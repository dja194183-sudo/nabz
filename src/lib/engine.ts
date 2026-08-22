import { adx, atr, ema, lastSwing, macdHist, rsi, sma } from "./ta";
import { assessExit, assessExpansion, describeEntry, NO_EXIT } from "./risk";
import type {
  Align,
  BacktestStats,
  Candle,
  DataQuality,
  FrameQuality,
  Interval,
  MarketKind,
  Mode,
  Pipeline,
  Reason,
  Regime,
  Side,
  Signal,
  SignalTier,
} from "./types";
import { baseFromSymbol } from "./format";

export const MODE_CONFIG = {
  strict: { minScore: 72, minAdx: 18 },
  balanced: { minScore: 62, minAdx: 14 },
} as const;

const RR1 = 1.2;
const RR2 = 2.0;
const ATR_SL = 1.45;
const SLIP_BPS = 2;
const HOLD_BARS = 24;
const COOLDOWN_BARS = 6;

export const TF_MS: Record<Interval, number> = {
  "4h": 4 * 60 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "5m": 5 * 60 * 1000,
};

export const TF_MIN: Record<Interval, number> = {
  "4h": 80,
  "1h": 150,
  "15m": 180,
  "5m": 160,
};

type Enriched = {
  candles: Candle[];
  e21: (number | null)[];
  e50: (number | null)[];
  rsi: (number | null)[];
  atr: (number | null)[];
  macd: (number | null)[];
  adx: (number | null)[];
  volSma: (number | null)[];
};

export type Frames = {
  h4: Enriched;
  h1: Enriched;
  m15: Enriched;
  m5: Enriched | null;
};

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n));
}

function enrich(candles: Candle[]): Enriched {
  const closes = candles.map((c) => c.c);
  const vols = candles.map((c) => c.v);
  return {
    candles,
    e21: ema(closes, 21),
    e50: ema(closes, 50),
    rsi: rsi(closes, 14),
    atr: atr(candles, 14),
    macd: macdHist(closes),
    adx: adx(candles, 14),
    volSma: sma(vols, 20),
  };
}

export function closedCandles(rows: Candle[], interval: Interval, asOf = Date.now()) {
  const step = TF_MS[interval];
  return rows.filter((c) => c.t + step <= asOf);
}

export function validateFrame(
  interval: Interval,
  rows: Candle[],
  asOf = Date.now(),
): FrameQuality {
  const need = TF_MIN[interval];
  const step = TF_MS[interval];
  const out: FrameQuality = {
    interval,
    ok: false,
    count: rows.length,
    need,
    reason: "",
  };
  if (rows.length < need) {
    out.reason = `${rows.length}/${need} کندل`;
    return out;
  }
  const last = rows[rows.length - 1]!;
  if (asOf - last.t > step * 3) {
    out.reason = "داده کهنه است";
    return out;
  }
  let bigGaps = 0;
  for (let i = 1; i < rows.length; i++) {
    const gap = rows[i]!.t - rows[i - 1]!.t;
    if (gap > step * 3) bigGaps += 1;
  }
  if (bigGaps > 12) {
    out.reason = "شکاف‌های زیاد در تاریخچه";
    return out;
  }
  out.ok = true;
  out.reason = "سالم";
  return out;
}

export function validateFrames(frames: Frames, asOf = Date.now()): DataQuality {
  const list = [
    validateFrame("4h", frames.h4.candles, asOf),
    validateFrame("1h", frames.h1.candles, asOf),
    validateFrame("15m", frames.m15.candles, asOf),
  ];
  if (frames.m5) list.push(validateFrame("5m", frames.m5.candles, asOf));
  return { ok: list.every((f) => f.ok || f.interval === "5m"), frames: list };
}

function lastClosedIndex(rows: Candle[], interval: Interval, asOf: number) {
  const step = TF_MS[interval];
  let i = rows.length - 1;
  while (i >= 0 && rows[i]!.t + step > asOf) i -= 1;
  return i;
}

