import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { scanMarket } from "@/lib/server/market";
import { useAppStore } from "@/lib/store";

export function useScan(opts?: { enabled?: boolean }) {
  const timeframe = useAppStore((s) => s.settings.timeframe);
  const mode = useAppStore((s) => s.settings.mode);
  const market = useAppStore((s) => s.settings.market);
  const lastScan = useAppStore((s) => s.lastScan);
  const setLastScan = useAppStore((s) => s.setLastScan);
  const qc = useQueryClient();
  const [manual, setManual] = useState(false);
  const key = ["scan", market, mode] as const;
  const cached =
    lastScan && lastScan.market === market && lastScan.mode === mode
      ? lastScan
      : undefined;
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      scanMarket({ data: { timeframe, mode, market, force: false } }),
    refetchInterval: (q) => (q.state.data?.done ? 90_000 : 4_000),
    staleTime: 8_000,
    retry: 0,
    placeholderData: cached,
    enabled: typeof window !== "undefined" && (opts?.enabled ?? true),
  });

  useEffect(() => {
    if (query.data?.signals?.length) setLastScan(query.data);
  }, [query.data, setLastScan]);

  async function refresh() {
    if (manual) return;
    setManual(true);
    try {
      const data = await scanMarket({
        data: { timeframe, mode, market, force: true },
      });
      qc.setQueryData(key, data);
      setLastScan(data);
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
