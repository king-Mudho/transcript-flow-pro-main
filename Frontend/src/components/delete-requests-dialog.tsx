import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { Note } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

/**
 * Permanent deletion of one or more requests (admins only), for test entries,
 * spam or mistakes. The server refuses requests that have payments recorded
 * or are out for delivery, and keeps a snapshot of each deleted request in
 * the audit log. Asks for a reason and an explicit confirmation.
 */
export function DeleteRequestsDialog({
  ids,
  label,
  onClose,
  onDone,
}: {
  ids: string[];
  /** e.g. "MSU-2026-048213" or "12 requests" */
  label: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [skipped, setSkipped] = useState<{ reference_number: string; reason: string }[] | null>(
    null,
  );

  async function remove() {
    setBusy(true);
    try {
      if (ids.length === 1) {
        await apiClient.deleteRequest(ids[0]!, reason.trim());
        toast.success(`${label} deleted`);
        finish();
        return;
      }
      const res = await apiClient.bulkDeleteRequests(ids, reason.trim());
      toast.success(`Deleted ${res.deleted} request${res.deleted === 1 ? "" : "s"}`);
      if (res.skipped.length) {
        setSkipped(res.skipped);
        queryClient.invalidateQueries({ queryKey: ["sidebar-counts"] });
        onDone();
      } else {
        finish();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
    } finally {
      setBusy(false);
    }
  }

  function finish() {
    queryClient.invalidateQueries({ queryKey: ["sidebar-counts"] });
    onDone();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{skipped ? "Some requests were kept" : `Delete ${label}?`}</DialogTitle>
        </DialogHeader>
        {skipped ? (
          <div className="space-y-3">
            <ul className="max-h-60 space-y-1 overflow-y-auto rounded-lg border border-line p-3 text-[14px]">
              {skipped.map((s) => (
                <li key={s.reference_number}>
                  <span className="font-mono text-[12px]">{s.reference_number}</span> — {s.reason}
                </li>
              ))}
            </ul>
            <Button className="w-full" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Note tone="danger">
              This removes the request, its documents, history, notes and clearance files for good.
              The graduate will no longer be able to track it. Requests with payments recorded or
              out for delivery are kept.
            </Note>
            <div>
              <Label>Reason (kept in the audit log)</Label>
              <Textarea
                className="mt-1.5"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Test entry, or duplicate sent by mistake"
              />
            </div>
            <label className="flex cursor-pointer items-start gap-2.5 text-[14px]">
              <input
                type="checkbox"
                checked={sure}
                onChange={(e) => setSure(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--danger)]"
              />
              I understand this cannot be undone.
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="danger" disabled={!reason.trim() || !sure || busy} onClick={remove}>
                {busy ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete permanently
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