function classifyRegime(e: Enriched, i: number): Regime {
  const c = e.candles[i];
  const e21 = e.e21[i];
  const e50 = e.e50[i];
  const mac = e.macd[i];
  const r = e.rsi[i];
  if (!c || e21 == null || e50 == null) return "range";
  const trend = Math.abs(e21 - e50) / Math.max(c.c, 1e-9);
  const mom = mac ?? 0;
  if (trend < 0.0018 && Math.abs(mom) < c.c * 0.0004) return "range";
  const rsiV = r ?? 50;
  if (e21 > e50 && mom >= 0 && rsiV >= 50) return "bull";
  if (e21 < e50 && mom <= 0 && rsiV <= 50) return "bear";
  return "transition";
}

function directionAt(e: Enriched, i: number): Align {
  const e21 = e.e21[i];
  const e50 = e.e50[i];
  const mac = e.macd[i];
  const r = e.rsi[i];
  if (e21 == null || e50 == null) return "wait";
  const s =
    (e21 > e50 ? 1 : -1) +
    ((mac ?? 0) >= 0 ? 1 : -1) +
    ((r ?? 50) >= 50 ? 1 : -1);
  return s >= 2 ? "long" : s <= -2 ? "short" : "wait";
}

function setupAt(e: Enriched, i: number): Align {
  if (i < 4) return "wait";
  const a = e.candles[i]!;
  const b = e.candles[i - 1]!;
  const e21 = e.e21[i];
  const prevE = e.e21[i - 1];
  const r = e.rsi[i] ?? 50;
  if (e21 == null || prevE == null) return "wait";
  const up = a.c > e21 && e21 >= prevE;
  const dn = a.c < e21 && e21 <= prevE;
  const breakoutUp = a.c > b.h;
  const breakoutDn = a.c < b.l;
  if ((up && r >= 52) || (breakoutUp && r >= 50 && e21 > (e.e50[i] ?? e21))) {
    return "long";
  }
  if ((dn && r <= 48) || (breakoutDn && r <= 50 && e21 < (e.e50[i] ?? e21))) {
    return "short";
  }
  return "wait";
}

function triggerAt(e: Enriched, i: number, dir: Side): Align {
  if (i < 2) return "wait";
  const a = e.candles[i]!;
  const b = e.candles[i - 1]!;
  const atrV = e.atr[i] ?? a.c * 0.005;
  const e21 = e.e21[i];
  const prevE = e.e21[i - 1];
  const r = e.rsi[i] ?? 50;
  const body = Math.abs(a.c - a.o);
  const impulse = body > atrV * 0.2;
  if (dir === "long") {
    const brk = a.c > b.h && a.c > a.o && impulse;
    const reclaim = e21 != null && prevE != null && a.c > e21 && e21 >= prevE && r >= 50;
    if (brk || reclaim) return "long";
  } else {
    const brk = a.c < b.l && a.c < a.o && impulse;
    const reclaim = e21 != null && prevE != null && a.c < e21 && e21 <= prevE && r <= 50;
    if (brk || reclaim) return "short";
  }
  return "wait";
}

function candidateFrom(h4: Regime, h1: Align): Align {
  if (h4 === "range" || h4 === "transition") return "wait";
  if (h4 === "bull" && h1 === "long") return "long";
  if (h4 === "bear" && h1 === "short") return "short";
  return "wait";
}

