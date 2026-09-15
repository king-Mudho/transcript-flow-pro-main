import { Link } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { WhatsAppFloatingButton, WhatsAppFooterLink } from "@/components/whatsapp-contact";

export function SiteHeader() {
  return (
    <header className="border-b bg-primary text-primary-foreground">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gold text-gold-foreground">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">MSU Transcript</div>
            <div className="text-[11px] text-primary-foreground/70">Collection Solution</div>
          </div>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link to="/status" className="rounded-md px-3 py-2 hover:bg-white/10">
            Check Status
          </Link>
          <Link
            to="/request"
            className="rounded-md bg-gold px-3 py-2 font-medium text-gold-foreground hover:bg-gold/90"
          >
            Start a Request
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <>
      <footer className="mt-16 border-t bg-muted/40">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} MSU Transcript Collection Solution</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <WhatsAppFooterLink />
            <Link to="/auth" className="hover:text-foreground">
              Admin Sign In
            </Link>
          </div>
        </div>
      </footer>
      {/* Fixed-position, so it escapes the footer's flow and stays visible on
          every public page. Placed here to cover exactly the pages that use
          this shell, without touching each route. */}
      <WhatsAppFloatingButton />
    </>
  );
}
