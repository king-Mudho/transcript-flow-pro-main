import { Check, X } from "lucide-react";
import type { StatusResult } from "@/lib/api-client";
import { formatDay, formatStep } from "@/lib/msu";
import { cn } from "@/lib/utils";

const STEPS = [
  "received",
  "submitted_to_msu",
  "collected_from_msu",
  "dispatched",
  "collected",
] as const;
type Step = (typeof STEPS)[number];

export function documentWord(r: Pick<StatusResult, "items">): string {
  const types = new Set((r.items ?? []).map((i) => i.document_type));
  const count = (r.items ?? []).reduce((n, i) => n + i.quantity, 0);
  if (count > 1) return "documents";
  if (types.has("degree_certificate")) return "certificate";
  if (types.has("transcript")) return "transcript";
  return "document";
}

function title(step: Step, r: StatusResult): string {
  if (step === "received") return "Received";
  if (step === "submitted_to_msu") return "Submitted to MSU";
  if (step === "collected_from_msu") return "Collected from MSU";
  if (step === "dispatched") return "Dispatched";
  return "Collected";
}

/** Grey line under a step that has not happened yet. */
function upcoming(step: Step, r: StatusResult): string {
  const branch = r.branch?.branch_name ?? "your branch";
  switch (step) {
    case "submitted_to_msu":
      return "We hand your request to MSU";
    case "collected_from_msu":
      return "We collect it once MSU releases it";
    case "dispatched":
      return r.zone === "harare"
        ? "Out for delivery with your driver"
        : `Sent to Zimpost ${branch}`;
    case "collected":
      return r.zone === "harare" ? "Handed to you" : `Collected at Zimpost ${branch}`;
    default:
      return "";
  }
}

/** One line under the current step: what is happening now and what is next. */
function nowLine(step: Step, r: StatusResult): string {
  const doc = documentWord(r);
  const branch = r.branch?.branch_name ?? "your branch";
  switch (step) {
    case "received":
      return "We have your request. Next, we submit it to MSU.";
    case "submitted_to_msu":
      return `Your request is with MSU. Next, we collect your ${doc} once it is released.`;
    case "collected_from_msu":
      return r.zone === "harare"
        ? `We have your ${doc}. Next, it goes out with a driver.`
        : `We have your ${doc}. Next, we send it to Zimpost ${branch}.`;
    case "dispatched":
      if (r.zone === "harare") {
        const first = r.driver?.full_name.split(/\s+/)[0];
        return first ? `Out for delivery with ${first}.` : "Out for delivery with your driver.";
      }
      return `On its way to Zimpost ${branch}.`;
    case "collected":
      if (r.zone === "harare")
        return r.delivered_by ? `Delivered by ${r.delivered_by}.` : "Handed to you.";
      return `Collected at Zimpost ${branch}.`;
  }
}

/**
 * Vertical progress stepper (B2.3, G08–G10). Done steps show a tick and the
 * date reached; the current step is highlighted with a line on what is next;
 * steps to come are grey. A rejection stops at the third step.
 */
