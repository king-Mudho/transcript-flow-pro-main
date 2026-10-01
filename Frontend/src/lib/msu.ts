/** Delivery fees in USD, for display only. The server sets the real fee when a
 *  request is submitted (Backend/requests_app/services.py), so these cannot be
 *  used to change what a graduate is charged. */
export const FEE_HARARE = 15;
export const FEE_OUTSIDE = 20;

/** The request lifecycle, matching requests_app.models.RequestStatus on the
 *  backend. Keep the two in step: a status the backend can emit but this map
 *  does not know about will fall back to the raw value in the UI. */
export const STATUS_LABELS: Record<string, string> = {
  received: "Received",
  submitted_to_msu: "Submitted to MSU",
  collected_from_msu: "Collected from MSU",
  rejected: "Rejected",
  dispatched: "Dispatched",
  collected: "Collected",
};

/** Every status, in the order shown in filters. */
export const STATUSES = [
  "received",
  "submitted_to_msu",
  "collected_from_msu",
  "rejected",
  "dispatched",
  "collected",
] as const;

export const STATUS_CLASSES: Record<string, string> = {
  received: "bg-status-submitted/15 text-status-submitted border-status-submitted/30",
  submitted_to_msu: "bg-status-msu/15 text-status-msu border-status-msu/30",
  collected_from_msu: "bg-status-frommsu/15 text-status-frommsu border-status-frommsu/30",
  rejected: "bg-status-rejected/15 text-status-rejected border-status-rejected/30",
  dispatched: "bg-status-transit/15 text-status-transit border-status-transit/30",
  collected: "bg-status-collected/15 text-status-collected border-status-collected/30",
};

/** Human-readable label for a status, falling back to the raw value.
 *  Indexing STATUS_LABELS directly would render an empty badge if the backend
 *  ever introduces a status the frontend hasn't been taught yet. */
export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/** Badge classes for a status, falling back to neutral styling so an unknown
 *  status renders as a plain badge rather than `class="... undefined"`. */
export function statusClasses(status: string): string {
  return STATUS_CLASSES[status] ?? "bg-muted text-muted-foreground border-border";
}

/** Graduation years offered in the request form: this year back 15 years. */
export function yearOptions(): number[] {
  const now = new Date().getFullYear();
  return Array.from({ length: 15 }, (_, i) => now - i);
}

/** Format an ISO timestamp from the API for display.
 *  Returns an em dash for missing or unparseable values so a bad timestamp
 *  cannot render as "Invalid Date". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

/** Digits-only form of a +263 number, as wa.me and tel: links want. */
export function waDigits(phone: string): string {
  return phone.replace(/\D/g, "");
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
