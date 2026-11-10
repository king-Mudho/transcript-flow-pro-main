import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download, Eye, LogOut, Search } from "lucide-react";
import { z } from "zod";
import { apiClient, type MsuRequest } from "@/lib/api-client";
import { BrandMark } from "@/components/site-header";
import { MonthlyReportView } from "@/components/monthly-report";
import { Card, Empty, Note, Spinner, StageChip, Tick } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { downloadBlob, formatDay } from "@/lib/msu";
import { handinPdf, monthlyPdf } from "@/lib/pdf";
import { useSite } from "@/lib/site";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/**
 * MSU release queue (B10.2, design M01). Only reachable while the MSU staff
 * portal is switched on in Settings, and only by MSU staff (or the team).
 * Shows MSU-safe fields only: no phone numbers, emails or addresses.
 */
export const Route = createFileRoute("/msu")({
  ssr: false,
  validateSearch: z.object({
    tab: z.enum(["to_process", "ready", "rejected", "report"]).catch("to_process"),
    handin: z.string().optional().catch(undefined),
  }),
  beforeLoad: async () => {
    const user = await apiClient.me();
    if (!user) throw redirect({ to: "/auth" });
    if (user.mfa_required && !user.mfa_verified) throw redirect({ to: "/security" });
    if (!user.is_msu) throw redirect({ to: user.is_team ? "/admin" : "/no-access" });
    return { user };
  },
  head: () => ({ meta: [{ title: "MSU release queue" }, { name: "robots", content: "noindex" }] }),
  component: MsuPortal,
});

