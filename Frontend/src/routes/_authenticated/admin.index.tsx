import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { apiClient, type RequestRow } from "@/lib/api-client";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, statusClasses, statusLabel } from "@/lib/msu";
import { toast } from "sonner";
import { Download, Loader2, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Admin — Requests" }, { name: "robots", content: "noindex" }] }),
  component: AdminList,
});

const STATUSES = ["submitted", "in_transit", "collected", "rejected"] as const;

function AdminList() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [zoneFilter, setZoneFilter] = useState<string>("all");
  const [exportedFilter, setExportedFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<string>("");
  const [detailId, setDetailId] = useState<string | null>(null);
  // Looked up from `rows` (not stored as its own snapshot) so the open dialog
  // reflects the latest paid/status values after a `load()` refresh instead of
  // showing the stale state from when it was opened.
  const detail = useMemo(() => rows.find((r) => r.id === detailId) ?? null, [rows, detailId]);

  async function load() {
    setLoading(true);
    try {
      setRows(await apiClient.listRequests());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load requests");
      setRows([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (zoneFilter !== "all" && r.zone !== zoneFilter) return false;
      if (exportedFilter === "not_exported" && r.exported_at) return false;
      if (exportedFilter === "exported" && !r.exported_at) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          r.reference_number.toLowerCase().includes(s) ||
          r.full_name.toLowerCase().includes(s) ||
          r.reg_number.toLowerCase().includes(s) ||
          r.programme_name.toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [rows, search, statusFilter, zoneFilter, exportedFilter]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelected(next);
  }

  async function updateStatus(ids: string[], status: string, reason?: string) {
    try {
      await apiClient.bulkUpdateStatus(
        ids,
        status,
        status === "rejected" ? (reason ?? null) : undefined,
      );
    } catch (e) {
      return toast.error(e instanceof Error ? e.message : "Update failed");
    }
    toast.success(`Updated ${ids.length} request(s)`);
    await load();
  }

  async function togglePaid(id: string, paid: boolean) {
    try {
      await apiClient.updateRequestPaid(id, paid);
    } catch (e) {
      return toast.error(e instanceof Error ? e.message : "Update failed");
    }
    await load();
  }

  async function exportExcel() {
    if (filtered.length === 0) return toast.error("Nothing to export");
    // The workbook is generated server-side, which also stamps exported_at on
    // exactly the rows it exported — the same filters are applied there.
    let blob: Blob;
    try {
      blob = await apiClient.exportRequests({
        search,
        status: statusFilter,
        zone: zoneFilter,
        exported: exportedFilter,
      });
    } catch (e) {
      return toast.error(e instanceof Error ? e.message : "Export failed");
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `msu-requests-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`Exported ${filtered.length} records`);
    await load();
  }

  return (
    <AdminShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Transcript Requests</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} of {rows.length} shown
          </p>
        </div>
        <Button onClick={exportExcel} className="bg-gold text-gold-foreground hover:bg-gold/90">
          <Download className="mr-2 h-4 w-4" /> Export filtered to Excel
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, reg #, reference, programme…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {statusLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={zoneFilter} onValueChange={setZoneFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Zone" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All zones</SelectItem>
            <SelectItem value="harare">Harare</SelectItem>
            <SelectItem value="outside_harare">Outside Harare</SelectItem>
          </SelectContent>
        </Select>
        <Select value={exportedFilter} onValueChange={setExportedFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All exports</SelectItem>
            <SelectItem value="not_exported">Not yet exported</SelectItem>
            <SelectItem value="exported">Already exported</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border bg-primary/5 p-3 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <Select value={bulkStatus} onValueChange={setBulkStatus}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Move to status…" />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {statusLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!bulkStatus}
            onClick={async () => {
              await updateStatus(Array.from(selected), bulkStatus);
              setSelected(new Set());
              setBulkStatus("");
            }}
          >
            Apply
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-card">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    checked={filtered.length > 0 && filtered.every((r) => selected.has(r.id))}
                    onCheckedChange={(v) =>
                      setSelected(v ? new Set(filtered.map((r) => r.id)) : new Set())
                    }
                  />
                </TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Reg #</TableHead>
                <TableHead>Programme</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Zone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetailId(r.id)}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.reference_number}</TableCell>
                  <TableCell className="font-medium">{r.full_name}</TableCell>
                  <TableCell>{r.reg_number}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{r.programme_name}</TableCell>
                  <TableCell>{r.year_completed}</TableCell>
                  <TableCell className="text-xs">
                    {r.zone === "harare" ? "Harare" : "Outside"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClasses(r.status)}`}
                    >
                      {statusLabel(r.status)}
                    </span>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={r.paid}
                      onCheckedChange={(v) => togglePaid(r.id, v === true)}
                    />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(r.created_at)}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    No requests match your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <DetailDialog
        row={detail}
        onClose={() => setDetailId(null)}
        onUpdate={async (ids, s, r) => {
          await updateStatus(ids, s, r);
        }}
        onTogglePaid={async (id, p) => {
          await togglePaid(id, p);
        }}
      />
    </AdminShell>
  );
}

function DetailDialog({
  row,
  onClose,
  onUpdate,
  onTogglePaid,
}: {
  row: RequestRow | null;
  onClose: () => void;
  onUpdate: (ids: string[], status: string, reason?: string) => Promise<void>;
  onTogglePaid: (id: string, paid: boolean) => Promise<void>;
}) {
  const [status, setStatus] = useState<string>("");
  const [reason, setReason] = useState<string>("");

  useEffect(() => {
    if (row) {
      setStatus(row.status);
      setReason(row.status_reason ?? "");
    }
  }, [row]);

  if (!row) return null;

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-mono text-sm">{row.reference_number}</span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClasses(row.status)}`}
            >
              {statusLabel(row.status)}
            </span>
          </DialogTitle>
        </DialogHeader>

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
                ? (row.harare_address ?? "—")
                : row.zimpost_branches
                  ? `${row.zimpost_branches.branch_name} — ${row.zimpost_branches.branch_area}`
                  : "—"
            }
          />
          <Info k="Submitted" v={formatDate(row.created_at)} />
        </div>

        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <div className="mb-2 font-medium">Clearance ticks</div>
          <div className="flex flex-wrap gap-3 text-xs">
            <ClearanceTick label="Department" checked={row.cleared_department} />
            <ClearanceTick label="Accounts" checked={row.cleared_accounts} />
            <ClearanceTick label="Library" checked={row.cleared_library} />
          </div>
        </div>

        <div className="grid gap-3 rounded-md border p-3">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={row.paid}
                onCheckedChange={(v) => onTogglePaid(row.id, v === true)}
              />{" "}
              Paid
            </label>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={async () => {
                await onUpdate([row.id], status, reason);
                onClose();
              }}
            >
              Update status
            </Button>
          </div>
          {status === "rejected" && (
            <Textarea
              placeholder="Reason for rejection (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
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