export function buildPipeline(frames: Frames, asOf: number): Pipeline {
  const i4 = lastClosedIndex(frames.h4.candles, "4h", asOf);
  const i1 = lastClosedIndex(frames.h1.candles, "1h", asOf);
  const i15 = lastClosedIndex(frames.m15.candles, "15m", asOf);
  const h4 = i4 >= 50 ? classifyRegime(frames.h4, i4) : "range";
  const h1 = i1 >= 50 ? directionAt(frames.h1, i1) : "wait";
  const candidate = candidateFrom(h4, h1);
  const m15 =
    candidate === "wait" || i15 < 60 ? "wait" : setupAt(frames.m15, i15);
  let m5: Align = "wait";
  if (frames.m5 && candidate !== "wait") {
    const i5 = lastClosedIndex(frames.m5.candles, "5m", asOf);
    if (i5 >= 30) m5 = triggerAt(frames.m5, i5, candidate);
  }
  const mapped = [h4, h1, m15, m5].map((v) =>
    v === "bull" || v === "long" ? "long" : v === "bear" || v === "short" ? "short" : "wait",
  );
  const aligned = candidate === "wait" ? 0 : mapped.filter((v) => v === candidate).length;
  const triggerOk = m5 === candidate && candidate !== "wait";
  let reason = "";
  if (h4 === "range") reason = "بازار ۴ساعته بدون جهت مشخص است";
  else if (h4 === "transition") reason = "روند ۴ساعته در حال تغییر است";
  else if (candidate === "wait") reason = `تضاد ۴ساعته (${h4}) با ۱ساعته (${h1})`;
  else if (m15 !== candidate) reason = `جهت ${candidate} هست؛ ستاپ ۱۵دقیقه هنوز شکل نگرفته`;
  else if (triggerOk) reason = `${candidate === "long" ? "لانگ" : "شورت"} — ۴H و ۱H و ۱۵M و ۵M هم‌جهت‌اند`;
  else reason = `${candidate === "long" ? "لانگ" : "شورت"} — ستاپ ۱۵دقیقه معتبر است؛ تریگر ۵دقیقه هنوز نرم است`;
  return { h4, h1, m15, m5, aligned, triggerOk, reason };
}

