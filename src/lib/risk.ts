import type {
  Align,
  Candle,
  EntryState,
  Expansion,
  ExitAlert,
  Regime,
  Side,
} from "./types";

export const NO_EXIT: ExitAlert = { on: false, level: "none", reasons: [] };

export const NO_EXPANSION: Expansion = {
  kind: "none",
  score: 0,
  bias: null,
  reasons: [],
};

const READY_ATR = 0.35;
const STRETCH_ATR = 0.85;

export function describeEntry(
  side: Side | null,
  entry: number,
  live: number,
  atr: number,
): { entryState: EntryState; stretchAtr: number; fillable: boolean } {
  if (!side || atr <= 0 || entry <= 0) {
    return { entryState: "ready", stretchAtr: 0, fillable: true };
  }
  const signed = side === "long" ? (live - entry) / atr : (entry - live) / atr;
  if (signed <= READY_ATR) {
    return { entryState: "ready", stretchAtr: signed, fillable: true };
  }
  if (signed <= STRETCH_ATR) {
    return { entryState: "pullback", stretchAtr: signed, fillable: false };
  }
  return { entryState: "stretched", stretchAtr: signed, fillable: false };
}

function recentPivots(candles: Candle[], i: number) {
  const start = Math.max(2, i - 36);
  const highs: number[] = [];
  const lows: number[] = [];
  const end = Math.max(start, i - 1);
  for (let j = start; j <= end; j++) {
    const prev = candles[j - 1];
    const cur = candles[j];
    const next = candles[j + 1] ?? cur;
    if (!prev || !cur) continue;
    if (cur.h >= prev.h && cur.h >= next.h) highs.push(cur.h);
    if (cur.l <= prev.l && cur.l <= next.l) lows.push(cur.l);
  }
  return { highs, lows };
}

export function structureBroken(candles: Candle[], i: number, side: Side) {
  if (i < 8) return false;
  const { highs, lows } = recentPivots(candles, i);
  const close = candles[i]?.c;
  if (close == null) return false;
  if (side === "long") {
    if (highs.length < 2 || lows.length < 1) return false;
    const lastHigh = highs[highs.length - 1]!;
    const prevHigh = highs[highs.length - 2]!;
    const lastLow = lows[lows.length - 1]!;
    return lastHigh < prevHigh && close < lastLow;
  }
  if (highs.length < 1 || lows.length < 2) return false;
  const lastLow = lows[lows.length - 1]!;
  const prevLow = lows[lows.length - 2]!;
  const lastHigh = highs[highs.length - 1]!;
  return lastLow > prevLow && close > lastHigh;
}

export function assessExit(opts: {
  side: Side;
  h4: Regime;
  h1: Align;
  close: number;
  e21: number | null;
  e50: number | null;
  rsi: number;
  adx: number;
  macd: number;
  candles: Candle[];
  index: number;
}): ExitAlert {
  const reasons: string[] = [];
  let weight = 0;
  const againstH4 =
    opts.side === "long"
      ? opts.h4 === "bear" || opts.h4 === "range"
      : opts.h4 === "bull" || opts.h4 === "range";
  if (againstH4) {
    weight += opts.h4 === "range" ? 2 : 3;
    reasons.push(
      opts.h4 === "range"
        ? "روند ۴ساعته رنج شده و دیگر از معامله حمایت نمی‌کند"
        : "روند ۴ساعته برخلاف پوزیشن برگشته",
    );
  } else if (opts.h4 === "transition") {
    weight += 1;
    reasons.push("روند ۴ساعته در حال تغییر است");
  }

  const againstH1 =
    opts.h1 !== "wait" &&
    ((opts.side === "long" && opts.h1 !== "long") ||
      (opts.side === "short" && opts.h1 !== "short"));
  if (againstH1) {
    weight += 2;
    reasons.push("جهت ۱ساعته دیگر با معامله هم‌جهت نیست");
  }

  const e21 = opts.e21;
  const e50 = opts.e50;
  if (e21 != null && e50 != null) {
    const stackBroken =
      opts.side === "long"
        ? opts.close < e21 && e21 < e50
        : opts.close > e21 && e21 > e50;
    if (stackBroken) {
      weight += 2;
      reasons.push("چینش میانگین ۱۵دقیقه شکسته شده");
    }
  }

  if (structureBroken(opts.candles, opts.index, opts.side)) {
    weight += 3;
    reasons.push(
      opts.side === "long"
        ? "ساختار سقف/کف بالاتر شکسته شد"
        : "ساختار سقف/کف پایین‌تر شکسته شد",
    );
  }

  if (opts.adx < 14) {
    weight += 1;
    reasons.push("قدرت روند ضعیف شده");
  }
  const momAgainst =
    opts.side === "long"
      ? opts.macd < 0 && opts.rsi < 45
      : opts.macd > 0 && opts.rsi > 55;
  if (momAgainst) {
    weight += 1;
    reasons.push("مومنتوم برخلاف معامله است");
  }

  const level: ExitAlert["level"] =
    weight >= 5 ? "emergency" : weight >= 3 ? "caution" : "none";
  return {
    on: level !== "none",
    level,
    reasons,
  };
}

