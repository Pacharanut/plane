# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from .views import (
    PromAuditLogView,
    PromConnectedAccountDetailView,
    PromConnectedAccountsStartLinkingView,
    PromConnectedAccountsView,
    PromInstallationActivateView,
    PromInstallationDeactivateView,
    PromInstallationDetailView,
    PromInstallationListView,
    PromInstallationRevokeView,
    PromInstallationTestConnectionView,
    PromInstallationWorkspaceLinkView,
    PromInstallationWorkspaceUnlinkView,
    PromWorkspaceConnectionView,
)

# Mounted at api/prom-bridge/ (see plane/urls.py) -- unversioned, matching plane.app.urls'
# own convention (only the public plane.api app under api/v1/ is versioned).
urlpatterns = [
    path(
        "workspaces/<str:slug>/connection/",
        PromWorkspaceConnectionView.as_view(),
        name="prom-bridge-workspace-connection",
    ),
    path(
        "workspaces/<str:slug>/installations/",
        PromInstallationListView.as_view(),
        name="prom-bridge-installation-list",
    ),
    path(
        "workspaces/<str:slug>/installations/<uuid:installation_id>/",
        PromInstallationDetailView.as_view(),
        name="prom-bridge-installation-detail",
    ),
    path(
        "workspaces/<str:slug>/installations/<uuid:installation_id>/test-connection/",
        PromInstallationTestConnectionView.as_view(),
        name="prom-bridge-installation-test-connection",
    ),
    path(
        "workspaces/<str:slug>/installations/<uuid:installation_id>/activate/",
        PromInstallationActivateView.as_view(),
        name="prom-bridge-installation-activate",
    ),
    path(
        "workspaces/<str:slug>/installations/<uuid:installation_id>/deactivate/",
        PromInstallationDeactivateView.as_view(),
        name="prom-bridge-installation-deactivate",
    ),
    path(
        "workspaces/<str:slug>/installations/<uuid:installation_id>/revoke/",
        PromInstallationRevokeView.as_view(),
        name="prom-bridge-installation-revoke",
    ),
    path(
        "workspaces/<str:slug>/installations/<uuid:installation_id>/workspaces/",
        PromInstallationWorkspaceLinkView.as_view(),
        name="prom-bridge-installation-workspace-link",
    ),
    path(
        "workspaces/<str:slug>/installations/<uuid:installation_id>/workspaces/<uuid:workspace_connection_id>/",
        PromInstallationWorkspaceUnlinkView.as_view(),
        name="prom-bridge-installation-workspace-unlink",
    ),
    path(
        "workspaces/<str:slug>/audit-log/",
        PromAuditLogView.as_view(),
        name="prom-bridge-audit-log",
    ),
    path(
        "connected-accounts/",
        PromConnectedAccountsView.as_view(),
        name="prom-bridge-connected-accounts-list",
    ),
    path(
        "connected-accounts/start-linking/",
        PromConnectedAccountsStartLinkingView.as_view(),
        name="prom-bridge-connected-accounts-start-linking",
    ),
    path(
        "connected-accounts/<uuid:linked_identity_id>/",
        PromConnectedAccountDetailView.as_view(),
        name="prom-bridge-connected-accounts-detail",
    ),
]