function confluenceScore(
  frames: Frames,
  pipe: Pipeline,
  funding: number | null,
): { score: number; side: Side | null; reasons: Reason[]; adx: number; rsi: number } {
  const i15 = frames.m15.candles.length - 1;
  const i1 = frames.h1.candles.length - 1;
  const e21 = frames.m15.e21[i15];
  const e50 = frames.m15.e50[i15];
  const close = frames.m15.candles[i15]?.c ?? 0;
  const r = frames.m15.rsi[i15] ?? 50;
  const d = frames.h1.adx[i1] ?? frames.m15.adx[i15] ?? 0;
  const atrV = frames.m15.atr[i15] ?? 0;
  const vol = frames.m15.candles[i15]?.v ?? 0;
  const vSma = frames.m15.volSma[i15];
  const mac = frames.m15.macd[i15] ?? 0;
  const candidate = candidateFrom(pipe.h4, pipe.h1);
  const side: Side | null = candidate === "wait" ? null : candidate;

  let long = 0;
  let short = 0;
  const reasonsL: Reason[] = [];
  const reasonsS: Reason[] = [];

  const h4L = pipe.h4 === "bull";
  const h4S = pipe.h4 === "bear";
  long += h4L ? 26 : pipe.h4 === "transition" ? 6 : 0;
  short += h4S ? 26 : pipe.h4 === "transition" ? 6 : 0;
  reasonsL.push({ id: "h4", label: "روند ۴ساعته صعودی", ok: h4L });
  reasonsS.push({ id: "h4", label: "روند ۴ساعته نزولی", ok: h4S });

  const h1L = pipe.h1 === "long";
  const h1S = pipe.h1 === "short";
  long += h1L ? 20 : 0;
  short += h1S ? 20 : 0;
  reasonsL.push({ id: "h1", label: "جهت ۱ساعته لانگ", ok: h1L });
  reasonsS.push({ id: "h1", label: "جهت ۱ساعته شورت", ok: h1S });

  const s15L = pipe.m15 === "long";
  const s15S = pipe.m15 === "short";
  long += s15L ? 16 : 0;
  short += s15S ? 16 : 0;
  reasonsL.push({ id: "m15", label: "ستاپ ۱۵دقیقه لانگ", ok: s15L });
  reasonsS.push({ id: "m15", label: "ستاپ ۱۵دقیقه شورت", ok: s15S });

  long += pipe.m5 === "long" ? 10 : 0;
  short += pipe.m5 === "short" ? 10 : 0;
  reasonsL.push({ id: "m5", label: "تریگر ۵دقیقه تأیید شد", ok: pipe.m5 === "long" });
  reasonsS.push({ id: "m5", label: "تریگر ۵دقیقه تأیید شد", ok: pipe.m5 === "short" });

  const stackL = e21 != null && e50 != null && close > e50 && e21 >= e50;
  const stackS = e21 != null && e50 != null && close < e50 && e21 <= e50;
  long += stackL ? 8 : 0;
  short += stackS ? 8 : 0;
  reasonsL.push({ id: "ema", label: "چینش میانگین‌ها هم‌جهت", ok: stackL });
  reasonsS.push({ id: "ema", label: "چینش میانگین‌ها هم‌جهت", ok: stackS });

  const adxOk = d >= 16;
  long += adxOk ? 8 : 2;
  short += adxOk ? 8 : 2;
  reasonsL.push({ id: "adx", label: "بازار روند دارد", ok: adxOk });
  reasonsS.push({ id: "adx", label: "بازار روند دارد", ok: adxOk });

  const volOk = vSma != null ? vol >= vSma * 0.85 : true;
  long += volOk ? 6 : 1;
  short += volOk ? 6 : 1;
  reasonsL.push({ id: "vol", label: "حجم همراهی می‌کند", ok: volOk });
  reasonsS.push({ id: "vol", label: "حجم همراهی می‌کند", ok: volOk });

  if (mac > 0) long += 4;
  if (mac < 0) short += 4;

  if (funding != null) {
    if (funding > 0.0006) {
      long -= 6;
      short += 4;
    } else if (funding < -0.0006) {
      short -= 6;
      long += 4;
    }
  }

  long = clamp(Math.round(long), 0, 100);
  short = clamp(Math.round(short), 0, 100);
  const scoredSide: Side | null =
    side ?? (long === 0 && short === 0 ? null : long >= short ? "long" : "short");
  const score = scoredSide === "long" ? long : scoredSide === "short" ? short : 0;
  void atrV;
  return {
    score,
    side: scoredSide,
    reasons: scoredSide === "short" ? reasonsS : reasonsL,
    adx: d,
    rsi: r,
  };
}

export function tradePlan(
  side: Side,
  row: Candle,
  atrV: number,
  swingLow: number,
  swingHigh: number,
  e21: number | null,
) {
  const slDist = Math.max(
    ATR_SL * atrV,
    side === "short" ? Math.max(0, swingHigh - row.c) : Math.max(0, row.c - swingLow),
  );
  const distEma = e21 != null && atrV > 0 ? Math.abs(row.c - e21) / atrV : 0;
  const stretched = distEma > 0.45;
  const entryKind: "market" | "limit" = stretched && e21 != null ? "limit" : "market";
  const entry = entryKind === "limit" && e21 != null ? e21 : row.c;
  const sl = side === "short" ? entry + slDist : entry - slDist;
  const tp1 = side === "short" ? entry - RR1 * slDist : entry + RR1 * slDist;
  const tp2 = side === "short" ? entry - RR2 * slDist : entry + RR2 * slDist;
  return { entry, entryKind, sl, tp1, tp2, slDist };
}

function slipPrice(side: Side, price: number, isEntry: boolean) {
  const s = SLIP_BPS / 10_000;
  if (side === "long") return isEntry ? price * (1 + s) : price * (1 - s);
  return isEntry ? price * (1 - s) : price * (1 + s);
}

