import { createServerFn } from "@tanstack/react-start";
import { buildSignal, chartSeries, preferSetup } from "../engine";
import type {
  Interval,
  MarketKind,
  Mode,
  PairDetail,
  ScanResult,
  Signal,
  Timeframe,
} from "../types";
import { APP_VERSION } from "../version";
import { stabilizeSignal } from "./lock";
import {
  fetchFundingMap,
  fetchFundingOne,
  fetchKlines,
  fetchLongShort,
  fetchMark,
  fetchOi,
  fetchTickers,
  fetchContractSpec,
  isFuturesSymbol,
  isSpotSymbol,
  mapPool,
  type Ticker,
} from "./toobit";

const BATCH = 12;
const DONE_TTL = 50_000;

type Job = {
  tickers: Ticker[];
  funding: Map<string, number>;
  signals: Map<string, Signal>;
  index: number;
  startedAt: number;
  done: boolean;
  finishedAt: number;
};

const jobs = new Map<string, Job>();

function isMode(v: unknown): v is Mode {
  return v === "strict" || v === "balanced";
}
function isTf(v: unknown): v is Timeframe {
  return v === "15m" || v === "1h";
}
function isMarket(v: unknown): v is MarketKind {
  return v === "spot" || v === "futures";
}

function snapshot(
  job: Job,
  data: { timeframe: Timeframe; mode: Mode; market: MarketKind },
): ScanResult {
  return {
    updatedAt: Date.now(),
    timeframe: data.timeframe,
    mode: data.mode,
    market: data.market,
    version: APP_VERSION,
    signals: [...job.signals.values()].sort(preferSetup),
    scanned: Math.min(job.index, job.tickers.length),
    total: job.tickers.length,
    done: job.done,
  };
}

async function scoreBatch(
  job: Job,
  market: MarketKind,
  mode: Mode,
) {
  const slice = job.tickers.slice(job.index, job.index + BATCH);
  const built = await mapPool(slice, 8, async (t) => {
    try {
      const [h4, h1, m15, spec] = await Promise.all([
        fetchKlines(t.symbol, "4h", 90),
        fetchKlines(t.symbol, "1h", 160),
        fetchKlines(t.symbol, "15m", 200),
        fetchContractSpec(t.symbol, market),
      ]);
      const signal = buildSignal({
        symbol: t.symbol,
        market,
        price: t.price,
        change24h: t.change24h,
        volume24h: t.volume24h,
        h4,
        h1,
        m15,
        funding: job.funding.get(t.symbol) ?? null,
        mode,
        maxLeverage: spec.maxLeverage,
        makerBps: spec.makerBps,
        takerBps: spec.takerBps,
      });
      if (!signal) return null;
      return stabilizeSignal(signal, mode);
    } catch {
      return null;
    }
  });
  for (const s of built) {
    if (s) job.signals.set(s.symbol, s);
  }
  job.index += slice.length;
  if (job.index >= job.tickers.length) {
    job.done = true;
    job.finishedAt = Date.now();
  }
}

export const scanMarket = createServerFn({ method: "POST" })
  .validator((input: {
    timeframe?: Timeframe;
    mode?: Mode;
    market?: MarketKind;
    force?: boolean;
  }) => {
    return {
      timeframe: isTf(input?.timeframe) ? input.timeframe : "15m",
      mode: isMode(input?.mode) ? input.mode : "strict",
      market: isMarket(input?.market) ? input.market : "futures",
      force: Boolean(input?.force),
    };
  })
  .handler(async ({ data }): Promise<ScanResult> => {
    const key = `${data.market}:${data.mode}:v10`;
    let job = jobs.get(key);
    if (
      job?.done &&
      !data.force &&
      Date.now() - job.finishedAt < DONE_TTL
    ) {
      return snapshot(job, data);
    }
    if (data.force || !job || (job.done && Date.now() - job.finishedAt >= DONE_TTL)) {
      const [tickers, funding] = await Promise.all([
        fetchTickers(data.market),
        data.market === "futures"
          ? fetchFundingMap().catch(() => new Map<string, number>())
          : Promise.resolve(new Map<string, number>()),
      ]);
      job = {
        tickers,
        funding,
        signals: new Map(),
        index: 0,
        startedAt: Date.now(),
        done: tickers.length === 0,
        finishedAt: tickers.length === 0 ? Date.now() : 0,
      };
      jobs.set(key, job);
    }
    if (!job.done) await scoreBatch(job, data.market, data.mode);
    return snapshot(job, data);
  });

