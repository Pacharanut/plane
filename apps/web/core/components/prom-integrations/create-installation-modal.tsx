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
import { EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
// services
import type { TPromChannelType } from "@/services/prom-bridge.service";
import { PromBridgeService } from "@/services/prom-bridge.service";

const promBridgeService = new PromBridgeService();

type Props = {
  workspaceSlug: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
};

// Gate 8: create-only, matching Hub's actual endpoints (verified this session — there is no
// "update installation credentials" endpoint anywhere in Stage 1's route list). Changing
// credentials means creating a new installation and re-linking workspaces to it; this modal
// never pre-fills or redisplays a credential value, matching the "never echo a secret back"
// principle already established server-side (see WorkspaceConnectionResponse.has_webhook_secret).
export function CreateInstallationModal(props: Props) {
  const { workspaceSlug, isOpen, onClose, onCreated } = props;
  const { t } = useTranslation();

  const [channelType, setChannelType] = useState<TPromChannelType>("line");
  const [displayName, setDisplayName] = useState("");
  const [channelAccessToken, setChannelAccessToken] = useState("");
  const [channelSecret, setChannelSecret] = useState("");
  const [botToken, setBotToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = () => {
    setDisplayName("");
    setChannelAccessToken("");
    setChannelSecret("");
    setBotToken("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // Exact credential dict keys Hub's ChannelValidatorRegistry expects (verified against
      // src/channels/validator_registry.py this session, not guessed):
      // LINE -> {channel_access_token, channel_secret}, Discord -> {bot_token}.
      const credentials: Record<string, string> =
        channelType === "line"
          ? { channel_access_token: channelAccessToken, channel_secret: channelSecret }
          : { bot_token: botToken };
      await promBridgeService.createInstallation(workspaceSlug, {
        channel_type: channelType,
        display_name: displayName,
        credentials,
      });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("toast.success"),
        message: t("prom_integrations.create_success"),
      });
      onCreated();
      handleClose();
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: error?.message ?? t("prom_integrations.create_error"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit =
    displayName.trim().length > 0 &&
    (channelType === "line" ? channelAccessToken.trim() && channelSecret.trim() : botToken.trim());

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="space-y-4 p-5">
        <h3 className="text-16 font-medium">{t("prom_integrations.create_modal.title")}</h3>

        <div className="flex gap-2">
          <Button
            variant={channelType === "line" ? "primary" : "secondary"}
            onClick={() => setChannelType("line")}
            size="sm"
          >
            LINE
          </Button>
          <Button
            variant={channelType === "discord" ? "primary" : "secondary"}
            onClick={() => setChannelType("discord")}
            size="sm"
          >
            Discord
          </Button>
        </div>

        <div>
          <label className="mb-1 block text-13 text-secondary">
            {t("prom_integrations.create_modal.display_name")}
          </label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full" />
        </div>

        {channelType === "line" ? (
          <>
            <div>
              <label className="mb-1 block text-13 text-secondary">
                {t("prom_integrations.create_modal.channel_access_token")}
              </label>
              <Input
                type="password"
                value={channelAccessToken}
                onChange={(e) => setChannelAccessToken(e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <label className="mb-1 block text-13 text-secondary">
                {t("prom_integrations.create_modal.channel_secret")}
              </label>
              <Input
                type="password"
                value={channelSecret}
                onChange={(e) => setChannelSecret(e.target.value)}
                className="w-full"
              />
            </div>
          </>
        ) : (
          <div>
            <label className="mb-1 block text-13 text-secondary">{t("prom_integrations.create_modal.bot_token")}</label>
            <Input type="password" value={botToken} onChange={(e) => setBotToken(e.target.value)} className="w-full" />
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t-[0.5px] border-subtle px-5 py-4">
        <Button variant="secondary" onClick={handleClose}>
          {t("cancel")}
        </Button>
        <Button variant="primary" onClick={handleSubmit} loading={isSubmitting} disabled={!canSubmit}>
          {t("prom_integrations.create_modal.submit")}
        </Button>
      </div>
    </ModalCore>
  );
}
