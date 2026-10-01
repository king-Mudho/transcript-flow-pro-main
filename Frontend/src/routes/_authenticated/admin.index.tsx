import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { apiClient, type Page, type RequestFilters, type RequestRow } from "@/lib/api-client";
import { AdminShell } from "@/components/admin-shell";
import { RequestDetailDialog } from "@/components/request-detail-dialog";
import { StatusMoveDialog, type MoveTarget } from "@/components/status-move-dialog";
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
import { STATUSES, formatDate, statusClasses, statusLabel } from "@/lib/msu";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Download, Loader2, Search } from "lucide-react";

// Filters and page live in the URL, so a filtered view can be bookmarked.
const searchSchema = z.object({
  search: z.string().catch(""),
  status: z.string().catch("all"),
  zone: z.string().catch("all"),
  exported: z.string().catch("all"),
  date_from: z.string().catch(""),
  date_to: z.string().catch(""),
  page: z.number().int().min(1).catch(1),
});

export const Route = createFileRoute("/_authenticated/admin/")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Admin — Requests" }, { name: "robots", content: "noindex" }] }),
  component: AdminList,
});

const PAGE_SIZE = 50;

function AdminList() {
  const params = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const filters: RequestFilters = useMemo(
    () => ({
      search: params.search,
      status: params.status,
      zone: params.zone,
      exported: params.exported,
      date_from: params.date_from,
      date_to: params.date_to,
    }),
    [params.search, params.status, params.zone, params.exported, params.date_from, params.date_to],
  );

  const [data, setData] = useState<Page<RequestRow> | null>(null);
  const [loading, setLoading] = useState(true);
  // Typing is local; the URL (and so the query) updates after a short pause.
  const [searchText, setSearchText] = useState(params.search);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("");
  const [move, setMove] = useState<{ target: MoveTarget; count: number; status: string } | null>(
    null,
  );
  const [detailId, setDetailId] = useState<string | null>(null);

  const rows = useMemo(() => data?.results ?? [], [data]);
  const detail = useMemo(() => rows.find((r) => r.id === detailId) ?? null, [rows, detailId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiClient.listRequests(filters, params.page));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load requests");
      setData(null);
    }
    setLoading(false);
  }, [filters, params.page]);

  useEffect(() => {
    load();
  }, [load]);

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

  function setFilter(patch: Partial<RequestFilters>) {
    navigate({ search: (prev) => ({ ...prev, ...patch, page: 1 }) });
  }

  const total = data?.count ?? 0;
  const first = total === 0 ? 0 : (params.page - 1) * PAGE_SIZE + 1;
  const last = Math.min(params.page * PAGE_SIZE, total);
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageAllSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const selectedCount = allMatching ? total : selected.size;

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setAllMatching(false);
    setSelected(next);
  }

  async function togglePaid(id: string, paid: boolean) {
    try {
      await apiClient.updateRequest(id, { paid });
    } catch (e) {
      return toast.error(e instanceof Error ? e.message : "Update failed");
    }
    await load();
  }

  async function exportExcel() {
    if (total === 0) return toast.error("Nothing to export");
    let blob: Blob;
    try {
      // The server exports every row that matches the filters, not just this page.
      blob = await apiClient.exportRequests(filters);
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
    toast.success(`Exported ${total} records`);
    await load();
  }

  return (
    <AdminShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Transcript Requests</h1>
          <p className="text-sm text-muted-foreground">
            {total === 0 ? "No requests" : `${first} to ${last} of ${total}`}
          </p>
        </div>
        <Button onClick={exportExcel} className="bg-gold text-gold-foreground hover:bg-gold/90">
          <Download className="mr-2 h-4 w-4" /> Export filtered to Excel
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, reg #, reference, phone, programme…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={params.status} onValueChange={(v) => setFilter({ status: v })}>
          <SelectTrigger className="w-[190px]">
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
        <Select value={params.zone} onValueChange={(v) => setFilter({ zone: v })}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Zone" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All zones</SelectItem>
            <SelectItem value="harare">Harare</SelectItem>
            <SelectItem value="outside_harare">Outside Harare</SelectItem>
          </SelectContent>
        </Select>
        <Select value={params.exported} onValueChange={(v) => setFilter({ exported: v })}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All exports</SelectItem>
            <SelectItem value="not_exported">Not yet exported</SelectItem>
            <SelectItem value="exported">Already exported</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          From
          <Input
            type="date"
            className="w-[150px]"
            value={params.date_from}
            onChange={(e) => setFilter({ date_from: e.target.value })}
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          To
          <Input
            type="date"
            className="w-[150px]"
            value={params.date_to}
            onChange={(e) => setFilter({ date_to: e.target.value })}
          />
        </label>
      </div>

      {(selected.size > 0 || allMatching) && (
        <div className="mb-3 space-y-2 rounded-lg border bg-primary/5 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">
              {allMatching ? `All ${total} matching selected` : `${selected.size} selected`}
            </span>
            <Select value={bulkStatus} onValueChange={setBulkStatus}>
              <SelectTrigger className="w-[190px]">
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
              onClick={() =>
                setMove({
                  target: allMatching ? { filters } : { ids: Array.from(selected) },
                  count: selectedCount,
                  status: bulkStatus,
                })
              }
            >
              Apply
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSelected(new Set());
                setAllMatching(false);
              }}
            >
              Clear
            </Button>
          </div>
          {pageAllSelected && !allMatching && total > rows.length && (
            <div className="text-xs">
              All {rows.length} on this page are selected.{" "}
              <button
                type="button"
                className="font-medium text-primary underline"
                onClick={() => setAllMatching(true)}
              >
                Select all {total} matching
              </button>
            </div>
          )}
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
                    checked={pageAllSelected}
                    onCheckedChange={(v) => {
                      setAllMatching(false);
                      setSelected(v ? new Set(rows.map((r) => r.id)) : new Set());
                    }}
                  />
                </TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Reg #</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Programme</TableHead>
                <TableHead>Zone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetailId(r.id)}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(r.id) || allMatching}
                      onCheckedChange={() => toggle(r.id)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.reference_number}</TableCell>
                  <TableCell className="font-medium">{r.full_name}</TableCell>
                  <TableCell>{r.reg_number}</TableCell>
                  <TableCell className="text-xs">{r.phone_number}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{r.programme_name}</TableCell>
                  <TableCell className="text-xs">
                    {r.zone === "harare" ? "Harare" : "Outside"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClasses(r.status)}`}
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
              {rows.length === 0 && (
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

      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Page {params.page} of {lastPage}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={params.page <= 1}
            onClick={() => navigate({ search: (prev) => ({ ...prev, page: params.page - 1 }) })}
          >
            <ChevronLeft className="mr-1 h-4 w-4" /> Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={params.page >= lastPage}
            onClick={() => navigate({ search: (prev) => ({ ...prev, page: params.page + 1 }) })}
          >
            Next <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>

      <RequestDetailDialog row={detail} onClose={() => setDetailId(null)} onChanged={load} />

      {move && (
        <StatusMoveDialog
          open
          target={move.target}
          count={move.count}
          status={move.status}
          onClose={() => {
            setMove(null);
            setSelected(new Set());
            setAllMatching(false);
            setBulkStatus("");
          }}
          onDone={load}
        />
      )}
    </AdminShell>
  );
}
