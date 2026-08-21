import type { Candle } from "./types";

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i]!;
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function atr(candles: Candle[], period = 14): (number | null)[] {
  const trs: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]!;
    const prev = candles[i - 1]!;
    trs.push(
      Math.max(c.h - c.l, Math.abs(c.h - prev.c), Math.abs(c.l - prev.c)),
    );
  }
  return ema(trs, period);
}

export function macdHist(closes: number[]): (number | null)[] {
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  const line: (number | null)[] = closes.map((_, i) =>
    fast[i] != null && slow[i] != null ? fast[i]! - slow[i]! : null,
  );
  const valid = line.filter((v): v is number => v != null);
  const pad = line.length - valid.length;
  const signalPad = ema(valid, 9);
  const signal: (number | null)[] = [
    ...Array(pad).fill(null),
    ...signalPad,
  ];
  return line.map((v, i) =>
    v != null && signal[i] != null ? v - signal[i]! : null,
  );
}

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function stochRsi(
  closes: number[],
  rsiPeriod = 14,
  stochPeriod = 14,
): (number | null)[] {
  const r = rsi(closes, rsiPeriod);
  const out: (number | null)[] = Array(closes.length).fill(null);
  for (let i = 0; i < r.length; i++) {
    if (r[i] == null || i < rsiPeriod + stochPeriod - 1) continue;
    let min = Infinity;
    let max = -Infinity;
    for (let j = i - stochPeriod + 1; j <= i; j++) {
      const v = r[j];
      if (v == null) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) continue;
    out[i] = max === min ? 50 : ((r[i]! - min) / (max - min)) * 100;
  }
  return out;
}

export function adx(candles: Candle[], period = 14): (number | null)[] {
  const n = candles.length;
  const out: (number | null)[] = Array(n).fill(null);
  if (n < period * 2) return out;
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const tr: number[] = [0];
  for (let i = 1; i < n; i++) {
    const up = candles[i]!.h - candles[i - 1]!.h;
    const down = candles[i - 1]!.l - candles[i]!.l;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    tr.push(
      Math.max(
        candles[i]!.h - candles[i]!.l,
        Math.abs(candles[i]!.h - candles[i - 1]!.c),
        Math.abs(candles[i]!.l - candles[i - 1]!.c),
      ),
    );
  }
  let smTR = 0;
  let smP = 0;
  let smM = 0;
  for (let i = 1; i <= period; i++) {
    smTR += tr[i]!;
    smP += plusDM[i]!;
    smM += minusDM[i]!;
  }
  const dx: number[] = Array(n).fill(0);
  const plusDI = (100 * smP) / smTR;
  const minusDI = (100 * smM) / smTR;
  const den = plusDI + minusDI;
  dx[period] = den === 0 ? 0 : (100 * Math.abs(plusDI - minusDI)) / den;
  let prevTR = smTR;
  let prevP = smP;
  let prevM = smM;
  for (let i = period + 1; i < n; i++) {
    prevTR = prevTR - prevTR / period + tr[i]!;
    prevP = prevP - prevP / period + plusDM[i]!;
    prevM = prevM - prevM / period + minusDM[i]!;
    const pdi = (100 * prevP) / prevTR;
    const mdi = (100 * prevM) / prevTR;
    const d = pdi + mdi;
    dx[i] = d === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / d;
  }
  let adxVal = 0;
  for (let i = period; i < period * 2; i++) adxVal += dx[i]!;
  adxVal /= period;
  out[period * 2 - 1] = adxVal;
  for (let i = period * 2; i < n; i++) {
    adxVal = (adxVal * (period - 1) + dx[i]!) / period;
    out[i] = adxVal;
  }
  return out;
}

export function lastSwing(
  values: number[],
  i: number,
  dir: "low" | "high",
  lookback = 12,
) {
  const start = Math.max(1, i - lookback);
  let best = values[i]!;
  for (let j = start; j <= i; j++) {
    const v = values[j]!;
    if (dir === "low") best = Math.min(best, v);
    else best = Math.max(best, v);
  }
  return best;
}

export function parseKlines(raw: unknown): Candle[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!Array.isArray(row) || row.length < 6) return null;
      const t = Number(row[0]);
      const o = Number(row[1]);
      const h = Number(row[2]);
      const l = Number(row[3]);
      const c = Number(row[4]);
      const v = Number(row[5]);
      if (![t, o, h, l, c, v].every(Number.isFinite)) return null;
      return { t, o, h, l, c, v };
    })
    .filter((x): x is Candle => x != null);
}
