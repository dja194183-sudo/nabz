import { parseKlines } from "../ta";
import type { Candle, Interval, MarketKind, Timeframe } from "../types";

const BASE = "https://api.toobit.com";
const UA = "Mozilla/5.0 (compatible; NABZ/1.3; +https://grok.com)";

const SKIP_BASE = new Set([
  "MSTR",
  "TSLA",
  "NVDA",
  "AAPL",
  "AMZN",
  "META",
  "GOOG",
  "GOOGL",
  "NFLX",
  "COIN",
  "HOOD",
  "SOXL",
  "SPCX",
  "SNDK",
  "SKHYNIX",
  "XAU",
  "XAG",
  "XPT",
  "US500",
  "US100",
]);

const CORE_FUTURES = [
  "BTC-SWAP-USDT",
  "ETH-SWAP-USDT",
  "SOL-SWAP-USDT",
  "XRP-SWAP-USDT",
  "DOGE-SWAP-USDT",
  "BNB-SWAP-USDT",
  "ADA-SWAP-USDT",
  "AVAX-SWAP-USDT",
  "LINK-SWAP-USDT",
  "SUI-SWAP-USDT",
  "TON-SWAP-USDT",
  "NEAR-SWAP-USDT",
  "APT-SWAP-USDT",
  "ARB-SWAP-USDT",
  "OP-SWAP-USDT",
  "LTC-SWAP-USDT",
  "UNI-SWAP-USDT",
  "AAVE-SWAP-USDT",
  "HYPE-SWAP-USDT",
  "1000PEPE-SWAP-USDT",
  "WIF-SWAP-USDT",
  "DOT-SWAP-USDT",
  "INJ-SWAP-USDT",
  "SEI-SWAP-USDT",
  "TIA-SWAP-USDT",
  "ENA-SWAP-USDT",
  "WLD-SWAP-USDT",
  "ATOM-SWAP-USDT",
  "FIL-SWAP-USDT",
  "ZEC-SWAP-USDT",
];

const CORE_SPOT = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "BNBUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "SUIUSDT",
  "TONUSDT",
  "NEARUSDT",
  "APTUSDT",
  "ARBUSDT",
  "OPUSDT",
  "LTCUSDT",
  "UNIUSDT",
  "AAVEUSDT",
  "DOTUSDT",
  "INJUSDT",
  "SEIUSDT",
  "TIAUSDT",
  "ENAUSDT",
  "WLDUSDT",
  "ATOMUSDT",
  "FILUSDT",
  "PEPEUSDT",
];

export type Ticker = {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
};

async function toobit<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) {
    throw new Error(`Toobit ${res.status} ${path}`);
  }
  return (await res.json()) as T;
}

export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      out[idx] = await fn(items[idx]!);
    }
  }
  const n = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

const LEVERED = /(?:3L|3S|5L|5S|UP|DOWN)$/i;

export async function fetchTickers(market: MarketKind = "futures"): Promise<Ticker[]> {
  if (market === "spot") return fetchSpotTickers();
  const raw = await toobit<
    Array<{ s: string; c: string; pcp: string; qv: string }>
  >("/quote/v1/contract/ticker/24hr");
  const bySym = new Map<string, Ticker>();
  for (const row of raw) {
    const symbol = row.s;
    if (!symbol.endsWith("-SWAP-USDT")) continue;
    if (symbol.startsWith("TBV_")) continue;
    if (SKIP_BASE.has(symbol.replace(/-SWAP-USDT$/i, ""))) continue;
    const price = Number(row.c);
    const change24h = Number(row.pcp);
    const volume24h = Number(row.qv);
    if (![price, change24h, volume24h].every(Number.isFinite)) continue;
    bySym.set(symbol, { symbol, price, change24h, volume24h });
  }
  const preferred = CORE_FUTURES.map((s) => bySym.get(s)).filter(
    (x): x is Ticker => x != null,
  );
  const rest = [...bySym.values()]
    .filter((t) => !CORE_FUTURES.includes(t.symbol))
    .sort((a, b) => b.volume24h - a.volume24h);
  return [...preferred, ...rest];
}

async function fetchSpotTickers(): Promise<Ticker[]> {
  const raw = await toobit<
    Array<{ s: string; c: string; pcp: string | number; qv: string | number }>
  >("/quote/v1/ticker/24hr");
  const bySym = new Map<string, Ticker>();
  for (const row of raw) {
    const symbol = row.s;
    if (!symbol.endsWith("USDT")) continue;
    if (symbol.includes("-") || symbol.includes("_")) continue;
    if (LEVERED.test(symbol.replace(/USDT$/i, ""))) continue;
    const base = symbol.replace(/USDT$/i, "");
    if (SKIP_BASE.has(base)) continue;
    if (base.length > 12) continue;
    const price = Number(row.c);
    const change24h = Number(row.pcp);
    const volume24h = Number(row.qv);
    if (![price, change24h, volume24h].every(Number.isFinite)) continue;
    bySym.set(symbol, { symbol, price, change24h, volume24h });
  }
  const preferred = CORE_SPOT.map((s) => bySym.get(s)).filter(
    (x): x is Ticker => x != null,
  );
  const rest = [...bySym.values()]
    .filter((t) => !CORE_SPOT.includes(t.symbol))
    .sort((a, b) => b.volume24h - a.volume24h);
  return [...preferred, ...rest];
}

