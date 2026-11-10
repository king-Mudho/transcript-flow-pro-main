import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Lock,
  MessageSquare,
  Phone,
  Printer,
  Trash2,
  Undo2,
} from "lucide-react";
import { AdminShell, useCurrentUser } from "@/components/admin-shell";
import { DeleteRequestsDialog } from "@/components/delete-requests-dialog";
import { Combobox } from "@/components/combobox";
import { StatusMoveDialog } from "@/components/status-move-dialog";
import {
  Card,
  CardHeader,
  DefRow,
  Empty,
  Note,
  Spinner,
  StageChip,
  Switch,
  Tag,
  Tick,
} from "@/components/ds";
import { WhatsAppIcon } from "@/components/whatsapp-contact";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  apiClient,
  type Branch,
  type RequestDetail,
  type RequestEvent,
  type StatusValue,
} from "@/lib/api-client";
import {
  CHANNEL_LABELS,
  formatDate,
  formatPhone,
  isBackMove,
  money,
  openWhatsApp,
  statusLabel,
  waDigits,
} from "@/lib/msu";
import { labelFromRequest, labelsPdf } from "@/lib/pdf";
import { useSite } from "@/lib/site";
import { toast } from "sonner";

const text = z.union([z.string(), z.number()]).transform(String);
const searchSchema = z.object({
  search: text.optional().catch(undefined),
  status: z.string().optional().catch(undefined),
  zone: z.string().optional().catch(undefined),
  payment: z.string().optional().catch(undefined),
  exported: z.string().optional().catch(undefined),
  date_from: z.string().optional().catch(undefined),
  date_to: z.string().optional().catch(undefined),
  duplicate: text.optional().catch(undefined),
  min_days: text.optional().catch(undefined),
  channel: z.string().optional().catch(undefined),
  handin: text.optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/admin/requests/$requestId")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: "Request — MSU Transcript admin" }, { name: "robots", content: "noindex" }],
  }),
  component: RequestPage,
});

function nextStep(r: RequestDetail): string {
  switch (r.status) {
    case "received":
      return r.clearance_verified
        ? "Submit to MSU with the next hand-in list."
        : "Check the clearance proof, switch on Verified, then submit to MSU.";
    case "submitted_to_msu":
      return r.ready_at_msu_at
        ? "MSU has released it. Collect it on the next collection run."
        : "Waiting for MSU. Mark it ready when MSU releases it, or reject with MSU's reason.";
    case "collected_from_msu":
      if (r.zone === "harare") return "Add it to a dispatch batch with a driver.";
      return r.paid
        ? "Dispatch it to the Zimpost branch."
        : "Collect the deposit, then dispatch it to Zimpost.";
    case "dispatched":
      return r.zone === "harare"
        ? "Out with the driver. Record the result on the batch page."
        : "Sent to Zimpost. Mark collected when the graduate picks it up.";
    case "collected":
      return r.paid
        ? "Complete. Nothing left to do."
        : "Delivered but not fully paid. Record the payment.";
    case "rejected":
      return "Closed. The graduate has been told MSU's reason.";
  }
}

