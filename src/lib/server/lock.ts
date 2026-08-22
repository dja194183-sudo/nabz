import type { Mode, Side, Signal } from "../types";
import { describeEntry } from "../risk";

export const SIGNAL_HOLD_MS = 60_000;

type Slot = {
  side: Side;
  entry: number;
  entryKind: "market" | "limit";
  sl: number;
  tp1: number;
  tp2: number;
  atr: number;
  issuedAt: number;
};

const slots = new Map<string, Slot>();

function slotKey(mode: Mode, symbol: string, market?: string) {
  return `${mode}:${market ?? "futures"}:${symbol}`;
}

function stopHit(side: Side, sl: number, live: number) {
  return side === "long" ? live <= sl : live >= sl;
}

export function trailStop(
  side: Side,
  lockedSl: number,
  freshSl: number,
  live: number,
  atr = 0,
) {
  const gap = Math.max(Math.abs(live) * 0.001, (atr || Math.abs(live) * 0.01) * 0.25);
  if (side === "long") {
    const sl = Math.max(lockedSl, freshSl);
    if (sl >= live - gap) return lockedSl;
    return sl;
  }
  const sl = Math.min(lockedSl, freshSl);
  if (sl <= live + gap) return lockedSl;
  return sl;
}

function withSlot(signal: Signal, slot: Slot, live: number, freshSl: number): Signal {
  const sl = trailStop(slot.side, slot.sl, freshSl, live, slot.atr);
  slot.sl = sl;
  const dist = describeEntry(slot.side, slot.entry, live, slot.atr || signal.atr);
  const heldAgainst =
    signal.side != null && signal.side !== slot.side
      ? `جهت تا پایان قفل یک‌دقیقه‌ای عوض نمی‌شود (خوانش تازه: ${signal.side === "long" ? "لانگ" : "شورت"}).`
      : "";
  return {
    ...signal,
    side: slot.side,
    entry: slot.entry,
    entryKind: slot.entryKind,
    sl,
    tp1: slot.tp1,
    tp2: slot.tp2,
    issuedAt: slot.issuedAt,
    entryLocked: true,
    fillable: dist.fillable,
    entryState: dist.entryState,
    stretchAtr: dist.stretchAtr,
    pipeline: heldAgainst
      ? { ...signal.pipeline, reason: `${signal.pipeline.reason} · ${heldAgainst}` }
      : signal.pipeline,
    tier:
      signal.tier === "none" && Date.now() - slot.issuedAt < SIGNAL_HOLD_MS
        ? "setup"
        : signal.side === slot.side
          ? signal.tier
          : Date.now() - slot.issuedAt < SIGNAL_HOLD_MS
            ? "setup"
            : signal.tier,
  };
}

export function stabilizeSignal(signal: Signal, mode: Mode): Signal {
  const k = slotKey(mode, signal.symbol, signal.market);
  const now = Date.now();
  const live = signal.price;
  const prev = slots.get(k);

  if (prev && stopHit(prev.side, prev.sl, live)) {
    slots.delete(k);
  }

  const current = slots.get(k);
  const hold = current != null && now - current.issuedAt < SIGNAL_HOLD_MS;
  const side = signal.side;

  if (current && side === current.side) {
    return withSlot(signal, current, live, signal.sl);
  }

  if (current && hold) {
    return withSlot(signal, current, live, current.sl);
  }

  if (side && (signal.tier === "setup" || signal.tier === "watch")) {
    const next: Slot = {
      side,
      entry: signal.entry,
      entryKind: signal.entryKind,
      sl: signal.sl,
      tp1: signal.tp1,
      tp2: signal.tp2,
      atr: signal.atr,
      issuedAt: now,
    };
    slots.set(k, next);
    const dist = describeEntry(side, signal.entry, live, signal.atr);
    return {
      ...signal,
      issuedAt: now,
      entryLocked: true,
      fillable: dist.fillable,
      entryState: dist.entryState,
      stretchAtr: dist.stretchAtr,
    };
  }

  if (current) slots.delete(k);
  return {
    ...signal,
    issuedAt: signal.issuedAt || now,
    entryLocked: false,
  };
}
