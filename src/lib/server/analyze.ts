import { createServerFn } from "@tanstack/react-start";
import { sideLabel } from "../format";
import type { Side } from "../types";

export const analyzeSetup = createServerFn({ method: "POST" })
  .validator((input: {
    symbol: string;
    base: string;
    side: Side | null;
    score: number;
    entry: number;
    sl: number;
    tp1: number;
    rsi: number;
    adx: number;
    funding: number | null;
    htf: string;
    winRate: number;
    sample: number;
    reason: string;
    triggerOk: boolean;
    profitFactor: number;
  }) => input)
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return {
        ok: false as const,
        error: "تحلیل هوش مصنوعی در این محیط در دسترس نیست",
      };
    }
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4-fast-non-reasoning",
        max_tokens: 280,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "تو یک تحلیل‌گر تکنیکال محتاط فیوچرز کریپتو هستی. فقط فارسی بنویس. مشاوره مالی یا تضمین سود نده. کوتاه، دقیق، بدون ایموجی. سه بخش: خوانش ستاپ، ریسک‌ها، نکته اجرایی.",
          },
          {
            role: "user",
            content: `نماد ${data.base} در توبیت. جهت: ${sideLabel(data.side)}. امتیاز ${data.score}. ورود ${data.entry} حد ضرر ${data.sl} هدف ${data.tp1}. RSI ${data.rsi.toFixed(1)} ADX ${data.adx.toFixed(1)} فاندینگ ${data.funding ?? "نامشخص"}. بایاس ۴ساعته: ${data.htf}. دلیل زنجیره: ${data.reason}. تریگر ۵دقیقه: ${data.triggerOk ? "تأیید" : "نرم / نیامده"}. وین‌ریت بک‌تست ${data.winRate.toFixed(0)}٪ از ${data.sample} معامله، PF ${data.profitFactor.toFixed(2)}. تحلیل کن.`,
          },
        ],
      }),
    });
    if (!res.ok) {
      return { ok: false as const, error: "پاسخ مدل نیامد. دوباره تلاش کن." };
    }
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = body.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) return { ok: false as const, error: "متن خالی برگشت" };
    return { ok: true as const, text };
  });
