import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { Download, Printer } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { StatusMoveDialog } from "@/components/status-move-dialog";
import { Card, Empty, Note, Spinner, StageChip } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { apiClient, type RequestRow } from "@/lib/api-client";
import { downloadBlob, formatDate } from "@/lib/msu";
import { handinPdf, pickupPdf } from "@/lib/pdf";
import { useSite } from "@/lib/site";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/collections")({
  validateSearch: z.object({ tab: z.enum(["ready", "at_msu", "lists"]).catch("ready") }),
  head: () => ({
    meta: [
      { title: "MSU and collections — MSU Transcript admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CollectionsPage,
});

/** B9.4 and B10.3: what is at MSU, what MSU has released, collection runs
 *  with a printed pick-up list, and the hand-in lists MSU signs. Works with
 *  the MSU portal off: staff mark documents ready when MSU phones. */
function CollectionsPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <AdminShell wide title="MSU and collections">
      <div role="tablist" className="mb-4 flex gap-1">
        {(
          [
            ["ready", "Ready at MSU"],
            ["at_msu", "Waiting at MSU"],
            ["lists", "Hand-in lists"],
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
      {tab === "lists" ? <HandInLists /> : <Queue ready={tab === "ready"} />}
    </AdminShell>
  );
}

function Queue({ ready }: { ready: boolean }) {
  const site = useSite();
  const queryClient = useQueryClient();
  const status = ready ? "ready_at_msu" : "submitted_to_msu";
  const { data, refetch } = useQuery({
    queryKey: ["collections", status],
    queryFn: () => apiClient.listRequests({ status, order: "oldest_in_stage" }, 1),
  });
  const rows = (data?.results ?? []).filter((r) =>
    ready ? !!r.ready_at_msu_at : !r.ready_at_msu_at,
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collecting, setCollecting] = useState(false);
  const chosen = rows.filter((r) => selected.has(r.id));

  function refresh() {
    setSelected(new Set());
    refetch();
    queryClient.invalidateQueries({ queryKey: ["sidebar-counts"] });
  }

  async function markReady() {
    const res = await apiClient.setReadyAtMsu(Array.from(selected));
    toast.success(`${res.moved} marked ready at MSU`);
    refresh();
  }

  return (
    <div className="space-y-3">
      <Note tone="info">
        {ready
          ? "Documents MSU has released. Select the ones to collect, print the pick-up list for the trip, then mark them collected in one step."
          : "Requests handed in to MSU and not yet released. When MSU tells you by phone that documents are ready, mark them here."}
      </Note>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-ink-3">{chosen.length} selected</span>
        {ready ? (
          <>
            <Button
              variant="outline"
              disabled={!chosen.length}
              onClick={async () =>
                downloadBlob(
                  await pickupPdf(chosen, site),
                  `pick-up-list-${new Date().toISOString().slice(0, 10)}.pdf`,
                )
              }
            >
              <Printer /> Print pick-up list
            </Button>
            <Button variant="gold" disabled={!chosen.length} onClick={() => setCollecting(true)}>
              Mark {chosen.length || ""} collected from MSU
            </Button>
          </>
        ) : (
          <Button variant="gold" disabled={!chosen.length} onClick={markReady}>
            Mark ready at MSU
          </Button>
        )}
      </div>
      <Card className="overflow-x-auto">
        {!data ? (
          <div className="flex justify-center py-12 text-ink-3">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <Empty>{ready ? "Nothing is ready at MSU." : "Nothing is waiting at MSU."}</Empty>
        ) : (
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead className="border-b border-line text-[12px] uppercase tracking-wider text-ink-3">
              <tr>
                <th className="w-10 px-3 py-2.5">
                  <Checkbox
                    aria-label="Select all"
                    checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
                    onCheckedChange={(v) =>
                      setSelected(v ? new Set(rows.map((r) => r.id)) : new Set())
                    }
                  />
                </th>
                <th className="px-3 py-2.5">Graduate</th>
                <th className="px-3 py-2.5">Documents</th>
                <th className="px-3 py-2.5">Hand-in</th>
                <th className="px-3 py-2.5">Days with MSU</th>
                <th className="px-3 py-2.5">Stage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r: RequestRow) => (
                <tr key={r.id} className="hover:bg-ground">
                  <td className="px-3 py-2.5">
                    <Checkbox
                      checked={selected.has(r.id)}
                      onCheckedChange={(v) => {
                        const next = new Set(selected);
                        if (v) next.add(r.id);
                        else next.delete(r.id);
                        setSelected(next);
                      }}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      to="/admin/requests/$requestId"
                      params={{ requestId: r.id }}
                      className="font-semibold hover:underline"
                    >
                      {r.full_name}
                    </Link>
                    <div className="text-[12px] text-ink-3">
                      {r.reference_number} · {r.reg_number}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">{r.documents}</td>
                  <td className="px-3 py-2.5">{r.handin_number ?? "—"}</td>
                  <td className="px-3 py-2.5">
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
                      {r.days_in_stage}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <StageChip status={r.ready_at_msu_at ? "ready_at_msu" : r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {collecting && (
        <StatusMoveDialog
          open
          target={{ ids: Array.from(selected) }}
          count={selected.size}
          status="collected_from_msu"
          currentStatus="submitted_to_msu"
          onClose={() => setCollecting(false)}
          onDone={refresh}
        />
      )}
    </div>
  );
}

function HandInLists() {
  const site = useSite();
  const { data } = useQuery({ queryKey: ["handin-lists"], queryFn: () => apiClient.handinLists() });

  async function pdf(id: string, number: string) {
    try {
      downloadBlob(await handinPdf(await apiClient.handinList(id), site), `hand-in-${number}.pdf`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build the list");
    }
  }

  return (
    <Card className="overflow-x-auto">
      {!data ? (
        <div className="flex justify-center py-12 text-ink-3">
          <Spinner />
        </div>
      ) : data.length === 0 ? (
        <Empty>
          No hand-in lists yet. One is made each time requests move to Submitted to MSU.
        </Empty>
      ) : (
        <table className="w-full min-w-[600px] text-left text-[13px]">
          <thead className="border-b border-line text-[12px] uppercase tracking-wider text-ink-3">
            <tr>
              <th className="px-4 py-2.5">List</th>
              <th className="px-4 py-2.5">Requests</th>
              <th className="px-4 py-2.5">By</th>
              <th className="px-4 py-2.5">When</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2.5 font-mono font-semibold">
                  <Link
                    to="/admin/requests"
                    search={{ handin: l.number, page: 1 }}
                    className="text-navy underline"
                  >
                    {l.number}
                  </Link>
                </td>
                <td className="px-4 py-2.5 tabular">{l.request_count}</td>
                <td className="px-4 py-2.5">{l.created_by}</td>
                <td className="px-4 py-2.5 text-ink-3">{formatDate(l.created_at)}</td>
                <td className="px-4 py-2.5 text-right">
                  <Button size="sm" variant="outline" onClick={() => pdf(l.id, l.number)}>
                    <Download /> A4 list for MSU
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
