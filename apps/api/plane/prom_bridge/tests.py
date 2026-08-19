# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Tests for the prom_bridge relay app.

NOT executed in the Gate 8 Stage 2 sandbox this was written in -- a full Plane Django
environment needs `pg_config` (native PostgreSQL client headers) to install `psycopg[c]` from
apps/api/requirements/base.txt, which this sandbox does not have and installing was judged out
of scope for a verification-only step. Confirmed by real, unmasked `pip install -r
requirements/base.txt` output: `error: [Errno 2] No such file or directory: 'pg_config'`. Every
file in this app WAS confirmed syntactically valid via `python3 -m py_compile` (no Django
needed). No existing `tests.py`/`test_*.py` convention was found anywhere else in
`apps/api/plane` to mirror (searched, zero hits) -- this uses plain, idiomatic
`rest_framework.test.APITestCase`.

Run for real with: `python manage.py test plane.prom_bridge` inside a properly configured
Plane dev environment (see CONTRIBUTING.md's `./setup.sh` flow).
"""

from unittest.mock import MagicMock, patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from plane.db.models import Workspace, WorkspaceMember

User = get_user_model()

_HUB_SETTINGS = dict(
    PROM_HUB_BASE_URL="https://hub.internal.example.com",
    PROM_HUB_SERVICE_TOKEN="test-service-token",
    PROM_INSTANCE_ID=str(uuid4()),
    PROM_CUSTOMER_ID=str(uuid4()),
)


def _fake_response(status_code, json_body):
    response = MagicMock()
    response.status_code = status_code
    response.json.return_value = json_body
    return response


class PromBridgeConfigTests(APITestCase):
    """Doesn't need PROM_HUB_* settings -- proves a Plane deployment with no Hub configured
    degrades to a clean 503, not an unhandled exception, on every prom_bridge route."""

    def setUp(self):
        self.user = User.objects.create_user(username="admin", email="admin@example.com")
        self.workspace = Workspace.objects.create(name="Acme", slug="acme", owner=self.user)
        WorkspaceMember.objects.create(workspace=self.workspace, member=self.user, role=20)
        self.client.force_authenticate(user=self.user)

    @override_settings(
        PROM_HUB_BASE_URL=None,
        PROM_HUB_SERVICE_TOKEN=None,
        PROM_INSTANCE_ID=None,
        PROM_CUSTOMER_ID=None,
    )
    def test_unconfigured_hub_returns_503_not_a_crash(self):
        response = self.client.get(
            reverse("prom-bridge-installation-list", kwargs={"slug": self.workspace.slug})
        )
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)


@override_settings(**_HUB_SETTINGS)
class PromBridgeWorkspacePermissionTests(APITestCase):
    """WorkspaceOwnerPermission (role=Admin only) gates every installation/audit-log route --
    confirms a plain Member (role=15, not Admin=20) is rejected, not just an anonymous user."""

    def setUp(self):
        self.admin = User.objects.create_user(username="admin", email="admin@example.com")
        self.member = User.objects.create_user(username="member", email="member@example.com")
        self.workspace = Workspace.objects.create(name="Acme", slug="acme", owner=self.admin)
        WorkspaceMember.objects.create(workspace=self.workspace, member=self.admin, role=20)
        WorkspaceMember.objects.create(workspace=self.workspace, member=self.member, role=15)

    def test_member_role_is_rejected_from_installation_list(self):
        self.client.force_authenticate(user=self.member)
        response = self.client.get(
            reverse("prom-bridge-installation-list", kwargs={"slug": self.workspace.slug})
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @patch("plane.prom_bridge.client.pinned_fetch")
    def test_workspace_connection_relays_real_workspace_fields(self, mock_pinned_fetch):
        """PromWorkspaceConnectionView must resolve the real Workspace row (id/slug/name) itself
        -- BaseAPIView only exposes the slug string, not a model instance -- and forward exactly
        those fields to Hub's get-or-create endpoint."""
        mock_pinned_fetch.return_value = _fake_response(
            201,
            {
                "id": str(uuid4()),
                "customer_id": _HUB_SETTINGS["PROM_CUSTOMER_ID"],
                "prom_instance_id": _HUB_SETTINGS["PROM_INSTANCE_ID"],
                "prom_workspace_id": str(self.workspace.id),
                "prom_workspace_slug": self.workspace.slug,
                "name": self.workspace.name,
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:00:00Z",
                "has_webhook_secret": False,
                "webhook_url": "https://hub.internal.example.com/webhooks/v1/prom/x",
            },
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            reverse("prom-bridge-workspace-connection", kwargs={"slug": self.workspace.slug})
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        sent_json = mock_pinned_fetch.call_args.kwargs["json"]
        self.assertEqual(sent_json["prom_workspace_id"], str(self.workspace.id))
        self.assertEqual(sent_json["prom_workspace_slug"], self.workspace.slug)
        self.assertEqual(sent_json["name"], self.workspace.name)
        self.assertEqual(sent_json["customer_id"], _HUB_SETTINGS["PROM_CUSTOMER_ID"])

    def test_workspace_connection_unknown_slug_is_403(self):
        """WorkspaceOwnerPermission.has_permission (apps/api/plane/app/permissions/workspace.py:
        51-58) filters WorkspaceMember by `workspace__slug=view.workspace_slug` -- for a slug that
        doesn't exist, that queryset is simply empty, so DRF denies with 403 *before* the view's
        own `Workspace.objects.get(slug=slug)` (and its 404 branch) ever runs. Documenting the
        real behavior rather than the initially-assumed 404."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            reverse("prom-bridge-workspace-connection", kwargs={"slug": "does-not-exist"})
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @patch("plane.prom_bridge.client.pinned_fetch")
    def test_admin_role_reaches_the_relay(self, mock_pinned_fetch):
        mock_pinned_fetch.return_value = _fake_response(200, [])
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(
            reverse("prom-bridge-installation-list", kwargs={"slug": self.workspace.slug})
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_pinned_fetch.assert_called_once()
        called_url = mock_pinned_fetch.call_args.args[1]
        self.assertIn(f"/api/v1/customers/{_HUB_SETTINGS['PROM_CUSTOMER_ID']}/installations", called_url)


@override_settings(**_HUB_SETTINGS)
class PromBridgeRelayResponseTests(APITestCase):
    """Confirms Hub's error-code JSON body and status code pass through unchanged rather than
    being collapsed into a generic 500 (see views._relay_response's docstring)."""

    def setUp(self):
        self.admin = User.objects.create_user(username="admin", email="admin@example.com")
        self.workspace = Workspace.objects.create(name="Acme", slug="acme", owner=self.admin)
        WorkspaceMember.objects.create(workspace=self.workspace, member=self.admin, role=20)
        self.client.force_authenticate(user=self.admin)

    @patch("plane.prom_bridge.client.pinned_fetch")
    def test_hub_error_body_and_status_pass_through(self, mock_pinned_fetch):
        installation_id = uuid4()
        mock_pinned_fetch.return_value = _fake_response(
            404, {"error_code": "NOT_FOUND", "message": "not found", "correlation_id": "abc"}
        )
        response = self.client.get(
            reverse(
                "prom-bridge-installation-detail",
                kwargs={"slug": self.workspace.slug, "installation_id": installation_id},
            )
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data["error_code"], "NOT_FOUND")


@override_settings(**_HUB_SETTINGS)
class PromBridgeConnectedAccountsTests(APITestCase):
    """Connected accounts are IsAuthenticated-only (no workspace-admin requirement -- users
    manage their own links), and the delete endpoint must enforce ownership itself since Hub's
    own DELETE /api/v1/identities/{id} trusts the caller completely."""

    def setUp(self):
        self.user = User.objects.create_user(username="alice", email="alice@example.com")
        self.client.force_authenticate(user=self.user)

    @patch("plane.prom_bridge.client.pinned_fetch")
    def test_start_linking_mints_a_token_and_relays_it(self, mock_pinned_fetch):
        mock_pinned_fetch.return_value = _fake_response(
            200, {"code": "123456", "expires_at": "2026-01-01T00:10:00Z"}
        )
        response = self.client.post(reverse("prom-bridge-connected-accounts-start-linking"), {})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_pinned_fetch.assert_called_once()
        sent_json = mock_pinned_fetch.call_args.kwargs["json"]
        self.assertEqual(sent_json["prom_user_id"], str(self.user.id))
        self.assertTrue(sent_json["delegated_token"])  # a real APIToken.token was minted

    @patch("plane.prom_bridge.client.pinned_fetch")
    def test_delete_rejects_an_identity_not_owned_by_the_caller(self, mock_pinned_fetch):
        not_mine_id = uuid4()
        mock_pinned_fetch.return_value = _fake_response(
            200, [{"id": str(uuid4()), "channel_type": "line"}]
        )
        response = self.client.delete(
            reverse(
                "prom-bridge-connected-accounts-detail",
                kwargs={"linked_identity_id": not_mine_id},
            )
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        # Only the ownership-check GET happened -- the DELETE was never forwarded to Hub.
        mock_pinned_fetch.assert_called_once()

    @patch("plane.prom_bridge.client.pinned_fetch")
    def test_delete_forwards_when_identity_is_owned_by_the_caller(self, mock_pinned_fetch):
        mine_id = uuid4()
        mock_pinned_fetch.side_effect = [
            _fake_response(200, [{"id": str(mine_id), "channel_type": "line"}]),
            _fake_response(204, {}),
        ]
        response = self.client.delete(
            reverse(
                "prom-bridge-connected-accounts-detail", kwargs={"linked_identity_id": mine_id}
            )
        )
        self.assertEqual(mock_pinned_fetch.call_count, 2)
        second_call_method = mock_pinned_fetch.call_args_list[1].args[0]
        self.assertEqual(second_call_method, "DELETE")
