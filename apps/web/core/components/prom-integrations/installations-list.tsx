/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore } from "@plane/ui";
// components
import { WorkspaceLinksModal } from "@/components/prom-integrations/workspace-links-modal";
// services
import type { TPromInstallation } from "@/services/prom-bridge.service";
import { PromBridgeService } from "@/services/prom-bridge.service";

const promBridgeService = new PromBridgeService();

const STATUS_STYLES: Record<TPromInstallation["status"], string> = {
  active: "bg-success-subtle text-success-primary",
  inactive: "bg-warning-subtle text-warning-primary",
  revoked: "bg-danger-subtle text-danger-primary",
};

type Props = {
  workspaceSlug: string;
  installations: TPromInstallation[];
  onChanged: () => void;
};

export function InstallationsList(props: Props) {
  const { workspaceSlug, installations, onChanged } = props;
  const { t } = useTranslation();
  const [revokeTarget, setRevokeTarget] = useState<TPromInstallation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TPromInstallation | null>(null);
  const [manageTarget, setManageTarget] = useState<TPromInstallation | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleTestConnection = async (installation: TPromInstallation) => {
    setBusyId(installation.id);
    try {
      const result = await promBridgeService.testConnection(workspaceSlug, installation.id);
      setToast({
        type: result.is_valid ? TOAST_TYPE.SUCCESS : TOAST_TYPE.ERROR,
        title: result.is_valid
          ? t("prom_integrations.test_connection.success")
          : t("prom_integrations.test_connection.failure"),
        message: result.error_message ?? undefined,
      });
    } catch (error: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: error?.message });
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (installation: TPromInstallation) => {
    setBusyId(installation.id);
    try {
      if (installation.status === "active") {
        await promBridgeService.deactivateInstallation(workspaceSlug, installation.id);
      } else {
        await promBridgeService.activateInstallation(workspaceSlug, installation.id);
      }
      onChanged();
    } catch (error: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: error?.message });
    } finally {
      setBusyId(null);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setBusyId(revokeTarget.id);
    try {
      await promBridgeService.revokeInstallation(workspaceSlug, revokeTarget.id);
      onChanged();
    } catch (error: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: error?.message });
    } finally {
      setBusyId(null);
      setRevokeTarget(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await promBridgeService.deleteInstallation(workspaceSlug, deleteTarget.id);
      onChanged();
    } catch (error: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: error?.message });
    } finally {
      setBusyId(null);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="divide-y divide-subtle rounded-md border-[0.5px] border-subtle">
      {revokeTarget && (
        <AlertModalCore
          isOpen
          handleClose={() => setRevokeTarget(null)}
          handleSubmit={handleRevoke}
          isSubmitting={busyId === revokeTarget.id}
          title={t("prom_integrations.revoke_modal.title")}
          content={t("prom_integrations.revoke_modal.content", { name: revokeTarget.display_name })}
          primaryButtonText={{ loading: t("prom_integrations.revoking"), default: t("prom_integrations.revoke") }}
        />
      )}
      {deleteTarget && (
        <AlertModalCore
          isOpen
          handleClose={() => setDeleteTarget(null)}
          handleSubmit={handleDelete}
          isSubmitting={busyId === deleteTarget.id}
          title={t("prom_integrations.delete_modal.title")}
          content={t("prom_integrations.delete_modal.content", { name: deleteTarget.display_name })}
          primaryButtonText={{ loading: t("prom_integrations.deleting"), default: t("prom_integrations.delete") }}
        />
      )}
      {manageTarget && (
        <WorkspaceLinksModal
          workspaceSlug={workspaceSlug}
          installation={manageTarget}
          isOpen
          onClose={() => setManageTarget(null)}
        />
      )}
      {installations.map((installation) => (
        <div key={installation.id} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-13 font-medium text-tertiary uppercase">{installation.channel_type}</span>
              <span className="truncate text-14 font-medium">{installation.display_name}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-11 font-medium capitalize ${STATUS_STYLES[installation.status]}`}
              >
                {installation.status}
              </span>
            </div>
            <span className="text-12 text-tertiary">{installation.external_account_id}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleTestConnection(installation)}
              loading={busyId === installation.id}
            >
              {t("prom_integrations.test_connection.action")}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setManageTarget(installation)}>
              {t("prom_integrations.manage_workspaces")}
            </Button>
            {installation.status !== "revoked" && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleToggleActive(installation)}
                loading={busyId === installation.id}
              >
                {installation.status === "active" ? t("prom_integrations.deactivate") : t("prom_integrations.activate")}
              </Button>
            )}
            {installation.status !== "revoked" && (
              <Button variant="error-fill" size="sm" onClick={() => setRevokeTarget(installation)}>
                {t("prom_integrations.revoke")}
              </Button>
            )}
            {installation.status === "revoked" && (
              <Button variant="error-fill" size="sm" onClick={() => setDeleteTarget(installation)}>
                {t("prom_integrations.delete")}
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