export function exitForFlippedSide(tradeSide: Side, marketSide: Side | null): ExitAlert | null {
  if (marketSide && marketSide !== tradeSide) {
    return {
      on: true,
      level: "emergency",
      reasons: ["جهت بازار نسبت به پوزیشن تو برگشته"],
    };
  }
  return null;
}

export function alertForOpenTrade(
  tradeSide: Side,
  signal: { side: Side | null; exitAlert: ExitAlert } | undefined,
): ExitAlert | null {
  if (!signal) return null;
  const flipped = exitForFlippedSide(tradeSide, signal.side);
  if (flipped) return flipped;
  if (signal.side === tradeSide && signal.exitAlert.on) return signal.exitAlert;
  return null;
}

function barRange(c: Candle) {
  return c.h - c.l;
}

function windowRange(candles: Candle[], i: number, n: number) {
  const start = Math.max(0, i - n + 1);
  let hi = -Infinity;
  let lo = Infinity;
  for (let j = start; j <= i; j++) {
    hi = Math.max(hi, candles[j]!.h);
    lo = Math.min(lo, candles[j]!.l);
  }
  return hi - lo;
}

export function assessExpansion(opts: {
  side: Side | null;
  candles: Candle[];
  index: number;
  atr: number;
  atrPrev: number | null;
  volSma: number | null;
  h4: Regime;
  funding: number | null;
  change24h: number;
}): Expansion {
  const i = opts.index;
  const row = opts.candles[i];
  if (!row || opts.atr <= 0 || i < 16) return NO_EXPANSION;

  const reasons: string[] = [];
  let up = 0;
  let dn = 0;
  const volRatio = opts.volSma && opts.volSma > 0 ? row.v / opts.volSma : 1;
  if (volRatio >= 1.8) {
    up += 22;
    dn += 22;
    reasons.push("حجم ۱۵دقیقه نسبت به میانگین پریده");
  } else if (volRatio >= 1.25) {
    up += 10;
    dn += 10;
  }

  const range12 = windowRange(opts.candles, i, 12);
  const squeezed = range12 / opts.atr <= 2.5;
  const impulse = barRange(row) >= opts.atr * 1.15;
  if (squeezed) {
    up += 14;
    dn += 14;
    reasons.push("بازه فشرده بوده");
  }
  if (squeezed && impulse) {
    up += 16;
    dn += 16;
    reasons.push("از فشردگی در حال خروج است");
  } else if (impulse && volRatio >= 1.4) {
    up += 10;
    dn += 10;
    reasons.push("کندل انبساط با حجم");
  }

  if (opts.atrPrev && opts.atrPrev > 0 && opts.atr > opts.atrPrev * 1.12) {
    up += 10;
    dn += 10;
    reasons.push("نوسان در حال باز شدن است");
  }

  if (opts.h4 === "bull") up += 16;
  else if (opts.h4 === "bear") dn += 16;

  if (opts.funding != null) {
    if (opts.funding <= -0.0003) {
      up += 12;
      reasons.push("فاندینگ منفی؛ شورت‌ها شلوغ‌اند");
    } else if (opts.funding >= 0.0005) {
      dn += 12;
      reasons.push("فاندینگ مثبت؛ لانگ‌ها شلوغ‌اند");
    }
  }

  const body = row.c - row.o;
  if (body > opts.atr * 0.45) up += 8;
  if (body < -opts.atr * 0.45) dn += 8;

  if (opts.change24h >= 0.12) up -= 18;
  if (opts.change24h <= -0.12) dn -= 18;

  up = Math.max(0, Math.min(100, Math.round(up)));
  dn = Math.max(0, Math.min(100, Math.round(dn)));
  const bias: Side | null = up === 0 && dn === 0 ? null : up >= dn ? "long" : "short";
  const score = bias === "long" ? up : bias === "short" ? dn : 0;
  if (opts.side && bias && opts.side !== bias && score < 70) {
    return { kind: "none", score: 0, bias: opts.side, reasons: [] };
  }
  let kind: Expansion["kind"] = "none";
  if (score >= 58 && (impulse || squeezed)) kind = impulse ? "expansion" : "coil";
  else if (score >= 58) kind = "expansion";
  else if (score >= 42 && squeezed) kind = "coil";
  return { kind, score, bias, reasons: reasons.slice(0, 3) };
}
