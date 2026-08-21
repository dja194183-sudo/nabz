export type Timeframe = "15m" | "1h";
export type Interval = "4h" | "1h" | "15m" | "5m";
export type Mode = "strict" | "balanced";
export type MarketKind = "futures" | "spot";
export type Side = "long" | "short";
export type SignalTier = "setup" | "watch" | "none";
export type Regime = "bull" | "bear" | "range" | "transition";
export type Align = Side | "wait";
export type EntryState = "ready" | "pullback" | "stretched";
export type ExitLevel = "none" | "caution" | "emergency";

export type Candle = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export type BacktestStats = {
  n: number;
  wins: number;
  losses: number;
  timeouts: number;
  winRate: number;
  avgR: number;
  profitFactor: number;
  expectancy: number;
  maxDD: number;
};

export type Reason = {
  id: string;
  label: string;
  ok: boolean;
};

export type FrameQuality = {
  interval: Interval;
  ok: boolean;
  count: number;
  need: number;
  reason: string;
};

export type DataQuality = {
  ok: boolean;
  frames: FrameQuality[];
};

export type ExitAlert = {
  on: boolean;
  level: ExitLevel;
  reasons: string[];
};

export type ExpansionKind = "none" | "coil" | "expansion";

export type Expansion = {
  kind: ExpansionKind;
  score: number;
  bias: Side | null;
  reasons: string[];
};

export type Pipeline = {
  h4: Regime;
  h1: Align;
  m15: Align;
  m5: Align;
  aligned: number;
  triggerOk: boolean;
  reason: string;
};

export type Signal = {
  symbol: string;
  base: string;
  market: MarketKind;
  price: number;
  change24h: number;
  volume24h: number;
  side: Side | null;
  score: number;
  tier: SignalTier;
  reasons: Reason[];
  entry: number;
  entryKind: "market" | "limit";
  sl: number;
  tp1: number;
  tp2: number;
  atr: number;
  rr: number;
  htf: Side | "range";
  adx: number;
  rsi: number;
  funding: number | null;
  backtest: BacktestStats;
  spark: number[];
  pipeline: Pipeline;
  dataQuality: DataQuality;
  issuedAt: number;
  entryLocked: boolean;
  fillable: boolean;
  entryState: EntryState;
  stretchAtr: number;
  exitAlert: ExitAlert;
  expansion: Expansion;
  candles: Candle[];
  maxLeverage: number;
  makerBps: number;
  takerBps: number;
};

export type PairDetail = Signal & {
  candles: Candle[];
  ema21: (number | null)[];
  ema50: (number | null)[];
  charts: Record<Interval, { candles: Candle[]; ema21: (number | null)[]; ema50: (number | null)[] }>;
  markPrice: number | null;
  openInterest: number | null;
  longShort: {
    ratio: number;
    longAccount: number;
    shortAccount: number;
  } | null;
  nextFundingTime: number | null;
};

export type ScanResult = {
  updatedAt: number;
  timeframe: Timeframe;
  mode: Mode;
  market: MarketKind;
  version: string;
  signals: Signal[];
  scanned: number;
  total: number;
  done: boolean;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: number;
};

export type PaperTrade = {
  id: string;
  symbol: string;
  base: string;
  market?: MarketKind;
  side: Side;
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  qty: number;
  riskUsd: number;
  openedAt: number;
  closedAt?: number;
  closePrice?: number;
  result?: "win" | "loss" | "be";
  pnlUsd?: number;
  note?: string;
  source?: "signal" | "manual";
  usdt?: number;
  leverage?: number;
  takerBps?: number;
  makerBps?: number;
};

export type AppSettings = {
  timeframe: Timeframe;
  mode: Mode;
  market: MarketKind;
  capital: number;
  orderUsd: number;
  riskPct: number;
  leverage: number;
  leverageBySymbol: Record<string, number>;
  minWinRate: number;
  apiKey: string;
  apiSecret: string;
};
