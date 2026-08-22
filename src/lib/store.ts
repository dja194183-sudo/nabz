import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppSettings, ChatMessage, PaperTrade, ScanResult, Side } from "./types";

type AppState = {
  settings: AppSettings;
  watchlist: string[];
  journal: PaperTrade[];
  chat: ChatMessage[];
  wrFilter: boolean;
  vaultId: string;
  lastScan: ScanResult | null;
  setSettings: (patch: Partial<AppSettings>) => void;
  toggleWatch: (symbol: string) => void;
  setWrFilter: (on: boolean) => void;
  addTrade: (trade: PaperTrade) => void;
  updateTrade: (id: string, patch: Partial<PaperTrade>) => void;
  closeTrade: (id: string, closePrice: number) => void;
  removeTrade: (id: string) => void;
  importJournal: (trades: PaperTrade[]) => number;
  pushChat: (msg: ChatMessage) => void;
  clearChat: () => void;
  setLastScan: (scan: ScanResult | null) => void;
  setVaultId: (id: string) => void;
  replaceVault: (data: {
    journal?: PaperTrade[];
    watchlist?: string[];
    lastScan?: ScanResult | null;
  }) => void;
};

const BACKUP_KEY = "nabz-journal-backup";

function readBackup(): PaperTrade[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { journal?: PaperTrade[] };
    return Array.isArray(parsed.journal) ? parsed.journal : [];
  } catch {
    return [];
  }
}

function writeBackup(journal: PaperTrade[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      BACKUP_KEY,
      JSON.stringify({ v: 1, at: Date.now(), journal }),
    );
  } catch {
    /* quota */
  }
}

function newVaultId() {
  const n = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `NABZ-${n}`;
}

function slimScan(scan: ScanResult): ScanResult {
  return {
    ...scan,
    signals: scan.signals.slice(0, 40).map((s) => ({
      ...s,
      candles: [],
      spark: (s.spark ?? []).slice(-12),
    })),
  };
}

const defaults: AppSettings = {
  timeframe: "15m",
  mode: "strict",
  market: "futures",
  capital: 50,
  orderUsd: 50,
  riskPct: 1,
  leverage: 10,
  leverageBySymbol: {},
  minWinRate: 52,
  apiKey: "",
  apiSecret: "",
};

function closeResult(
  side: Side,
  entry: number,
  sl: number,
  tp1: number,
  closePrice: number,
) {
  const slDist = Math.abs(entry - sl);
  const pnlMove = side === "long" ? closePrice - entry : entry - closePrice;
  const r = slDist === 0 ? 0 : pnlMove / slDist;
  const hitTp =
    side === "long" ? closePrice >= tp1 : closePrice <= tp1;
  const hitSl =
    side === "long" ? closePrice <= sl : closePrice >= sl;
  let result: "win" | "loss" | "be" = "be";
  if (hitTp || r >= 0.4) result = "win";
  else if (hitSl || r <= -0.4) result = "loss";
  else if (r > 0.05) result = "win";
  else if (r < -0.05) result = "loss";
  return { result, r };
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      settings: defaults,
      watchlist: ["BTC-SWAP-USDT", "ETH-SWAP-USDT", "SOL-SWAP-USDT"],
      journal: [],
      chat: [],
      wrFilter: true,
      vaultId: newVaultId(),
      lastScan: null,
      setSettings: (patch) =>
        set({ settings: { ...get().settings, ...patch } }),
      toggleWatch: (symbol) => {
        const cur = get().watchlist;
        set({
          watchlist: cur.includes(symbol)
            ? cur.filter((s) => s !== symbol)
            : [symbol, ...cur].slice(0, 24),
        });
      },
      setWrFilter: (on) => set({ wrFilter: on }),
      addTrade: (trade) => {
        const journal = [trade, ...get().journal].slice(0, 80);
        writeBackup(journal);
        set({ journal });
      },
      updateTrade: (id, patch) => {
        const journal = get().journal.map((t) =>
          t.id === id ? { ...t, ...patch, id: t.id } : t,
        );
        writeBackup(journal);
        set({ journal });
      },
      closeTrade: (id, closePrice) => {
        const journal = get().journal.map((t) => {
          if (t.id !== id || t.closedAt) return t;
          const { result } = closeResult(t.side, t.entry, t.sl, t.tp1, closePrice);
          const bps = (t.takerBps ?? 6) / 10_000;
          const gross =
            t.side === "long"
              ? (closePrice - t.entry) * t.qty
              : (t.entry - closePrice) * t.qty;
          const fee = t.qty * t.entry * bps + t.qty * closePrice * bps;
          return {
            ...t,
            closedAt: Date.now(),
            closePrice,
            result,
            pnlUsd: gross - fee,
          };
        });
        writeBackup(journal);
        set({ journal });
      },
      removeTrade: (id) => {
        const journal = get().journal.filter((t) => t.id !== id);
        writeBackup(journal);
        set({ journal });
      },
      importJournal: (trades) => {
        const cur = get().journal;
        const ids = new Set(cur.map((t) => t.id));
        const extra = trades.filter((t) => t?.id && !ids.has(t.id));
        const journal = [...extra, ...cur].slice(0, 120);
        writeBackup(journal);
        set({ journal });
        return extra.length;
      },
      pushChat: (msg) =>
        set({ chat: [...get().chat, msg].slice(-60) }),
      clearChat: () => set({ chat: [] }),
      setLastScan: (scan) => set({ lastScan: scan ? slimScan(scan) : null }),
      setVaultId: (id) => set({ vaultId: id.toUpperCase().slice(0, 24) }),
      replaceVault: (data) => {
        const journal = data.journal ?? get().journal;
        writeBackup(journal);
        set({
          journal,
          watchlist: data.watchlist ?? get().watchlist,
          lastScan: data.lastScan ?? get().lastScan,
        });
      },
    }),
    {
      name: "nabz-store",
      partialize: (state) => ({
        settings: {
          ...state.settings,
          apiKey: "",
          apiSecret: "",
        },
        watchlist: state.watchlist,
        journal: state.journal,
        wrFilter: state.wrFilter,
        vaultId: state.vaultId,
        lastScan: state.lastScan,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        const next = {
          ...defaults,
          ...(p.settings ?? {}),
          leverageBySymbol: {
            ...defaults.leverageBySymbol,
            ...(p.settings?.leverageBySymbol ?? {}),
          },
        };
        if (next.capital === 1000) next.capital = 50;
        if (next.orderUsd == null) next.orderUsd = 50;
        next.apiKey = "";
        next.apiSecret = "";
        const backup = (!p.journal || p.journal.length === 0) ? readBackup() : [];
        const journal =
          p.journal && p.journal.length > 0 ? p.journal : backup.length ? backup : current.journal;
        return {
          ...current,
          ...p,
          journal,
          chat: p.chat ?? current.chat,
          settings: next,
          vaultId: p.vaultId && p.vaultId.length >= 8 ? p.vaultId : current.vaultId,
          lastScan: p.lastScan ?? current.lastScan,
        };
      },
    },
  ),
);
