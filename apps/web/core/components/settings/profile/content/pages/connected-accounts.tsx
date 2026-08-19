/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EmptyStateCompact } from "@plane/propel/empty-state";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
// components
import { ProfileSettingsHeading } from "@/components/settings/profile/heading";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
// services
import type { TPromInstallation, TPromLinkedIdentity, TPromStartLinkingResult } from "@/services/prom-bridge.service";
import { PromBridgeService } from "@/services/prom-bridge.service";

const promBridgeService = new PromBridgeService();

const CONNECTED_ACCOUNTS_KEY = "PROM_CONNECTED_ACCOUNTS";

// Gate 8: LinkedIdentity is user-scoped (any Plane user across any workspace), but the channel
// installation it links against is workspace-scoped -- so "Connect" here is necessarily a
// two-step picker (workspace, then installation within it), unlike the single-click flow the
// original directive sketched. Documented as a deliberate scope decision, not an oversight: the
// Hub API gives no "all installations visible to this user" endpoint to shortcut it, only
// per-workspace listInstallations().
function ConnectAccountModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { workspaces } = useWorkspace();
  const workspaceList = Object.values(workspaces ?? {});

  const [selectedWorkspaceSlug, setSelectedWorkspaceSlug] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState<string | null>(null);
  const [linkResult, setLinkResult] = useState<TPromStartLinkingResult | null>(null);

  const { data: installations, isLoading } = useSWR(
    selectedWorkspaceSlug ? `PROM_INTEGRATIONS_LIST_${selectedWorkspaceSlug}` : null,
    selectedWorkspaceSlug ? () => promBridgeService.listInstallations(selectedWorkspaceSlug) : null
  );

  const handleClose = () => {
    setSelectedWorkspaceSlug(null);
    setLinkResult(null);
    onClose();
  };

  const handleStartLinking = async (installation: TPromInstallation) => {
    setIsStarting(installation.id);
    try {
      const result = await promBridgeService.startLinking({ channel_installation_id: installation.id });
      setLinkResult(result);
    } catch (error: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: error?.message });
    } finally {
      setIsStarting(null);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="space-y-4 p-5">
        <h3 className="text-16 font-medium">{t("account_settings.connected_accounts.connect_modal.title")}</h3>

        {linkResult ? (
          <div className="space-y-2">
            <p className="text-13 text-secondary">
              {t("account_settings.connected_accounts.connect_modal.code_instructions")}
            </p>
            <div className="bg-surface-secondary tracking-widest rounded-md border-[0.5px] border-subtle px-4 py-3 text-center text-24 font-semibold">
              {linkResult.code}
            </div>
            <p className="text-12 text-tertiary">
              {t("account_settings.connected_accounts.connect_modal.expires_at", {
                expires_at: new Date(linkResult.expires_at).toLocaleString(),
              })}
            </p>
          </div>
        ) : !selectedWorkspaceSlug ? (
          <div className="space-y-1">
            {workspaceList.map((workspace) => (
              <button
                key={workspace.id}
                className="hover:bg-surface-secondary w-full rounded-md border-[0.5px] border-subtle px-3 py-2 text-left text-13"
                onClick={() => setSelectedWorkspaceSlug(workspace.slug)}
              >
                {workspace.name}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {isLoading && <p className="text-13 text-tertiary">{t("loading")}</p>}
            {(installations ?? []).map((installation) => (
              <button
                key={installation.id}
                disabled={isStarting === installation.id}
                className="hover:bg-surface-secondary flex w-full items-center justify-between rounded-md border-[0.5px] border-subtle px-3 py-2 text-left text-13"
                onClick={() => handleStartLinking(installation)}
              >
                <span className="text-tertiary uppercase">{installation.channel_type}</span>
                <span>{installation.display_name}</span>
              </button>
            ))}
            {!isLoading && (installations ?? []).length === 0 && (
              <p className="text-13 text-tertiary">
                {t("account_settings.connected_accounts.connect_modal.no_installations")}
              </p>
            )}
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t-[0.5px] border-subtle px-5 py-4">
        <Button variant="secondary" onClick={handleClose}>
          {t("close")}
        </Button>
      </div>
    </ModalCore>
  );
}

export const ConnectedAccountsProfileSettings = observer(function ConnectedAccountsProfileSettings() {
  const { t } = useTranslation();
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<TPromLinkedIdentity | null>(null);
  const [isUnlinking, setIsUnlinking] = useState(false);

  const {
    data: identities,
    isLoading,
    mutate,
  } = useSWR(CONNECTED_ACCOUNTS_KEY, () => promBridgeService.listConnectedAccounts());

  const handleUnlink = async () => {
    if (!unlinkTarget) return;
    setIsUnlinking(true);
    try {
      await promBridgeService.unlinkConnectedAccount(unlinkTarget.id);
      mutate();
    } catch (error: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: error?.message });
    } finally {
      setIsUnlinking(false);
      setUnlinkTarget(null);
    }
  };

  return (
    <div className="size-full">
      <ConnectAccountModal isOpen={showConnectModal} onClose={() => setShowConnectModal(false)} />
      {unlinkTarget && (
        <AlertModalCore
          isOpen
          handleClose={() => setUnlinkTarget(null)}
          handleSubmit={handleUnlink}
          isSubmitting={isUnlinking}
          title={t("account_settings.connected_accounts.unlink_modal.title")}
          content={t("account_settings.connected_accounts.unlink_modal.content", {
            channel_user_id: unlinkTarget.channel_user_id,
          })}
          primaryButtonText={{
            loading: t("account_settings.connected_accounts.unlinking"),
            default: t("account_settings.connected_accounts.unlink"),
          }}
        />
      )}
      <ProfileSettingsHeading
        title={t("account_settings.connected_accounts.title")}
        description={t("account_settings.connected_accounts.description")}
        control={
          <Button variant="primary" size="lg" onClick={() => setShowConnectModal(true)}>
            {t("account_settings.connected_accounts.connect")}
          </Button>
        }
      />
      <div className="mt-7">
        {!isLoading && identities && identities.length > 0 ? (
          <div className="divide-y divide-subtle rounded-md border-[0.5px] border-subtle">
            {identities.map((identity) => (
              <div key={identity.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-13 font-medium text-tertiary uppercase">{identity.channel_type}</span>
                    <span className="text-14 font-medium">{identity.channel_user_id}</span>
                  </div>
                  <span className="text-12 text-tertiary">
                    {t("account_settings.connected_accounts.linked_at", {
                      linked_at: new Date(identity.linked_at).toLocaleString(),
                    })}
                  </span>
                </div>
                <Button variant="error-fill" size="sm" onClick={() => setUnlinkTarget(identity)}>
                  {t("account_settings.connected_accounts.unlink")}
                </Button>
              </div>
            ))}
          </div>
        ) : !isLoading ? (
          <EmptyStateCompact
            assetKey="webhook"
            title={t("account_settings.connected_accounts.empty_state.title")}
            description={t("account_settings.connected_accounts.empty_state.description")}
            actions={[
              {
                label: t("account_settings.connected_accounts.connect"),
                onClick: () => setShowConnectModal(true),
              },
            ]}
            align="start"
            rootClassName="py-20"
          />
        ) : null}
      </div>
    </div>
  );
});
