/** Delivery fees in USD used only until Settings have loaded. The server sets
 *  the real fee when a request is submitted, from the admin Settings page. */
export const FEE_HARARE = 15;
export const FEE_OUTSIDE = 20;

/** Support WhatsApp number used until Settings have loaded. */
export const SUPPORT_WHATSAPP = "+263714460652";

/** The request lifecycle, matching requests_app.models.RequestStatus. */
export const STATUS_LABELS: Record<string, string> = {
  received: "Received",
  submitted_to_msu: "Submitted to MSU",
  collected_from_msu: "Collected from MSU",
  rejected: "Rejected",
  dispatched: "Dispatched",
  collected: "Collected",
};

/** Every status, in the order shown in tabs and filters. */
export const STATUSES = [
  "received",
  "submitted_to_msu",
  "collected_from_msu",
  "dispatched",
  "collected",
  "rejected",
] as const;

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export const DOCUMENT_TYPES = [
  { value: "transcript", label: "Academic transcript", hint: "Official, sealed by MSU" },
  { value: "degree_certificate", label: "Degree certificate", hint: "Original certificate" },
] as const;

export function documentLabel(type: string): string {
  if (type === "transcript") return "Academic transcript";
  if (type === "degree_certificate") return "Degree certificate";
  return "Document (not recorded)";
}

export const CHANNEL_LABELS: Record<string, string> = {
  web: "Website",
  whatsapp: "WhatsApp",
  phone: "Phone call",
  walk_in: "Walk-in",
};

/** Graduation years offered in the request form: this year back 15 years. */
export function yearOptions(): number[] {
  const now = new Date().getFullYear();
  return Array.from({ length: 15 }, (_, i) => now - i);
}

/** "US$15" for whole amounts, "US$15.50" otherwise. */
export function money(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "US$0";
  const abs = Math.abs(n);
  return `${n < 0 ? "−" : ""}US$${Number.isInteger(abs) ? abs : abs.toFixed(2)}`;
}

/** Format an ISO timestamp for display, or an em dash. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

/** "Thu 9 Oct, 10:12", as in the tracking designs. */
export function formatStep(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day.replace(",", "")}, ${time}`;
}

export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** Digits-only form of a +263 number, as wa.me and tel: links want. */
export function waDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** "+263 77 123 4567" for display. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const m = phone.match(/^\+263(\d{2})(\d{3})(\d{4})$/);
  return m ? `+263 ${m[1]} ${m[2]} ${m[3]}` : phone;
}

/** Mirrors services.normalise_phone: a Zimbabwe mobile as +2637XXXXXXXX, or null. */
export function normalisePhone(raw: string): string | null {
  let digits = (raw || "").replace(/[\s\-().]/g, "");
  if (digits.startsWith("00263")) digits = "+" + digits.slice(2);
  else if (digits.startsWith("263")) digits = "+" + digits;
  else if (digits.startsWith("0")) digits = "+263" + digits.slice(1);
  else if (/^7\d{8}$/.test(digits)) digits = "+263" + digits;
  return /^\+2637\d{8}$/.test(digits) ? digits : null;
}

/** Registration numbers: uppercase, no spaces. */
export function normaliseReg(raw: string): string {
  return (raw || "").replace(/\s+/g, "").toUpperCase();
}

/** MSU format appears to be R, six digits and a letter. Used to warn only. */
export function regLooksRight(reg: string): boolean {
  return /^R\d{6}[A-Z]$/.test(reg);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** One step back to fix a mistake. Mirrors BACK_MOVES in requests_app/models.py. */
const BACK_MOVES: Record<string, string[]> = {
  submitted_to_msu: ["received"],
  collected_from_msu: ["submitted_to_msu"],
  rejected: ["submitted_to_msu"],
  dispatched: ["collected_from_msu"],
  collected: ["dispatched"],
};

export function isBackMove(from: string, to: string): boolean {
  return (BACK_MOVES[from] ?? []).includes(to);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function openWhatsApp(phone: string, text?: string) {
  const url = `https://wa.me/${waDigits(phone)}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
  window.open(url, "_blank", "noopener");
}
