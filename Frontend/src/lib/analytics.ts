/**
 * Google Analytics (GA4) through the Google tag set up by Sofala Digital.
 *
 *   Measurement ID  G-Y8SFXYVGP0
 *   Google tag ID   GTM-5PNTWPFB
 *
 * Enhanced measurement counts page views, including in-app navigation, so
 * the only page_view sent here is the one held back until consent is given.
 * Never put personal data (names, phone numbers,
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
 * 3. Consent: nothing is measured and no GA cookie is set until the visitor
 *    accepts in the cookie banner. Consent Mode defaults analytics_storage
 *    (and all advertising signals) to denied, and the opt-out flag stays on
 *    until the stored choice is "granted", so a visitor who declines or never
 *    answers sends nothing to Google at all.
 */
export const CONSENT_KEY = "msu.analytics.consent";
export const CONSENT_OPEN_EVENT = "msu:cookie-settings";
const STAFF_PATTERN = /^\/(admin|msu|auth|security|reset-password|no-access)(\/|$)/;

export const ANALYTICS_BOOT_SCRIPT = `(function(){
var id=${JSON.stringify(GA_MEASUREMENT_ID)};
var staff=${STAFF_PATTERN.toString()};
function consent(){try{return localStorage.getItem(${JSON.stringify(CONSENT_KEY)});}catch(e){return null;}}
function gate(u){try{window['ga-disable-'+id]=consent()!=='granted'||staff.test(new URL(u,location.href).pathname);}catch(e){window['ga-disable-'+id]=true;}}
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
window.gtag('consent','default',{analytics_storage:consent()==='granted'?'granted':'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
window.gtag('js',new Date());
})();`;

export type ConsentChoice = "granted" | "denied";

export function isStaffPath(path: string) {
  return STAFF_PATTERN.test(path);
}

export function readConsent(): ConsentChoice | null {
  try {
    const value = window.localStorage.getItem(CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

/** Remove GA's cookies (_ga, _ga_<id>) from every domain they could be on. */
function clearGaCookies() {
  const host = window.location.hostname;
  const domains = ["", host, `.${host}`, `.${host.replace(/^www\./, "")}`];
  for (const name of document.cookie.split(";").map((c) => c.split("=")[0].trim())) {
    if (!/^_ga(_|$)/.test(name)) continue;
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ""}`;
    }
  }
}

/** Record the visitor's cookie choice and apply it straight away. */
export function saveConsent(choice: ConsentChoice) {
  try {
    window.localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    // Private mode: the choice applies to this page only.
  }
  const granted = choice === "granted";
  try {
    window.gtag?.("consent", "update", { analytics_storage: granted ? "granted" : "denied" });
  } catch {
    // ignore
  }
  const flags = window as unknown as Record<string, unknown>;
  const flag = `ga-disable-${GA_MEASUREMENT_ID}`;
  const wasDisabled = flags[flag];
  flags[flag] = !granted || isStaffPath(window.location.pathname);
  if (granted && wasDisabled && !isStaffPath(window.location.pathname)) {
    // The page view for this page was held back while there was no consent,
    // so count it now. Later pages are counted by enhanced measurement.
    send("page_view", { page_location: window.location.href, page_title: document.title });
  }
  if (!granted) clearGaCookies();
}

/** Open the cookie banner again (from the privacy page). */
export function openCookieSettings() {
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
}

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
