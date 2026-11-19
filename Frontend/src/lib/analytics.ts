/**
 * Google Analytics (GA4) through the Google tag set up by Sofala Digital.
 *
 *   Measurement ID  G-Y8SFXYVGP0
 *   Google tag ID   GTM-5PNTWPFB
 *
 * Enhanced measurement counts page views, including in-app navigation, so
 * nothing here sends page_view. Never put personal data (names, phone numbers,
 * emails, registration numbers, references) in event parameters.
 */

export const GA_MEASUREMENT_ID = "G-Y8SFXYVGP0";
export const GOOGLE_TAG_ID = "GTM-5PNTWPFB";
export const GOOGLE_TAG_SRC = `https://www.googletagmanager.com/gtm.js?id=${GOOGLE_TAG_ID}`;

/**
 * Runs in <head> before the Google tag loads, so it acts before GA sees a URL.
 *
 * 1. Staff pages (workspace, MSU portal, sign-in, password reset) are not
 *    measured: GA's own opt-out flag is switched on for them, and kept in step
 *    on every in-app navigation by wrapping history.pushState/replaceState and
 *    listening to popstate. These are installed before the Google tag's own
 *    listeners, so the flag is always set before GA counts the page.
 * 2. Tracking links (/status?ref=...&reg=...) carry a reference and a
 *    registration number. They are moved out of the address bar into
 *    window.__trackPrefill, which the status page reads, so they never reach
 *    GA. Links already sent by SMS, WhatsApp and printed PDFs keep working.
 */
export const ANALYTICS_BOOT_SCRIPT = `(function(){
var id=${JSON.stringify(GA_MEASUREMENT_ID)};
var staff=/^\\/(admin|msu|auth|security|reset-password|no-access)(\\/|$)/;
function gate(u){try{window['ga-disable-'+id]=staff.test(new URL(u,location.href).pathname);}catch(e){}}
try{
if(location.pathname==='/status'&&/[?&](ref|reg)=/.test(location.search)){
var q=new URLSearchParams(location.search);
window.__trackPrefill={ref:q.get('ref')||'',reg:q.get('reg')||''};
q.delete('ref');q.delete('reg');var s=q.toString();
history.replaceState(history.state,'',location.pathname+(s?'?'+s:'')+location.hash);
}
}catch(e){}
gate(location.href);
['pushState','replaceState'].forEach(function(m){var o=history[m];history[m]=function(st,t,u){if(u!=null)gate(u);return o.apply(this,arguments);};});
addEventListener('popstate',function(){gate(location.href);});
window.dataLayer=window.dataLayer||[];
window.gtag=function(){window.dataLayer.push(arguments);};
window.gtag('js',new Date());
})();`;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
    __trackPrefill?: { ref?: string; reg?: string };
  }
}

function send(name: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    if (params) window.gtag?.("event", name, params);
    else window.gtag?.("event", name);
  } catch {
    // Analytics must never break the page.
  }
}

/** After a graduate's request is accepted by the API. */
export function trackRequestSubmitted(opts: {
  transcripts: number;
  certificates: number;
  total: number;
}) {
  const document_type =
    opts.transcripts && opts.certificates
      ? "transcript_and_certificate"
      : opts.certificates
        ? "certificate"
        : "transcript";
  send("request_submitted", { document_type, value: opts.total, currency: "USD" });
}

/** After a tracking lookup finds a request. */
export function trackStatusChecked() {
  send("status_checked");
}

/** Hand a reference (and optionally a registration number) to /status
 *  without putting either in the URL. */
export function setTrackPrefill(prefill: { ref?: string; reg?: string }) {
  if (typeof window !== "undefined") window.__trackPrefill = prefill;
}

/** Read and clear what setTrackPrefill or a tracking link left for /status. */
export function takeTrackPrefill(): { ref?: string; reg?: string } | undefined {
  if (typeof window === "undefined") return undefined;
  const prefill = window.__trackPrefill;
  delete window.__trackPrefill;
  return prefill;
}
