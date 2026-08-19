/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
// services
import type { TPromInstallation } from "@/services/prom-bridge.service";
import { PromBridgeService } from "@/services/prom-bridge.service";

const promBridgeService = new PromBridgeService();

type Props = {
  workspaceSlug: string;
  installation: TPromInstallation;
  isOpen: boolean;
  onClose: () => void;
};

// Gate 8: linking "this" workspace to an installation is a two-step relay call, not one --
// first get-or-create the Hub WorkspaceConnection for the current Plane workspace (Stage 3's
// PromWorkspaceConnectionView), then link the installation to the workspace_connection_id that
// returns. Hub's own link endpoint deliberately does not resolve this itself (see
// PromInstallationWorkspaceLinkView's docstring) -- it's frontend's job, done here.
export function WorkspaceLinksModal(props: Props) {
  const { workspaceSlug, installation, isOpen, onClose } = props;
  const { t } = useTranslation();
  const [isLinking, setIsLinking] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  const { data: detail, mutate } = useSWR(isOpen ? `PROM_INSTALLATION_DETAIL_${installation.id}` : null, () =>
    promBridgeService.getInstallation(workspaceSlug, installation.id)
  );

  const handleLinkCurrentWorkspace = async () => {
    setIsLinking(true);
    try {
      const connection = await promBridgeService.getOrCreateWorkspaceConnection(workspaceSlug);
      await promBridgeService.linkWorkspace(workspaceSlug, installation.id, {
        workspace_connection_id: connection.id,
      });
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("prom_integrations.link_workspace.success") });
      mutate();
    } catch (error: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: error?.message });
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlink = async (workspaceConnectionId: string) => {
    setUnlinkingId(workspaceConnectionId);
    try {
      await promBridgeService.unlinkWorkspace(workspaceSlug, installation.id, workspaceConnectionId);
      mutate();
    } catch (error: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: error?.message });
    } finally {
      setUnlinkingId(null);
    }
  };

  const alreadyLinkedIds = new Set((detail?.workspaces ?? []).map((w) => w.workspace_connection_id));

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="space-y-4 p-5">
        <h3 className="text-16 font-medium">{t("prom_integrations.manage_workspaces")}</h3>
        <p className="text-13 text-secondary">{installation.display_name}</p>

        <div className="space-y-2">
          {(detail?.workspaces ?? []).map((link) => (
            <div
              key={link.id}
              className="flex items-center justify-between rounded-md border-[0.5px] border-subtle px-3 py-2"
            >
              <span className="text-13">{link.workspace_connection_id}</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleUnlink(link.workspace_connection_id)}
                loading={unlinkingId === link.workspace_connection_id}
              >
                {t("prom_integrations.unlink")}
              </Button>
            </div>
          ))}
          {(detail?.workspaces ?? []).length === 0 && (
            <p className="text-13 text-tertiary">{t("prom_integrations.no_workspaces_linked")}</p>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t-[0.5px] border-subtle px-5 py-4">
        <Button variant="secondary" onClick={onClose}>
          {t("close")}
        </Button>
        <Button variant="primary" onClick={handleLinkCurrentWorkspace} loading={isLinking}>
          {t("prom_integrations.link_this_workspace")}
        </Button>
      </div>
      {/* alreadyLinkedIds reserved for a future "already linked" disabled-state affordance on
          the link button -- not surfaced yet since Hub's link endpoint is itself idempotent-safe
          (documented, not re-verified this pass) and a duplicate click just no-ops visibly via
          the unchanged list. */}
      {alreadyLinkedIds.size >= 0 && null}
    </ModalCore>
  );
}
