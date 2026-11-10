import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { apiClient, type BulkResult, type RequestFilters } from "@/lib/api-client";
import { isBackMove, statusLabel } from "@/lib/msu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Note } from "@/components/ds";
import { toast } from "sonner";

export type MoveTarget = { ids: string[] } | { filters: Partial<RequestFilters> };

/**
 * Confirmation for every status change, single or bulk (B2.1). Asks for what
 * the move needs: a reason to reject, a dispatch date and tracking number for
 * Zimpost, a note to step back or to override unverified clearance. Applies
 * the move only where it is allowed and lists what it skipped. A move to
 * Submitted to MSU reports the hand-in list it created (B9.4).
 */
export function StatusMoveDialog({
  open,
  target,
  count,
  status,
  currentStatus,
  needsOverride,
  onClose,
  onDone,
}: {
  open: boolean;
  target: MoveTarget;
  count: number;
  status: string;
  currentStatus?: string;
  /** Known for a single request whose clearance is not verified. */
  needsOverride?: boolean;
  onClose: () => void;
  onDone: (result: BulkResult) => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setNote("");
      setTracking("");
      setResult(null);
      setDate(new Date().toISOString().slice(0, 10));
    }
  }, [open, status]);

  const rejecting = status === "rejected";
  const dispatching = status === "dispatched";
  const submitting =
    status === "submitted_to_msu" && (!currentStatus || currentStatus === "received");
  const backStep = !!currentStatus && isBackMove(currentStatus, status);
  const noteRequired = backStep || (submitting && !!needsOverride);

  async function apply() {
    if (rejecting && !reason.trim()) return toast.error("A rejection needs a reason");
    if (noteRequired && !note.trim())
      return toast.error(
        backStep ? "Say why you are stepping back" : "Add a note to override the clearance check",
      );
    setBusy(true);
    try {
      const res = await apiClient.bulkUpdateStatus(target, status, {
        reason: rejecting ? reason.trim() : undefined,
        note: note.trim() || undefined,
        dispatched_at: dispatching ? date : undefined,
        zimpost_tracking_number: dispatching ? tracking.trim() || undefined : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["sidebar-counts"] });
      onDone(res);
      if (res.skipped.length === 0) {
        toast.success(
          `Moved ${res.moved} request${res.moved === 1 ? "" : "s"} to ${statusLabel(status)}` +
            (res.handin_list ? ` · hand-in list ${res.handin_list.number}` : ""),
        );
        onClose();
      } else {
        setResult(res);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {result
              ? `Moved ${result.moved}, skipped ${result.skipped.length}`
              : `Move ${count} request${count === 1 ? "" : "s"} to ${statusLabel(status)}?`}
          </DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            {result.handin_list && (
              <Note tone="success">
                Hand-in list {result.handin_list.number} was created for the requests that moved.
              </Note>
            )}
            <p className="text-[14px] text-ink-3">These were left as they were:</p>
            <ul className="max-h-60 space-y-1 overflow-y-auto rounded-lg border border-line p-3 text-[14px]">
              {result.skipped.map((s) => (
                <li key={s.reference_number}>
                  <span className="font-mono text-[12px]">{s.reference_number}</span> — {s.reason}
                </li>
              ))}
            </ul>
            <Button onClick={onClose} className="w-full">
              Close
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {count > 1 && (
              <p className="text-[14px] text-ink-3">
                Only requests allowed to move to this stage will change. The rest are skipped and
                listed afterwards.
              </p>
            )}
            {submitting && (
              <Note tone="info">
                The requests that move go on one new hand-in list for MSU to sign. Requests whose
                clearance is not verified are skipped unless you add a note to override.
              </Note>
            )}
            {rejecting && (
              <div>
                <Label>Reason (shown to the graduate)</Label>
                <Textarea
                  className="mt-1.5"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Library clearance not approved on the student portal"
                />
              </div>
            )}
            {dispatching && (
              <div className="space-y-3 rounded-lg border border-line bg-ground p-3">
                <p className="text-[13px] text-ink-3">
                  For requests outside Harare, sent by Zimpost. Harare requests are dispatched in a
                  batch on the Dispatch page.
                </p>
                <div>
                  <Label>Dispatch date</Label>
                  <Input
                    className="mt-1.5"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Zimpost tracking or registered-mail number (optional)</Label>
                  <Input
                    className="mt-1.5"
                    value={tracking}
                    onChange={(e) => setTracking(e.target.value)}
                  />
                </div>
              </div>
            )}
            <div>
              <Label>
                {backStep
                  ? "Why are you stepping back? (required)"
                  : submitting && needsOverride
                    ? "Clearance is not verified. Note for the override (required)"
                    : submitting
                      ? "Note (needed to override unverified clearance)"
                      : "Note (optional)"}
              </Label>
              <Input className="mt-1.5" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={apply} disabled={busy} variant={rejecting ? "danger" : "navy"}>
                {busy && <Loader2 className="animate-spin" />} Confirm
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