function RequestPage() {
  const { requestId } = Route.useParams();
  const listSearch = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [move, setMove] = useState<StatusValue | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { data: me } = useCurrentUser();

  const { data: r, refetch } = useQuery({
    queryKey: ["request", requestId, listSearch],
    queryFn: () => apiClient.getRequest(requestId, listSearch),
  });

  const reload = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ["history", requestId] });
    queryClient.invalidateQueries({ queryKey: ["sidebar-counts"] });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!r || (e.target as HTMLElement)?.closest("input, textarea, select, [role=dialog]"))
        return;
      if (e.altKey && e.key === "ArrowLeft" && r.neighbours.previous)
        navigate({
          to: "/admin/requests/$requestId",
          params: { requestId: r.neighbours.previous },
          search: listSearch,
        });
      if (e.altKey && e.key === "ArrowRight" && r.neighbours.next)
        navigate({
          to: "/admin/requests/$requestId",
          params: { requestId: r.neighbours.next },
          search: listSearch,
        });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [r, navigate, listSearch]);

  if (!r) {
    return (
      <AdminShell>
        <div className="flex justify-center py-20 text-ink-3">
          <Spinner />
        </div>
      </AdminShell>
    );
  }

  const forward = r.allowed_next.filter((s) => !isBackMove(r.status, s));
  const back = r.allowed_next.find((s) => isBackMove(r.status, s));

  async function sendUpdate() {
    try {
      const { phone, message } = await apiClient.graduateMessage(r!.id);
      openWhatsApp(phone, message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not prepare the message");
    }
  }

  return (
    <AdminShell>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link
          to="/admin/requests"
          search={{ ...listSearch, page: 1 }}
          className="inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Requests
        </Link>
        <div className="flex items-center gap-2 text-[13px] text-ink-3">
          {r.neighbours.position && (
            <span>
              {r.neighbours.position} of {r.neighbours.total}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={!r.neighbours.previous}
            title="Previous (Alt + ←)"
            onClick={() =>
              navigate({
                to: "/admin/requests/$requestId",
                params: { requestId: r.neighbours.previous! },
                search: listSearch,
              })
            }
          >
            <ChevronLeft /> Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!r.neighbours.next}
            title="Next (Alt + →)"
            onClick={() =>
              navigate({
                to: "/admin/requests/$requestId",
                params: { requestId: r.neighbours.next! },
                search: listSearch,
              })
            }
          >
            Next <ChevronRight />
          </Button>
        </div>
      </div>

      {/* Header */}
      <Card className="mb-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[13px] text-ink-3">{r.reference_number}</div>
            <h1 className="text-[24px] font-bold">{r.full_name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StageChip
                status={
                  r.status === "submitted_to_msu" && r.ready_at_msu_at ? "ready_at_msu" : r.status
                }
              />
              <Tag tone="navy">{r.zone === "harare" ? "Harare doorstep" : "Zimpost branch"}</Tag>
              <Tag
                tone={
                  r.stage_level === "red"
                    ? "danger"
                    : r.stage_level === "amber"
                      ? "gold"
                      : "neutral"
                }
              >
                {r.days_in_stage} day{r.days_in_stage === 1 ? "" : "s"} in stage
              </Tag>
              {r.handin_number && <Tag>Hand-in {r.handin_number}</Tag>}
              {r.batch_number && (
                <Link to="/admin/batch/$batchId" params={{ batchId: r.batch! }}>
                  <Tag tone="info">Batch {r.batch_number}</Tag>
                </Link>
              )}
              {r.possible_duplicate && <Tag tone="danger">Possible duplicate</Tag>}
              {r.channel !== "web" && <Tag>Taken by {CHANNEL_LABELS[r.channel]}</Tag>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {back && (
              <Button variant="outline" onClick={() => setMove(back)}>
                <Undo2 /> Step back
              </Button>
            )}
            {me?.is_admin && (
              <Button
                variant="outline"
                className="text-danger"
                onClick={() => setDeleting(true)}
                title={
                  r.payments.length
                    ? "Requests with payments recorded cannot be deleted"
                    : "Delete this request"
                }
                disabled={r.payments.length > 0 || r.status === "dispatched"}
              >
                <Trash2 /> Delete
              </Button>
            )}
            <Button variant="outline" onClick={sendUpdate}>
              <WhatsAppIcon className="h-4 w-4 text-whatsapp" /> Send update
            </Button>
            <StageAction r={r} forward={forward} onMove={setMove} onChanged={reload} />
          </div>
        </div>
        <Note tone="warn" icon={false} className="mt-4">
          <strong>Next step:</strong> {nextStep(r)}
        </Note>
        {r.duplicates.length > 0 && (
          <Note tone="danger" className="mt-3">
            Also in progress for this registration number:{" "}
            {r.duplicates.map((d, i) => (
              <span key={d.id}>
                {i > 0 && ", "}
                <Link
                  to="/admin/requests/$requestId"
                  params={{ requestId: d.id }}
                  className="font-semibold underline"
                >
                  {d.reference_number}
                </Link>{" "}
                ({statusLabel(d.status)})
              </span>
            ))}
          </Note>
        )}
        {r.status === "rejected" && r.status_reason && (
          <Note tone="danger" className="mt-3">
            Rejected: {r.status_reason}
          </Note>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <GraduateCard r={r} />
          <DeliveryCard r={r} onChanged={reload} />
          <div className="grid gap-5 md:grid-cols-2">
            <DocumentsCard r={r} />
            <ClearanceCard r={r} onChanged={reload} />
          </div>
          <HistoryCard id={r.id} refreshKey={r.updated_at} />
        </div>
        <div className="space-y-5">
          <PaymentCard r={r} onChanged={reload} />
          <NotesCard r={r} onChanged={reload} />
          <Card className="p-5">
            <CardHeader title="Record" />
            <dl className="mt-2 text-[13px]">
              <DefRow k="Submitted" v={formatDate(r.created_at)} />
              <DefRow
                k="Channel"
                v={CHANNEL_LABELS[r.channel] + (r.created_by_name ? ` · ${r.created_by_name}` : "")}
              />
              <DefRow
                k="Consent"
                v={
                  r.consent_at
                    ? `${formatDate(r.consent_at)} · terms ${r.terms_version}`
                    : "Before consent was recorded"
                }
              />
              {r.consent_via && (
                <DefRow
                  k="Given by"
                  v={
                    r.consent_via.startsWith("staff:")
                      ? `To ${r.consent_via.slice(6)}`
                      : "The graduate, online"
                  }
                />
              )}
              {r.exported_at && <DefRow k="Exported" v={formatDate(r.exported_at)} />}
              {r.anonymised_at && <DefRow k="Anonymised" v={formatDate(r.anonymised_at)} />}
            </dl>
          </Card>
        </div>
      </div>

      {deleting && (
        <DeleteRequestsDialog
          ids={[r.id]}
          label={r.reference_number}
          onClose={() => setDeleting(false)}
          onDone={() =>
            navigate({
              to: "/admin/requests",
              search: { ...listSearch, page: 1 } as never,
            })
          }
        />
      )}

      {move && (
        <StatusMoveDialog
          open
          target={{ ids: [r.id] }}
          count={1}
          status={move}
          currentStatus={r.status}
          needsOverride={!r.clearance_verified}
          onClose={() => setMove(null)}
          onDone={reload}
        />
      )}
    </AdminShell>
  );
}

function StageAction({
  r,
  forward,
  onMove,
  onChanged,
}: {
  r: RequestDetail;
  forward: StatusValue[];
  onMove: (s: StatusValue) => void;
  onChanged: () => void;
}) {
  if (r.status === "collected_from_msu" && r.zone === "harare") {
    return (
      <Button asChild variant="gold">
        <Link to="/admin/dispatch" search={{ select: r.id }}>
          Add to a dispatch batch
        </Link>
      </Button>
    );
  }
  if (r.status === "dispatched" && r.zone === "harare" && r.batch) {
    return (
      <Button asChild variant="gold">
        <Link to="/admin/batch/$batchId" params={{ batchId: r.batch }}>
          Open batch
        </Link>
      </Button>
    );
  }
  return (
    <>
      {r.status === "submitted_to_msu" && !r.ready_at_msu_at && (
        <Button
          variant="outline"
          onClick={async () => {
            await apiClient.setReadyAtMsu([r.id]);
            toast.success("Marked ready at MSU");
            onChanged();
          }}
        >
          Mark ready at MSU
        </Button>
      )}
      {forward.map((s) =>
        s === "rejected" ? (
          <Button key={s} variant="danger" onClick={() => onMove(s)}>
            Reject
          </Button>
        ) : (
          <Button key={s} variant="gold" onClick={() => onMove(s)}>
            {s === "submitted_to_msu"
              ? "Submit to MSU"
              : s === "collected_from_msu"
                ? "Collected from MSU"
                : s === "dispatched"
                  ? "Dispatch to Zimpost"
                  : s === "collected"
                    ? r.zone === "harare"
                      ? "Mark delivered"
                      : "Collected at branch"
                    : statusLabel(s)}
          </Button>
        ),
      )}
    </>
  );
}

function GraduateCard({ r }: { r: RequestDetail }) {
  return (
    <Card className="p-5">
      <CardHeader
        title="Graduate"
        action={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={`tel:${r.phone_number}`}>
                <Phone /> Call
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a
                href={`https://wa.me/${waDigits(r.phone_number)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <WhatsAppIcon className="h-4 w-4 text-whatsapp" /> WhatsApp
              </a>
            </Button>
          </div>
        }
      />
      <dl className="mt-3 grid gap-x-6 sm:grid-cols-2">
        <DefRow k="Reg number" v={r.reg_number} />
        <DefRow k="Programme" v={`${r.programme_name}, ${r.year_completed}`} />
        <DefRow k="Mobile" v={formatPhone(r.phone_number)} />
        <DefRow
          k="Email"
          v={r.email ?? <span className="font-normal text-ink-3">Not given</span>}
        />
      </dl>
    </Card>
  );
}

function DeliveryCard({ r, onChanged }: { r: RequestDetail; onChanged: () => void }) {
  const site = useSite();
  const [editing, setEditing] = useState(false);
  const [zone, setZone] = useState(r.zone);
  const [address, setAddress] = useState(r.harare_address ?? "");
  const [suburb, setSuburb] = useState(r.suburb ?? "");
  const [directions, setDirections] = useState(r.directions ?? "");
  const [branchId, setBranchId] = useState(r.zimpost_branch ?? "");
  const [phone, setPhone] = useState(r.phone_number);
  const [email, setEmail] = useState(r.email ?? "");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing)
      apiClient
        .listBranches()
        .then(setBranches)
        .catch(() => undefined);
  }, [editing]);

  useEffect(() => {
    setZone(r.zone);
    setAddress(r.harare_address ?? "");
    setSuburb(r.suburb ?? "");
    setDirections(r.directions ?? "");
    setBranchId(r.zimpost_branch ?? "");
    setPhone(r.phone_number);
    setEmail(r.email ?? "");
  }, [r]);

  const newFee = zone === "harare" ? site.fee_harare : site.fee_outside;

  async function save() {
    if (
      zone !== r.zone &&
      !window.confirm(
        `Changing the delivery changes the fee to ${money(newFee)} (${zone === "harare" ? "cash on delivery" : "cash deposit"}). Continue?`,
      )
    )
      return;
    setSaving(true);
    try {
      await apiClient.updateRequest(r.id, {
        zone,
        harare_address: zone === "harare" ? address : null,
        suburb: zone === "harare" ? suburb : null,
        directions: zone === "harare" ? directions : "",
        zimpost_branch: zone === "outside_harare" ? branchId || null : null,
        phone_number: phone,
        email: email || null,
      });
      toast.success("Delivery details updated");
      setEditing(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <CardHeader
        title="Delivery"
        action={
          r.locked ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-3">
              <Lock className="h-4 w-4" /> Locked after dispatch
            </span>
          ) : (
            !editing && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                Edit delivery details
              </Button>
            )
          )
        }
      />
      {!editing ? (
        <dl className="mt-3">
          <DefRow
            k="Method"
            v={
              r.zone === "harare"
                ? "Harare doorstep, cash on delivery"
                : "Zimpost branch, cash deposit"
            }
          />
          {r.zone === "harare" ? (
            <>
              <DefRow k="Address" v={r.harare_address || "—"} />
              <DefRow
                k="Suburb"
                v={
                  <>
                    {r.suburb || "—"}{" "}
                    {!r.suburb_mapped && <Tag tone="gold">Not on the suburb list</Tag>}
                  </>
                }
              />
              {r.directions && <DefRow k="Directions" v={r.directions} />}
            </>
          ) : (
            <DefRow
              k="Branch"
              v={
                r.zimpost_branches
                  ? `${r.zimpost_branches.branch_name}, ${r.zimpost_branches.branch_area}`
                  : "—"
              }
            />
          )}
          {r.zone === "outside_harare" && r.dispatched_at && (
            <DefRow k="Sent" v={formatDate(r.dispatched_at)} />
          )}
          {r.zimpost_tracking_number && <DefRow k="Zimpost no." v={r.zimpost_tracking_number} />}
          {r.driver_name && <DefRow k="Driver" v={r.driver_name} />}
          <div className="mt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                const blob = await labelsPdf(
                  [labelFromRequest(r)],
                  site,
                  window.location.origin,
                  "thermal",
                );
                window.open(URL.createObjectURL(blob), "_blank", "noopener");
              }}
            >
              <Printer /> Print label
            </Button>
          </div>
        </dl>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Delivery</Label>
              <select
                value={zone}
                onChange={(e) => setZone(e.target.value as typeof zone)}
                className="mt-1.5 h-9 w-full rounded-lg border border-line px-2.5"
              >
                <option value="harare">Harare doorstep</option>
                <option value="outside_harare">Zimpost branch</option>
              </select>
              {zone !== r.zone && (
                <p className="mt-1 text-[12px] text-warn-ink">
                  Fee becomes {money(newFee)} (
                  {zone === "harare" ? "cash on delivery" : "cash deposit"}).
                </p>
              )}
            </div>
            {zone === "harare" ? (
              <>
                <div>
                  <Label>Suburb</Label>
                  <div className="mt-1.5">
                    <Combobox
                      size="sm"
                      options={site.suburbs.map((s) => ({ value: s.name, label: s.name }))}
                      value={suburb}
                      allowCustom
                      onChange={(v) => setSuburb(v)}
                    />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <Label>House number and street</Label>
                  <Input
                    className="mt-1.5"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Directions</Label>
                  <Input
                    className="mt-1.5"
                    value={directions}
                    onChange={(e) => setDirections(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <div>
                <Label>Zimpost branch</Label>
                <div className="mt-1.5">
                  <Combobox
                    size="sm"
                    options={branches.map((b) => ({
                      value: b.id,
                      label: b.branch_name,
                      group: b.branch_area,
                    }))}
                    value={branchId}
                    onChange={(v) => setBranchId(v)}
                  />
                </div>
              </div>
            )}
            <div>
              <Label>Mobile</Label>
              <Input className="mt-1.5" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label>Email</Label>
              <Input className="mt-1.5" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Spinner />} Save changes
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function DocumentsCard({ r }: { r: RequestDetail }) {
  return (
    <Card className="p-5">
      <CardHeader title="Documents" />
      <ul className="mt-3 space-y-1.5 text-[14px]">
        {r.items.map((i) => (
          <li key={i.document_type} className="flex justify-between">
            <span>{i.label ?? i.document_type}</span>
            <span className="font-semibold tabular">× {i.quantity}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] text-ink-3">
        One fee covers every document: {money(r.fee_amount)}.
      </p>
    </Card>
  );
}

function ClearanceCard({ r, onChanged }: { r: RequestDetail; onChanged: () => void }) {
  async function view(fileId: string) {
    try {
      const blob = await apiClient.clearanceFile(r.id, fileId);
      window.open(URL.createObjectURL(blob), "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open the file");
    }
  }
  return (
    <Card className="p-5">
      <CardHeader
        title="Clearance"
        action={
          <label className="flex items-center gap-2 text-[13px] font-medium">
            Verified
            <Switch
              label="Clearance verified"
              checked={r.clearance_verified}
              onChange={async (v) => {
                try {
                  await apiClient.updateRequest(r.id, { clearance_verified: v });
                  onChanged();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Update failed");
                }
              }}
            />
          </label>
        }
      />
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Tick ok={r.cleared_department} label="Department" />
        <Tick ok={r.cleared_accounts} label="Accounts" />
        <Tick ok={r.cleared_library} label="Library" />
      </div>
      {r.clearance_files.length ? (
        <ul className="mt-3 space-y-1.5">
          {r.clearance_files.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => view(f.id)}
                className="flex w-full items-center gap-2 rounded-lg border border-line px-3 py-2 text-left text-[13px] hover:bg-ground"
              >
                <FileText className="h-4 w-4 text-ink-3" />
                <span className="min-w-0 flex-1 truncate">{f.original_name}</span>
                <Eye className="h-4 w-4 text-ink-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-ink-3">No proof uploaded.</p>
      )}
      {!r.clearance_verified && r.status === "received" && (
        <p className="mt-3 text-[12px] text-warn-ink">
          Submitting to MSU needs Verified on, or an override note.
        </p>
      )}
    </Card>
  );
}

function PaymentCard({ r, onChanged }: { r: RequestDetail; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [reversing, setReversing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const due = Math.max(Number(r.fee_amount) - Number(r.amount_paid), 0);

  async function record() {
    setBusy(true);
    try {
      const p = await apiClient.recordPayment(r.id, Number(amount), note);
      toast.success(`Recorded ${money(p.amount)} · receipt ${p.receipt_number}`);
      setOpen(false);
      setAmount("");
      setNote("");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record the payment");
    } finally {
      setBusy(false);
    }
  }

  async function reverse() {
    if (!reversing) return;
    try {
      await apiClient.reversePayment(reversing, reason);
      toast.success("Payment reversed");
      setReversing(null);
      setReason("");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reverse");
    }
  }

  return (
    <Card className="p-5">
      <CardHeader
        title="Payment"
        action={
          r.paid ? (
            <Tag tone="success">Paid</Tag>
          ) : r.amount_paid > 0 ? (
            <Tag tone="gold">Part-paid</Tag>
          ) : (
            <Tag>Unpaid</Tag>
          )
        }
      />
      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-[13px] text-ink-3">
          {r.payment_method === "cash_on_delivery" ? "Cash on delivery" : "Cash deposit"}
        </span>
        <span className="text-[20px] font-bold tabular">
          {money(r.amount_paid)}{" "}
          <span className="text-[13px] font-normal text-ink-3">of {money(r.fee_amount)}</span>
        </span>
      </div>
      {r.payments.length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line text-[13px]">
          {r.payments.map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-2 p-2.5">
              <div className="min-w-0">
                <div className={p.is_reversal ? "font-semibold text-danger" : "font-semibold"}>
                  {money(p.amount)} · {p.receipt_number}
                </div>
                <div className="text-[12px] text-ink-3">
                  {formatDate(p.received_at)} · {p.received_by}
                </div>
                {p.note && <div className="text-[12px] text-ink-2">{p.note}</div>}
              </div>
              {!p.is_reversal && !p.reversed && (
                <button
                  type="button"
                  className="shrink-0 text-[12px] text-ink-3 underline"
                  onClick={() => setReversing(p.id)}
                >
                  Reverse
                </button>
              )}
              {p.reversed && <span className="text-[11px] text-ink-3">Reversed</span>}
            </li>
          ))}
        </ul>
      )}
      {!r.paid && (
        <Button
          className="mt-3 w-full"
          variant="navy"
          onClick={() => {
            setAmount(String(due));
            setOpen(true);
          }}
        >
          Record payment
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Amount (US$)</Label>
              <Input
                className="mt-1.5"
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="mt-1 text-[12px] text-ink-3">
                Still due: {money(due)}. You are recorded as the receiver.
              </p>
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Input
                className="mt-1.5"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Deposit at the hub"
              />
            </div>
            <Button className="w-full" onClick={record} disabled={busy || !(Number(amount) > 0)}>
              Record {amount ? money(amount) : ""}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!reversing} onOpenChange={(o) => !o && setReversing(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reverse this payment?</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-ink-3">
            Payments are never deleted. A reversal is recorded with your reason.
          </p>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason, e.g. recorded against the wrong request"
          />
          <Button variant="danger" onClick={reverse} disabled={!reason.trim()}>
            Record reversal
          </Button>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function NotesCard({ r, onChanged }: { r: RequestDetail; onChanged: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      await apiClient.addNote(r.id, text);
      setText("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the note");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="p-5">
      <CardHeader title="Team notes" action={<MessageSquare className="h-4 w-4 text-ink-3" />} />
      <p className="mt-1 text-[12px] text-ink-3">Internal. Never shown to the graduate.</p>
      <form onSubmit={add} className="mt-3 space-y-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a note for the team"
          className="min-h-[64px]"
        />
        <Button size="sm" type="submit" disabled={busy || !text.trim()}>
          Add note
        </Button>
      </form>
      {r.team_notes.length > 0 && (
        <ul className="mt-4 space-y-3">
          {r.team_notes.map((n) => (
            <li key={n.id} className="rounded-lg bg-ground p-3 text-[13px]">
              <div className="whitespace-pre-wrap">{n.text}</div>
              <div className="mt-1 text-[11px] text-ink-3">
                {n.author} · {formatDate(n.created_at)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const FIELD_LABELS: Record<string, string> = {
  zone: "Delivery",
  harare_address: "Address",
  suburb: "Suburb",
  directions: "Directions",
  zimpost_branch: "Zimpost branch",
  phone_number: "Mobile",
  email: "Email",
  fee_amount: "Fee",
  payment_method: "Payment method",
  batch: "Batch",
  clearance_verified: "Clearance",
  ready_at_msu: "MSU",
};

function describe(e: RequestEvent) {
  if (e.event_type === "status_change") {
    return (
      <>
        <span className="font-semibold">
          {e.from_value ? `${statusLabel(e.from_value)} → ` : ""}
          {statusLabel(e.to_value ?? "")}
        </span>
        {e.note && <div className="text-ink-3">{e.note}</div>}
      </>
    );
  }
  if (e.event_type === "payment") {
    return (
      <>
        <span className="font-semibold">Payment {money(e.to_value)}</span>
        {e.note && <div className="text-ink-3">{e.note}</div>}
      </>
    );
  }
  if (e.event_type === "msu") {
    return (
      <span className="font-semibold">
        {e.to_value === "Ready at MSU"
          ? "Ready for collection at MSU"
          : "No longer marked ready at MSU"}
      </span>
    );
  }
  const label = FIELD_LABELS[e.field] ?? e.field;
  return (
    <>
      <span className="font-semibold">{label} changed</span>
      <div className="text-ink-3">
        {e.from_value || "—"} → {e.to_value || "—"}
      </div>
      {e.note && <div className="text-ink-3">{e.note}</div>}
    </>
  );
}

function HistoryCard({ id, refreshKey }: { id: string; refreshKey: string }) {
  const { data } = useQuery({
    queryKey: ["history", id, refreshKey],
    queryFn: () => apiClient.requestHistory(id),
  });
  return (
    <Card className="p-5">
      <CardHeader title="History" />
      {!data ? (
        <div className="flex justify-center py-6 text-ink-3">
          <Spinner />
        </div>
      ) : data.length === 0 ? (
        <Empty>No history yet.</Empty>
      ) : (
        <ol className="mt-3 divide-y divide-line text-[13px]">
          {data.map((e) => (
            <li key={e.id} className="grid gap-1 py-2.5 sm:grid-cols-[160px_1fr]">
              <div className="text-[12px] text-ink-3">
                {formatDate(e.created_at)}
                <div>{e.actor}</div>
              </div>
              <div>{describe(e)}</div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
