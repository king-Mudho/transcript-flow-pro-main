import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { apiClient, type Batch, type Driver, type RequestRow } from "@/lib/api-client";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { formatDate } from "@/lib/msu";
import { toast } from "sonner";
import { Loader2, Truck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/dispatch")({
  head: () => ({ meta: [{ title: "Admin — Dispatch" }, { name: "robots", content: "noindex" }] }),
  component: DispatchPage,
});

function DispatchPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState<RequestRow[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortDesc, setSortDesc] = useState(false);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [r, b, d] = await Promise.all([
        apiClient.dispatchReady(),
        apiClient.listBatches(),
        apiClient.listDrivers(),
      ]);
      setReady(r);
      setBatches(b);
      setDrivers(d);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load dispatch");
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const sorted = useMemo(() => {
    const copy = [...ready].sort((a, b) => (a.suburb || "").localeCompare(b.suburb || ""));
    return sortDesc ? copy.reverse() : copy;
  }, [ready, sortDesc]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  const allSelected = sorted.length > 0 && sorted.every((r) => selected.has(r.id));

  return (
    <AdminShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dispatch</h1>
          <p className="text-sm text-muted-foreground">
            Harare requests collected from MSU and not yet in a batch.
          </p>
        </div>
        <Button disabled={selected.size === 0} onClick={() => setCreating(true)}>
          <Truck className="mr-2 h-4 w-4" /> Create batch ({selected.size})
        </Button>
      </div>

      <div className="mb-8 overflow-x-auto rounded-lg border bg-card">
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
                    checked={allSelected}
                    onCheckedChange={(v) =>
                      setSelected(v ? new Set(sorted.map((r) => r.id)) : new Set())
                    }
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>
                  <button
                    type="button"
                    className="font-medium"
                    onClick={() => setSortDesc(!sortDesc)}
                  >
                    Suburb {sortDesc ? "▼" : "▲"}
                  </button>
                </TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Fee</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => toggle(r.id)}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                  </TableCell>
                  <TableCell className="font-medium">{r.full_name}</TableCell>
                  <TableCell>{r.phone_number}</TableCell>
                  <TableCell>{r.suburb || "—"}</TableCell>
                  <TableCell className="max-w-[260px] truncate">{r.harare_address}</TableCell>
                  <TableCell>
                    US${r.fee_amount}
                    {r.paid ? " (paid)" : ""}
                  </TableCell>
                </TableRow>
              ))}
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    Nothing waiting. Harare requests appear here once they reach Collected from MSU.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <h2 className="mb-3 text-lg font-semibold">Batches</h2>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Batch</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead>Documents</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Out</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {batches.map((b) => (
              <TableRow key={b.id}>
                <TableCell>
                  <Link
                    to="/admin/batch/$batchId"
                    params={{ batchId: b.id }}
                    className="font-mono text-xs text-primary underline"
                  >
                    {b.batch_number}
                  </Link>
                </TableCell>
                <TableCell>{b.driver.full_name}</TableCell>
                <TableCell>
                  {b.document_count}
                  {b.outstanding > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {" "}
                      · {b.outstanding} still out
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      b.status === "closed"
                        ? "border-status-collected/30 bg-status-collected/15 text-status-collected"
                        : "border-status-transit/30 bg-status-transit/15 text-status-transit"
                    }`}
                  >
                    {b.status === "closed" ? "Closed" : "Out for delivery"}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDate(b.dispatched_at)}
                </TableCell>
              </TableRow>
            ))}
            {batches.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  No batches yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {creating && (
        <CreateBatchDialog
          drivers={drivers.filter((d) => d.active)}
          count={selected.size}
          onClose={() => setCreating(false)}
          onCreate={async (driverId) => {
            try {
              const batch = await apiClient.createBatch(Array.from(selected), driverId);
              toast.success(`Batch ${batch.batch_number} created`);
              setCreating(false);
              setSelected(new Set());
              navigate({ to: "/admin/batch/$batchId", params: { batchId: batch.id } });
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Could not create the batch");
              await load();
            }
          }}
        />
      )}
    </AdminShell>
  );
}

function CreateBatchDialog({
  drivers,
  count,
  onClose,
  onCreate,
}: {
  drivers: Driver[];
  count: number;
  onClose: () => void;
  onCreate: (driverId: string) => Promise<void>;
}) {
  const [driverId, setDriverId] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Create batch of {count} document{count === 1 ? "" : "s"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Select value={driverId} onValueChange={setDriverId}>
            <SelectTrigger>
              <SelectValue placeholder={drivers.length ? "Choose a driver" : "No active drivers"} />
            </SelectTrigger>
            <SelectContent>
              {drivers.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.full_name} · {d.phone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            All selected requests move to Dispatched and are handed to this driver.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!driverId || busy}
              onClick={async () => {
                setBusy(true);
                await onCreate(driverId);
                setBusy(false);
              }}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirm
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
