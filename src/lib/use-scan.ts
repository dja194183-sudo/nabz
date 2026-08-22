import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { scanMarket } from "@/lib/server/market";
import { useAppStore } from "@/lib/store";
import type { ScanResult } from "@/lib/types";

function preferFresh(live: ScanResult | undefined, cached?: ScanResult | null) {
  if (!live) return cached ?? undefined;
  if (!cached?.signals?.length) return live;
  if (
    !live.done &&
    cached.done &&
    live.market === cached.market &&
    live.mode === cached.mode &&
    live.signals.length < Math.min(8, cached.signals.length)
  ) {
    return { ...live, signals: cached.signals };
  }
  return live;
}

export function useScan(opts?: { enabled?: boolean }) {
  const timeframe = useAppStore((s) => s.settings.timeframe);
  const mode = useAppStore((s) => s.settings.mode);
  const market = useAppStore((s) => s.settings.market);
  const lastScan = useAppStore((s) => s.lastScan);
  const setLastScan = useAppStore((s) => s.setLastScan);
  const qc = useQueryClient();
  const [manual, setManual] = useState(false);
  const [painted, setPainted] = useState(false);
  const key = ["scan", market, mode] as const;

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setPainted(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      scanMarket({ data: { timeframe, mode, market, force: false } }),
    refetchInterval: (q) => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return false;
      }
      return q.state.data?.done ? 90_000 : 8_000;
    },
    staleTime: 60_000,
    retry: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    placeholderData: (prev) => prev ?? lastScan ?? undefined,
    enabled:
      typeof window !== "undefined" &&
      painted &&
      (opts?.enabled ?? true),
  });

  const data = preferFresh(query.data, lastScan);

  useEffect(() => {
    if (query.data?.done) setLastScan(query.data);
  }, [query.data, setLastScan]);

  async function refresh() {
    if (manual) return;
    setManual(true);
    try {
      const next = await scanMarket({
        data: { timeframe, mode, market, force: true },
      });
      qc.setQueryData(key, next);
      if (next.done) setLastScan(next);
    } finally {
      setManual(false);
    }
  }

  return {
    ...query,
    data,
    refresh,
    isRefreshing: manual,
    isLoading: !data && query.isLoading,
  };
}
