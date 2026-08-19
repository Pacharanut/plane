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
// services
import { PromBridgeService } from "@/services/prom-bridge.service";

const promBridgeService = new PromBridgeService();

const PAGE_SIZE = 20;

type Props = {
  workspaceSlug: string;
};

// Secondary view, kept intentionally simple per the Stage 3 directive: no filters, no per-row
// detail expansion -- occurred_at / action / result_status / error_code only, offset pagination.
export function AuditLogSection(props: Props) {
  const { workspaceSlug } = props;
  const { t } = useTranslation();
  const [offset, setOffset] = useState(0);

  const { data: entries, isLoading } = useSWR(`PROM_AUDIT_LOG_${workspaceSlug}_${offset}`, () =>
    promBridgeService.getAuditLog(workspaceSlug, { limit: PAGE_SIZE, offset })
  );

  return (
    <div className="space-y-3">
      <h4 className="text-14 font-medium">{t("prom_integrations.audit_log.title")}</h4>
      <div className="overflow-x-auto rounded-md border-[0.5px] border-subtle">
        <table className="w-full text-13">
          <thead>
            <tr className="border-b-[0.5px] border-subtle text-left text-tertiary">
              <th className="px-3 py-2 font-medium">{t("prom_integrations.audit_log.occurred_at")}</th>
              <th className="px-3 py-2 font-medium">{t("prom_integrations.audit_log.action")}</th>
              <th className="px-3 py-2 font-medium">{t("prom_integrations.audit_log.result_status")}</th>
              <th className="px-3 py-2 font-medium">{t("prom_integrations.audit_log.error_code")}</th>
            </tr>
          </thead>
          <tbody>
            {(entries ?? []).map((entry) => (
              <tr key={entry.id} className="border-b-[0.5px] border-subtle last:border-0">
                <td className="px-3 py-2">{new Date(entry.occurred_at).toLocaleString()}</td>
                <td className="px-3 py-2">{entry.action}</td>
                <td className="px-3 py-2">
                  <span className={entry.result_status === "success" ? "text-success-primary" : "text-danger-primary"}>
                    {entry.result_status}
                  </span>
                </td>
                <td className="px-3 py-2 text-tertiary">{entry.error_code ?? "-"}</td>
              </tr>
            ))}
            {!isLoading && (entries ?? []).length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-tertiary" colSpan={4}>
                  {t("prom_integrations.audit_log.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
        >
          {t("prom_integrations.audit_log.previous")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={(entries ?? []).length < PAGE_SIZE}
          onClick={() => setOffset(offset + PAGE_SIZE)}
        >
          {t("prom_integrations.audit_log.next")}
        </Button>
      </div>
    </div>
  );
}
