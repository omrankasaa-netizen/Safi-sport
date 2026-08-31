import { env } from "../../lib/env";
import { mapRawItem, mapRawStock } from "./fieldMap";
import type { InventoryProvider, PushSaleOrder, PushSaleResult, RbmsoftItem, RbmsoftStockRow } from "./types";

const TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const resp = await fetch(url, { ...init, signal: controller.signal });
      if (resp.status >= 500 && attempt < MAX_ATTEMPTS) {
        lastError = new Error(`RBMsoft ${resp.status}`);
      } else if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`RBMsoft request failed (${resp.status}): ${text.slice(0, 300)}`);
      } else {
        return resp;
      }
    } catch (error) {
      lastError = error;
      if (attempt === MAX_ATTEMPTS) break;
    } finally {
      clearTimeout(timer);
    }
    // Backoff: 500ms, 1500ms.
    await new Promise((r) => setTimeout(r, 500 * (2 * attempt - 1)));
  }
  throw lastError instanceof Error ? lastError : new Error("RBMsoft request failed");
}

/**
 * Generic REST driver for the real RBMsoft API. Endpoint paths come from env
 * (SAFI_RBMSOFT_ITEMS_PATH/STOCK_PATH/SALE_PATH); payload field mapping lives
 * in fieldMap.ts. Never throws into a request path — syncService wraps all
 * calls and records failures in sync_runs.
 */
export function createHttpDriver(): InventoryProvider {
  const base = env.rbmsoftBaseUrl.replace(/\/$/, "");
  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${env.rbmsoftApiKey}`,
  };

  function url(path: string, since?: Date): string {
    const u = new URL(`${base}${path}`);
    if (since) u.searchParams.set("since", since.toISOString());
    return u.toString();
  }

  function extractArray(data: unknown): Record<string, unknown>[] {
    if (Array.isArray(data)) return data as Record<string, unknown>[];
    if (data && typeof data === "object") {
      for (const key of ["items", "data", "rows", "stock", "results"]) {
        const v = (data as Record<string, unknown>)[key];
        if (Array.isArray(v)) return v as Record<string, unknown>[];
      }
    }
    return [];
  }

  return {
    name: "http",

    async fetchItems(since?: Date): Promise<RbmsoftItem[]> {
      const resp = await fetchWithRetry(url(env.rbmsoftItemsPath, since), { headers: authHeaders });
      const rows = extractArray(await resp.json());
      return rows.map(mapRawItem).filter((r): r is RbmsoftItem => r != null);
    },

    async fetchStock(since?: Date): Promise<RbmsoftStockRow[]> {
      const resp = await fetchWithRetry(url(env.rbmsoftStockPath, since), { headers: authHeaders });
      const rows = extractArray(await resp.json());
      return rows.map(mapRawStock).filter((r): r is RbmsoftStockRow => r != null);
    },

    async pushSale(order: PushSaleOrder): Promise<PushSaleResult> {
      const resp = await fetchWithRetry(`${base}${env.rbmsoftSalePath}`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(order),
      });
      const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
      const externalId = data.externalId ?? data.id ?? data.saleId;
      return { ok: true, externalId: externalId == null ? undefined : String(externalId) };
    },
  };
}
