import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { Providers } from "@/components/providers";
import appCss from "../styles.css?url";

const APP_NAME = "NABZ";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=overlays-content",
      },
      { title: APP_NAME },
      {
        name: "description",
        content: "سیگنال فیوچرز توبیت با فیلتر کانفلوئنس و بک‌تست واقعی",
      },
      { name: "theme-color", content: "#0a0a0b" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  component: Root,
});

function Root() {
  return (
    <html lang="fa" dir="rtl" className="antialiased" style={{ background: "#0a0a0b", color: "#f1f1f3" }} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body dir="rtl" lang="fa" style={{ background: "#0a0a0b", color: "#f1f1f3", margin: 0, minHeight: "100dvh" }}>
        <PreviewHostBridge />
        <AuthProvider>
          <Providers>
            <Outlet />
          </Providers>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
