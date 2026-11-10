import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { BookmarkPlus, ChevronLeft, ChevronRight, Download, Search, Trash2, X } from "lucide-react";
import { AdminShell, useCurrentUser } from "@/components/admin-shell";
import { DeleteRequestsDialog } from "@/components/delete-requests-dialog";
import { StatusMoveDialog, type MoveTarget } from "@/components/status-move-dialog";
import { Card, Empty, Spinner, StageChip, Tag } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  apiClient,
  type RequestFilters,
  type RequestRow,
  type StatusValue,
} from "@/lib/api-client";
import { downloadBlob, formatDay, formatPhone, money, statusLabel } from "@/lib/msu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const text = z.union([z.string(), z.number()]).transform(String);
const searchSchema = z.object({
  search: text.catch(""),
  status: z.string().catch("all"),
  zone: z.string().catch("all"),
  payment: z.string().catch("all"),
  exported: z.string().catch("all"),
  date_from: z.string().catch(""),
  date_to: z.string().catch(""),
  duplicate: text.catch(""),
  min_days: text.catch(""),
  channel: z.string().catch("all"),
  handin: text.catch(""),
  page: z.number().int().min(1).catch(1),
});

export type ListSearch = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/_authenticated/admin/requests/")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: "Requests — MSU Transcript admin" }, { name: "robots", content: "noindex" }],
  }),
  component: RequestsList,
});

const PAGE_SIZE = 50;
const TABS = [
  ["all", "All"],
  ["received", "Received"],
  ["submitted_to_msu", "At MSU"],
  ["ready_at_msu", "Ready at MSU"],
  ["collected_from_msu", "Collected from MSU"],
  ["dispatched", "Dispatched"],
  ["collected", "Collected"],
  ["rejected", "Rejected"],
] as const;

