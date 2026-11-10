import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { apiClient, type PublicSettings } from "@/lib/api-client";
import { FEE_HARARE, FEE_OUTSIDE, SUPPORT_WHATSAPP } from "@/lib/msu";

/** Used for the first render and whenever the API cannot be reached, so
 *  public pages always show something sensible. */
export const DEFAULT_SITE: PublicSettings = {
  fee_harare: FEE_HARARE,
  fee_outside: FEE_OUTSIDE,
  service_name: "MSU Transcript Collection Solution",
  short_name: "MSU Transcript",
  tagline: "Collection Solution",
  operator_line: "Operated by Sofala Digital for MSU graduates.",
  support_whatsapp: SUPPORT_WHATSAPP,
  primary_color: "#0F2750",
  accent_color: "#D19936",
  logo_url: "",
  terms_version: "2026-10",
  suburbs: [],
};

/** Prices, brand and suburbs from Settings (B4.3, B11.4). Every public page
 *  reads prices from here, so a price change in Settings shows everywhere. */
export function useSite(): PublicSettings & { loaded: boolean } {
  const { data } = useQuery({
    queryKey: ["public-settings"],
    queryFn: () => apiClient.publicSettings(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  return { ...(data ?? DEFAULT_SITE), loaded: !!data };
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => {
    const v = (n >> shift) & 255;
    return Math.max(
      0,
      Math.min(255, Math.round(v + (amount < 0 ? v * amount : (255 - v) * amount))),
    );
  };
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`;
}

/** Apply the brand colours from Settings to the design tokens. */
export function useBrandColours() {
  const site = useSite();
  useEffect(() => {
    if (!site.loaded) return;
    const root = document.documentElement.style;
    if (/^#[0-9a-f]{6}$/i.test(site.primary_color)) {
      root.setProperty("--navy", site.primary_color);
      root.setProperty("--navy-2", shade(site.primary_color, 0.12));
    }
    if (/^#[0-9a-f]{6}$/i.test(site.accent_color)) {
      root.setProperty("--gold", site.accent_color);
      root.setProperty("--gold-hover", shade(site.accent_color, -0.08));
    }
  }, [site.loaded, site.primary_color, site.accent_color]);
}

/** A random id kept for one tab session, for funnel counting. No cookies. */
export function visitId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.sessionStorage.getItem("msu.visit");
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      window.sessionStorage.setItem("msu.visit", id);
    }
    return id;
  } catch {
    return "";
  }
}

export function trackStep(step: string) {
  apiClient.track({ name: "funnel", step, visit: visitId() });
}