export function tradeOutcome(
  side: Side,
  entry: number,
  stop: number,
  tp: number,
  future: Candle[],
  maxBars = HOLD_BARS,
): { result: "WIN" | "LOSS" | "TIMEOUT"; bars: number; exit: number } {
  const n = Math.min(maxBars, future.length);
  for (let j = 0; j < n; j++) {
    const bar = future[j]!;
    const hitSL = side === "long" ? bar.l <= stop : bar.h >= stop;
    const hitTP = side === "long" ? bar.h >= tp : bar.l <= tp;
    if (hitSL && hitTP) {
      return { result: "LOSS", bars: j + 1, exit: slipPrice(side, stop, false) };
    }
    if (hitSL) {
      return { result: "LOSS", bars: j + 1, exit: slipPrice(side, stop, false) };
    }
    if (hitTP) {
      return { result: "WIN", bars: j + 1, exit: slipPrice(side, tp, false) };
    }
  }
  const last = future[Math.max(0, n - 1)];
  return {
    result: "TIMEOUT",
    bars: n,
    exit: last ? slipPrice(side, last.c, false) : entry,
  };
}

export function netR(
  side: Side,
  entry: number,
  exit: number,
  risk: number,
  feeBps = 6,
) {
  if (risk <= 0) return 0;
  const gross = side === "long" ? exit - entry : entry - exit;
  const fee = entry * (feeBps / 10_000) + exit * (feeBps / 10_000);
  return (gross - fee) / risk;
}

function emptyBacktest(): BacktestStats {
  return {
    n: 0,
    wins: 0,
    losses: 0,
    timeouts: 0,
    winRate: 0,
    avgR: 0,
    profitFactor: 0,
    expectancy: 0,
    maxDD: 0,
  };
}

export function backtestFrames(
  frames: Frames,
  mode: Mode,
  feeBps = 6,
): BacktestStats {
  const { minScore, minAdx } = MODE_CONFIG[mode];
  const m15 = frames.m15.candles;
  const last = m15.length - HOLD_BARS - 1;
  if (last < 90) return emptyBacktest();

  let i4 = 0;
  let i1 = 0;
  let i5 = 0;
  let cooldown = 0;
  const trades: number[] = [];
  let wins = 0;
  let losses = 0;
  let timeouts = 0;

  const lows = frames.m15.candles.map((c) => c.l);
  const highs = frames.m15.candles.map((c) => c.h);

  for (let i = 80; i < last; i++) {
    if (cooldown > 0) {
      cooldown -= 1;
      continue;
    }
    const bar = m15[i]!;
    const asOf = bar.t + TF_MS["15m"];
    while (
      i4 + 1 < frames.h4.candles.length &&
      frames.h4.candles[i4 + 1]!.t + TF_MS["4h"] <= asOf
    ) {
      i4 += 1;
    }
    while (
      i1 + 1 < frames.h1.candles.length &&
      frames.h1.candles[i1 + 1]!.t + TF_MS["1h"] <= asOf
    ) {
      i1 += 1;
    }
    if (frames.m5) {
      while (
        i5 + 1 < frames.m5.candles.length &&
        frames.m5.candles[i5 + 1]!.t + TF_MS["5m"] <= asOf
      ) {
        i5 += 1;
      }
    }
    if (i4 < 50 || i1 < 50) continue;

    const h4 = classifyRegime(frames.h4, i4);
    const h1 = directionAt(frames.h1, i1);
    const cand = candidateFrom(h4, h1);
    if (cand === "wait") continue;
    const m15s = setupAt(frames.m15, i);
    if (m15s !== cand) continue;

    const d = frames.h1.adx[i1] ?? 0;
    if (d < minAdx) continue;

    let score = 0;
    if (h4 === "bull" || h4 === "bear") score += 26;
    if (h1 === cand) score += 20;
    if (m15s === cand) score += 16;
    const e21 = frames.m15.e21[i];
    const e50 = frames.m15.e50[i];
    if (e21 != null && e50 != null) {
      if (cand === "long" && e21 >= e50) score += 8;
      if (cand === "short" && e21 <= e50) score += 8;
    }
    if (d >= 16) score += 8;
    if (frames.m5 && i5 >= 30 && triggerAt(frames.m5, i5, cand) === cand) score += 10;
    if (score < minScore) continue;

    const atrV = frames.m15.atr[i];
    if (atrV == null || atrV <= 0) continue;
    const swingLow = lastSwing(lows, i, "low");
    const swingHigh = lastSwing(highs, i, "high");
    const plan = tradePlan(cand, bar, atrV, swingLow, swingHigh, e21 ?? null);
    const entry = slipPrice(cand, plan.entry, true);
    const stop = slipPrice(cand, plan.sl, true);
    const risk = Math.abs(entry - stop);
    if (risk <= 0) continue;
    const future = m15.slice(i + 1);
    const o = tradeOutcome(cand, entry, stop, plan.tp1, future, HOLD_BARS);
    const r = netR(cand, entry, o.exit, risk, feeBps);
    trades.push(r);
    if (o.result === "WIN") wins += 1;
    else if (o.result === "LOSS") losses += 1;
    else timeouts += 1;
    cooldown = Math.max(COOLDOWN_BARS, o.bars);
  }

  const n = trades.length;
  if (n === 0) return emptyBacktest();
  let equity = 0;
  let peak = 0;
  let maxDD = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let sum = 0;
  for (const r of trades) {
    sum += r;
    equity += r;
    peak = Math.max(peak, equity);
    maxDD = Math.max(maxDD, peak - equity);
    if (r > 0) grossWin += r;
    else grossLoss += -r;
  }
  return {
    n,
    wins,
    losses,
    timeouts,
    winRate: (wins / n) * 100,
    avgR: sum / n,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0,
    expectancy: sum / n,
    maxDD,
  };
}

