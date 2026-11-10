import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Printer, Truck } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { StatusMoveDialog } from "@/components/status-move-dialog";
import { Card, CardHeader, Empty, Spinner, Tag } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { apiClient, type Driver, type RequestRow } from "@/lib/api-client";
import { formatDate, formatPhone, money } from "@/lib/msu";
import { labelFromRequest, labelsPdf } from "@/lib/pdf";
import { useSite } from "@/lib/site";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/dispatch")({
  validateSearch: z.object({
    tab: z.enum(["harare", "zimpost", "batches"]).catch("harare"),
    select: z.string().optional().catch(undefined),
  }),
  head: () => ({
    meta: [{ title: "Dispatch — MSU Transcript admin" }, { name: "robots", content: "noindex" }],
  }),
  component: DispatchPage,
});

function DispatchPage() {
  const { tab, select } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <AdminShell wide title="Dispatch">
      <div role="tablist" className="mb-4 flex gap-1">
        {(
          [
            ["harare", "Harare doorstep"],
            ["zimpost", "Zimpost branches"],
            ["batches", "Batches"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => navigate({ search: { tab: value } })}
            className={cn(
              "h-9 rounded-lg px-4 text-[13px] font-semibold",
              tab === value ? "bg-navy text-white" : "bg-white text-ink-2 hover:bg-line/60",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "harare" && <HarareTab preselect={select} />}
      {tab === "zimpost" && <ZimpostTab />}
      {tab === "batches" && <BatchesTab />}
    </AdminShell>
  );
}

const STATE_LABEL = { free: "Free", batch_out: "Batch out", off_today: "Off today" } as const;

function HarareTab({ preselect }: { preselect?: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: ready, refetch } = useQuery({
    queryKey: ["dispatch-ready"],
    queryFn: () => apiClient.dispatchReady(),
  });
  const { data: drivers, refetch: refetchDrivers } = useQuery({
    queryKey: ["drivers"],
    queryFn: () => apiClient.listDrivers(),
  });
  const [selected, setSelected] = useState<Set<string>>(new Set(preselect ? [preselect] : []));
  const [driverId, setDriverId] = useState("");
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<string, RequestRow[]>();
    for (const r of ready ?? []) {
      const key = r.suburb || "No suburb";
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [ready]);

  const chosen = (ready ?? []).filter((r) => selected.has(r.id));
  const documents = chosen.reduce((n, r) => n + r.items.reduce((s, i) => s + i.quantity, 0), 0);
  const alreadyPaid = chosen.filter((r) => r.paid).length;
  const cash = chosen.reduce((sum, r) => sum + Number(r.cash_due), 0);
  const activeDrivers = (drivers ?? []).filter((d) => d.active);

  function toggle(ids: string[], on: boolean) {
    const next = new Set(selected);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    setSelected(next);
  }

  async function create() {
    setBusy(true);
    try {
      const batch = await apiClient.createBatch(Array.from(selected), driverId);
      toast.success(`Batch ${batch.batch_number} created`);
      queryClient.invalidateQueries({ queryKey: ["sidebar-counts"] });
      navigate({ to: "/admin/batch/$batchId", params: { batchId: batch.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the batch");
      refetch();
      refetchDrivers();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <p className="text-[13px] text-ink-3">
          Harare requests at Collected from MSU and not yet in a batch, grouped by suburb.
        </p>
        {!ready ? (
          <div className="flex justify-center py-16 text-ink-3">
            <Spinner />
          </div>
        ) : groups.length === 0 ? (
          <Card>
            <Empty>
              Nothing waiting. Harare requests appear here once they reach Collected from MSU.
            </Empty>
          </Card>
        ) : (
          groups.map(([suburb, rows]) => {
            const all = rows.every((r) => selected.has(r.id));
            return (
              <Card key={suburb} className="overflow-hidden">
                <label className="flex cursor-pointer items-center gap-3 border-b border-line bg-ground px-4 py-2.5">
                  <Checkbox
                    checked={all}
                    onCheckedChange={(v) =>
                      toggle(
                        rows.map((r) => r.id),
                        !!v,
                      )
                    }
                    aria-label={`Select all in ${suburb}`}
                  />
                  <span className="font-semibold">{suburb}</span>
                  <span className="text-[12px] text-ink-3">{rows.length}</span>
                </label>
                <ul className="divide-y divide-line">
                  {rows.map((r) => (
                    <li key={r.id}>
                      <label className="flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-ground">
                        <Checkbox
                          className="mt-0.5"
                          checked={selected.has(r.id)}
                          onCheckedChange={(v) => toggle([r.id], !!v)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">{r.full_name}</span>
                          <span className="block truncate text-[12px] text-ink-3">
                            {r.harare_address} · {formatPhone(r.phone_number)} · {r.documents}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-[13px]">
                          {r.paid ? (
                            <Tag tone="success">Paid</Tag>
                          ) : (
                            <span className="font-semibold tabular">{money(r.cash_due)}</span>
                          )}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })
        )}
      </div>

      <Card className="h-fit p-5 lg:sticky lg:top-20">
        <CardHeader title="New batch" />
        <dl className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
          <Stat k="Requests" v={chosen.length} />
          <Stat k="Documents" v={documents} />
          <Stat k="Already paid" v={alreadyPaid} />
          <Stat k="Cash to collect" v={money(cash)} />
        </dl>
        <div className="mt-4 text-[13px] font-semibold">Driver</div>
        <ul className="mt-2 space-y-1.5" role="radiogroup" aria-label="Driver">
          {activeDrivers.map((d) => (
            <DriverOption
              key={d.id}
              d={d}
              checked={driverId === d.id}
              onChoose={() => setDriverId(d.id)}
            />
          ))}
          {drivers && activeDrivers.length === 0 && (
            <li className="text-[13px] text-ink-3">
              No active drivers.{" "}
              <Link to="/admin/drivers" className="underline">
                Add one
              </Link>
              .
            </li>
          )}
        </ul>
        <Button
          className="mt-4 w-full"
          variant="gold"
          disabled={!chosen.length || !driverId || busy}
          onClick={create}
        >
          <Truck /> Create batch and dispatch
        </Button>
        <p className="mt-2 text-[12px] text-ink-3">
          All selected requests move to Dispatched with this driver.
        </p>
      </Card>
    </div>
  );
}

function DriverOption({
  d,
  checked,
  onChoose,
}: {
  d: Driver;
  checked: boolean;
  onChoose: () => void;
}) {
  const off = d.state === "off_today";
  return (
    <li>
      <label
        className={cn(
          "flex items-center gap-3 rounded-lg border px-3 py-2",
          off ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-ground",
          checked ? "border-navy bg-ground" : "border-line",
        )}
      >
        <input
          type="radio"
          name="driver"
          disabled={off}
          checked={checked}
          onChange={onChoose}
          className="accent-[var(--navy)]"
        />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{d.full_name}</span>
          <span className="block text-[12px] text-ink-3">
            {d.bike_registration || formatPhone(d.phone)}
          </span>
        </span>
        <Tag tone={d.state === "free" ? "success" : d.state === "batch_out" ? "gold" : "neutral"}>
          {STATE_LABEL[d.state]}
        </Tag>
      </label>
    </li>
  );
}

function Stat({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-ground p-2.5">
      <dt className="text-[11px] text-ink-3">{k}</dt>
      <dd className="text-[18px] font-semibold tabular">{v}</dd>
    </div>
  );
}

function ZimpostTab() {
  const site = useSite();
  const { data: ready, refetch } = useQuery({
    queryKey: ["zimpost-ready"],
    queryFn: () => apiClient.zimpostReady(),
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dispatching, setDispatching] = useState(false);

  useEffect(() => setSelected(new Set()), [ready]);

  const groups = useMemo(() => {
    const map = new Map<string, RequestRow[]>();
    for (const r of ready ?? []) {
      const key = r.zimpost_branches
        ? `${r.zimpost_branches.branch_name} · ${r.zimpost_branches.branch_area}`
        : "No branch";
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [ready]);
  const chosen = (ready ?? []).filter((r) => selected.has(r.id));
  const unpaid = chosen.filter((r) => !r.paid).length;

  async function labels() {
    const blob = await labelsPdf(
      chosen.map((r) => labelFromRequest(r)),
      site,
      window.location.origin,
      "a4",
    );
    window.open(URL.createObjectURL(blob), "_blank", "noopener");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-ink-3">
          Outside Harare requests at Collected from MSU. Deposits are paid before dispatch.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" disabled={!chosen.length} onClick={labels}>
            <Printer /> Labels ({chosen.length})
          </Button>
          <Button variant="gold" disabled={!chosen.length} onClick={() => setDispatching(true)}>
            Dispatch {chosen.length || ""} to Zimpost
          </Button>
        </div>
      </div>
      {unpaid > 0 && (
        <p className="text-[13px] text-warn-ink">
          {unpaid} selected request(s) have no deposit recorded yet.
        </p>
      )}
      {!ready ? (
        <div className="flex justify-center py-16 text-ink-3">
          <Spinner />
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <Empty>Nothing waiting for Zimpost.</Empty>
        </Card>
      ) : (
        groups.map(([branch, rows]) => (
          <Card key={branch} className="overflow-hidden">
            <label className="flex cursor-pointer items-center gap-3 border-b border-line bg-ground px-4 py-2.5">
              <Checkbox
                checked={rows.every((r) => selected.has(r.id))}
                onCheckedChange={(v) => {
                  const next = new Set(selected);
                  rows.forEach((r) => (v ? next.add(r.id) : next.delete(r.id)));
                  setSelected(next);
                }}
              />
              <span className="font-semibold">{branch}</span>
            </label>
            <ul className="divide-y divide-line">
              {rows.map((r) => (
                <li key={r.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-ground">
                    <Checkbox
                      checked={selected.has(r.id)}
                      onCheckedChange={(v) => {
                        const next = new Set(selected);
                        if (v) next.add(r.id);
                        else next.delete(r.id);
                        setSelected(next);
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{r.full_name}</span>
                      <span className="block text-[12px] text-ink-3">
                        {r.reference_number} · {formatPhone(r.phone_number)} · {r.documents}
                      </span>
                    </span>
                    {r.paid ? (
                      <Tag tone="success">Deposit paid</Tag>
                    ) : (
                      <Tag tone="gold">Deposit due {money(r.fee_amount)}</Tag>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
      {dispatching && (
        <StatusMoveDialog
          open
          target={{ ids: Array.from(selected) }}
          count={selected.size}
          status="dispatched"
          currentStatus="collected_from_msu"
          onClose={() => setDispatching(false)}
          onDone={() => refetch()}
        />
      )}
    </div>
  );
}

function BatchesTab() {
  const { data } = useQuery({ queryKey: ["batches"], queryFn: () => apiClient.listBatches() });
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-[13px]">
        <thead className="border-b border-line text-[12px] uppercase tracking-wider text-ink-3">
          <tr>
            <th className="px-4 py-2.5">Batch</th>
            <th className="px-4 py-2.5">Driver</th>
            <th className="px-4 py-2.5">Delivered</th>
            <th className="px-4 py-2.5">Cash</th>
            <th className="px-4 py-2.5">Status</th>
            <th className="px-4 py-2.5">Out</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {(data ?? []).map((b) => (
            <tr key={b.id} className="hover:bg-ground">
              <td className="px-4 py-2.5">
                <Link
                  to="/admin/batch/$batchId"
                  params={{ batchId: b.id }}
                  className="font-mono font-semibold text-navy underline"
                >
                  {b.batch_number}
                </Link>
              </td>
              <td className="px-4 py-2.5">{b.driver.full_name}</td>
              <td className="px-4 py-2.5 tabular">
                {b.delivered} of {b.document_count}
                {b.outstanding > 0 && <span className="text-ink-3"> · {b.outstanding} out</span>}
              </td>
              <td className="px-4 py-2.5 tabular">
                {b.status === "closed" ? (
                  <>
                    {money(b.cash_handed_in)} in
                    {b.variance != null && Number(b.variance) !== 0 && (
                      <span className="ml-1 font-semibold text-danger">({money(b.variance)})</span>
                    )}
                  </>
                ) : (
                  `${money(b.cash_to_collect)} so far`
                )}
              </td>
              <td className="px-4 py-2.5">
                {b.status === "closed" ? (
                  <Tag tone="success">Closed</Tag>
                ) : (
                  <Tag tone="info">Out for delivery</Tag>
                )}
              </td>
              <td className="px-4 py-2.5 text-ink-3">{formatDate(b.dispatched_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && data.length === 0 && <Empty>No batches yet.</Empty>}
    </Card>
  );
}
