/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// api services
import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

// Gate 8: thin client for Plane's own `prom_bridge` relay (apps/api/plane/prom_bridge) — NOT
// Hub directly. Same origin as every other Plane API call (API_BASE_URL, cookie-session auth
// via APIService's withCredentials), no CORS concern, no secret ever touches the browser — see
// core_patches/0001-prom-bridge/README.md for why this relay exists at all.

export type TPromChannelType = "line" | "discord";
export type TPromInstallationStatus = "active" | "inactive" | "revoked";

export type TPromInstallation = {
  id: string;
  customer_id: string;
  channel_type: TPromChannelType;
  display_name: string;
  status: TPromInstallationStatus;
  external_account_id: string;
  default_workspace_connection_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TPromWorkspaceLink = {
  id: string;
  channel_installation_id: string;
  workspace_connection_id: string;
  created_at: string;
};

export type TPromInstallationDetail = TPromInstallation & {
  workspaces: TPromWorkspaceLink[];
};

export type TPromWorkspaceConnection = {
  id: string;
  customer_id: string;
  prom_instance_id: string;
  prom_workspace_id: string;
  prom_workspace_slug: string;
  name: string;
  created_at: string;
  updated_at: string;
  has_webhook_secret: boolean;
  webhook_url: string;
};

export type TPromTestConnectionResult = {
  is_valid: boolean;
  error_message: string | null;
};

export type TPromAuditLogEntry = {
  id: string;
  installation_id: string | null;
  channel_type: TPromChannelType | null;
  channel_user_id: string | null;
  prom_user_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  correlation_id: string;
  result_status: "success" | "failure";
  error_code: string | null;
  occurred_at: string;
};

export type TPromLinkedIdentity = {
  id: string;
  channel_installation_id: string;
  channel_type: TPromChannelType;
  channel_user_id: string;
  default_workspace_connection_id: string | null;
  status: "active" | "unlinked";
  linked_at: string;
  unlinked_at: string | null;
};

export type TPromStartLinkingResult = {
  code: string;
  expires_at: string;
};

export class PromBridgeService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  // --- Workspace-scoped: Integrations settings (WorkspaceOwnerPermission-gated server-side) ---

  async listInstallations(workspaceSlug: string): Promise<TPromInstallation[]> {
    return this.get(`/api/prom-bridge/workspaces/${workspaceSlug}/installations/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createInstallation(
    workspaceSlug: string,
    data: { channel_type: TPromChannelType; display_name: string; credentials: Record<string, string> }
  ): Promise<TPromInstallation> {
    return this.post(`/api/prom-bridge/workspaces/${workspaceSlug}/installations/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getInstallation(workspaceSlug: string, installationId: string): Promise<TPromInstallationDetail> {
    return this.get(`/api/prom-bridge/workspaces/${workspaceSlug}/installations/${installationId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async testConnection(workspaceSlug: string, installationId: string): Promise<TPromTestConnectionResult> {
    return this.post(`/api/prom-bridge/workspaces/${workspaceSlug}/installations/${installationId}/test-connection/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async activateInstallation(workspaceSlug: string, installationId: string): Promise<TPromInstallation> {
    return this.post(`/api/prom-bridge/workspaces/${workspaceSlug}/installations/${installationId}/activate/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deactivateInstallation(workspaceSlug: string, installationId: string): Promise<TPromInstallation> {
    return this.post(`/api/prom-bridge/workspaces/${workspaceSlug}/installations/${installationId}/deactivate/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async revokeInstallation(workspaceSlug: string, installationId: string): Promise<TPromInstallation> {
    return this.post(`/api/prom-bridge/workspaces/${workspaceSlug}/installations/${installationId}/revoke/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getOrCreateWorkspaceConnection(workspaceSlug: string): Promise<TPromWorkspaceConnection> {
    return this.post(`/api/prom-bridge/workspaces/${workspaceSlug}/connection/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async linkWorkspace(
    workspaceSlug: string,
    installationId: string,
    data: { workspace_connection_id: string; is_default?: boolean }
  ): Promise<TPromWorkspaceLink> {
    return this.post(`/api/prom-bridge/workspaces/${workspaceSlug}/installations/${installationId}/workspaces/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async unlinkWorkspace(workspaceSlug: string, installationId: string, workspaceConnectionId: string): Promise<void> {
    return this.delete(
      `/api/prom-bridge/workspaces/${workspaceSlug}/installations/${installationId}/workspaces/${workspaceConnectionId}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getAuditLog(
    workspaceSlug: string,
    params: { installation_id?: string; limit?: number; offset?: number } = {}
  ): Promise<TPromAuditLogEntry[]> {
    return this.get(`/api/prom-bridge/workspaces/${workspaceSlug}/audit-log/`, { params })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // --- User-scoped: Connected Accounts (IsAuthenticated-only, any user manages their own) ---

  async listConnectedAccounts(): Promise<TPromLinkedIdentity[]> {
    return this.get(`/api/prom-bridge/connected-accounts/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async startLinking(data: {
    channel_installation_id: string;
    default_workspace_connection_id?: string;
  }): Promise<TPromStartLinkingResult> {
    return this.post(`/api/prom-bridge/connected-accounts/start-linking/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async unlinkConnectedAccount(linkedIdentityId: string): Promise<void> {
    return this.delete(`/api/prom-bridge/connected-accounts/${linkedIdentityId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