function MsuPortal() {
  const { user } = Route.useRouteContext();
  const { tab, handin } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const site = useSite();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<MsuRequest | null>(null);

  const queue = useQuery({
    queryKey: ["msu-queue", tab, handin, search],
    queryFn: () => apiClient.msuQueue(tab === "report" ? "to_process" : tab, handin, search),
  });
  const lists = useQuery({ queryKey: ["handin-lists"], queryFn: () => apiClient.handinLists() });

  const rows = queue.data?.results ?? [];
  const counts = queue.data?.counts;

  async function ready() {
    try {
      const res = await apiClient.msuReady(Array.from(selected));
      toast.success(`${res.moved} marked ready for collection`);
      setSelected(new Set());
      queue.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function viewFile(r: MsuRequest, fileId: string) {
    try {
      const blob = await apiClient.clearanceFile(r.id, fileId);
      window.open(URL.createObjectURL(blob), "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open the file");
    }
  }

  const tabs = [
    ["to_process", "To process", counts?.to_process],
    ["ready", "Ready for collection", counts?.ready],
    ["rejected", "Rejected", counts?.rejected],
    ["report", "Monthly report", undefined],
  ] as const;

  return (
    <div className="min-h-screen bg-ground text-[14px]">
      <header className="bg-navy text-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <BrandMark />
            <span className="hidden rounded-md bg-white/10 px-2 py-0.5 text-[12px] font-semibold sm:inline">
              MSU staff portal
            </span>
          </div>
          <div className="flex items-center gap-3 text-[13px]">
            <span className="hidden text-white/75 sm:inline">{user.full_name || user.email}</span>
            <button
              type="button"
              onClick={async () => {
                await apiClient.logout();
                navigate({ to: "/auth" });
              }}
              className="inline-flex h-9 items-center gap-2 rounded-lg px-2 hover:bg-white/10"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl p-4 md:p-6">
        <h1 className="text-[24px] font-bold">Release queue</h1>
        <p className="mt-1 text-[13px] text-ink-3">
          Requests handed in by {site.short_name}. Mark documents ready for collection, or reject
          with a reason the graduate will see.
        </p>

        <div role="tablist" className="mt-4 flex gap-1 overflow-x-auto">
          {tabs.map(([value, label, n]) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              onClick={() => {
                setSelected(new Set());
                navigate({ search: (p) => ({ ...p, tab: value }) });
              }}
              className={cn(
                "flex h-9 shrink-0 items-center gap-2 rounded-lg px-4 text-[13px] font-semibold",
                tab === value ? "bg-navy text-white" : "bg-white text-ink-2",
              )}
            >
              {label}
              {n !== undefined && (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[11px]",
                    tab === value ? "bg-white/20" : "bg-ground",
                  )}
                >
                  {n}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "report" ? (
          <MsuReport />
        ) : (
          <>
            <Card className="mt-3 flex flex-wrap items-center gap-2 p-3">
              <div className="relative min-w-[200px] flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-ink-3" />
                <Input
                  className="pl-8"
                  placeholder="Search name, reg number or reference"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select
                aria-label="Hand-in list"
                value={handin ?? ""}
                onChange={(e) =>
                  navigate({ search: (p) => ({ ...p, handin: e.target.value || undefined }) })
                }
                className="h-9 rounded-lg border border-line bg-white px-2.5 text-[13px]"
              >
                <option value="">All hand-in lists</option>
                {lists.data?.map((l) => (
                  <option key={l.id} value={l.number}>
                    {l.number} · {formatDay(l.created_at)} · {l.request_count}
                  </option>
                ))}
              </select>
              {handin && (
                <Button
                  variant="outline"
                  onClick={async () => {
                    const list = lists.data?.find((l) => l.number === handin);
                    if (list)
                      downloadBlob(
                        await handinPdf(await apiClient.handinList(list.id), site),
                        `hand-in-${handin}.pdf`,
                      );
                  }}
                >
                  <Download /> Hand-in list PDF
                </Button>
              )}
              {tab === "to_process" && (
                <Button variant="gold" disabled={!selected.size} onClick={ready}>
                  Ready for collection ({selected.size})
                </Button>
              )}
            </Card>

            <Card className="mt-3 overflow-x-auto">
              {queue.isLoading ? (
                <div className="flex justify-center py-12 text-ink-3">
                  <Spinner />
                </div>
              ) : queue.error ? (
                <Empty>{(queue.error as Error).message}</Empty>
              ) : rows.length === 0 ? (
                <Empty>Nothing here.</Empty>
              ) : (
                <table className="w-full min-w-[900px] text-left text-[13px]">
                  <thead className="border-b border-line text-[12px] uppercase tracking-wider text-ink-3">
                    <tr>
                      {tab === "to_process" && (
                        <th className="w-10 px-3 py-2.5">
                          <Checkbox
                            aria-label="Select all"
                            checked={rows.every((r) => selected.has(r.id))}
                            onCheckedChange={(v) =>
                              setSelected(v ? new Set(rows.map((r) => r.id)) : new Set())
                            }
                          />
                        </th>
                      )}
                      <th className="px-3 py-2.5">Graduate</th>
                      <th className="px-3 py-2.5">Programme</th>
                      <th className="px-3 py-2.5">Documents</th>
                      <th className="px-3 py-2.5">Clearance</th>
                      <th className="px-3 py-2.5">Hand-in</th>
                      <th className="px-3 py-2.5">
                        {tab === "rejected" ? "Reason" : "Days with MSU"}
                      </th>
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line align-top">
                    {rows.map((r) => (
                      <tr key={r.id}>
                        {tab === "to_process" && (
                          <td className="px-3 py-2.5">
                            <Checkbox
                              aria-label={`Select ${r.reference_number}`}
                              checked={selected.has(r.id)}
                              onCheckedChange={(v) => {
                                const next = new Set(selected);
                                if (v) next.add(r.id);
                                else next.delete(r.id);
                                setSelected(next);
                              }}
                            />
                          </td>
                        )}
                        <td className="px-3 py-2.5">
                          <div className="font-semibold">{r.full_name}</div>
                          <div className="text-[12px] text-ink-3">
                            {r.reg_number} · {r.reference_number}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          {r.programme_name}
                          <div className="text-[12px] text-ink-3">{r.year_completed}</div>
                        </td>
                        <td className="px-3 py-2.5">{r.documents}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            <Tick ok={r.cleared_department} label="Dept" />
                            <Tick ok={r.cleared_accounts} label="Accounts" />
                            <Tick ok={r.cleared_library} label="Library" />
                          </div>
                          {r.clearance_files.map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => viewFile(r, f.id)}
                              className="mt-1 flex items-center gap-1 text-[12px] text-navy underline"
                            >
                              <Eye className="h-3 w-3" /> {f.original_name}
                            </button>
                          ))}
                        </td>
                        <td className="px-3 py-2.5">{r.handin_number ?? "—"}</td>
                        <td className="px-3 py-2.5">
                          {tab === "rejected" ? (
                            <span className="text-danger">{r.status_reason}</span>
                          ) : r.days_with_msu != null ? (
                            <span
                              className={cn(
                                "rounded-md px-2 py-0.5 font-semibold tabular",
                                r.stage_level === "red"
                                  ? "bg-danger-tint text-danger"
                                  : r.stage_level === "amber"
                                    ? "bg-gold-tint text-warn-ink"
                                    : "",
                              )}
                            >
                              {r.days_with_msu}
                            </span>
                          ) : (
                            <StageChip status={r.status} />
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {r.status === "submitted_to_msu" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-danger"
                              onClick={() => setRejecting(r)}
                            >
                              Reject
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </>
        )}
      </main>
      {rejecting && queue.data && (
        <RejectDialog
          request={rejecting}
          reasons={queue.data.reasons}
          onClose={() => setRejecting(null)}
          onDone={() => {
            setRejecting(null);
            queue.refetch();
          }}
        />
      )}
    </div>
  );
}

function RejectDialog({
  request,
  reasons,
  onClose,
  onDone,
}: {
  request: MsuRequest;
  reasons: Record<string, string>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reject: {request.full_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <fieldset>
            <legend className="text-[13px] font-semibold">Reason</legend>
            <div className="mt-2 space-y-1.5">
              {Object.entries(reasons).map(([value, label]) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-[14px]"
                >
                  <input
                    type="radio"
                    name="reason"
                    value={value}
                    checked={code === value}
                    onChange={() => setCode(value)}
                    className="accent-[var(--navy)]"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <Label>Note for the graduate {code === "other" ? "(required)" : "(optional)"}</Label>
            <Textarea className="mt-1.5" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Note tone="info">
            The graduate sees this reason on their tracking page and is sent a message.
          </Note>
          <Button
            variant="danger"
            className="w-full"
            disabled={!code || (code === "other" && !note.trim()) || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await apiClient.msuReject(request.id, code, note);
                toast.success("Rejected");
                onDone();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Could not reject");
              } finally {
                setBusy(false);
              }
            }}
          >
            Reject request
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MsuReport() {
  const site = useSite();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const { data } = useQuery({
    queryKey: ["monthly", month],
    queryFn: () => apiClient.monthlyReport(month),
  });
  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[13px] text-ink-3">
          Month{" "}
          <Input
            type="month"
            className="w-[170px]"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
        <Button
          variant="outline"
          className="ml-auto"
          disabled={!data}
          onClick={async () =>
            data && downloadBlob(await monthlyPdf(data, site), `msu-report-${month}.pdf`)
          }
        >
          PDF
        </Button>
        <Button
          variant="outline"
          onClick={async () =>
            downloadBlob(await apiClient.monthlyReportXlsx(month), `msu-report-${month}.xlsx`)
          }
        >
          Excel
        </Button>
      </div>
      {data ? <MonthlyReportView report={data} /> : <Spinner />}
    </div>
  );
}