export function TrackingStepper({ result }: { result: StatusResult }) {
  const rejected = result.status === "rejected";
  const currentIndex = rejected ? 2 : STEPS.indexOf(result.status as Step);
  const finished = result.status === "collected";

  return (
    <ol className="mt-4" aria-label="Progress">
      {STEPS.map((step, i) => {
        const isRejected = rejected && i === 2;
        const done = !isRejected && (i < currentIndex || (finished && i === currentIndex));
        const current = !isRejected && i === currentIndex && !finished;
        const future = !done && !current && !isRejected;
        const reachedAt = result.stages[isRejected ? "rejected" : step];
        const last = i === STEPS.length - 1;
        const lineDone = i < currentIndex && !(rejected && i >= 1);
        const state = isRejected ? "rejected" : done ? "done" : current ? "current" : "not started";

        return (
          <li
            key={step}
            className="relative flex gap-4 pb-6 last:pb-0"
            aria-current={current ? "step" : undefined}
          >
            {!last && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5",
                  lineDone ? "bg-navy" : "bg-line",
                )}
              />
            )}
            <span
              aria-hidden
              className={cn(
                "z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                isRejected && "bg-danger text-white ring-4 ring-danger-tint",
                done && "bg-navy text-white",
                current && "bg-gold ring-4 ring-gold-tint",
                future && "border-2 border-line bg-white",
              )}
            >
              {isRejected ? (
                <X className="h-4 w-4" />
              ) : done ? (
                <Check className="h-4 w-4" />
              ) : current ? (
                <span className="h-2.5 w-2.5 rounded-full bg-navy" />
              ) : null}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div
                className={cn(
                  "text-[17px] font-semibold",
                  isRejected ? "text-danger" : future ? "text-ink-3/70" : "text-ink",
                )}
              >
                <span className="sr-only">{`Step ${i + 1}, ${state}: `}</span>
                {isRejected ? "Rejected by MSU" : title(step, result)}
              </div>
              {!future && reachedAt && (
                <div className="text-[14px] text-ink-3">{formatStep(reachedAt)}</div>
              )}
              {future && (
                <div className="text-[14px] text-ink-3/70">
                  {rejected ? "Not for this request" : upcoming(step, result)}
                </div>
              )}
              {current && <p className="mt-1.5 text-[15px] text-ink-2">{nowLine(step, result)}</p>}
              {step === "dispatched" &&
                !future &&
                result.zone === "outside_harare" &&
                result.zimpost && (
                  <dl className="mt-2 space-y-0.5 rounded-lg bg-ground p-3 text-[14px]">
                    {result.branch && (
                      <div>
                        <dt className="inline text-ink-3">Branch: </dt>
                        <dd className="inline font-medium">
                          {result.branch.branch_name}, {result.branch.branch_area}
                        </dd>
                      </div>
                    )}
                    {result.zimpost.dispatched_at && (
                      <div>
                        <dt className="inline text-ink-3">Sent on: </dt>
                        <dd className="inline font-medium">
                          {formatDay(result.zimpost.dispatched_at)}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt className="inline text-ink-3">Zimpost tracking number: </dt>
                      <dd className="inline font-medium">
                        {result.zimpost.tracking_number ?? "Not given"}
                      </dd>
                    </div>
                  </dl>
                )}
              {step === "collected" && done && result.zone === "harare" && result.delivered_by && (
                <p className="mt-1 text-[14px] text-ink-3">Delivered by {result.delivered_by}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** The summary card's "Now" line for every stage (B8.4). */
export function summaryNow(r: StatusResult, fee: string): { lead: string; text: string } {
  const doc = documentWord(r);
  const branch = r.branch?.branch_name ?? "your branch";
  switch (r.status) {
    case "received":
      return { lead: "Now:", text: "we have your request. Next, we submit it to MSU." };
    case "submitted_to_msu":
      return {
        lead: "Now:",
        text: `your request is with MSU. Next, we collect your ${doc} once it is released.`,
      };
    case "collected_from_msu":
      return r.zone === "harare"
        ? { lead: "Now:", text: `we have your ${doc}. Next, it goes out with a driver.` }
        : {
            lead: "Now:",
            text: r.paid
              ? `we have your ${doc}. Next, we send it to Zimpost ${branch}.`
              : `we have your ${doc} at our Harare hub. Pay the ${fee} deposit and we send it to Zimpost ${branch}.`,
          };
    case "dispatched":
      return r.zone === "harare"
        ? {
            lead: "On the way.",
            text: r.paid
              ? "Your driver will call when close."
              : `Have ${fee} ready in cash for your driver.`,
          }
        : {
            lead: "On the way.",
            text: `Your ${doc} is going to Zimpost ${branch}. Collect it there once it arrives.`,
          };
    case "collected":
      return {
        lead: "Done.",
        text:
          r.zone === "harare"
            ? `Your ${doc} was handed to you.`
            : `Your ${doc} was collected at Zimpost ${branch}.`,
      };
    default:
      return { lead: "", text: "" };
  }
}
