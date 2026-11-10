import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, FileText, Phone, Printer, Share2 } from "lucide-react";
import { AdminShell, useCurrentUser } from "@/components/admin-shell";
import { Card, CardHeader, DefRow, Note, Spinner, StageChip, Tag } from "@/components/ds";
import { WhatsAppIcon } from "@/components/whatsapp-contact";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient, type RequestRow } from "@/lib/api-client";
import {
  downloadBlob,
  formatDate,
  formatPhone,
  initials,
  money,
  openWhatsApp,
  waDigits,
} from "@/lib/msu";
import {
  batchSummary,
  cashToCollect,
  labelFromRequest,
  labelsPdf,
  sharePdf,
  waybillFilename,
  waybillPdf,
} from "@/lib/pdf";
import { useSite } from "@/lib/site";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/batch/$batchId")({
  head: () => ({
    meta: [{ title: "Batch — MSU Transcript admin" }, { name: "robots", content: "noindex" }],
  }),
  component: BatchPage,
});

function BatchPage() {
  const { batchId } = Route.useParams();
  const site = useSite();
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { data: batch, refetch } = useQuery({
    queryKey: ["batch", batchId],
    queryFn: () => apiClient.getBatch(batchId),
  });
  const [failing, setFailing] = useState<RequestRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [handedIn, setHandedIn] = useState("");
  const [note, setNote] = useState("");

  if (!batch) {
    return (
      <AdminShell>
        <div className="flex justify-center py-20 text-ink-3">
          <Spinner />
        </div>
      </AdminShell>
    );
  }

  const b = batch;
  const d = b.driver;
  const { count, cash, documents } = batchSummary(b);
  const resolvedAll = b.outstanding === 0;
  const expected = Number(b.cash_to_collect);
  const variance = handedIn === "" ? null : Number(handedIn) - expected;
  const closed = b.status === "closed";

  async function resolve(r: RequestRow, delivered: boolean, reason?: string) {
    setBusy(r.id);
    try {
      await apiClient.resolveBatchItem(batchId, r.id, delivered, reason);
      toast.success(delivered ? "Marked delivered" : "Returned to Collected from MSU");
      refetch();
      queryClient.invalidateQueries({ queryKey: ["sidebar-counts"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  }

  async function waybill(share: boolean) {
    setBusy(share ? "share" : "pdf");
    try {
      const blob = await waybillPdf(b, site, user?.full_name || user?.email);
      if (!share) {
        downloadBlob(blob, waybillFilename(b));
      } else {
        const how = await sharePdf(
          blob,
          waybillFilename(b),
          `Waybill ${b.batch_number}: ${count} request${count === 1 ? "" : "s"}, ${documents} document${documents === 1 ? "" : "s"}, US$${cash.toFixed(2)} cash to collect.`,
          d.whatsapp_phone || d.phone,
        );
        if (how === "downloaded")
          toast.message("Waybill downloaded. Attach it in the WhatsApp chat that opened.");
      }
    } catch {
      toast.error("Could not build the waybill");
    } finally {
      setBusy(null);
    }
  }

  async function labels(format: "thermal" | "a4") {
    const blob = await labelsPdf(
      b.requests.map((r) => labelFromRequest(r, b.batch_number)),
      site,
      window.location.origin,
      format,
    );
    downloadBlob(blob, `labels-${b.batch_number}${format === "a4" ? "-a4" : ""}.pdf`);
  }

  async function close() {
    setBusy("close");
    try {
      await apiClient.closeBatch(batchId, Number(handedIn), note);
      toast.success("Batch closed and payments recorded");
      refetch();
      queryClient.invalidateQueries({ queryKey: ["sidebar-counts"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not close the batch");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminShell wide>
      <Link
        to="/admin/dispatch"
        search={{ tab: "batches" }}
        className="mb-4 inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Batches
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-[24px] font-bold">{b.batch_number}</h1>
          <p className="text-[13px] text-ink-3">
            {closed ? "Closed" : "Out for delivery"} · out {formatDate(b.dispatched_at)}
            {b.closed_at && ` · closed ${formatDate(b.closed_at)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => waybill(false)} disabled={busy === "pdf"}>
            <FileText /> Waybill (PDF)
          </Button>
          <Button variant="outline" onClick={() => labels("thermal")}>
            <Printer /> Labels 4×6
          </Button>
          <Button variant="outline" onClick={() => labels("a4")}>
            <Printer /> Labels A4
          </Button>
          <Button variant="whatsapp" onClick={() => waybill(true)} disabled={busy === "share"}>
            <Share2 /> Share on WhatsApp
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card className="flex flex-wrap items-center gap-4 p-5">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gold-tint text-[16px] font-bold text-navy">
              {initials(d.full_name)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-semibold">{d.full_name}</div>
              <div className="text-[13px] text-ink-3">
                {formatPhone(d.phone)}
                {d.bike_registration && ` · Bike ${d.bike_registration}`}
              </div>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={`tel:${d.phone}`}>
                  <Phone /> Call
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a
                  href={`https://wa.me/${waDigits(d.whatsapp_phone || d.phone)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <WhatsAppIcon className="h-4 w-4 text-whatsapp" /> WhatsApp
                </a>
              </Button>
            </div>
            <div className="grid w-full grid-cols-3 gap-3 text-center sm:w-auto">
              <Mini k="Delivered" v={`${b.delivered}/${b.document_count}`} />
              <Mini k="Still out" v={b.outstanding} />
              <Mini k="Cash so far" v={money(b.cash_to_collect)} />
            </div>
          </Card>
          <Note tone="warn" icon={false}>
            The waybill and labels hold graduates&apos; phone numbers and addresses. Share them only
            with {d.full_name}.
          </Note>

          <Card className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead className="border-b border-line text-[12px] uppercase tracking-wider text-ink-3">
                <tr>
                  <th className="px-4 py-2.5">#</th>
                  <th className="px-4 py-2.5">Graduate</th>
                  <th className="px-4 py-2.5">Suburb and address</th>
                  <th className="px-4 py-2.5">Cash</th>
                  <th className="px-4 py-2.5">Stage</th>
                  <th className="px-4 py-2.5">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {b.requests.map((r, i) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5 text-ink-3">{i + 1}</td>
                    <td className="px-4 py-2.5">
                      <Link
                        to="/admin/requests/$requestId"
                        params={{ requestId: r.id }}
                        className="font-semibold hover:underline"
                      >
                        {r.full_name}
                      </Link>
                      <div className="text-[12px] text-ink-3">
                        {r.reference_number} · {formatPhone(r.phone_number)}
                      </div>
                    </td>
                    <td className="max-w-[240px] px-4 py-2.5">
                      <div className="font-medium">{r.suburb}</div>
                      <div className="truncate text-[12px] text-ink-3">{r.harare_address}</div>
                    </td>
                    <td className="px-4 py-2.5 tabular">
                      {cashToCollect(r) ? money(cashToCollect(r)) : <Tag tone="success">Paid</Tag>}
                    </td>
                    <td className="px-4 py-2.5">
                      <StageChip status={r.status} />
                    </td>
                    <td className="px-4 py-2.5">
                      {r.status === "dispatched" && !closed ? (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={busy === r.id}
                            onClick={() => resolve(r, true)}
                          >
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
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`WhatsApp ${r.full_name}`}
                            onClick={async () => {
                              const m = await apiClient.graduateMessage(r.id);
                              openWhatsApp(m.phone, m.message);
                            }}
                          >
                            <WhatsAppIcon className="h-4 w-4 text-whatsapp" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-ink-3">
                          {r.status === "collected" ? "Delivered" : "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        <Card className="h-fit p-5 lg:sticky lg:top-20">
          <CardHeader title={closed ? "Cash check" : "Close batch"} />
          {closed ? (
            <dl className="mt-3 text-[13px]">
              <DefRow k="Expected" v={money(b.cash_expected)} />
              <DefRow k="Handed in" v={money(b.cash_handed_in)} />
              <DefRow
                k="Variance"
                v={
                  <span className={Number(b.variance) !== 0 ? "text-danger" : "text-success"}>
                    {money(b.variance)}
                  </span>
                }
              />
              <DefRow k="Received by" v={b.cash_received_by_name ?? "—"} />
              {b.variance_note && <DefRow k="Note" v={b.variance_note} />}
              <DefRow k="Closed" v={formatDate(b.reconciled_at)} />
            </dl>
          ) : (
            <div className="mt-3 space-y-3">
              <p className="text-[13px] text-ink-3">
                When every document has a result, count the cash the driver hands in. Each delivered
                document is then recorded as paid, received by {d.full_name.split(" ")[0]}.
              </p>
              <div className="rounded-lg bg-ground p-3">
                <div className="text-[12px] text-ink-3">
                  Expected (delivered, unpaid cash on delivery)
                </div>
                <div className="text-[24px] font-bold tabular">{money(expected)}</div>
              </div>
              <div>
                <Label>Cash handed in (US$)</Label>
                <Input
                  className="mt-1.5"
                  type="number"
                  min={0}
                  step="0.01"
                  value={handedIn}
                  onChange={(e) => setHandedIn(e.target.value)}
                  disabled={!resolvedAll}
                />
              </div>
              {variance !== null && variance !== 0 && (
                <Note tone="danger">
                  {variance < 0 ? "Short" : "Over"} by {money(Math.abs(variance))}. Add a note to
                  close.
                </Note>
              )}
              <div>
                <Label>Note {variance ? "(required)" : "(optional)"}</Label>
                <Input
                  className="mt-1.5"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={!resolvedAll}
                />
              </div>
              <Button
                className="w-full"
                variant="gold"
                disabled={
                  !resolvedAll ||
                  handedIn === "" ||
                  (!!variance && !note.trim()) ||
                  busy === "close"
                }
                onClick={close}
              >
                Close batch
              </Button>
              {!resolvedAll && (
                <p className="text-[12px] text-warn-ink">
                  {b.outstanding} document(s) still need a result.
                </p>
              )}
            </div>
          )}
        </Card>
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

function Mini({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-ground px-3 py-2">
      <div className="text-[11px] text-ink-3">{k}</div>
      <div className="font-semibold tabular">{v}</div>
    </div>
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
        <p className="text-[13px] text-ink-3">
          The document leaves this batch and goes back to Collected from MSU. The reason is kept in
          its history.
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
      </DialogContent>
    </Dialog>
  );
}
