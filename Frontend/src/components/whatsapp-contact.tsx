/**
 * WhatsApp contact button.
 *
 * The glyph is an inline SVG rather than an icon-library import: lucide-react
 * (this project's icon set) dropped brand marks, and adding a second icon
 * dependency for one logo isn't worth it. The path is the standard WhatsApp
 * mark, drawn with `currentColor` so it inherits colour like every lucide icon.
 *
 * `https://wa.me/<number>` is WhatsApp's own routing endpoint: it opens the
 * installed app on Android/iOS and falls back to WhatsApp Web on desktop, so a
 * single href covers every platform without device sniffing.
 */

/** Number in international format, digits only — the form wa.me requires. */
const WHATSAPP_NUMBER = "263714460652";

const PREFILLED_MESSAGE = "Hello, I need assistance with the MSU Transcript Collection Service.";

const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(PREFILLED_MESSAGE)}`;

const LABEL = "Contact us on WhatsApp";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 0 1 6.988 2.896 9.83 9.83 0 0 1 2.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885m8.413-18.297A11.82 11.82 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.9 11.9 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.82 11.82 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

/**
 * Floating action button, fixed to the bottom-right of the viewport.
 *
 * Deliberately `hidden md:flex`. On wide screens the content column is centred
 * with an empty gutter, so the button floats over nothing. Below 768px the
 * content spans the full width and a bottom-right button lands directly on the
 * request wizard's "Continue" control — measured overlap was the right third of
 * that button, which would send a mis-tap to WhatsApp instead of submitting.
 * Small screens get the footer link below instead.
 *
 * Rendered from SiteFooter so it appears on the public pages (landing, request,
 * status) and nowhere else — the admin dashboard has its own shell and doesn't
 * need a support button over its table and dialogs.
 */
export function WhatsAppFloatingButton() {
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      // noopener stops the opened tab reaching back via window.opener.
      rel="noopener noreferrer"
      aria-label={LABEL}
      title={LABEL}
      className="fixed bottom-5 right-5 z-50 hidden h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-105 hover:bg-[#1EBE5A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2 motion-reduce:transition-none md:flex"
    >
      <WhatsAppIcon className="h-7 w-7" />
      {/* Visible only to screen readers; the icon alone carries no text. */}
      <span className="sr-only">{LABEL}</span>
    </a>
  );
}

/**
 * Inline contact link for the footer's contact area.
 *
 * Always rendered, at every width: it is the only WhatsApp entry point on
 * mobile (where the floating button is suppressed), and on desktop it doubles
 * as a conventional, discoverable place to look for contact details.
 */
export function WhatsAppFooterLink() {
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={LABEL}
      title={LABEL}
      className="inline-flex items-center gap-1.5 rounded-md text-[#128C7E] transition-colors hover:text-[#0F6F63] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2 dark:text-[#25D366]"
    >
      <WhatsAppIcon className="h-4 w-4" />
      <span>Contact us on WhatsApp</span>
    </a>
  );
}

/** Full-width call-to-action used inside the tracking page, e.g. on a rejection. */
export function WhatsAppContactButton() {
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-md bg-[#25D366] px-4 py-2 text-sm font-medium text-white hover:bg-[#1EBE5A]"
    >
      <WhatsAppIcon className="h-4 w-4" />
      {LABEL}
    </a>
  );
}
