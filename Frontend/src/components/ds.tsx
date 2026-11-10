/**
 * Shared parts for the graduate site and the admin workspace (B7.1): stage
 * chip, fields with label/hint/error, check and radio cards, notes, cards,
 * KPI tiles, switches and quantity steppers. Built only from the tokens in
 * styles.css.
 */
import * as React from "react";
import { AlertCircle, Check, Info, Minus, Plus, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { statusLabel } from "@/lib/msu";

/* ----------------------------------------------------------- stage chip */

const STAGE_STYLE: Record<string, { text: string; bg: string; dot: string }> = {
  received: { text: "text-stage-received", bg: "bg-stage-received-tint", dot: "bg-stage-received" },
  submitted_to_msu: { text: "text-stage-msu", bg: "bg-stage-msu-tint", dot: "bg-stage-msu" },
  ready_at_msu: { text: "text-stage-msu", bg: "bg-stage-msu-tint", dot: "bg-stage-msu" },
  collected_from_msu: {
    text: "text-stage-frommsu",
    bg: "bg-stage-frommsu-tint",
    dot: "bg-stage-frommsu",
  },
  rejected: { text: "text-stage-rejected", bg: "bg-stage-rejected-tint", dot: "bg-stage-rejected" },
  dispatched: {
    text: "text-stage-dispatched",
    bg: "bg-stage-dispatched-tint",
    dot: "bg-stage-dispatched",
  },
  collected: {
    text: "text-stage-collected",
    bg: "bg-stage-collected-tint",
    dot: "bg-stage-collected",
  },
};

export function StageChip({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  const s = STAGE_STYLE[status] ?? STAGE_STYLE.received;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold",
        s.bg,
        s.text,
        className,
      )}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {label ?? (status === "ready_at_msu" ? "Ready at MSU" : statusLabel(status))}
    </span>
  );
}

/* ----------------------------------------------------------------- tags */

export function Tag({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "gold" | "danger" | "success" | "info" | "navy";
  className?: string;
}) {
  const tones = {
    neutral: "bg-ground text-ink-2 border-line",
    gold: "bg-gold-tint text-warn-ink border-gold/30",
    danger: "bg-danger-tint text-danger border-danger/20",
    success: "bg-success-tint text-success border-success/20",
    info: "bg-info-tint text-info-ink border-info-ink/15",
    navy: "bg-navy text-white border-navy",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[12px] font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------- card */

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-xl border border-line bg-white", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  action,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
      {action}
    </div>
  );
}

/* ---------------------------------------------------------------- notes */

export function Note({
  tone = "info",
  children,
  className,
  icon = true,
}: {
  tone?: "info" | "warn" | "danger" | "success" | "neutral";
  children: React.ReactNode;
  className?: string;
  icon?: boolean;
}) {
  const tones = {
    info: "bg-info-tint text-info-ink",
    warn: "bg-gold-tint text-warn-ink",
    danger: "bg-danger-tint text-danger",
    success: "bg-success-tint text-success",
    neutral: "bg-ground text-ink-2",
  };
  const Icon = tone === "danger" ? AlertCircle : tone === "warn" ? TriangleAlert : Info;
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={cn(
        "flex gap-2.5 rounded-lg px-3.5 py-3 text-[14px] leading-snug",
        tones[tone],
        className,
      )}
    >
      {icon && <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* --------------------------------------------------------------- fields */

/** Label, the control, then a hint or an error. Errors are announced. */
export function Field({
  label,
  optional,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: React.ReactNode;
  optional?: boolean;
  hint?: React.ReactNode;
  error?: string | null;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const id = React.useId();
  const hintId = `${id}-hint`;
  const control = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        "aria-describedby": hint || error ? hintId : undefined,
        "aria-invalid": error ? true : undefined,
      })
    : children;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[14px] font-semibold text-ink">
        {label}
        {optional && <span className="font-normal text-ink-3"> (optional)</span>}
      </label>
      {control}
      {error ? (
        <p id={hintId} role="alert" className="text-[13px] font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[13px] text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const fieldBase =
  "w-full rounded-lg border border-line bg-white px-4 text-[16px] text-ink placeholder:text-ink-3/70 transition-colors focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15 aria-[invalid=true]:border-danger disabled:bg-ground disabled:text-ink-3";

export const TextInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(fieldBase, "h-12", className)} {...props} />
  ),
);
TextInput.displayName = "TextInput";

export const TextArea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(fieldBase, "min-h-[88px] py-3", className)} {...props} />
  ),
);
TextArea.displayName = "TextArea";

