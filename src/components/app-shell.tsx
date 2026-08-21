import type { ReactNode } from "react";
import { BottomNav } from "./bottom-nav";
import { EmergencyAlarm } from "./emergency-alarm";

export function AppShell({
  children,
  hideNav = false,
}: {
  children: ReactNode;
  hideNav?: boolean;
}) {
  return (
    <div className="min-h-dvh bg-background text-foreground" dir="rtl">
      <div
        className="mx-auto w-full max-w-lg"
        style={{
          paddingBottom: hideNav
            ? "env(safe-area-inset-bottom)"
            : "calc(4.75rem + env(safe-area-inset-bottom))",
        }}
      >
        <div className="sticky top-0 z-30">
          <EmergencyAlarm />
        </div>
        {children}
      </div>
      {hideNav ? null : <BottomNav />}
    </div>
  );
}
