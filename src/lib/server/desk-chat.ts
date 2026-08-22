import { createServerFn } from "@tanstack/react-start";
import { localDeskReply } from "../desk-local";
import { pairLiveSignal } from "./market";
import type { MarketKind, Mode } from "../types";

type Msg = { role: "user" | "assistant"; content: string };

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
    focus?: "journal" | "market";
    symbols?: string[];
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
    const symbols = Array.isArray(input?.symbols)
      ? input.symbols.map((s) => String(s).toUpperCase()).filter(Boolean).slice(0, 6)
      : [];
    return {
      messages: clean,
      desk: String(input?.desk ?? "").slice(0, 12000),
      market: input?.market === "spot" ? "spot" : "futures",
      mode: input?.mode === "balanced" ? "balanced" : "strict",
      focus: input?.focus === "journal" ? "journal" : "market",
      symbols,
    };
  })
  .handler(async ({ data }) => {
    const last = data.messages[data.messages.length - 1]?.content ?? "";
    const guessed = data.focus === "journal" ? null : guessSymbol(last);
    const want = [
      ...data.symbols,
      ...(guessed
        ? [data.market === "spot" ? `${guessed}USDT` : `${guessed}-SWAP-USDT`]
        : []),
    ].slice(0, 4);
    const live = await Promise.all(
      want.map(async (symbol) => {
        try {
          const detail = await pairLiveSignal({
            symbol,
            mode: data.mode as Mode,
            market: data.market as MarketKind,
          });
          return [
            `${detail.base}: قیمت ${detail.price} مارک ${detail.markPrice ?? "—"}`,
            `زنجیره 4H=${detail.pipeline.h4} 1H=${detail.pipeline.h1} 15M=${detail.pipeline.m15} 5M=${detail.pipeline.m5}`,
            `جهت ${detail.side ?? "نامشخص"} امتیاز ${detail.score} RSI ${detail.rsi.toFixed(0)} ADX ${detail.adx.toFixed(0)}`,
            `وضعیت ${detail.entryState} خروج ${detail.exitAlert.level}${detail.exitAlert.reasons.length ? " · " + detail.exitAlert.reasons.join("، ") : ""}`,
            detail.pipeline.reason,
          ].join(" | ");
        } catch {
          return `${symbol}: قیمت زنده نیامد`;
        }
      }),
    );
    return {
      ok: true as const,
      text: localDeskReply({
        focus: data.focus === "journal" ? "journal" : "market",
        desk: data.desk,
        live,
      }),
    };
  });