const klineCache = new Map<string, { at: number; rows: Candle[] }>();
const KLINE_TTL: Record<Interval, number> = {
  "4h": 8 * 60_000,
  "1h": 120_000,
  "15m": 40_000,
  "5m": 20_000,
};

export function clearKlineCache() {
  klineCache.clear();
}

export async function fetchKlines(
  symbol: string,
  interval: Interval,
  limit: number,
  force = false,
): Promise<Candle[]> {
  const key = `${symbol}|${interval}|${limit}`;
  const hit = klineCache.get(key);
  const ttl = KLINE_TTL[interval] ?? 40_000;
  if (!force && hit && Date.now() - hit.at < ttl) return hit.rows;
  try {
    const raw = await toobit<unknown>(
      `/quote/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`,
    );
    const rows = parseKlines(raw).sort((a, b) => a.t - b.t);
    klineCache.set(key, { at: Date.now(), rows });
    return rows;
  } catch {
    if (hit) return hit.rows;
    return [];
  }
}

export async function fetchFundingMap(): Promise<Map<string, number>> {
  const raw = await toobit<Array<{ symbol: string; rate: string; nextFundingTime?: string }>>(
    "/api/v1/futures/fundingRate",
  );
  const map = new Map<string, number>();
  for (const row of raw) {
    const n = Number(row.rate);
    if (Number.isFinite(n)) map.set(row.symbol, n);
  }
  return map;
}

export async function fetchFundingOne(symbol: string) {
  const raw = await toobit<
    Array<{ symbol: string; rate: string; nextFundingTime?: string }>
  >(`/api/v1/futures/fundingRate?symbol=${encodeURIComponent(symbol)}`);
  const row = raw[0];
  if (!row) return { rate: null as number | null, next: null as number | null };
  const rate = Number(row.rate);
  const next = row.nextFundingTime ? Number(row.nextFundingTime) : null;
  return {
    rate: Number.isFinite(rate) ? rate : null,
    next: Number.isFinite(next) ? next : null,
  };
}

export async function fetchMark(symbol: string) {
  try {
    const raw = await toobit<{ price?: string }>(
      `/quote/v1/markPrice?symbol=${encodeURIComponent(symbol)}`,
    );
    const n = Number(raw.price);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function fetchOi(symbol: string) {
  try {
    const raw = await toobit<{ openInterestList?: Array<{ size: string }> }>(
      `/quote/v1/openInterest?symbol=${encodeURIComponent(symbol)}`,
    );
    const n = Number(raw.openInterestList?.[0]?.size);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function fetchLongShort(symbol: string) {
  try {
    const raw = await toobit<
      Array<{ longShortRatio: string; longAccount: string; shortAccount: string }>
    >(
      `/quote/v1/globalLongShortAccountRatio?symbol=${encodeURIComponent(symbol)}&period=1h&limit=1`,
    );
    const row = raw[0];
    if (!row) return null;
    const ratio = Number(row.longShortRatio);
    const longAccount = Number(row.longAccount);
    const shortAccount = Number(row.shortAccount);
    if (![ratio, longAccount, shortAccount].every(Number.isFinite)) return null;
    return { ratio, longAccount, shortAccount };
  } catch {
    return null;
  }
}

export type ContractSpec = {
  maxLeverage: number | null;
  makerBps: number;
  takerBps: number;
};

/** Toobit VIP0 published schedule (toobit.com/support/fee-rate). */
export const FUTURES_FEES: ContractSpec = {
  maxLeverage: null,
  makerBps: 2,
  takerBps: 6,
};
export const SPOT_FEES: ContractSpec = {
  maxLeverage: 1,
  makerBps: 0,
  takerBps: 0,
};

const specCache = new Map<string, { at: number; spec: ContractSpec }>();

export async function fetchContractSpec(
  symbol: string,
  market: MarketKind,
): Promise<ContractSpec> {
  if (market === "spot") return SPOT_FEES;
  const hit = specCache.get(symbol);
  if (hit && Date.now() - hit.at < 12 * 60 * 60_000 && hit.spec.maxLeverage != null) {
    return hit.spec;
  }
  try {
    const raw = await toobit<Array<{ level: number; maxLeverage: number }>>(
      `/api/v1/futures/riskLimits?symbol=${encodeURIComponent(symbol)}`,
    );
    const maxLeverage = Array.isArray(raw)
      ? Math.max(0, ...raw.map((r) => Number(r.maxLeverage) || 0))
      : 0;
    const spec: ContractSpec = {
      maxLeverage: maxLeverage > 0 ? maxLeverage : null,
      makerBps: FUTURES_FEES.makerBps,
      takerBps: FUTURES_FEES.takerBps,
    };
    if (spec.maxLeverage != null) specCache.set(symbol, { at: Date.now(), spec });
    return spec;
  } catch {
    return { ...FUTURES_FEES };
  }
}

export function levChoices(max: number) {
  return [2, 3, 5, 10, 15, 20, 25, 50, 75, 100, 125, 150, 175, 200].filter(
    (n) => n <= Math.max(1, max),
  );
}

export function chartInterval(tf: Timeframe): Interval {
  return tf;
}

export function isSpotSymbol(symbol: string) {
  return /^[A-Z0-9]{2,20}USDT$/.test(symbol) && !symbol.includes("-");
}

export function isFuturesSymbol(symbol: string) {
  return /^[A-Z0-9]{2,20}-SWAP-USDT$/.test(symbol);
}
