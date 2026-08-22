function alignFa(v: string) {
  if (v === "long" || v === "bull") return "صعودی";
  if (v === "short" || v === "bear") return "نزولی";
  if (v === "wait") return "صبر";
  return v;
}

function adviseLive(line: string) {
  const base = line.split(":")[0]?.trim() || "نماد";
  const h4 = /4H=(\w+)/.exec(line)?.[1] ?? "";
  const h1 = /1H=(\w+)/.exec(line)?.[1] ?? "";
  const m15 = /15M=(\w+)/.exec(line)?.[1] ?? "";
  const m5 = /5M=(\w+)/.exec(line)?.[1] ?? "";
  const exit = /خروج (\w+)/.exec(line)?.[1] ?? "none";
  const state = /وضعیت (\w+)/.exec(line)?.[1] ?? "";
  const reason = line.split(" | ").at(-1) ?? "";

  if (exit === "emergency") {
    return `${base}: خروج اضطراری. ساختار شکسته؛ نگه ندار. حد را پایین‌تر نبر.`;
  }
  if (h4 === "bear" && /لانگ|long/i.test(line)) {
    return `${base}: ۴ساعته نزولی است. لانگ را سنگین نکن؛ اگر نزدیک حد است حجم اضافه ممنوع.`;
  }
  if (m15 === "wait" || m15 === "short" && h1 === "long") {
    return `${base}: جهت بالاتر ${alignFa(h4)}/${alignFa(h1)} است ولی ۱۵دقیقه ستاپ ندارد. نگه اگر حد سالم است؛ ورود جدید نکن.`;
  }
  if (state === "stretched" || state === "pullback") {
    return `${base}: ورود فوری نه. صبر برای برگشت نزدیک ورود. ${reason}`;
  }
  if (m15 === "long" && (h1 === "long" || h4 === "bull") && m5 !== "wait") {
    return `${base}: زنجیره هم‌جهت است. حد را تا وقتی ۴ساعته نشکسته جابه‌جا نکن؛ اگر در سود است حد را بالای ورود قفل کن.`;
  }
  return `${base}: ${reason || "ساختار را با حد و هدف فعلی مدیریت کن."} تریگر ۵دقیقه ${alignFa(m5)}.`;
}

export function localDeskReply(opts: {
  focus: "journal" | "market";
  desk: string;
  live: string[];
}) {
  if (opts.focus === "journal") {
    if (/پوزیشن باز نیست/.test(opts.desk) && opts.live.length === 0) {
      return "پوزیشن باز در ژورنال نیست.";
    }
    const body =
      opts.live.length > 0
        ? opts.live.map(adviseLive).join("\n\n")
        : opts.desk
            .split("\n")
            .filter((l) => l && !l.startsWith("فقط"))
            .slice(0, 6)
            .join("\n");
    return `${body}\n\nاین خوانش موتور NABZ است، نه مدل خارجی. تضمین سود نیست.`;
  }

  const setups = opts.desk
    .split("\n")
    .find((l) => l.startsWith("ستاپ"));
  if (opts.live.length) {
    return `${opts.live.map(adviseLive).join("\n\n")}\n\nاز روی داده همین جلسه. تضمین سود نیست.`;
  }
  if (setups && !setups.includes("نیست")) {
    return `${setups}\nورود دورشده را تعقیب نکن. تضمین سود نیست.`;
  }
  return "ستاپ آماده‌ای در داده این جلسه نیست. از تب سیگنال اسکن را کامل کن.";
}
