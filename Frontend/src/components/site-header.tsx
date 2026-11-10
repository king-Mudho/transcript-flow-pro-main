import { Link } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSite } from "@/lib/site";
import { WhatsAppFloatingButton, WhatsAppLink } from "@/components/whatsapp-contact";

export function BrandMark({ className, light = true }: { className?: string; light?: boolean }) {
  const site = useSite();
  return (
    <span className={cn("flex items-center gap-3", className)}>
      {site.logo_url ? (
        <img src={site.logo_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold text-navy">
          <GraduationCap className="h-6 w-6" aria-hidden />
        </span>
      )}
      <span className="leading-tight">
        <span className={cn("block text-[16px] font-bold", light ? "text-white" : "text-ink")}>
          {site.short_name}
        </span>
        <span className={cn("block text-[13px]", light ? "text-white/75" : "text-ink-3")}>
          {site.tagline}
        </span>
      </span>
    </span>
  );
}

/**
 * Navy top bar for every public page. On phones it carries one action: Track
 * (home page) or New request (tracking pages). On wide screens it adds the
 * section links of the desktop home page (G11).
 */
export function SiteHeader({ action = "track" }: { action?: "track" | "new" | "none" }) {
  return (
    <header className="no-print bg-navy text-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 md:h-[72px] md:px-6">
        <Link to="/" aria-label="Home" className="rounded-lg">
          <BrandMark />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 text-[15px]">
          <span className="hidden items-center gap-1 lg:flex">
            <a
              href="/#how-it-works"
              className="rounded-md px-3 py-2 text-white/85 hover:text-white"
            >
              How it works
            </a>
            <a href="/#prices" className="rounded-md px-3 py-2 text-white/85 hover:text-white">
              Prices
            </a>
            <a href="/#questions" className="rounded-md px-3 py-2 text-white/85 hover:text-white">
              Questions
            </a>
          </span>
          {action !== "none" && (
            <>
              <Link
                to="/status"
                className={cn(
                  "items-center rounded-lg border border-white/40 px-3.5 py-2 font-semibold hover:bg-white/10",
                  action === "track" ? "inline-flex" : "hidden md:inline-flex",
                )}
              >
                <span className="md:hidden">Track</span>
                <span className="hidden md:inline">Track a request</span>
              </Link>
              <Link
                to="/request"
                className={cn(
                  "ml-1 items-center rounded-lg bg-gold px-3.5 py-2 font-semibold text-ink hover:bg-gold-hover",
                  action === "new" ? "inline-flex" : "hidden md:inline-flex",
                )}
              >
                <span className="md:hidden">New request</span>
                <span className="hidden md:inline">Start a request</span>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const site = useSite();
  return (
    <>
      <footer className="no-print bg-navy text-white/80">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-8 text-[14px] md:grid-cols-[1fr_auto] md:items-center md:px-6">
          <div>
            <div className="font-semibold text-white">{site.service_name}</div>
            <div className="mt-0.5">{site.operator_line}</div>
            <div className="mt-0.5 text-white/60">© {new Date().getFullYear()}</div>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link to="/privacy" className="hover:text-white hover:underline">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-white hover:underline">
              Terms
            </Link>
            <WhatsAppLink className="text-white" />
            <Link to="/auth" className="hover:text-white hover:underline">
              Staff sign in
            </Link>
          </nav>
        </div>
      </footer>
      <WhatsAppFloatingButton />
    </>
  );
}
