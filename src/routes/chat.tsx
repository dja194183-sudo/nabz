import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { sideLabel } from "@/lib/format";
import { deskChat } from "@/lib/server/desk-chat";
import { useAppStore } from "@/lib/store";
import { useScan } from "@/lib/use-scan";
import type { ChatMessage } from "@/lib/types";
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

function ChatPage() {
  const chat = useAppStore((s) => s.chat);
  const pushChat = useAppStore((s) => s.pushChat);
  const clearChat = useAppStore((s) => s.clearChat);
  const journal = useAppStore((s) => s.journal);
  const settings = useAppStore((s) => s.settings);
  const scan = useScan();
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  const desk = useMemo(() => {
    const open = journal.filter((t) => !t.closedAt);
    const setups = (scan.data?.signals ?? [])
      .filter((s) => s.tier === "setup")
      .slice(0, 10);
    return [
      `بازار ${settings.market} حالت ${settings.mode} سرمایه ${settings.capital} حجم‌ورود ${settings.orderUsd}USDT`,
      scan.data
        ? `اسکن ${scan.data.scanned}/${scan.data.total} ${scan.data.done ? "تمام" : "ادامه"}`
        : "اسکن نیامده",
      open.length
        ? `باز: ${open
            .map(
              (t) =>
                `${t.base} ${sideLabel(t.side)} entry ${t.entry} sl ${t.sl} tp ${t.tp1} qty ${t.qty} lev ${t.leverage ?? "?"}x fee ${t.takerBps ?? 6}bps`,
            )
            .join(" | ")}`
        : "پوزیشن باز نیست.",
      setups.length
        ? `ستاپ: ${setups
            .map(
              (s) =>
                `${s.base} ${sideLabel(s.side)} ${s.score} ${s.entryState} lev≤${s.maxLeverage}x taker ${s.takerBps}bps`,
            )
            .join(" | ")}`
        : "ستاپ آماده در این لحظه نیست.",
    ].join("\n");
  }, [journal, settings, scan.data]);

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
      return deskChat({
        data: {
          messages: history,
          desk,
          market: settings.market,
          mode: settings.mode,
        },
      });
    },
    onSuccess: (res) => {
      pushChat({
        id: `a-${Date.now()}`,
        role: "assistant",
        content: res.ok ? res.text : res.error,
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
    <AppShell>
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
        className="fixed inset-x-0 z-30 mx-auto w-full max-w-lg space-y-2 border-t border-border bg-background px-4 pt-2"
        style={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom))" }}
      >
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
        <form
          className="flex items-end gap-2 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <textarea
            value={draft}
            rows={2}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="سؤال…"
            className="min-h-12 flex-1 resize-none rounded-2xl bg-card px-3 py-3 text-[14px] leading-6 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] outline-none"
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
