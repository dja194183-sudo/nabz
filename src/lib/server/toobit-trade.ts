import { createHmac } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import type { MarketKind, Side } from "../types";

const BASE = "https://api.toobit.com";

function hmacHex(secret: string, payload: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

async function signedRequest(opts: {
  method: "GET" | "POST";
  path: string;
  apiKey: string;
  secret: string;
  params: Record<string, string>;
}) {
  const timestamp = Date.now().toString();
  const params = { ...opts.params, recvWindow: "20000", timestamp };
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const signature = hmacHex(opts.secret, qs);
  const signed = `${qs}&signature=${signature}`;
  const url =
    opts.method === "GET"
      ? `${BASE}${opts.path}?${signed}`
      : `${BASE}${opts.path}`;
  const res = await fetch(url, {
    method: opts.method,
    headers: {
      "X-BB-APIKEY": opts.apiKey,
      Accept: "application/json",
      ...(opts.method === "POST"
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
    },
    body: opts.method === "POST" ? signed : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { msg: text.slice(0, 240) };
  }
  return { ok: res.ok, status: res.status, json };
}

function numStr(n: number, digits: number) {
  if (!Number.isFinite(n)) return "0";
  return n.toFixed(digits).replace(/\.?0+$/, (m) => (m.startsWith(".") ? "" : m));
}

function isSide(v: unknown): v is Side {
  return v === "long" || v === "short";
}

export const testToobitKeys = createServerFn({ method: "POST" })
  .validator((input: { apiKey?: string; secret?: string; market?: MarketKind }) => {
    const apiKey = String(input?.apiKey ?? "").trim();
    const secret = String(input?.secret ?? "").trim();
    if (apiKey.length < 8 || secret.length < 8) {
      throw new Error("کلید یا سکرت ناقص است");
    }
    return {
      apiKey,
      secret,
      market: input?.market === "spot" ? "spot" : "futures",
    };
  })
  .handler(async ({ data }) => {
    const path =
      data.market === "spot" ? "/api/v1/account" : "/api/v1/futures/balance";
    const r = await signedRequest({
      method: "GET",
      path,
      apiKey: data.apiKey,
      secret: data.secret,
      params: {},
    });
    if (!r.ok) {
      const msg =
        typeof r.json === "object" && r.json && "msg" in r.json
          ? String((r.json as { msg: string }).msg)
          : `HTTP ${r.status}`;
      return { ok: false as const, message: msg };
    }
    return { ok: true as const, message: "اتصال برقرار شد" };
  });

export const placeToobitOrder = createServerFn({ method: "POST" })
  .validator((input: {
    apiKey?: string;
    secret?: string;
    market?: MarketKind;
    symbol?: string;
    side?: Side;
    entryKind?: "market" | "limit";
    quantity?: number;
    price?: number;
    sl?: number;
    tp?: number;
    leverage?: number;
  }) => {
    const apiKey = String(input?.apiKey ?? "").trim();
    const secret = String(input?.secret ?? "").trim();
    const symbol = String(input?.symbol ?? "").toUpperCase();
    if (apiKey.length < 8 || secret.length < 8) throw new Error("کلید API نیست");
    if (!isSide(input?.side)) throw new Error("جهت نامعتبر است");
    const quantity = Number(input?.quantity);
    const price = Number(input?.price);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("حجم نامعتبر است");
    if (!Number.isFinite(price) || price <= 0) throw new Error("قیمت نامعتبر است");
    return {
      apiKey,
      secret,
      market: input?.market === "spot" ? ("spot" as const) : ("futures" as const),
      symbol,
      side: input.side,
      entryKind: input?.entryKind === "limit" ? ("limit" as const) : ("market" as const),
      quantity,
      price,
      sl: Number.isFinite(Number(input?.sl)) ? Number(input?.sl) : 0,
      tp: Number.isFinite(Number(input?.tp)) ? Number(input?.tp) : 0,
      leverage: Math.min(50, Math.max(1, Math.round(Number(input?.leverage) || 10))),
    };
  })
  .handler(async ({ data }) => {
    if (data.market === "futures") {
      await signedRequest({
        method: "POST",
        path: "/api/v1/futures/leverage",
        apiKey: data.apiKey,
        secret: data.secret,
        params: {
          symbol: data.symbol,
          leverage: String(data.leverage),
        },
      });
    }

    const clientId = `nabz${Date.now().toString(36)}`;
    const qty = numStr(data.quantity, 6);
    const px = numStr(data.price, 6);
    const path =
      data.market === "spot" ? "/api/v1/spot/order" : "/api/v1/futures/order";

    const base: Record<string, string> =
      data.market === "spot"
        ? {
            symbol: data.symbol,
            side: data.side === "long" ? "BUY" : "SELL",
            type: data.entryKind === "limit" ? "LIMIT" : "MARKET",
            quantity: qty,
            newClientOrderId: clientId,
            ...(data.entryKind === "limit"
              ? { timeInForce: "GTC", price: px }
              : {}),
          }
        : {
            symbol: data.symbol,
            side: data.side === "long" ? "BUY_OPEN" : "SELL_OPEN",
            type: "LIMIT",
            quantity: qty,
            newClientOrderId: clientId,
            ...(data.entryKind === "limit"
              ? { priceType: "INPUT", price: px, timeInForce: "GTC" }
              : { priceType: "MARKET", price: px }),
            ...(data.sl > 0 ? { stopLoss: numStr(data.sl, 6) } : {}),
            ...(data.tp > 0 ? { takeProfit: numStr(data.tp, 6) } : {}),
          };

    let r = await signedRequest({
      method: "POST",
      path,
      apiKey: data.apiKey,
      secret: data.secret,
      params: base,
    });

    if (!r.ok && data.market === "futures") {
      const msg =
        typeof r.json === "object" && r.json && "msg" in r.json
          ? String((r.json as { msg: string }).msg)
          : "";
      if (/side|BUY_OPEN|SELL_OPEN/i.test(msg)) {
        r = await signedRequest({
          method: "POST",
          path,
          apiKey: data.apiKey,
          secret: data.secret,
          params: {
            ...base,
            side: data.side === "long" ? "BUY" : "SELL",
          },
        });
      }
    }

    const body = r.json as { orderId?: string; code?: number; msg?: string };
    if (!r.ok || (typeof body?.code === "number" && body.code < 0)) {
      return {
        ok: false as const,
        message: body?.msg || `سفارش رد شد (${r.status})`,
      };
    }
    return {
      ok: true as const,
      message: body?.orderId
        ? `سفارش ثبت شد · ${body.orderId}`
        : "سفارش به توبیت ارسال شد",
      orderId: body?.orderId ?? null,
    };
  });
