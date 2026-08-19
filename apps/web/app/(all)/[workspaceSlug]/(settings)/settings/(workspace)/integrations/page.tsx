/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EmptyStateCompact } from "@plane/propel/empty-state";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { AuditLogSection } from "@/components/prom-integrations/audit-log-section";
import { CreateInstallationModal } from "@/components/prom-integrations/create-installation-modal";
import { InstallationsList } from "@/components/prom-integrations/installations-list";
import { SettingsHeading } from "@/components/settings/heading";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";
// services
import { PromBridgeService } from "@/services/prom-bridge.service";
// local imports
import type { Route } from "./+types/page";
import { IntegrationsWorkspaceSettingsHeader } from "./header";

const promBridgeService = new PromBridgeService();

function IntegrationsSettingsPage({ params }: Route.ComponentProps) {
  // states
  const [showCreateModal, setShowCreateModal] = useState(false);
  // router
  const { workspaceSlug } = params;
  // plane hooks
  const { t } = useTranslation();
  // mobx store
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();
  // derived values
  const canPerformWorkspaceAdminActions = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  const {
    data: installations,
    isLoading,
    mutate: mutateInstallations,
  } = useSWR(
    canPerformWorkspaceAdminActions ? `PROM_INTEGRATIONS_LIST_${workspaceSlug}` : null,
    canPerformWorkspaceAdminActions ? () => promBridgeService.listInstallations(workspaceSlug) : null
  );

  const pageTitle = currentWorkspace?.name
    ? `${currentWorkspace.name} - ${t("workspace_settings.settings.integrations.title")}`
    : undefined;

  if (workspaceUserInfo && !canPerformWorkspaceAdminActions) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<IntegrationsWorkspaceSettingsHeader />}>
      <PageHead title={pageTitle} />
      <div className="w-full">
        <CreateInstallationModal
          workspaceSlug={workspaceSlug}
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => mutateInstallations()}
        />
        <SettingsHeading
          title={t("workspace_settings.settings.integrations.title")}
          description={t("workspace_settings.settings.integrations.description")}
          control={
            <Button variant="primary" size="lg" onClick={() => setShowCreateModal(true)}>
              {t("prom_integrations.add_installation")}
            </Button>
          }
        />
        {isLoading || !installations ? null : installations.length > 0 ? (
          <div className="mt-4">
            <InstallationsList
              workspaceSlug={workspaceSlug}
              installations={installations}
              onChanged={() => mutateInstallations()}
            />
          </div>
        ) : (
          <div className="flex h-full w-full flex-col">
            <div className="flex h-full w-full items-center justify-center">
              <EmptyStateCompact
                assetKey="webhook"
                title={t("prom_integrations.empty_state.title")}
                description={t("prom_integrations.empty_state.description")}
                actions={[
                  {
                    label: t("prom_integrations.add_installation"),
                    onClick: () => setShowCreateModal(true),
                  },
                ]}
                align="start"
                rootClassName="py-20"
              />
            </div>
          </div>
        )}
        {installations && installations.length > 0 && (
          <div className="mt-10">
            <AuditLogSection workspaceSlug={workspaceSlug} />
          </div>
        )}
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(IntegrationsSettingsPage);
