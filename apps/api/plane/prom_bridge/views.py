# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Prom Bridge: thin relay views from Plane's session-authenticated browser to the Prom
Integration Hub's service-token-protected API (`services/prom-integration-hub`). Every view
here does the same three things: (1) authenticate/authorize the request using Plane's own
session + permission system (BaseAPIView/WorkspaceOwnerPermission/IsAuthenticated -- the exact
same classes every other plane.app view uses), (2) build a request to Hub and call it
server-to-server via HubClient (X-Hub-Service-Token never reaches the browser), (3) relay Hub's
JSON response straight back with the same status code. No business logic lives here -- Hub owns
all of it. See core_patches/0001-prom-bridge/README.md.

Workspace-scoped views (installations, audit log) require WorkspaceOwnerPermission (role=Admin
only, not Member -- these are sensitive integration-credential actions, a stricter bar than the
more common WorkSpaceAdminPermission which also allows Member role elsewhere in this codebase).
Connected-accounts views are IsAuthenticated only -- any linked-in user manages their own links,
no workspace-admin requirement.
"""

from uuid import uuid4

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import WorkspaceOwnerPermission
from plane.app.serializers import APITokenSerializer
from plane.app.views.base import BaseAPIView
from plane.db.models import APIToken, Workspace

from .client import HubClient, HubNotConfigured


def _relay_response(hub_response):
    """Translate Hub's response into a DRF Response with the same status code. Hub's error
    bodies are `{"error_code", "message", "correlation_id"}` (services/prom-integration-hub's
    apps/api/error_handlers.py) -- passed through as-is, never collapsed into a generic 500."""
    try:
        body = hub_response.json()
    except ValueError:
        body = {"detail": hub_response.text}
    return Response(body, status=hub_response.status_code)


def _not_configured_response():
    return Response(
        {"detail": "Prom Hub is not configured for this Plane instance."},
        status=status.HTTP_503_SERVICE_UNAVAILABLE,
    )


class PromInstallationListView(BaseAPIView):
    permission_classes = [WorkspaceOwnerPermission]

    def get(self, request, slug):
        try:
            client = HubClient()
        except HubNotConfigured:
            return _not_configured_response()
        response = client.request(
            "GET", f"/api/v1/customers/{client.customer_id}/installations"
        )
        return _relay_response(response)

    def post(self, request, slug):
        try:
            client = HubClient()
        except HubNotConfigured:
            return _not_configured_response()
        body = dict(request.data)
        body["customer_id"] = client.customer_id
        response = client.request("POST", "/api/v1/installations", json_body=body)
        return _relay_response(response)


class PromInstallationDetailView(BaseAPIView):
    permission_classes = [WorkspaceOwnerPermission]

    def get(self, request, slug, installation_id):
        try:
            client = HubClient()
        except HubNotConfigured:
            return _not_configured_response()
        response = client.request("GET", f"/api/v1/installations/{installation_id}")
        return _relay_response(response)

    def delete(self, request, slug, installation_id):
        """Hard-delete an installation an admin created by mistake and never actually used. Hub
        only allows this when the installation is `revoked` and has zero linked-identity history
        -- this relay does no validation of its own, same "no business logic here" rule as every
        other view in this file; Hub's own error response (409 INSTALLATION_NOT_REVOKED /
        INSTALLATION_HAS_LINKED_IDENTITIES) is what surfaces to the admin if those aren't met."""
        try:
            client = HubClient()
        except HubNotConfigured:
            return _not_configured_response()
        response = client.request("DELETE", f"/api/v1/installations/{installation_id}")
        return _relay_response(response)


class PromInstallationTestConnectionView(BaseAPIView):
    permission_classes = [WorkspaceOwnerPermission]

    def post(self, request, slug, installation_id):
        try:
            client = HubClient()
        except HubNotConfigured:
            return _not_configured_response()
        response = client.request(
            "POST", f"/api/v1/installations/{installation_id}/test-connection"
        )
        return _relay_response(response)


class PromInstallationActivateView(BaseAPIView):
    permission_classes = [WorkspaceOwnerPermission]

    def post(self, request, slug, installation_id):
        try:
            client = HubClient()
        except HubNotConfigured:
            return _not_configured_response()
        response = client.request("POST", f"/api/v1/installations/{installation_id}/activate")
        return _relay_response(response)


class PromInstallationDeactivateView(BaseAPIView):
    permission_classes = [WorkspaceOwnerPermission]

    def post(self, request, slug, installation_id):
        try:
            client = HubClient()
        except HubNotConfigured:
            return _not_configured_response()
        response = client.request(
            "POST", f"/api/v1/installations/{installation_id}/deactivate"
        )
        return _relay_response(response)


class PromInstallationRevokeView(BaseAPIView):
    permission_classes = [WorkspaceOwnerPermission]

    def post(self, request, slug, installation_id):
        try:
            client = HubClient()
        except HubNotConfigured:
            return _not_configured_response()
        response = client.request("POST", f"/api/v1/installations/{installation_id}/revoke")
        return _relay_response(response)


