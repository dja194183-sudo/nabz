import { useEffect, useRef } from "react";
import { loadVault, saveVault } from "@/lib/server/vault";
import { useAppStore } from "@/lib/store";

export function VaultSync() {
  const vaultId = useAppStore((s) => s.vaultId);
  const journal = useAppStore((s) => s.journal);
  const watchlist = useAppStore((s) => s.watchlist);
  const lastScan = useAppStore((s) => s.lastScan);
  const replaceVault = useAppStore((s) => s.replaceVault);
  const ready = useRef(false);

  useEffect(() => {
    let stop = false;
    void (async () => {
      try {
        const res = await loadVault({ data: { id: vaultId } });
        if (stop || !res.ok) return;
        const parsed = JSON.parse(res.payload) as {
          journal?: typeof journal;
          watchlist?: string[];
          lastScan?: typeof lastScan;
        };
        const local = useAppStore.getState();
        if (local.journal.length === 0 && parsed.journal?.length) {
          replaceVault(parsed);
        } else if (!local.lastScan && parsed.lastScan) {
          replaceVault({ lastScan: parsed.lastScan });
        }
      } catch {
        /* preview db may not be ready */
      } finally {
        ready.current = true;
      }
    })();
    return () => {
      stop = true;
    };
  }, [vaultId, replaceVault]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!ready.current) return;
      const payload = JSON.stringify({
        v: 1,
        journal,
        watchlist,
        lastScan,
      });
      void saveVault({ data: { id: vaultId, payload } }).catch(() => {});
    }, 1800);
    return () => window.clearTimeout(t);
  }, [journal, watchlist, lastScan, vaultId]);

  return null;
}
