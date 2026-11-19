import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CONSENT_OPEN_EVENT,
  isStaffPath,
  readConsent,
  saveConsent,
  type ConsentChoice,
} from "@/lib/analytics";

/**
 * Asks graduates whether we may use Google Analytics cookies. Shown on public
 * pages until they choose; the privacy page can open it again. Staff pages are
 * never measured, so it never shows there.
 */
export function CookieBanner() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  // Decided after mount: the stored choice lives in the browser, and the
  // server render must match the first client render.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (readConsent() === null) setOpen(true);
    const reopen = () => setOpen(true);
    window.addEventListener(CONSENT_OPEN_EVENT, reopen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, reopen);
  }, []);

  if (!open || isStaffPath(path)) return null;

  const choose = (choice: ConsentChoice) => {
    saveConsent(choice);
    setOpen(false);
  };

  return (
    <div
      role="region"
      aria-label="Cookie choice"
      className="no-print fixed inset-x-0 bottom-0 z-40 p-3 sm:p-4"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-xl border border-line bg-white p-5 shadow-xl sm:flex-row sm:items-center">
        <p className="text-[15px] leading-relaxed text-ink-2">
          May we use Google Analytics cookies to see how people use this site? They help us improve
          it and never include your name, phone number or registration number.{" "}
          <Link to="/privacy" className="font-medium text-navy underline">
            Privacy notice
          </Link>
        </p>
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
          <Button variant="outline" size="lg" onClick={() => choose("denied")}>
            No thanks
          </Button>
          <Button variant="navy" size="lg" onClick={() => choose("granted")}>
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
