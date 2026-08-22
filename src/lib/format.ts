import type { Side } from "./types";

export function resolveSymbol(raw: string, market: "futures" | "spot") {
  const s = raw.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (!s) return "";
  if (s.includes("-SWAP-")) return s.endsWith("USDT") ? s : `${s}-USDT`;
  const base = s.endsWith("USDT") ? s.slice(0, -4) : s;
  if (!base) return "";
  return market === "spot" ? `${base}USDT` : `${base}-SWAP-USDT`;
}

export function baseFromSymbol(symbol: string) {
  return symbol
    .replace(/-SWAP-USDT$/i, "")
    .replace(/-SWAP-USDC$/i, "")
    .replace(/USDT$/i, "");
}

export function fmtPrice(n: number) {
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 1 : abs >= 100 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 6 : 8;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: abs >= 1000 ? 1 : 0,
    maximumFractionDigits: digits,
  });
}

export function fmtPct(n: number, digits = 1) {
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(digits)}٪`;
}

export function fmtPnl(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}${Math.abs(n).toFixed(6)}`;
}

export function fmtPnlPct(frac: number) {
  const sign = frac > 0 ? "+" : frac < 0 ? "-" : "";
  return `${sign}${Math.abs(frac * 100).toFixed(2)}%`;
}

export function roundTripFee(qty: number, entry: number, exit: number, takerBps: number) {
  const bps = takerBps / 10_000;
  return qty * entry * bps + qty * exit * bps;
}

export function levChoices(max: number) {
  return [2, 3, 5, 10, 15, 20, 25, 50, 75, 100, 125, 150, 175, 200].filter(
    (n) => n <= Math.max(1, max),
  );
}

export function qtyFromMargin(margin: number, entry: number, leverage = 1) {
  const lev = Math.max(1, leverage);
  if (entry <= 0 || margin <= 0) return 0;
  return (margin * lev) / entry;
}

export function qtyFromUsdt(usdt: number, entry: number) {
  return qtyFromMargin(usdt, entry, 1);
}

export function fmtUsd(n: number, digits = 2) {
  const sign = n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function fmtQty(n: number) {
  const abs = Math.abs(n);
  const digits = abs >= 100 ? 2 : abs >= 1 ? 4 : 6;
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function fmtFunding(n: number) {
  return `${(n * 100).toFixed(4)}٪`;
}

export function sideLabel(side: Side | null) {
  if (side === "long") return "لانگ";
  if (side === "short") return "شورت";
  return "خنثی";
}

export function regimeLabel(v: string) {
  if (v === "bull" || v === "long") return "صعودی";
  if (v === "bear" || v === "short") return "نزولی";
  if (v === "range") return "رنج";
  if (v === "transition") return "گذار";
  return "صبر";
}

export function entryStateLabel(state: string) {
  if (state === "pullback") return "منتظر پولبک";
  if (state === "stretched") return "فاصله گرفته";
  return "ورود آماده";
}

export function expansionLabel(kind: string, bias: string | null) {
  if (kind === "expansion") {
    return bias === "short" ? "احتمال حرکت تند نزولی" : "احتمال حرکت تند";
  }
  if (kind === "coil") return "فشرده — منتظر انبساط";
  return "";
}

export function exitLevelLabel(level: string) {
  if (level === "emergency") return "خروج اضطراری";
  if (level === "caution") return "احتیاط در معامله باز";
  return "";
}

export function lockHint(issuedAt: number, locked: boolean) {
  if (!locked) return "";
  const left = Math.max(0, Math.ceil((60_000 - (Date.now() - issuedAt)) / 1000));
  if (left > 0) return `جهت تا ${left} ثانیه عوض نمی‌شود`;
  return "ورود این ستاپ قفل است";
}

export function timeAgoFa(ts: number) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 10) return "همین الان";
  if (s < 60) return `${s} ثانیه پیش`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} دقیقه پیش`;
  const h = Math.floor(m / 60);
  return `${h} ساعت پیش`;
}

export function toobitTradeUrl(symbol: string, market: "futures" | "spot" = "futures") {
  if (market === "spot") {
    const base = baseFromSymbol(symbol);
    return `https://www.toobit.com/en-US/spot/${encodeURIComponent(`${base}_USDT`)}`;
  }
  return `https://www.toobit.com/en-US/futures/${encodeURIComponent(symbol)}`;
}

export function positionSize(opts: {
  capital: number;
  riskPct: number;
  entry: number;
  sl: number;
}) {
  const riskUsd = (opts.capital * opts.riskPct) / 100;
  const dist = Math.abs(opts.entry - opts.sl);
  if (dist <= 0 || opts.entry <= 0) {
    return { riskUsd, qty: 0, notional: 0 };
  }
  const qty = riskUsd / dist;
  return { riskUsd, qty, notional: qty * opts.entry };
}