export const NativeSelect = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(fieldBase, "h-12 appearance-auto pr-3", className)} {...props}>
      {children}
    </select>
  ),
);
NativeSelect.displayName = "NativeSelect";

/* ------------------------------------------------- check and radio cards */

export function CheckCard({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  description?: string;
}) {
  return (
    <label
      className={cn(
        "flex min-h-[64px] cursor-pointer items-start gap-3.5 rounded-xl border px-4 py-3.5 transition-colors",
        checked ? "border-navy bg-ground" : "border-line bg-white hover:bg-ground",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[var(--navy)]"
      />
      <span className="min-w-0">
        <span className="block text-[16px] font-semibold text-ink">{title}</span>
        {description && <span className="block text-[14px] text-ink-3">{description}</span>}
      </span>
    </label>
  );
}

export function RadioCard({
  name,
  value,
  checked,
  onChange,
  title,
  price,
  description,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  title: string;
  price?: string;
  description?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3.5 rounded-xl border px-4 py-3.5 transition-colors",
        checked
          ? "border-2 border-navy bg-ground px-[15px] py-[13px]"
          : "border-line bg-white hover:bg-ground",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-[var(--navy)]"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-[16px] font-semibold text-ink">{title}</span>
          {price && <span className="text-[16px] font-semibold text-ink tabular">{price}</span>}
        </span>
        {description && <span className="mt-0.5 block text-[14px] text-ink-3">{description}</span>}
      </span>
    </label>
  );
}

/* -------------------------------------------------------------- stepper */

export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max = 10,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex h-11 items-center rounded-lg border border-line bg-white"
    >
      <button
        type="button"
        aria-label={`Fewer: ${label}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex h-11 w-11 items-center justify-center text-ink-2 disabled:text-line"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span aria-live="polite" className="w-7 text-center text-[16px] font-semibold tabular">
        {value}
      </span>
      <button
        type="button"
        aria-label={`More: ${label}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="flex h-11 w-11 items-center justify-center text-ink-2 disabled:text-line"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

/* --------------------------------------------------------------- switch */

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-navy" : "bg-line",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-[2px]",
        )}
      />
    </button>
  );
}

/* ------------------------------------------------------------ KPI tile */

export function KpiTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "danger" | "gold";
}) {
  return (
    <Card className="p-4">
      <div className="text-[13px] font-medium text-ink-3">{label}</div>
      <div
        className={cn(
          "mt-1 text-[28px] font-semibold leading-tight tabular",
          tone === "danger" ? "text-danger" : tone === "gold" ? "text-warn-ink" : "text-ink",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[12px] text-ink-3">{hint}</div>}
    </Card>
  );
}

/* ---------------------------------------------------------- definition */

export function DefRow({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 py-1 text-[15px]">
      <dt className="text-ink-3">{k}</dt>
      <dd className="font-medium text-ink">{v}</dd>
    </div>
  );
}

export function Tick({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-medium",
        ok ? "bg-success-tint text-success" : "bg-danger-tint text-danger",
      )}
    >
      {ok ? <Check className="h-3 w-3" /> : "✕"} {label}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent",
        className,
      )}
    />
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-12 text-center text-[14px] text-ink-3">{children}</div>;
}
