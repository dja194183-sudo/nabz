import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppSettings, ChatMessage, PaperTrade, Side } from "./types";

type AppState = {
  settings: AppSettings;
  watchlist: string[];
  journal: PaperTrade[];
  chat: ChatMessage[];
  wrFilter: boolean;
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
};

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
      addTrade: (trade) =>
        set({ journal: [trade, ...get().journal].slice(0, 80) }),
      updateTrade: (id, patch) =>
        set({
          journal: get().journal.map((t) =>
            t.id === id && !t.closedAt ? { ...t, ...patch, id: t.id } : t,
          ),
        }),
      closeTrade: (id, closePrice) => {
        set({
          journal: get().journal.map((t) => {
            if (t.id !== id || t.closedAt) return t;
            const { result, r } = closeResult(
              t.side,
              t.entry,
              t.sl,
              t.tp1,
              closePrice,
            );
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
          }),
        });
      },
      removeTrade: (id) =>
        set({ journal: get().journal.filter((t) => t.id !== id) }),
      importJournal: (trades) => {
        const cur = get().journal;
        const ids = new Set(cur.map((t) => t.id));
        const extra = trades.filter((t) => t?.id && !ids.has(t.id));
        set({ journal: [...extra, ...cur].slice(0, 120) });
        return extra.length;
      },
      pushChat: (msg) =>
        set({ chat: [...get().chat, msg].slice(-60) }),
      clearChat: () => set({ chat: [] }),
    }),
    {
      name: "nabz-store",
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
        return {
          ...current,
          ...p,
          journal: p.journal ?? current.journal,
          chat: p.chat ?? current.chat,
          settings: next,
        };
      },
    },
  ),
);
