import { useQuery } from "@tanstack/react-query";

import { getUsageLedger, getUsageSummary } from "@/api/usage";

const REFETCH_MS = 25_000;
const STALE_MS = 15_000;

export function useUsageSummaryQuery() {
  return useQuery({
    queryKey: ["usage", "summary"],
    queryFn: getUsageSummary,
    refetchInterval: REFETCH_MS,
    staleTime: STALE_MS,
  });
}

export function useUsageLedgerQuery(limit = 120) {
  return useQuery({
    queryKey: ["usage", "ledger", limit],
    queryFn: () => getUsageLedger(limit),
    refetchInterval: REFETCH_MS,
    staleTime: STALE_MS,
  });
}
