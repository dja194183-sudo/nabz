# NABZ v1.13

Toobit USDT-M futures / spot signal app (TanStack Start + React, RTL Persian).

**Not financial advice.** Backtest win rate is historical. Fees are Toobit VIP0 public table (futures maker 0.02% / taker 0.06%, spot 0%), not the user VIP tier. Max leverage per symbol comes from `GET /api/v1/futures/riskLimits`.

## Read first (for code review)

| File | What |
|---|---|
| `src/lib/engine.ts` | 4H→1H→15M→5M pipeline, confluence score, `backtestFrames` |
| `src/lib/risk.ts` | stretched/pullback entry, emergency exit, expansion |
| `src/lib/server/lock.ts` | 60s entry lock; trail SL only in favor |
| `src/lib/server/market.ts` | progressive full-market scanner |
| `src/lib/server/toobit.ts` | Toobit public API + riskLimits + VIP0 fees |
| `src/lib/server/desk-chat.ts` | AI desk (must answer from data, never “go check the app”) |
| `src/routes/journal.tsx` | journal, edit open trades, PnL 6dp + %, USDT size, fees |
| `src/routes/chat.tsx` | chat UI + desk context |
| `src/lib/store.ts` | persist |
| `src/lib/types.ts` | Signal / PaperTrade |

## Rules of the system

- Direction from 4H + 1H, setup from 15M, trigger from 5M
- Entry holds ≥60s; if price stretches away, do not chase
- Emergency exit is independent of SL/TP
- Order size is USDT notional, not %

Standalone browser file: `NABZ-app.html`