export const getPairDetail = createServerFn({ method: "POST" })
  .validator((input: {
    symbol: string;
    timeframe?: Timeframe;
    mode?: Mode;
    market?: MarketKind;
    force?: boolean;
  }) => {
    const symbol = String(input?.symbol ?? "").toUpperCase();
    const market: MarketKind = isMarket(input?.market)
      ? input.market
      : isSpotSymbol(symbol)
        ? "spot"
        : "futures";
    if (market === "futures" && !isFuturesSymbol(symbol)) {
      throw new Error("نماد نامعتبر است");
    }
    if (market === "spot" && !isSpotSymbol(symbol)) {
      throw new Error("نماد نامعتبر است");
    }
    return {
      symbol,
      timeframe: isTf(input?.timeframe) ? input.timeframe : "15m",
      mode: isMode(input?.mode) ? input.mode : "strict",
      market,
      force: Boolean(input?.force),
    };
  })
  .handler(async ({ data }): Promise<PairDetail> => {
    const futures = data.market === "futures";
    const [tickers, h4, h1, m15, m5, funding, mark, oi, ls, spec] = await Promise.all([
      fetchTickers(data.market),
      fetchKlines(data.symbol, "4h", 90, data.force),
      fetchKlines(data.symbol, "1h", 160, data.force),
      fetchKlines(data.symbol, "15m", 200, data.force),
      fetchKlines(data.symbol, "5m", 180, data.force),
      futures ? fetchFundingOne(data.symbol) : Promise.resolve({ rate: null, next: null }),
      futures ? fetchMark(data.symbol) : Promise.resolve(null),
      futures ? fetchOi(data.symbol) : Promise.resolve(null),
      futures ? fetchLongShort(data.symbol) : Promise.resolve(null),
      fetchContractSpec(data.symbol, data.market),
    ]);
    const t = tickers.find((x) => x.symbol === data.symbol);
    const last = m15[m15.length - 1];
    const signal = buildSignal({
      symbol: data.symbol,
      market: data.market,
      price: t?.price ?? last?.c ?? 0,
      change24h: t?.change24h ?? 0,
      volume24h: t?.volume24h ?? 0,
      h4,
      h1,
      m15,
      m5,
      funding: funding.rate,
      mode: data.mode,
      maxLeverage: spec.maxLeverage,
      makerBps: spec.makerBps,
      takerBps: spec.takerBps,
    });
    if (!signal) throw new Error("داده کافی برای این نماد نیست");
    const held = stabilizeSignal(signal, data.mode);
    const pack = (rows: typeof m15) => chartSeries(rows, 120);
    const c15 = pack(m15);
    const charts: PairDetail["charts"] = {
      "5m": pack(m5),
      "15m": c15,
      "1h": pack(h1),
      "4h": pack(h4),
    };
    const tf = (data.timeframe as Interval) in charts ? data.timeframe : "15m";
    const chart = charts[tf];
    return {
      ...held,
      candles: chart.candles,
      ema21: chart.ema21,
      ema50: chart.ema50,
      charts,
      markPrice: mark,
      openInterest: oi,
      longShort: ls,
      nextFundingTime: funding.next,
    };
  });

export const getTickersLite = createServerFn({ method: "GET" }).handler(
  async () => {
    const [futures, spot] = await Promise.all([
      fetchTickers("futures"),
      fetchTickers("spot").catch(() => []),
    ]);
    return [...futures, ...spot].map((t) => ({
      symbol: t.symbol,
      price: t.price,
      change24h: t.change24h,
    }));
  },
);

export function getScanBrief(market: MarketKind, mode: Mode) {
  const job = jobs.get(`${market}:${mode}:v10`);
  if (!job) return "اسکن هنوز در حافظه سرور نیست.";
  const setups = [...job.signals.values()]
    .filter((s) => s.tier === "setup")
    .sort(preferSetup)
    .slice(0, 10)
    .map(
      (s) =>
        `${s.base} ${s.side} score ${s.score} ${s.entryState} lev≤${s.maxLeverage}x taker ${s.takerBps}bps entry ${s.entry} sl ${s.sl}`,
    );
  return `اسکن ${job.index}/${job.tickers.length} ${job.done ? "تمام" : "ادامه"} · ستاپ‌ها: ${setups.join(" | ") || "هیچ"}`;
}
