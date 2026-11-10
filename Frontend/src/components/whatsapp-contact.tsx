/**
 * WhatsApp contact links. The number comes from Settings (support_whatsapp),
 * falling back to +263 71 446 0652 until Settings load.
 *
 * `https://wa.me/<number>` opens the WhatsApp app on phones and WhatsApp Web
 * on computers, so one link covers every platform.
 */
import { cn } from "@/lib/utils";
import { formatPhone, waDigits } from "@/lib/msu";
import { useSite } from "@/lib/site";

const PREFILLED = "Hello, I need help with the MSU Transcript Collection service.";

export function useWhatsAppUrl(text = PREFILLED): { url: string; display: string } {
  const site = useSite();
  return {
    url: `https://wa.me/${waDigits(site.support_whatsapp)}?text=${encodeURIComponent(text)}`,
    display: formatPhone(site.support_whatsapp),
  };
}

export function WhatsAppIcon({ className }: { className?: string }) {
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

/** Floating button, bottom-right, on wide screens only: on phones it would
 *  sit over the fixed Continue bar of the request flow. */
export function WhatsAppFloatingButton() {
  const { url } = useWhatsAppUrl();
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Contact us on WhatsApp"
      title="Contact us on WhatsApp"
      className="no-print fixed bottom-5 right-5 z-40 hidden h-14 w-14 items-center justify-center rounded-full bg-whatsapp text-white shadow-lg transition-transform hover:scale-105 motion-reduce:transition-none md:flex"
    >
      <WhatsAppIcon className="h-7 w-7" />
    </a>
  );
}

/** Inline link with the number, for footers and help lines. */
export function WhatsAppLink({ className, text }: { className?: string; text?: string }) {
  const { url, display } = useWhatsAppUrl(text);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex items-center gap-1.5 font-medium hover:underline", className)}
    >
      <WhatsAppIcon className="h-4 w-4" />
      WhatsApp {display}
    </a>
  );
}

/** Full-width outline button, used on tracking and confirmation pages. */
export function WhatsAppButton({
  label = "WhatsApp us",
  text,
  className,
}: {
  label?: string;
  text?: string;
  className?: string;
}) {
  const { url } = useWhatsAppUrl(text);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-line bg-white px-5 text-[16px] font-semibold text-ink hover:bg-ground",
        className,
      )}
    >
      <WhatsAppIcon className="h-4 w-4 text-whatsapp" />
      {label}
    </a>
  );
}
