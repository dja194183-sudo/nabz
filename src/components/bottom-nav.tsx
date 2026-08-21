import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, BookOpen, CandlestickChart, MessageCircle, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", label: "سیگنال", icon: Activity },
  { to: "/market", label: "بازار", icon: CandlestickChart },
  { to: "/chat", label: "چت", icon: MessageCircle },
  { to: "/journal", label: "ژورنال", icon: BookOpen },
  { to: "/settings", label: "تنظیمات", icon: SlidersHorizontal },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {items.map((item) => {
          const active =
            item.to === "/"
              ? pathname === "/"
              : pathname === item.to || pathname.startsWith(`${item.to}/`);
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors duration-150",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon
                  className="size-[18px]"
                  strokeWidth={active ? 2.2 : 1.7}
                />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