function RequestsList() {
  const params = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();

  const filters: RequestFilters = useMemo(
    () => ({
      search: params.search,
      status: params.status,
      zone: params.zone,
      exported: params.exported,
      date_from: params.date_from,
      date_to: params.date_to,
      payment: params.payment,
      duplicate: params.duplicate,
      min_days: params.min_days,
      channel: params.channel,
      handin: params.handin,
    }),
    [params],
  );
  const { page: _page, ...listParams } = params;

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["requests", filters, params.page],
    queryFn: () => apiClient.listRequests(filters, params.page),
    placeholderData: (prev) => prev,
  });
  const { data: counts } = useQuery({
    queryKey: ["request-counts", { ...filters, status: "all" }],
    queryFn: () => apiClient.requestCounts({ ...filters, status: "all" }),
  });
  const { data: views, refetch: refetchViews } = useQuery({
    queryKey: ["saved-views"],
    queryFn: () => apiClient.savedViews(),
  });

  const [searchText, setSearchText] = useState(params.search);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const { data: me } = useCurrentUser();
  const [deleting, setDeleting] = useState(false);
  const [move, setMove] = useState<{ target: MoveTarget; count: number; status: string } | null>(
    null,
  );

  const rows = useMemo(() => data?.results ?? [], [data]);
  const total = data?.count ?? 0;
  const first = total === 0 ? 0 : (params.page - 1) * PAGE_SIZE + 1;
  const last = Math.min(params.page * PAGE_SIZE, total);
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    setSelected(new Set());
    setAllMatching(false);
  }, [filters, params.page]);

  useEffect(() => {
    if (searchText === params.search) return;
    const t = setTimeout(
      () => navigate({ search: (prev) => ({ ...prev, search: searchText, page: 1 }) }),
      350,
    );
    return () => clearTimeout(t);
  }, [searchText, params.search, navigate]);

  useEffect(() => {
    if (data && params.page > lastPage) navigate({ search: (prev) => ({ ...prev, page: 1 }) });
  }, [data, params.page, lastPage, navigate]);

  function setFilter(patch: Partial<ListSearch>) {
    navigate({ search: (prev) => ({ ...prev, ...patch, page: 1 }) });
  }

  const selectedRows = rows.filter((r) => selected.has(r.id));
  const selectedCount = allMatching ? total : selected.size;
  const pageAllSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  // Offer only the moves every selected row allows (B9.3).
  const moves: StatusValue[] = useMemo(() => {
    if (allMatching) {
      const tabStatus = params.status === "ready_at_msu" ? "submitted_to_msu" : params.status;
      const sample = rows.find((r) => r.status === tabStatus) ?? rows[0];
      return params.status !== "all" && sample ? sample.allowed_next : [];
    }
    if (!selectedRows.length) return [];
    return selectedRows
      .map((r) => r.allowed_next)
      .reduce((acc, next) => acc.filter((s) => next.includes(s)));
  }, [allMatching, selectedRows, rows, params.status]);

  const canMarkReady =
    (allMatching
      ? params.status === "submitted_to_msu"
      : selectedRows.length > 0 &&
        selectedRows.every((r) => r.status === "submitted_to_msu" && !r.ready_at_msu_at)) &&
    !allMatching;

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setAllMatching(false);
    setSelected(next);
  }

  function refresh() {
    refetch();
    queryClient.invalidateQueries({ queryKey: ["request-counts"] });
    queryClient.invalidateQueries({ queryKey: ["sidebar-counts"] });
  }

  async function exportExcel() {
    if (total === 0) return toast.error("Nothing to export");
    try {
      downloadBlob(
        await apiClient.exportRequests(filters),
        `msu-requests-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
      toast.success(`Exported ${total} request${total === 1 ? "" : "s"}`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  }

  async function saveView() {
    const name = window.prompt("Name this view, for example “At MSU over 5 days”");
    if (!name?.trim()) return;
    const clean = Object.fromEntries(
      Object.entries(listParams).filter(([, v]) => v !== "" && v !== "all"),
    ) as Record<string, string>;
    try {
      await apiClient.saveView(name.trim(), clean);
      refetchViews();
      toast.success("View saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the view");
    }
  }

  async function markReady() {
    try {
      const res = await apiClient.setReadyAtMsu(Array.from(selected));
      toast.success(`${res.moved} marked ready at MSU`);
      setSelected(new Set());
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  const detailSearch = { ...listParams } as Record<string, string>;

  return (
    <AdminShell
      wide
      title={
        <div>
          <h1 className="text-[24px] font-bold">Requests</h1>
          <p className="text-[13px] text-ink-3">
            {total === 0 ? "No requests" : `${first} to ${last} of ${total}`}
          </p>
        </div>
      }
      actions={
        <>
          <Button variant="outline" onClick={exportExcel}>
            <Download /> Export to Excel
          </Button>
        </>
      }
    >
      {/* Stage tabs */}
      <div
        role="tablist"
        aria-label="Stage"
        className="-mx-1 mb-3 flex gap-1 overflow-x-auto px-1 pb-1"
      >
        {TABS.map(([value, label]) => {
          const active = params.status === value;
          const n = counts?.[value];
          return (
            <button
              key={value}
              role="tab"
              aria-selected={active}
              onClick={() => setFilter({ status: value })}
              className={cn(
                "flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-[13px] font-semibold",
                active ? "bg-navy text-white" : "bg-white text-ink-2 hover:bg-line/60",
              )}
            >
              {label}
              {n !== undefined && (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[11px] tabular",
                    active ? "bg-white/20" : "bg-ground",
                  )}
                >
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <Card className="mb-3 flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-ink-3" />
          <Input
            placeholder="Search name, reg number, reference, phone, programme"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={params.zone} onChange={(v) => setFilter({ zone: v })} label="Delivery">
          <option value="all">Any delivery</option>
          <option value="harare">Harare doorstep</option>
          <option value="outside_harare">Zimpost branch</option>
        </Select>
        <Select value={params.payment} onChange={(v) => setFilter({ payment: v })} label="Payment">
          <option value="all">Any payment</option>
          <option value="unpaid">Unpaid</option>
          <option value="part_paid">Part-paid</option>
          <option value="paid">Paid</option>
        </Select>
        <Select value={params.exported} onChange={(v) => setFilter({ exported: v })} label="Export">
          <option value="all">Exported or not</option>
          <option value="not_exported">Not yet exported</option>
          <option value="exported">Already exported</option>
        </Select>
        <label className="flex items-center gap-1.5 text-[12px] text-ink-3">
          From
          <Input
            type="date"
            className="w-[140px]"
            value={params.date_from}
            onChange={(e) => setFilter({ date_from: e.target.value })}
          />
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-ink-3">
          To
          <Input
            type="date"
            className="w-[140px]"
            value={params.date_to}
            onChange={(e) => setFilter({ date_to: e.target.value })}
          />
        </label>
        <label className="flex h-9 items-center gap-2 rounded-lg border border-line px-2.5 text-[13px]">
          <Checkbox
            checked={params.duplicate === "1"}
            onCheckedChange={(v) => setFilter({ duplicate: v ? "1" : "" })}
          />
          Possible duplicates
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-ink-3">
          In stage ≥
          <Input
            type="number"
            min={0}
            className="w-[64px]"
            value={params.min_days}
            onChange={(e) => setFilter({ min_days: e.target.value })}
          />
          days
        </label>
      </Card>

      {/* Saved views */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-ink-3">
          Saved views
        </span>
        <QuickView
          label="At MSU over 5 days"
          search={{ status: "submitted_to_msu", min_days: "5" }}
        />
        <QuickView
          label="Unpaid deposits"
          search={{ zone: "outside_harare", payment: "unpaid", status: "collected_from_msu" }}
        />
        {views?.map((v) => (
          <span
            key={v.id}
            className="inline-flex items-center rounded-full border border-line bg-white pl-3 text-[13px]"
          >
            <Link
              to="/admin/requests"
              search={{ ...v.params, page: 1 }}
              className="py-1 font-medium hover:underline"
            >
              {v.name}
            </Link>
            <button
              type="button"
              aria-label={`Delete view ${v.name}`}
              className="ml-1 flex h-7 w-7 items-center justify-center rounded-full text-ink-3 hover:bg-ground"
              onClick={async () => {
                await apiClient.deleteView(v.id);
                refetchViews();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        <Button variant="ghost" size="sm" onClick={saveView}>
          <BookmarkPlus /> Save this view
        </Button>
      </div>

      {/* Bulk bar */}
      {(selected.size > 0 || allMatching) && (
        <div className="sticky top-16 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-white shadow-lg">
          <span className="font-semibold">
            {allMatching ? `All ${total} matching` : `${selected.size} selected`}
          </span>
          <span className="mx-1 h-5 w-px bg-white/25" />
          {moves.length === 0 && (
            <span className="text-[13px] text-white/70">
              These requests have no move in common. Select one stage.
            </span>
          )}
          {moves.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={s === "rejected" ? "danger" : "gold"}
              onClick={() =>
                setMove({
                  target: allMatching ? { filters } : { ids: Array.from(selected) },
                  count: selectedCount,
                  status: s,
                })
              }
            >
              {s === "rejected" ? "Reject" : `Move to ${statusLabel(s)}`}
            </Button>
          ))}
          {canMarkReady && (
            <Button size="sm" variant="outline-light" onClick={markReady}>
              Mark ready at MSU
            </Button>
          )}
          {me?.is_admin && !allMatching && (
            <Button size="sm" variant="danger" onClick={() => setDeleting(true)}>
              <Trash2 /> Delete
            </Button>
          )}
          {pageAllSelected && !allMatching && total > rows.length && (
            <button
              type="button"
              className="text-[13px] font-semibold underline"
              onClick={() => setAllMatching(true)}
            >
              Select all {total} matching
            </button>
          )}
          <button
            type="button"
            aria-label="Clear selection"
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/10"
            onClick={() => {
              setSelected(new Set());
              setAllMatching(false);
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Table */}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-[13px]">
          <thead className="border-b border-line text-[12px] uppercase tracking-wider text-ink-3">
            <tr>
              <th className="w-10 px-3 py-2.5">
                <Checkbox
                  aria-label="Select this page"
                  checked={pageAllSelected}
                  onCheckedChange={(v) => {
                    setAllMatching(false);
                    setSelected(v ? new Set(rows.map((r) => r.id)) : new Set());
                  }}
                />
              </th>
              <th className="px-3 py-2.5 font-semibold">Reference</th>
              <th className="px-3 py-2.5 font-semibold">Graduate</th>
              <th className="px-3 py-2.5 font-semibold">Documents</th>
              <th className="px-3 py-2.5 font-semibold">Delivery</th>
              <th className="px-3 py-2.5 font-semibold">Stage</th>
              <th className="px-3 py-2.5 font-semibold">Days in stage</th>
              <th className="px-3 py-2.5 font-semibold">Payment</th>
              <th className="px-3 py-2.5 font-semibold">Submitted</th>
            </tr>
          </thead>
          <tbody className={cn("divide-y divide-line", isFetching && "opacity-60")}>
            {rows.map((r) => (
              <Row
                key={r.id}
                r={r}
                checked={selected.has(r.id) || allMatching}
                onToggle={() => toggle(r.id)}
                search={detailSearch}
              />
            ))}
          </tbody>
        </table>
        {!data && (
          <div className="flex justify-center py-16 text-ink-3">
            <Spinner />
          </div>
        )}
        {data && rows.length === 0 && <Empty>No requests match these filters.</Empty>}
      </Card>

      <div className="mt-3 flex items-center justify-between text-[13px]">
        <span className="text-ink-3">
          Page {params.page} of {lastPage}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={params.page <= 1}
            onClick={() => navigate({ search: (p) => ({ ...p, page: params.page - 1 }) })}
          >
            <ChevronLeft /> Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={params.page >= lastPage}
            onClick={() => navigate({ search: (p) => ({ ...p, page: params.page + 1 }) })}
          >
            Next <ChevronRight />
          </Button>
        </div>
      </div>

      {deleting && (
        <DeleteRequestsDialog
          ids={Array.from(selected)}
          label={
            selected.size === 1
              ? (selectedRows[0]?.reference_number ?? "1 request")
              : `${selected.size} requests`
          }
          onClose={() => {
            setDeleting(false);
            setSelected(new Set());
          }}
          onDone={refresh}
        />
      )}

      {move && (
        <StatusMoveDialog
          open
          target={move.target}
          count={move.count}
          status={move.status}
          currentStatus={
            !allMatching &&
            selectedRows.length &&
            selectedRows.every((r) => r.status === selectedRows[0]!.status)
              ? selectedRows[0]!.status
              : undefined
          }
          onClose={() => {
            setMove(null);
            setSelected(new Set());
            setAllMatching(false);
          }}
          onDone={refresh}
        />
      )}
    </AdminShell>
  );
}

function Row({
  r,
  checked,
  onToggle,
  search,
}: {
  r: RequestRow;
  checked: boolean;
  onToggle: () => void;
  search: Record<string, string>;
}) {
  const navigate = useNavigate();
  const open = () =>
    navigate({ to: "/admin/requests/$requestId", params: { requestId: r.id }, search });
  return (
    <tr className="cursor-pointer hover:bg-ground" onClick={open}>
      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          aria-label={`Select ${r.reference_number}`}
          checked={checked}
          onCheckedChange={onToggle}
        />
      </td>
      <td className="px-3 py-2.5 font-mono text-[12px]">
        <Link
          to="/admin/requests/$requestId"
          params={{ requestId: r.id }}
          search={search}
          onClick={(e) => e.stopPropagation()}
          className="hover:underline"
        >
          {r.reference_number}
        </Link>
        {r.possible_duplicate && (
          <div className="mt-1">
            <Tag tone="danger">Possible duplicate</Tag>
          </div>
        )}
      </td>
      <td className="px-3 py-2.5">
        <div className="font-semibold text-ink">{r.full_name}</div>
        <div className="text-[12px] text-ink-3">
          {r.reg_number} · {formatPhone(r.phone_number)}
        </div>
      </td>
      <td className="max-w-[180px] px-3 py-2.5 text-ink-2">{r.documents}</td>
      <td className="px-3 py-2.5">
        <div>{r.zone === "harare" ? "Harare" : "Zimpost"}</div>
        <div className="max-w-[160px] truncate text-[12px] text-ink-3">
          {r.zone === "harare" ? r.suburb || "—" : (r.zimpost_branches?.branch_name ?? "—")}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <StageChip
          status={r.status === "submitted_to_msu" && r.ready_at_msu_at ? "ready_at_msu" : r.status}
        />
        {r.handin_number && r.status === "submitted_to_msu" && (
          <div className="mt-1 text-[11px] text-ink-3">{r.handin_number}</div>
        )}
      </td>
      <td className="px-3 py-2.5">
        <span
          className={cn(
            "inline-block min-w-[2.5rem] rounded-md px-2 py-0.5 text-center font-semibold tabular",
            r.stage_level === "red"
              ? "bg-danger-tint text-danger"
              : r.stage_level === "amber"
                ? "bg-gold-tint text-warn-ink"
                : "text-ink-2",
          )}
        >
          {r.days_in_stage}
        </span>
      </td>
      <td className="px-3 py-2.5">
        {r.paid ? (
          <Tag tone="success">Paid</Tag>
        ) : r.payment_state === "part_paid" ? (
          <Tag tone="gold">
            {money(r.amount_paid)} of {money(r.fee_amount)}
          </Tag>
        ) : (
          <span className="text-ink-3">
            {money(r.fee_amount)} {r.payment_method === "cash_on_delivery" ? "COD" : "deposit"}
          </span>
        )}
      </td>
      <td className="px-3 py-2.5 text-[12px] text-ink-3">{formatDay(r.created_at)}</td>
    </tr>
  );
}

function QuickView({ label, search }: { label: string; search: Partial<ListSearch> }) {
  return (
    <Link
      to="/admin/requests"
      search={{ ...search, page: 1 }}
      className="rounded-full border border-line bg-white px-3 py-1 text-[13px] font-medium hover:bg-ground"
    >
      {label}
    </Link>
  );
}

function Select({
  value,
  onChange,
  label,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-lg border border-line bg-white px-2.5 text-[13px]"
    >
      {children}
    </select>
  );
}
