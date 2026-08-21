import { createServerFn } from "@tanstack/react-start";
import { getScanBrief } from "./market";
import { getPairDetail } from "./market";
import type { MarketKind, Mode } from "../types";

type Msg = { role: "user" | "assistant"; content: string };

const MODELS = ["grok-4-fast-non-reasoning", "grok-4-fast", "grok-4.5"] as const;

async function complete(opts: {
  apiKey: string;
  model: string;
  system: string;
  messages: Msg[];
}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20_000);
  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      signal: ac.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: 520,
        temperature: 0.25,
        messages: [{ role: "system", content: opts.system }, ...opts.messages],
      }),
    });
    const raw = (await res.json()) as {
      error?: { message?: string };
      choices?: Array<{
        message?: { content?: string; reasoning_content?: string };
      }>;
    };
    if (!res.ok) {
      return { ok: false as const, error: raw.error?.message || `HTTP ${res.status}` };
    }
    const msg = raw.choices?.[0]?.message;
    const text = (msg?.content || msg?.reasoning_content || "").trim();
    if (!text) return { ok: false as const, error: "empty" };
    return { ok: true as const, text };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return { ok: false as const, error: aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

function guessSymbol(text: string) {
  const m = text.toUpperCase().match(/\b([A-Z]{2,12})(?:USDT)?\b/g);
  if (!m) return null;
  const skip = new Set(["NABZ", "SL", "TP", "USDT", "VIP", "RSI", "ADX", "EMA"]);
  const token = m.find((x) => !skip.has(x.replace(/USDT$/, "")));
  return token ? token.replace(/USDT$/, "") : null;
}

export const deskChat = createServerFn({ method: "POST" })
  .validator((input: {
    messages?: Msg[];
    desk?: string;
    market?: MarketKind;
    mode?: Mode;
  }) => {
    const messages = Array.isArray(input?.messages) ? input.messages : [];
    const clean = messages
      .filter(
        (m) =>
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.trim().length > 0,
      )
      .slice(-10)
      .map((m) => ({
        role: m.role,
        content: m.content.trim().slice(0, 2000),
      }));
    if (clean.length === 0) throw new Error("پیام خالی است");
    return {
      messages: clean,
      desk: String(input?.desk ?? "").slice(0, 7000),
      market: input?.market === "spot" ? "spot" : "futures",
      mode: input?.mode === "balanced" ? "balanced" : "strict",
    };
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "چت هوش مصنوعی الان در دسترس نیست" };
    }
    const last = data.messages[data.messages.length - 1]?.content ?? "";
    const guessed = guessSymbol(last);
    let extra = "";
    try {
      extra = getScanBrief(data.market as MarketKind, data.mode as Mode);
    } catch {
      extra = "";
    }
    if (guessed) {
      try {
        const detail = await getPairDetail({
          data: {
            symbol:
              data.market === "spot"
                ? `${guessed}USDT`
                : `${guessed}-SWAP-USDT`,
            mode: data.mode as Mode,
            market: data.market as MarketKind,
          },
        });
        extra += `\nنماد ${detail.base}: قیمت ${detail.price} جهت ${detail.side} امتیاز ${detail.score} ورود ${detail.entry} SL ${detail.sl} TP ${detail.tp1} اهرم‌سقف ${detail.maxLeverage}x کارمزد تیکر ${detail.takerBps}bps وضعیت ${detail.entryState} ${detail.pipeline.reason}`;
      } catch {
        extra += `\nجزئیات ${guessed} در دسترس نشد.`;
      }
    }

    const system = `میز تحلیل NABZ هستی. فارسی، دقیق، بدون ایموجی و بدون تضمین سود.
هرگز نگو «برو خودت چک کن» یا «در اپ ببین». اگر داده هست جواب بده؛ اگر نیست صریح بگو در اسکن فعلی نیست.
قواعد: ۴H+۱H جهت، ۱۵M ستاپ، ۵M تریگر. ورود دورشده را تعقیب نکن. خروج اضطراری جدا از حد ضرر.
کارمزد فیوچرز توبیت VIP0: میکر ۰٫۰۲٪ تیکر ۰٫۰۶٪ (رفت و برگشت تیکر حدود ۰٫۱۲٪). اسپات ۰.
اهرم سقف هر نماد از riskLimits توبیت است.

داده کاربر:
${data.desk || "خالی"}

داده سرور:
${extra || "اسکن خالی"}`;

    let err = "پاسخ نیامد";
    for (const model of MODELS) {
      const r = await complete({
        apiKey,
        model,
        system,
        messages: data.messages,
      });
      if (r.ok) return { ok: true as const, text: r.text };
      err = r.error;
      if (err === "timeout") break;
    }
    return {
      ok: false as const,
      error: err === "timeout" ? "پاسخ طول کشید. دوباره بفرست." : "پاسخ نیامد. دوباره بفرست.",
    };
  });