export function makeFrames(opts: {
  h4: Candle[];
  h1: Candle[];
  m15: Candle[];
  m5?: Candle[] | null;
  asOf?: number;
}): Frames {
  const asOf = opts.asOf ?? Date.now();
  return {
    h4: enrich(closedCandles(opts.h4, "4h", asOf)),
    h1: enrich(closedCandles(opts.h1, "1h", asOf)),
    m15: enrich(closedCandles(opts.m15, "15m", asOf)),
    m5: opts.m5?.length ? enrich(closedCandles(opts.m5, "5m", asOf)) : null,
  };
}

export function buildSignal(opts: {
  symbol: string;
  market?: MarketKind;
  price: number;
  change24h: number;
  volume24h: number;
  h4: Candle[];
  h1: Candle[];
  m15: Candle[];
  m5?: Candle[] | null;
  funding: number | null;
  mode: Mode;
  maxLeverage?: number | null;
  makerBps?: number;
  takerBps?: number;
}): Signal | null {
  const asOf = Date.now();
  const frames = makeFrames({
    h4: opts.h4,
    h1: opts.h1,
    m15: opts.m15,
    m5: opts.m5,
    asOf,
  });
  const dq = validateFrames(frames, asOf);
  const i15 = lastClosedIndex(frames.m15.candles, "15m", asOf);
  if (i15 < 60 || frames.h4.candles.length < 50 || frames.h1.candles.length < 50) {
    return null;
  }

  const pipe = buildPipeline(frames, asOf);
  const conf = confluenceScore(frames, pipe, opts.funding);
  const { minScore, minAdx } = MODE_CONFIG[opts.mode];
  const candidate = candidateFrom(pipe.h4, pipe.h1);
  let tier: SignalTier = "none";
  if (
    candidate &&
    candidate !== "wait" &&
    pipe.m15 === candidate &&
    conf.score >= minScore &&
    conf.adx >= minAdx &&
    dq.ok
  ) {
    tier = "setup";
  } else if (
    candidate &&
    candidate !== "wait" &&
    conf.score >= minScore - 12 &&
    dq.ok
  ) {
    tier = "watch";
  }

  const row = frames.m15.candles[i15]!;
  const atrV = frames.m15.atr[i15] ?? row.c * 0.01;
  const swingLow = lastSwing(
    frames.m15.candles.map((c) => c.l),
    i15,
    "low",
  );
  const swingHigh = lastSwing(
    frames.m15.candles.map((c) => c.h),
    i15,
    "high",
  );
  const side = candidate === "wait" ? conf.side : candidate;
  const plan = side
    ? tradePlan(side, row, atrV, swingLow, swingHigh, frames.m15.e21[i15] ?? null)
    : {
        entry: opts.price,
        entryKind: "market" as const,
        sl: opts.price,
        tp1: opts.price,
        tp2: opts.price,
      };

  const dist = describeEntry(side, plan.entry, opts.price, atrV);
  const exitAlert =
    side && i15 >= 0
      ? assessExit({
          side,
          h4: pipe.h4,
          h1: pipe.h1,
          close: row.c,
          e21: frames.m15.e21[i15] ?? null,
          e50: frames.m15.e50[i15] ?? null,
          rsi: conf.rsi,
          adx: conf.adx,
          macd: frames.m15.macd[i15] ?? 0,
          candles: frames.m15.candles,
          index: i15,
        })
      : NO_EXIT;

  const expansion = assessExpansion({
    side,
    candles: frames.m15.candles,
    index: i15,
    atr: atrV,
    atrPrev: frames.m15.atr[Math.max(0, i15 - 6)] ?? null,
    volSma: frames.m15.volSma[i15] ?? null,
    h4: pipe.h4,
    funding: opts.funding,
    change24h: opts.change24h,
  });

  const bt = dq.ok
    ? backtestFrames(frames, opts.mode, opts.takerBps ?? 6)
    : emptyBacktest();
  const htf: Side | "range" =
    pipe.h4 === "bull" ? "long" : pipe.h4 === "bear" ? "short" : "range";

  return {
    symbol: opts.symbol,
    base: baseFromSymbol(opts.symbol),
    market: opts.market ?? (opts.symbol.includes("-SWAP-") ? "futures" : "spot"),
    price: opts.price,
    change24h: opts.change24h,
    volume24h: opts.volume24h,
    side,
    score: conf.score,
    tier,
    reasons: conf.reasons,
    entry: plan.entry,
    entryKind: plan.entryKind,
    sl: plan.sl,
    tp1: plan.tp1,
    tp2: plan.tp2,
    atr: atrV,
    rr: RR1,
    htf,
    adx: conf.adx,
    rsi: conf.rsi,
    funding: opts.funding,
    backtest: bt,
    spark: frames.m15.candles.slice(-24).map((c) => c.c),
    pipeline: pipe,
    dataQuality: dq,
    issuedAt: asOf,
    entryLocked: false,
    fillable: dist.fillable,
    entryState: dist.entryState,
    stretchAtr: dist.stretchAtr,
    exitAlert,
    expansion,
    candles: frames.m15.candles.slice(-48),
    maxLeverage: opts.maxLeverage ?? (opts.market === "spot" ? 1 : null),
    makerBps: opts.makerBps ?? (opts.market === "spot" ? 0 : 2),
    takerBps: opts.takerBps ?? (opts.market === "spot" ? 0 : 6),
  };
}

export function preferSetup(a: Signal, b: Signal) {
  const rank = (s: Signal) =>
    (s.tier === "setup" ? 320 : s.tier === "watch" ? 110 : 0) +
    (s.pipeline.triggerOk ? 12 : 0) +
    (s.entryState === "ready" ? 20 : -40) +
    (s.expansion.kind === "expansion" ? 10 : 0) +
    s.score +
    (s.backtest.n >= 6 ? s.backtest.winRate * 0.12 : 0) +
    (s.backtest.profitFactor > 1 ? 8 : 0);
  return rank(b) - rank(a);
}

export function chartSeries(candles: Candle[], take = 120) {
  const slice = candles.slice(-take);
  const closes = slice.map((c) => c.c);
  return {
    candles: slice,
    ema21: ema(closes, 21),
    ema50: ema(closes, 50),
  };
}