class PromWorkspaceConnectionView(BaseAPIView):
    """Get-or-create the Hub-side WorkspaceConnection row for the *current* Plane workspace, so
    the frontend has a `workspace_connection_id` to pass to PromInstallationWorkspaceLinkView
    below. Relays to Hub's `POST /api/v1/workspace-connections`, which is itself get-or-create
    (Gate 8's RegisterWorkspaceConnection use case) -- safe to call every time an admin opens the
    Integrations page. Plane's workspace id/slug/name are the source of truth; Hub only mirrors
    them (see RegisterWorkspaceConnection's "update on conflict" behavior)."""

    permission_classes = [WorkspaceOwnerPermission]

    def post(self, request, slug):
        try:
            client = HubClient()
        except HubNotConfigured:
            return _not_configured_response()
        # BaseAPIView exposes only `workspace_slug` (a string, from self.kwargs) -- no direct
        # model accessor -- so resolve the real Workspace row ourselves, the same one-liner
        # pattern used throughout plane.app/plane.api views that need more than the slug itself.
        try:
            workspace = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response({"detail": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)
        body = {
            "customer_id": client.customer_id,
            "prom_instance_id": client.instance_id,
            "prom_workspace_id": str(workspace.id),
            "prom_workspace_slug": workspace.slug,
            "name": workspace.name,
        }
        response = client.request("POST", "/api/v1/workspace-connections", json_body=body)
        return _relay_response(response)


class PromInstallationWorkspaceLinkView(BaseAPIView):
    """POST body must include `workspace_connection_id` (Hub's own id for the mapping) and
    `is_default` -- resolving *which* Hub WorkspaceConnection corresponds to this Plane
    workspace is a Stage 3 (frontend) concern; this relay does not look it up itself, per the
    architectural rule that Plane must not reach into Hub's database (and vice versa)."""

    permission_classes = [WorkspaceOwnerPermission]

    def post(self, request, slug, installation_id):
        try:
            client = HubClient()
        except HubNotConfigured:
            return _not_configured_response()
        response = client.request(
            "POST",
            f"/api/v1/installations/{installation_id}/workspaces",
            json_body=dict(request.data),
        )
        return _relay_response(response)


class PromInstallationWorkspaceUnlinkView(BaseAPIView):
    permission_classes = [WorkspaceOwnerPermission]

    def delete(self, request, slug, installation_id, workspace_connection_id):
        try:
            client = HubClient()
        except HubNotConfigured:
            return _not_configured_response()
        response = client.request(
            "DELETE",
            f"/api/v1/installations/{installation_id}/workspaces/{workspace_connection_id}",
        )
        return _relay_response(response)


class PromAuditLogView(BaseAPIView):
    """Role-gating who can see the audit log IS WorkspaceOwnerPermission here -- Hub itself has
    no role/permission concept (by design, confirmed Gate 8 Stage 1), so this permission check
    is the entire "audit visibility ตาม Role" requirement."""

    permission_classes = [WorkspaceOwnerPermission]

    def get(self, request, slug):
        try:
            client = HubClient()
        except HubNotConfigured:
            return _not_configured_response()
        params = {}
        installation_id = request.GET.get("installation_id")
        if installation_id:
            params["installation_id"] = installation_id
        if request.GET.get("limit"):
            params["limit"] = request.GET.get("limit")
        if request.GET.get("offset"):
            params["offset"] = request.GET.get("offset")
        response = client.request(
            "GET", f"/api/v1/customers/{client.customer_id}/audit-log", params=params
        )
        return _relay_response(response)


class PromConnectedAccountsView(BaseAPIView):
    """Any authenticated user manages their own linked channel identities -- no workspace-admin
    requirement, deliberately not workspace-scoped (a user's LINE/Discord link is a property of
    their Prom account, not any one workspace)."""

    def get(self, request):
        try:
            client = HubClient()
        except HubNotConfigured:
            return _not_configured_response()
        response = client.request(
            "GET",
            f"/api/v1/prom-instances/{client.instance_id}/prom-users/{request.user.id}/linked-identities",
        )
        return _relay_response(response)


class PromConnectedAccountsStartLinkingView(BaseAPIView):
    """Mints a personal APIToken for the current session user (the exact same effective action
    ApiTokenEndpoint.post() performs, apps/api/plane/app/views/api.py:20-39) and hands it to Hub
    as the delegated credential for the account-linking OTP flow -- the "click Connect, no
    password ever typed into LINE/Discord" mechanism verified feasible during this session's
    earlier Gate 1 research. The raw token is used once here, server-side, and discarded; it is
    never sent to the browser."""

    def post(self, request):
        try:
            client = HubClient()
        except HubNotConfigured:
            return _not_configured_response()

        user_type = 1 if request.user.is_bot else 0
        api_token = APIToken.objects.create(
            label=f"prom-bridge-linking-{uuid4().hex}",
            description="Auto-generated for Prom account linking (prom_bridge)",
            user=request.user,
            user_type=user_type,
            expired_at=None,
        )
        delegated_token = APITokenSerializer(api_token).data["token"]

        body = {
            "prom_instance_id": client.instance_id,
            "prom_user_id": str(request.user.id),
            "delegated_token": delegated_token,
            "channel_installation_id": request.data.get("channel_installation_id"),
            "default_workspace_connection_id": request.data.get(
                "default_workspace_connection_id"
            ),
        }
        response = client.request("POST", "/api/v1/account-linking/start", json_body=body)
        return _relay_response(response)


class PromConnectedAccountDetailView(BaseAPIView):
    def delete(self, request, linked_identity_id):
        try:
            client = HubClient()
        except HubNotConfigured:
            return _not_configured_response()

        # Hub's DELETE /api/v1/identities/{id} is a trusted server-to-server call from Hub's own
        # point of view -- it does not itself verify the identity belongs to the calling user.
        # Without this check, any authenticated Plane user could unlink any other user's
        # LINE/Discord identity by guessing/enumerating UUIDs. Confirm ownership first.
        mine = client.request(
            "GET",
            f"/api/v1/prom-instances/{client.instance_id}/prom-users/{request.user.id}/linked-identities",
        )
        if mine.status_code != status.HTTP_200_OK:
            return _relay_response(mine)
        owned_ids = {str(item.get("id")) for item in mine.json()}
        if str(linked_identity_id) not in owned_ids:
            return Response(
                {"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND
            )

        response = client.request("DELETE", f"/api/v1/identities/{linked_identity_id}")
        return _relay_response(response)
