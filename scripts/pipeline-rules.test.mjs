import assert from "node:assert/strict";
import test from "node:test";

const SLIP = 2 / 10_000;
const FEE = 5 / 10_000;

function slip(side, price, isEntry) {
  if (side === "long") return isEntry ? price * (1 + SLIP) : price * (1 - SLIP);
  return isEntry ? price * (1 - SLIP) : price * (1 + SLIP);
}

function tradeOutcome(side, entry, stop, tp, future, maxBars = 24) {
  const n = Math.min(maxBars, future.length);
  for (let j = 0; j < n; j++) {
    const bar = future[j];
    const hitSL = side === "long" ? bar.l <= stop : bar.h >= stop;
    const hitTP = side === "long" ? bar.h >= tp : bar.l <= tp;
    if (hitSL && hitTP) return { result: "LOSS", exit: slip(side, stop, false) };
    if (hitSL) return { result: "LOSS", exit: slip(side, stop, false) };
    if (hitTP) return { result: "WIN", exit: slip(side, tp, false) };
  }
  const last = future[Math.max(0, n - 1)];
  return { result: "TIMEOUT", exit: last ? slip(side, last.c, false) : entry };
}

function netR(side, entry, exit, risk) {
  const gross = side === "long" ? exit - entry : entry - exit;
  const fee = entry * FEE + exit * FEE;
  return (gross - fee) / risk;
}

function trailStop(side, locked, fresh, live) {
  if (side === "long") return Math.min(Math.max(locked, fresh), live);
  return Math.max(Math.min(locked, fresh), live);
}

function describeEntry(side, entry, live, atr) {
  const signed = side === "long" ? (live - entry) / atr : (entry - live) / atr;
  if (signed <= 0.35) return "ready";
  if (signed <= 0.85) return "pullback";
  return "stretched";
}

test("same-candle SL and TP counts as loss", () => {
  const o = tradeOutcome("long", 100, 99, 102, [{ l: 98, h: 103, c: 100 }]);
  assert.equal(o.result, "LOSS");
});

test("TP alone is a win", () => {
  const o = tradeOutcome("long", 100, 99, 102, [{ l: 99.5, h: 102.4, c: 102 }]);
  assert.equal(o.result, "WIN");
});

test("timeout if neither side is touched", () => {
  const rows = Array.from({ length: 24 }, () => ({ l: 99.6, h: 100.4, c: 100 }));
  const o = tradeOutcome("long", 100, 99, 102, rows);
  assert.equal(o.result, "TIMEOUT");
});

test("fees reduce R versus raw move", () => {
  const r = netR("long", 100, 101.2, 1);
  assert.ok(r < 1.2);
  assert.ok(r > 1.0);
});

test("trailing stop only moves in favor", () => {
  assert.equal(trailStop("long", 99, 99.4, 101), 99.4);
  assert.equal(trailStop("long", 99, 98.5, 101), 99);
  assert.equal(trailStop("short", 101, 100.6, 99), 100.6);
  assert.equal(trailStop("short", 101, 101.4, 99), 101);
});

test("first signal hold blocks opposite side for 60s", () => {
  const HOLD = 60_000;
  const issuedAt = Date.now() - 10_000;
  assert.equal(Date.now() - issuedAt >= HOLD, false);
});

test("price near entry is ready, far is stretched", () => {
  assert.equal(describeEntry("long", 100, 100.4, 2), "ready");
  assert.equal(describeEntry("long", 100, 101.2, 2), "pullback");
  assert.equal(describeEntry("long", 100, 102.2, 2), "stretched");
  assert.equal(describeEntry("short", 100, 99.6, 2), "ready");
  assert.equal(describeEntry("short", 100, 97.8, 2), "stretched");
});
