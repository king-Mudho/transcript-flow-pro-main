import { useEffect, useState } from "react";
import { apiClient, type Branch, type RequestEvent, type RequestRow } from "@/lib/api-client";
import { FEE_HARARE, FEE_OUTSIDE, formatDate, statusClasses, statusLabel } from "@/lib/msu";
import { StatusMoveDialog } from "@/components/status-move-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";

export function RequestDetailDialog({
  row,
  onClose,
  onChanged,
}: {
  row: RequestRow | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [nextStatus, setNextStatus] = useState("");
  const [moveOpen, setMoveOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setNextStatus("");
    setEditing(false);
  }, [row?.id, row?.status]);

  if (!row) return null;

  async function togglePaid(paid: boolean) {
    try {
      await apiClient.updateRequest(row!.id, { paid });
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-sm">{row.reference_number}</span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClasses(row.status)}`}
            >
              {statusLabel(row.status)}
            </span>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="details">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 pt-2">
            {editing ? (
              <EditDelivery
                row={row}
                onCancel={() => setEditing(false)}
                onSaved={() => {
                  setEditing(false);
                  onChanged();
                }}
              />
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Info k="Full name" v={row.full_name} />
                  <Info k="Reg #" v={row.reg_number} />
                  <Info k="Programme" v={row.programme_name} />
                  <Info k="Year completed" v={String(row.year_completed)} />
                  <Info k="Phone" v={row.phone_number} />
                  <Info k="Email" v={row.email ?? "—"} />
                  <Info k="Zone" v={row.zone === "harare" ? "Harare" : "Outside Harare"} />
                  <Info
                    k="Fee"
                    v={`US$${row.fee_amount} (${row.payment_method === "cash_on_delivery" ? "COD" : "Deposit"})`}
                  />
                  <Info
                    k="Address / Branch"
                    v={
                      row.zone === "harare"
                        ? [row.harare_address, row.suburb].filter(Boolean).join(", ") || "—"
                        : row.zimpost_branches
                          ? `${row.zimpost_branches.branch_name} — ${row.zimpost_branches.branch_area}`
                          : "—"
                    }
                  />
                  <Info k="Submitted" v={formatDate(row.created_at)} />
                  {row.batch_number && (
                    <Info k="Batch" v={`${row.batch_number} · ${row.driver_name}`} />
                  )}
                  {row.zimpost_tracking_number && (
                    <Info k="Zimpost tracking" v={row.zimpost_tracking_number} />
                  )}
                  {row.zone === "outside_harare" && row.dispatched_at && (
                    <Info k="Dispatched" v={formatDate(row.dispatched_at)} />
                  )}
                </div>

                <div className="flex items-center justify-between rounded-md border p-3 text-sm">
                  {row.locked ? (
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <Lock className="h-4 w-4" /> Locked after dispatch
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Delivery details</span>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={row.locked}
                    onClick={() => setEditing(true)}
                  >
                    Edit delivery details
                  </Button>
                </div>

                <div className="rounded-md border bg-muted/30 p-3 text-sm">
                  <div className="mb-2 font-medium">Clearance ticks</div>
                  <div className="flex flex-wrap gap-3 text-xs">
                    <ClearanceTick label="Department" checked={row.cleared_department} />
                    <ClearanceTick label="Accounts" checked={row.cleared_accounts} />
                    <ClearanceTick label="Library" checked={row.cleared_library} />
                  </div>
                </div>

                {row.status === "rejected" && row.status_reason && (
                  <p className="rounded-md border border-status-rejected/30 bg-status-rejected/5 p-3 text-sm text-status-rejected">
                    Rejected: {row.status_reason}
                  </p>
                )}

                <div className="grid gap-3 rounded-md border p-3">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={row.paid} onCheckedChange={(v) => togglePaid(v === true)} />{" "}
                    Paid
                  </label>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <Select value={nextStatus} onValueChange={setNextStatus}>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={row.allowed_next.length ? "Move to…" : "No further moves"}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {row.allowed_next.map((s) => (
                          <SelectItem key={s} value={s}>
                            {statusLabel(s)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button disabled={!nextStatus} onClick={() => setMoveOpen(true)}>
                      Update status
                    </Button>
                  </div>
                  {row.zone === "harare" && row.status === "collected_from_msu" && (
                    <p className="text-xs text-muted-foreground">
                      Harare requests are dispatched on the Dispatch page, in a batch with a driver.
                    </p>
                  )}
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="history" className="pt-2">
            <History id={row.id} refreshKey={`${row.status}${row.updated_at}`} />
          </TabsContent>
        </Tabs>

        <StatusMoveDialog
          open={moveOpen}
          target={{ ids: [row.id] }}
          count={1}
          status={nextStatus}
          currentStatus={row.status}
          onClose={() => setMoveOpen(false)}
          onDone={onChanged}
        />
      </DialogContent>
    </Dialog>
  );
}

function History({ id, refreshKey }: { id: string; refreshKey: string }) {
  const [events, setEvents] = useState<RequestEvent[] | null>(null);

  useEffect(() => {
    let live = true;
    apiClient
      .requestHistory(id)
      .then((e) => live && setEvents(e))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Could not load history"));
    return () => {
      live = false;
    };
  }, [id, refreshKey]);

  if (!events)
    return (
      <div className="flex justify-center py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );

  return (
    <ul className="divide-y rounded-md border text-sm">
      {events.map((e) => (
        <li key={e.id} className="grid gap-1 p-3 sm:grid-cols-[150px_1fr]">
          <div className="text-xs text-muted-foreground">
            {formatDate(e.created_at)}
            <div>{e.actor}</div>
          </div>
          <div>{describe(e)}</div>
        </li>
      ))}
    </ul>
  );
}

const FIELD_LABELS: Record<string, string> = {
  zone: "Zone",
  harare_address: "Address",
  suburb: "Suburb",
  zimpost_branch: "Zimpost branch",
  phone_number: "Phone",
  email: "Email",
  fee_amount: "Fee",
  payment_method: "Payment method",
  paid: "Paid",
  batch: "Batch",
};

function describe(e: RequestEvent) {
  if (e.event_type === "status_change") {
    return (
      <>
        <span className="font-medium">
          {e.from_value ? `${statusLabel(e.from_value)} → ` : ""}
          {statusLabel(e.to_value ?? "")}
        </span>
        {e.note && <div className="text-muted-foreground">{e.note}</div>}
      </>
    );
  }
  if (e.event_type === "payment") {
    return (
      <span className="font-medium">{e.to_value === "True" ? "Marked paid" : "Marked unpaid"}</span>
    );
  }
  const label = FIELD_LABELS[e.field] ?? e.field;
  return (
    <>
      <span className="font-medium">{label} changed</span>
      <div className="text-muted-foreground">
        {e.from_value || "—"} → {e.to_value || "—"}
      </div>
      {e.note && <div className="text-muted-foreground">{e.note}</div>}
    </>
  );
}

function EditDelivery({
  row,
  onCancel,
  onSaved,
}: {
  row: RequestRow;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [zone, setZone] = useState(row.zone);
  const [address, setAddress] = useState(row.harare_address ?? "");
  const [suburb, setSuburb] = useState(row.suburb ?? "");
  const [branchId, setBranchId] = useState(row.zimpost_branch ?? "");
  const [phone, setPhone] = useState(row.phone_number);
  const [email, setEmail] = useState(row.email ?? "");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient
      .listBranches()
      .then(setBranches)
      .catch(() => undefined);
  }, []);

  const zoneChanged = zone !== row.zone;
  const newFee = zone === "harare" ? FEE_HARARE : FEE_OUTSIDE;

  async function save() {
    if (zoneChanged) {
      const method = zone === "harare" ? "cash on delivery" : "cash deposit";
      if (
        !window.confirm(`Changing the zone changes the fee to US$${newFee} (${method}). Continue?`)
      )
        return;
    }
    setSaving(true);
    try {
      await apiClient.updateRequest(row.id, {
        zone,
        harare_address: zone === "harare" ? address : null,
        suburb: zone === "harare" ? suburb : null,
        zimpost_branch: zone === "outside_harare" ? branchId || null : null,
        phone_number: phone,
        email: email || null,
      });
      toast.success("Delivery details updated");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Zone</Label>
          <Select value={zone} onValueChange={(v) => setZone(v as typeof zone)}>
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="harare">Harare</SelectItem>
              <SelectItem value="outside_harare">Outside Harare</SelectItem>
            </SelectContent>
          </Select>
          {zoneChanged && (
            <p className="mt-1 text-xs text-muted-foreground">
              Fee becomes US${newFee} ({zone === "harare" ? "cash on delivery" : "cash deposit"}).
            </p>
          )}
        </div>
        <div />
        {zone === "harare" ? (
          <>
            <div>
              <Label>Address</Label>
              <Input
                className="mt-1.5"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
            <div>
              <Label>Suburb</Label>
              <Input
                className="mt-1.5"
                value={suburb}
                onChange={(e) => setSuburb(e.target.value)}
              />
            </div>
          </>
        ) : (
          <div className="sm:col-span-2">
            <Label>Zimpost branch</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Select a branch" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.branch_name} — {b.branch_area}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <Label>Phone</Label>
          <Input className="mt-1.5" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <Label>Email</Label>
          <Input className="mt-1.5" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save changes
        </Button>
      </div>
    </div>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className="text-sm font-medium">{v}</div>
    </div>
  );
}

function ClearanceTick({ label, checked }: { label: string; checked: boolean }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 ${checked ? "border-status-collected/40 bg-status-collected/10 text-status-collected" : "border-status-rejected/40 bg-status-rejected/10 text-status-rejected"}`}
    >
      {checked ? "✓" : "✗"} {label}
    </span>
  );
}
