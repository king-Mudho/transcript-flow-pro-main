import { Check, Phone, X } from "lucide-react";
import type { StatusResult } from "@/lib/api-client";
import { formatDate, statusLabel, waDigits } from "@/lib/msu";
import { WhatsAppContactButton } from "@/components/whatsapp-contact";

const STEPS = [
  "received",
  "submitted_to_msu",
  "collected_from_msu",
  "dispatched",
  "collected",
] as const;

type Step = (typeof STEPS)[number];

/** Heading shown for a step, which varies with the delivery zone. */
function stepTitle(step: Step, r: StatusResult): string {
  const branch = r.branch?.branch_name ?? "branch";
  if (step === "dispatched") {
    return r.zone === "harare" ? "Out for delivery with your driver" : `Sent to Zimpost ${branch}`;
  }
  if (step === "collected") {
    return r.zone === "harare" ? "Delivered to you" : `Collected at Zimpost ${branch}`;
  }
  return statusLabel(step);
}

/** One line on what is happening now and what comes next. */
function currentLine(step: Step, r: StatusResult): string {
  const branch = r.branch?.branch_name ?? "your branch";
  switch (step) {
    case "received":
      return "We have your request. Next, we submit it to MSU.";
    case "submitted_to_msu":
      return "Your request is with MSU. Next, we collect your document from MSU.";
    case "collected_from_msu":
      return r.zone === "harare"
        ? "We have your document. Next, it goes out with a driver."
        : `We have your document. Next, it is sent to Zimpost ${branch}.`;
    case "dispatched":
      return r.zone === "harare"
        ? "Your document is on its way. Please keep your phone close and have the cash ready."
        : `Your document is on its way to Zimpost ${branch}. Next, you collect it there.`;
    case "collected":
      return r.zone === "harare"
        ? "Your document was handed to you."
        : "Your document was collected.";
  }
}

export function TrackingStepper({ result }: { result: StatusResult }) {
  const rejected = result.status === "rejected";
  // A rejection stops at the third step, in place of "Collected from MSU".
  const currentIndex = rejected ? 2 : STEPS.indexOf(result.status as Step);
  const finished = result.status === "collected";

  return (
    <ol className="mt-6">
      {STEPS.map((step, i) => {
        const isRejectedStep = rejected && i === 2;
        const done = !isRejectedStep && (i < currentIndex || (finished && i === currentIndex));
        const current = i === currentIndex && !finished;
        const reachedAt = result.stages[isRejectedStep ? "rejected" : step];
        const last = i === STEPS.length - 1;

        const dot = isRejectedStep
          ? "border-status-rejected bg-status-rejected text-white"
          : done
            ? "border-status-collected bg-status-collected text-white"
            : current
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/30 bg-background text-muted-foreground/40";

        return (
          <li key={step} className="relative flex gap-4 pb-6 last:pb-0">
            {!last && (
              <span
                aria-hidden
                className={`absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5 ${
                  done ? "bg-status-collected" : "bg-muted-foreground/20"
                }`}
              />
            )}
            <span
              className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold ${dot}`}
            >
              {isRejectedStep ? (
                <X className="h-4 w-4" />
              ) : done ? (
                <Check className="h-4 w-4" />
              ) : (
                i + 1
              )}
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <div
                className={`text-sm font-semibold ${
                  isRejectedStep
                    ? "text-status-rejected"
                    : done || current
                      ? "text-foreground"
                      : "text-muted-foreground/60"
                }`}
              >
                {isRejectedStep ? "Rejected" : stepTitle(step, result)}
              </div>

              {(done || current || isRejectedStep) && reachedAt && (
                <div className="text-xs text-muted-foreground">{formatDate(reachedAt)}</div>
              )}

              {current && !isRejectedStep && (
                <p className="mt-1 text-sm text-primary">{currentLine(step, result)}</p>
              )}

              {isRejectedStep && (
                <div className="mt-2 space-y-3 rounded-md border border-status-rejected/30 bg-status-rejected/5 p-3 text-sm">
                  {result.status_reason && (
                    <p className="text-status-rejected">{result.status_reason}</p>
                  )}
                  <WhatsAppContactButton />
                </div>
              )}

              {step === "dispatched" && (done || current) && <DispatchDetails result={result} />}

              {step === "collected" && done && result.delivered_by && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Delivered by {result.delivered_by}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function DispatchDetails({ result }: { result: StatusResult }) {
  if (result.zone === "harare") {
    if (result.driver) {
      const d = result.driver;
      return (
        <div className="mt-3 rounded-md border bg-muted/30 p-3 text-sm">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Your driver
          </div>
          <div className="flex items-start gap-3">
            {d.photo_url && (
              <img
                src={d.photo_url}
                alt=""
                className="h-14 w-14 shrink-0 rounded-full object-cover"
              />
            )}
            <div className="min-w-0 space-y-0.5">
              <div className="font-semibold">{d.full_name}</div>
              <div className="text-muted-foreground">{d.phone}</div>
              {d.bike_registration && (
                <div className="text-muted-foreground">Bike: {d.bike_registration}</div>
              )}
              <div className="text-xs text-muted-foreground">
                Dispatched {formatDate(d.dispatched_at)}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={`tel:${d.phone}`}
              className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <Phone className="h-4 w-4" /> Call
            </a>
            <a
              href={`https://wa.me/${waDigits(d.whatsapp_phone)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-[#25D366] px-3 py-2 text-sm font-medium text-white hover:bg-[#1EBE5A]"
            >
              WhatsApp
            </a>
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <dl className="mt-3 grid gap-1 rounded-md border bg-muted/30 p-3 text-sm">
      {result.branch && (
        <Line k="Branch" v={`${result.branch.branch_name} — ${result.branch.branch_area}`} />
      )}
      {result.zimpost?.dispatched_at && (
        <Line k="Sent on" v={formatDate(result.zimpost.dispatched_at).split(",")[0]} />
      )}
      {result.zimpost?.tracking_number && (
        <Line k="Tracking number" v={result.zimpost.tracking_number} />
      )}
    </dl>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
