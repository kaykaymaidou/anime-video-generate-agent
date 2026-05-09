import { requestJson } from "@/lib/http";

export type UsageSummary = {
  totalCost: number;
  entryCount: number;
  lastEntryAt: number | null;
};

export type UsageLedgerEntryDto = {
  id: string;
  ts: number;
  taskId: string;
  shotId: string;
  cost: number;
  modelType: string;
  videoUrl?: string;
};

export function getUsageSummary() {
  return requestJson<UsageSummary>("/api/usage/summary");
}

export function getUsageLedger(limit = 100) {
  return requestJson<{ entries: UsageLedgerEntryDto[] }>(
    `/api/usage/ledger?limit=${encodeURIComponent(String(limit))}`
  );
}
