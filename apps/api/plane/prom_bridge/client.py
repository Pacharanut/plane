# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Thin HTTP client for calling the Prom Integration Hub's service-token-protected API.

Every prom_bridge view is a relay: the browser authenticates to Plane via its own session cookie
(BaseSessionAuthentication, same as every other plane.app view); this client then calls Hub
server-to-server using PROM_HUB_SERVICE_TOKEN, which is read from Django settings and never
serialized back to the client. See core_patches/0001-prom-bridge/README.md for why this exists
(Hub's own API is authenticated by one shared service token, unsafe to embed in frontend JS).

Uses plane.utils.url_security.pinned_fetch -- the same SSRF-safe helper
apps/api/plane/bgtasks/webhook_task.py already uses for outbound webhook delivery -- rather than
a bare `requests` call. Hub's configured base URL is operator-set infrastructure, not
user-supplied input, so its host is always added to `allowed_hosts`, the same trust tier
WEBHOOK_ALLOWED_HOSTS already gives an admin-configured webhook target elsewhere in this codebase.
"""

from urllib.parse import urlsplit

from django.conf import settings

from plane.utils.url_security import pinned_fetch


class HubNotConfigured(Exception):
    """Raised when PROM_HUB_BASE_URL / PROM_HUB_SERVICE_TOKEN / PROM_INSTANCE_ID /
    PROM_CUSTOMER_ID aren't all set. A Plane deployment with no Prom Hub configured must not
    crash on these routes -- callers translate this into a 503, not an unhandled exception."""


class HubClient:
    """One instance per request. Raises HubNotConfigured at construction time if any of the
    four required settings are missing, so every view can do a single try/except around
    `HubClient()` rather than checking each setting individually."""

    def __init__(self):
        base_url = getattr(settings, "PROM_HUB_BASE_URL", None)
        service_token = getattr(settings, "PROM_HUB_SERVICE_TOKEN", None)
        instance_id = getattr(settings, "PROM_INSTANCE_ID", None)
        customer_id = getattr(settings, "PROM_CUSTOMER_ID", None)
        if not base_url or not service_token or not instance_id or not customer_id:
            raise HubNotConfigured(
                "PROM_HUB_BASE_URL / PROM_HUB_SERVICE_TOKEN / PROM_INSTANCE_ID / "
                "PROM_CUSTOMER_ID must all be configured for this Plane instance."
            )
        self._base_url = base_url.rstrip("/")
        self._service_token = service_token
        self.instance_id = instance_id
        self.customer_id = customer_id
        self._allowed_host = urlsplit(self._base_url).hostname

    def request(self, method, path, *, json_body=None, params=None):
        """Issue one relayed request to Hub. Returns the raw `requests.Response` -- callers
        translate it into a DRF Response (see views._relay_response) rather than this client
        trying to guess the right shape for every caller."""
        url = f"{self._base_url}{path}"
        headers = {
            "X-Hub-Service-Token": self._service_token,
            "Content-Type": "application/json",
        }
        return pinned_fetch(
            method,
            url,
            allowed_hosts=[self._allowed_host] if self._allowed_host else None,
            headers=headers,
            timeout=15,
            json=json_body,
            params=params,
        )
