import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { scanMarket } from "@/lib/server/market";
import { useAppStore } from "@/lib/store";

export function useScan(opts?: { enabled?: boolean }) {
  const timeframe = useAppStore((s) => s.settings.timeframe);
  const mode = useAppStore((s) => s.settings.mode);
  const market = useAppStore((s) => s.settings.market);
  const qc = useQueryClient();
  const [manual, setManual] = useState(false);
  const key = ["scan", market, mode] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      scanMarket({ data: { timeframe, mode, market, force: false } }),
    refetchInterval: (q) => (q.state.data?.done ? 50_000 : 1_200),
    staleTime: 1_000,
    retry: 0,
    enabled: typeof window !== "undefined" && (opts?.enabled ?? true),
  });

  async function refresh() {
    if (manual) return;
    setManual(true);
    try {
      const data = await scanMarket({
        data: { timeframe, mode, market, force: true },
      });
      qc.setQueryData(key, data);
    } finally {
      setManual(false);
    }
  }

  return {
    ...query,
    refresh,
    isRefreshing: manual || query.isFetching,
  };
}
