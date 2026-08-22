# NABZ v1.21

NABZ v1.21 (optimized). Frozen v1.17: https://github.com/dja194183-sudo/nabz/releases/tag/v1.17-saved

# NABZ v1.17

Toobit USDT-M futures signal PWA (4H → 1H → 15M → 5M). Persian RTL.

**Download zip:** [nabz-v1.17.zip](https://github.com/dja194183-sudo/nabz/releases/download/v1.17/nabz-v1.17.zip)

Also in repo root: `nabz-v1.17.zip`

Core files for review:
- `src/lib/engine.ts` — confluence + backtest
- `src/lib/risk.ts` — stretch, trailing SL, emergency exit
- `src/lib/server/lock.ts` — 60s entry lock
- `src/lib/server/market.ts` — scanner / pair detail
- `src/lib/server/toobit.ts` — Toobit public API
- `src/lib/server/toobit-trade.ts` — optional live orders
- `src/lib/server/desk-chat.ts` + `src/lib/desk-local.ts` — local desk (no Grok model)
- `src/routes/journal.tsx` — paper journal / PnL
- `src/lib/store.ts` — local persist + vault id

Not investment advice.

## هاست ایران

بدون VPN: ببین [HOST-IRAN.md](HOST-IRAN.md) — Liara.
