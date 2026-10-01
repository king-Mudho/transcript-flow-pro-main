import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { apiClient, type BatchDetail, type RequestRow } from "@/lib/api-client";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, statusClasses, statusLabel } from "@/lib/msu";
import {
  batchSummary,
  buildWaybill,
  downloadBlob,
  shareWaybill,
  waybillFilename,
} from "@/lib/waybill";
import { toast } from "sonner";
import { ArrowLeft, FileText, Loader2, Share2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/batch/$batchId")({
  head: () => ({ meta: [{ title: "Admin — Batch" }, { name: "robots", content: "noindex" }] }),
  component: BatchPage,
});

function BatchPage() {
  const { batchId } = Route.useParams();
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [failing, setFailing] = useState<RequestRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setBatch(await apiClient.getBatch(batchId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load batch");
    }
  }, [batchId]);

  useEffect(() => {
    load();
  }, [load]);

  async function resolve(r: RequestRow, delivered: boolean, reason?: string) {
    setBusy(r.id);
    try {
      setBatch(await apiClient.resolveBatchItem(batchId, r.id, delivered, reason));
      toast.success(delivered ? "Marked delivered" : "Returned to Collected from MSU");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  }

  async function downloadPdf() {
    if (!batch) return;
    setBusy("pdf");
    try {
      downloadBlob(await buildWaybill(batch), waybillFilename(batch));
    } catch {
      toast.error("Could not build the waybill");
    } finally {
      setBusy(null);
    }
  }

  async function share() {
    if (!batch) return;
    setBusy("share");
    try {
      const how = await shareWaybill(batch);
      if (how === "downloaded") {
        toast.message("Waybill downloaded. Attach it in the WhatsApp chat that opened.");
      }
    } catch {
      toast.error("Could not share the waybill");
    } finally {
      setBusy(null);
    }
  }

  if (!batch) {
    return (
      <AdminShell>
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      </AdminShell>
    );
  }

  const { count, cash } = batchSummary(batch);
  const d = batch.driver;

  return (
    <AdminShell>
      <Link
        to="/admin/dispatch"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Dispatch
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-semibold">{batch.batch_number}</h1>
          <p className="text-sm text-muted-foreground">
            {batch.status === "closed" ? "Closed" : "Out for delivery"} · out{" "}
            {formatDate(batch.dispatched_at)}
            {batch.closed_at && ` · closed ${formatDate(batch.closed_at)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={downloadPdf} disabled={busy === "pdf"}>
            <FileText className="mr-2 h-4 w-4" /> Waybill (PDF)
          </Button>
          <Button
            onClick={share}
            disabled={busy === "share"}
            className="bg-[#25D366] text-white hover:bg-[#1EBE5A]"
          >
            <Share2 className="mr-2 h-4 w-4" /> Share on WhatsApp
          </Button>
        </div>
      </div>

      <div className="mb-6 grid gap-4 rounded-lg border bg-card p-4 text-sm sm:grid-cols-4">
        <Info k="Driver" v={d.full_name} />
        <Info k="Phone" v={d.phone} />
        <Info k="Bike" v={d.bike_registration || "—"} />
        <Info k="Documents / cash" v={`${count} · US$${cash.toFixed(2)}`} />
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        The waybill lists graduates&apos; phone numbers and addresses. Share it only with the driver
        assigned to this batch.
      </p>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Graduate</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Suburb / address</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-56" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {batch.requests.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.reference_number}</TableCell>
                <TableCell className="font-medium">{r.full_name}</TableCell>
                <TableCell>{r.phone_number}</TableCell>
                <TableCell className="max-w-[240px] truncate">
                  {[r.suburb, r.harare_address].filter(Boolean).join(" — ")}
                </TableCell>
                <TableCell>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClasses(r.status)}`}
                  >
                    {statusLabel(r.status)}
                  </span>
                </TableCell>
                <TableCell>
                  {r.status === "dispatched" && (
                    <div className="flex gap-2">
                      <Button size="sm" disabled={busy === r.id} onClick={() => resolve(r, true)}>
                        Delivered
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === r.id}
                        onClick={() => setFailing(r)}
                      >
                        Not delivered
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {failing && (
        <NotDeliveredDialog
          request={failing}
          onClose={() => setFailing(null)}
          onConfirm={async (reason) => {
            const r = failing;
            setFailing(null);
            await resolve(r, false, reason);
          }}
        />
      )}
    </AdminShell>
  );
}

function NotDeliveredDialog({
  request,
  onClose,
  onConfirm,
}: {
  request: RequestRow;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Not delivered: {request.full_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The document leaves this batch and goes back to Collected from MSU. The reason is kept
            in its history.
          </p>
          <Input
            placeholder="Reason, e.g. nobody at the address"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!reason.trim()} onClick={() => onConfirm(reason.trim())}>
              Confirm
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className="font-medium">{v}</div>
    </div>
  );
}
