import { useEffect, useState } from "react";
import { apiClient, type BulkResult, type RequestFilters } from "@/lib/api-client";
import { statusLabel } from "@/lib/msu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export type MoveTarget = { ids: string[] } | { filters: RequestFilters };

/**
 * Confirmation step for every status change, single or bulk.
 *
 * Asks for whatever the target status needs: one reason for a rejection, a
 * dispatch date and optional tracking number for Zimpost dispatches, and a note
 * (needed by the server when stepping back a stage). Applies the move only
 * where it is allowed and lists the requests it had to skip.
 */
export function StatusMoveDialog({
  open,
  target,
  count,
  status,
  onClose,
  onDone,
}: {
  open: boolean;
  target: MoveTarget;
  count: number;
  status: string;
  onClose: () => void;
  onDone: () => void;
}) {
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

  async function apply() {
    if (rejecting && !reason.trim()) return toast.error("A rejection needs a reason");
    setBusy(true);
    try {
      const res = await apiClient.bulkUpdateStatus(target, status, {
        reason: rejecting ? reason.trim() : undefined,
        note: note.trim() || undefined,
        dispatched_at: dispatching ? date : undefined,
        zimpost_tracking_number: dispatching ? tracking.trim() || undefined : undefined,
      });
      onDone();
      if (res.skipped.length === 0) {
        toast.success(`Moved ${res.moved} request(s) to ${statusLabel(status)}`);
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
            <p className="text-sm text-muted-foreground">
              These could not move, because the move is not allowed from their current stage:
            </p>
            <ul className="max-h-60 space-y-1 overflow-y-auto rounded-md border p-3 text-sm">
              {result.skipped.map((s) => (
                <li key={s.reference_number}>
                  <span className="font-mono text-xs">{s.reference_number}</span> — {s.reason}
                </li>
              ))}
            </ul>
            <Button onClick={onClose} className="w-full">
              Close
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Only requests that may move to this stage will change. The rest are skipped and listed
              afterwards.
            </p>
            {rejecting && (
              <div>
                <Label>Reason for rejection (shown to the graduate)</Label>
                <Textarea
                  className="mt-1.5"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Library fines still outstanding"
                />
              </div>
            )}
            {dispatching && (
              <div className="space-y-3 rounded-md border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">
                  For requests outside Harare (sent by Zimpost). Harare requests are dispatched
                  through a batch on the Dispatch page.
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
              <Label>Note (needed when stepping back a stage)</Label>
              <Input className="mt-1.5" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={apply} disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirm
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
