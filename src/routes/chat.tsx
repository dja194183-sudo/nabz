import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { sideLabel } from "@/lib/format";
import { deskChat } from "@/lib/server/desk-chat";
import { useAppStore } from "@/lib/store";
import type { ChatMessage, PaperTrade } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/chat")({
  ssr: false,
  component: ChatPage,
});

const STARTERS = [
  "ژورنال باز را چک کن",
  "بهترین ستاپ الان؟",
  "حد ضرر را چطور جابه‌جا کنم؟",
];

function isJournalAsk(text: string, hasOpen: boolean) {
  if (/بهترین ستاپ|کل بازار|سیگنال جدید/.test(text)) return false;
  if (
    /ژورنال|پوزیشن|معامله|حد ضرر|حدضرر|اهرم|مارجین|ورود من|ببندم|نگه دار|خروج|ریوارد/.test(
      text,
    )
  ) {
    return true;
  }
  if (hasOpen && /یعنی چی|پیش.?بین|نظرت|چی کار|وضعیت|الان/.test(text)) {
    return true;
  }
  return false;
}

function journalDesk(
  journal: PaperTrade[],
  settings: ReturnType<typeof useAppStore.getState>["settings"],
  scanSignals: { symbol: string; pipeline?: { reason: string; h4: string; h1: string; m15: string; m5: string }; score?: number; entryState?: string }[],
) {
  const open = journal.filter((t) => !t.closedAt);
  const closed = journal.filter((t) => t.closedAt);
  const bySym = new Map(scanSignals.map((s) => [s.symbol, s]));
  return [
    `فقط ژورنال باز. بازار ${settings.market}.`,
    open.length
      ? open
          .map((t) => {
            const s = bySym.get(t.symbol);
            const distSl = t.entry ? ((t.side === "long" ? t.entry - t.sl : t.sl - t.entry) / t.entry) * 100 : 0;
            const distTp = t.entry ? ((t.side === "long" ? t.tp1 - t.entry : t.entry - t.tp1) / t.entry) * 100 : 0;
            return `${t.base} ${sideLabel(t.side)} ورود ${t.entry} حدضرر ${t.sl} (${distSl.toFixed(1)}٪) هدف ${t.tp1} (${distTp.toFixed(1)}٪) مارجین ${t.usdt ?? "?"} اهرم ${t.leverage ?? "?"}x${s ? ` زنجیره ${s.pipeline?.h4}/${s.pipeline?.h1}/${s.pipeline?.m15}/${s.pipeline?.m5} ${s.pipeline?.reason ?? ""} امتیاز ${s.score ?? "?"} ${s.entryState ?? ""}` : ""}`;
          })
          .join("\n")
      : "پوزیشن باز نیست.",
    closed.length
      ? `بسته: ${closed
          .slice(0, 6)
          .map(
            (t) =>
              `${t.base} ${t.result === "win" ? "برد" : t.result === "loss" ? "باخت" : "سربه‌سر"}`,
          )
          .join(" | ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function journalFallback(journal: PaperTrade[]) {
  const open = journal.filter((t) => !t.closedAt);
  const closed = journal.filter((t) => t.closedAt);
  if (open.length === 0 && closed.length === 0) {
    return "ژورنال خالی است. معامله باز یا بسته‌ای برای بررسی ندارم.";
  }
  const lines = ["از روی ژورنال خودت:"];
  for (const t of open) {
    lines.push(
      `${t.base} ${sideLabel(t.side)} باز · ورود ${t.entry} · حدضرر ${t.sl} · هدف ${t.tp1} · مارجین ${t.usdt ?? "?"} · اهرم ${t.leverage ?? "نامشخص"}x. حد ضرر را تا وقتی ساختار نشکسته جابه‌جا نکن؛ اگر قیمت از ورود دور شد ورود مجدد نکن.`,
    );
  }
  for (const t of closed.slice(0, 5)) {
    lines.push(
      `${t.base} ${t.result === "win" ? "برد" : t.result === "loss" ? "باخت" : "سربه‌سر"} · ورود ${t.entry} خروج ${t.closePrice ?? "—"}`,
    );
  }
  lines.push("تضمین سود نیست.");
  return lines.join("\n");
}

function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      const next = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setInset(next > 60 ? next : 0);
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);
  return inset;
}

function ChatPage() {
  const chat = useAppStore((s) => s.chat);
  const pushChat = useAppStore((s) => s.pushChat);
  const clearChat = useAppStore((s) => s.clearChat);
  const journal = useAppStore((s) => s.journal);
  const settings = useAppStore((s) => s.settings);
  const lastScan = useAppStore((s) => s.lastScan);
  const keyboard = useKeyboardInset();
  const kbOpen = keyboard > 60;
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  const desk = useMemo(() => {
    const open = journal.filter((t) => !t.closedAt);
    const closed = journal.filter((t) => t.closedAt);
    const setups = (lastScan?.signals ?? [])
      .filter((s) => s.tier === "setup")
      .slice(0, 10);
    const scanLine = lastScan
      ? lastScan.done
        ? `اسکن تمام شد · ${lastScan.total} نماد`
        : `اسکن ناقص · ${lastScan.scanned} از ${lastScan.total} نماد — کل بازار نیست`
      : "اسکن این جلسه هنوز نیامده";
    return [
      `تنظیمات: بازار ${settings.market} حالت ${settings.mode} سرمایه ${settings.capital} مارجین‌ورود ${settings.orderUsd}USDT اهرم‌پیش‌فرض ${settings.leverage}x`,
      scanLine,
      open.length
        ? `ژورنال باز (${open.length}): ${open
            .map(
              (t) =>
                `${t.base} ${sideLabel(t.side)} ورود ${t.entry} حدضرر ${t.sl} هدف ${t.tp1} مارجین ${t.usdt ?? "?"} اهرم ${t.leverage ?? "نامشخص"}x منبع ${t.source === "manual" ? "دستی" : "سیگنال"}`,
            )
            .join(" | ")}`
        : "ژورنال باز خالی است.",
      closed.length
        ? `تاریخچه (${closed.length}): ${closed
            .slice(0, 8)
            .map(
              (t) =>
                `${t.base} ${sideLabel(t.side)} ${t.result === "win" ? "برد" : t.result === "loss" ? "باخت" : "سربه‌سر"} pnl ${t.pnlUsd ?? 0}`,
            )
            .join(" | ")}`
        : "تاریخچه خالی است.",
      setups.length
        ? `ستاپ‌های همین اسکن: ${setups
            .map((s) => `${s.base} ${sideLabel(s.side)} امتیاز ${s.score} ${s.entryState}`)
            .join(" | ")}`
        : "ستاپ آماده در اسکن فعلی نیست.",
    ].join("\n");
  }, [journal, settings, lastScan]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [chat.length]);

  const send = useMutation({
    mutationFn: async (text: string) => {
      const user: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: text,
        at: Date.now(),
      };
      pushChat(user);
      const history = useAppStore
        .getState()
        .chat.slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));
      const open = journal.filter((t) => !t.closedAt);
      const focus = isJournalAsk(text, open.length > 0) ? "journal" : "market";
      const res = await deskChat({
        data: {
          messages: history,
          desk:
            focus === "journal"
              ? journalDesk(journal, settings, lastScan?.signals ?? [])
              : desk,
          market: settings.market,
          mode: settings.mode,
          focus,
          symbols: focus === "journal" ? open.map((t) => t.symbol) : [],
        },
      });
      return { res, focus, asked: text };
    },
    onSuccess: ({ res, focus }) => {
      let text = res.ok ? res.text : "پاسخ نیامد.";
      if (
        focus === "journal" &&
        /اسکن|نماد بررسی|SCAN|پیش.?بینی ندارم|داده.?آینده/i.test(text)
      ) {
        text = journalFallback(journal);
      }
      pushChat({
        id: `a-${Date.now()}`,
        role: "assistant",
        content: text,
        at: Date.now(),
      });
    },
    onError: () => {
      pushChat({
        id: `a-${Date.now()}`,
        role: "assistant",
        content: "ارسال قطع شد. یک‌بار دیگر بفرست.",
        at: Date.now(),
      });
    },
  });

  function submit(text?: string) {
    const body = (text ?? draft).trim();
    if (!body || send.isPending) return;
    setDraft("");
    send.mutate(body);
  }

  return (
    <AppShell hideNav={kbOpen}>
      <header className="sticky top-0 z-20 flex items-end justify-between gap-3 bg-background/90 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md">
        <div>
          <p className="text-[11px] font-medium tracking-[0.18em] text-muted-foreground">
            DESK
          </p>
          <h1 className="text-[24px] font-semibold tracking-tight">میز تحلیل</h1>
        </div>
        {chat.length > 0 ? (
          <button
            type="button"
            className="h-11 text-[12px] text-muted-foreground"
            onClick={() => clearChat()}
          >
            پاک کردن
          </button>
        ) : null}
      </header>

      <div
        ref={scroller}
        className="space-y-3 px-4"
        style={{ paddingBottom: "9.5rem" }}
      >
        {chat.length === 0 ? (
          <div className="rounded-2xl bg-card p-4 text-[13px] leading-6 text-muted-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
            <p className="font-medium text-foreground">چت تخصصی NABZ</p>
            <p className="mt-2">
              سیگنال و ژورنال باز را می‌بیند. کوتاه جواب می‌دهد. تضمین سود نیست.
            </p>
          </div>
        ) : (
          chat.map((m) => (
            <div
              key={m.id}
              className={cn(
                "max-w-[92%] whitespace-pre-wrap rounded-2xl px-3 py-3 text-[14px] leading-7",
                m.role === "user"
                  ? "ms-auto bg-primary text-primary-foreground"
                  : "bg-card shadow-[0_0_0_1px_rgba(255,255,255,0.08)]",
              )}
            >
              {m.content}
            </div>
          ))
        )}
        {send.isPending ? (
          <p className="text-[12px] text-muted-foreground">در حال پاسخ…</p>
        ) : null}
      </div>

      <div
        className="fixed inset-x-0 z-50 mx-auto w-full max-w-lg space-y-2 border-t border-border bg-background px-4 pt-2"
        style={{
          bottom: kbOpen
            ? keyboard
            : "calc(4.75rem + env(safe-area-inset-bottom))",
        }}
      >
        {kbOpen ? null : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {STARTERS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={send.isPending}
                onClick={() => submit(s)}
                className="h-9 shrink-0 rounded-full bg-surface px-3 text-[12px] text-muted-foreground disabled:opacity-40"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <form
          className="flex items-end gap-2 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <textarea
            value={draft}
            rows={1}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="سؤال…"
            className="min-h-12 flex-1 resize-none rounded-2xl bg-card px-3 py-3 text-[16px] leading-6 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] outline-none"
          />
          <Button
            type="submit"
            size="icon"
            className="size-12 shrink-0"
            disabled={send.isPending || !draft.trim()}
            aria-label="ارسال"
          >
            <Send className="size-4" />
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
