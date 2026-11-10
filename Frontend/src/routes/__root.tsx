import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { apiClient } from "@/lib/api-client";
import { useBrandColours, visitId } from "@/lib/site";

const SITE_URL =
  (import.meta.env.VITE_SITE_URL as string | undefined) ?? "https://collectmytranscriptmsu.com";
const TITLE = "MSU Transcript Collection Solution — your transcript, delivered";
const DESCRIPTION =
  "Midlands State University graduates: request your transcript or certificate online. We collect it from MSU and deliver it to your door in Harare (US$15) or any Zimpost branch (US$20).";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ground px-4">
      <div className="max-w-md text-center">
        <p className="text-[40px] font-bold text-navy">404</p>
        <h1 className="mt-2 text-[20px] font-semibold">Page not found</h1>
        <p className="mt-2 text-[15px] text-ink-3">The page you are looking for does not exist.</p>
        <Link
          to="/"
          className="mt-6 inline-flex h-12 items-center rounded-lg bg-gold px-6 font-semibold text-ink"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    console.error(error);
    apiClient.reportError({
      message: error.message || "Route error",
      stack: error.stack,
      url: window.location.href,
    });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-ground px-4">
      <div className="max-w-md text-center">
        <h1 className="text-[20px] font-semibold">Something went wrong</h1>
        <p className="mt-2 text-[15px] text-ink-3">Please try again or return home.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex h-12 items-center rounded-lg bg-navy px-6 font-semibold text-white"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex h-12 items-center rounded-lg border border-line bg-white px-6 font-semibold"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#0F2750" },
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:site_name", content: "MSU Transcript Collection Solution" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
      { property: "og:image", content: `${SITE_URL}/og-image.png` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: `${SITE_URL}/og-image.png` },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "preload",
        as: "style",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-gold px-4 py-2 font-semibold text-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          Skip to content
        </a>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

/** Page views (no cookies, no IP) and browser error alerts (B7.3). */
function Instrumentation() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  useBrandColours();

  useEffect(() => {
    // Staff pages are not counted; the funnel is about graduates.
    if (path.startsWith("/admin") || path.startsWith("/msu") || path === "/auth") return;
    apiClient.track({ name: "page_view", path, visit: visitId() });
  }, [path]);

  useEffect(() => {
    const onError = (event: ErrorEvent) =>
      apiClient.reportError({
        message: event.message || "Script error",
        stack: event.error?.stack,
        url: window.location.href,
      });
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      apiClient.reportError({
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
        url: window.location.href,
      });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <Instrumentation />
      <Outlet />
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}
