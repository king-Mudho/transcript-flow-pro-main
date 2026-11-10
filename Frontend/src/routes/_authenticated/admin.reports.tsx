import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { Download, FileText } from "lucide-react";
import { AdminShell, useCurrentUser } from "@/components/admin-shell";
import { MonthlyReportView } from "@/components/monthly-report";
import { Card, Empty, Spinner, Tag } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";
import { downloadBlob, formatDate } from "@/lib/msu";
import { monthlyPdf } from "@/lib/pdf";
import { useSite } from "@/lib/site";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  validateSearch: z.object({ tab: z.enum(["monthly", "messages"]).catch("monthly") }),
  head: () => ({
    meta: [{ title: "Reports — MSU Transcript admin" }, { name: "robots", content: "noindex" }],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <AdminShell title="Reports">
      <div role="tablist" className="mb-4 flex gap-1">
        {(
          [
            ["monthly", "Monthly report for MSU"],
            ["messages", "Messages to graduates"],
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
      {tab === "monthly" ? <Monthly /> : <Messages />}
    </AdminShell>
  );
}

function Monthly() {
  const { data: user } = useCurrentUser();
  const site = useSite();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const { data, isLoading, error } = useQuery({
    queryKey: ["monthly", month],
    queryFn: () => apiClient.monthlyReport(month),
    enabled: !!user?.is_admin,
    retry: false,
  });

  if (user && !user.is_admin)
    return (
      <Card>
        <Empty>The monthly report is for admins.</Empty>
      </Card>
    );

  return (
    <div className="space-y-4">
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
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            disabled={!data}
            onClick={async () =>
              data && downloadBlob(await monthlyPdf(data, site), `msu-report-${month}.pdf`)
            }
          >
            <FileText /> PDF
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                downloadBlob(await apiClient.monthlyReportXlsx(month), `msu-report-${month}.xlsx`);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Export failed");
              }
            }}
          >
            <Download /> Excel
          </Button>
        </div>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-12 text-ink-3">
          <Spinner />
        </div>
      ) : error ? (
        <Card>
          <Empty>{(error as Error).message}</Empty>
        </Card>
      ) : (
        data && <MonthlyReportView report={data} />
      )}
    </div>
  );
}

function Messages() {
  const [filter, setFilter] = useState("failed");
  const { data } = useQuery({
    queryKey: ["notifications", filter],
    queryFn: () => apiClient.notifications(filter || undefined),
  });
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-9 rounded-lg border border-line bg-white px-2.5 text-[13px]"
          aria-label="Show"
        >
          <option value="failed">Failed</option>
          <option value="skipped">Not sent (no provider)</option>
          <option value="sent">Sent</option>
          <option value="">All</option>
        </select>
        <p className="text-[13px] text-ink-3">
          Each stage change sends an SMS and, where given, an email. Failed sends show here.
        </p>
      </div>
      <Card className="overflow-x-auto">
        {!data ? (
          <div className="flex justify-center py-12 text-ink-3">
            <Spinner />
          </div>
        ) : data.length === 0 ? (
          <Empty>No messages here.</Empty>
        ) : (
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead className="border-b border-line text-[12px] uppercase tracking-wider text-ink-3">
              <tr>
                <th className="px-4 py-2.5">When</th>
                <th className="px-4 py-2.5">Request</th>
                <th className="px-4 py-2.5">To</th>
                <th className="px-4 py-2.5">Message</th>
                <th className="px-4 py-2.5">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.map((n) => (
                <tr key={n.id} className="align-top">
                  <td className="px-4 py-2.5 text-ink-3">{formatDate(n.created_at)}</td>
                  <td className="px-4 py-2.5">
                    <Link
                      to="/admin/requests/$requestId"
                      params={{ requestId: n.request_id }}
                      className="font-mono text-navy underline"
                    >
                      {n.reference_number}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    {n.channel.toUpperCase()} · {n.recipient}
                  </td>
                  <td className="max-w-[360px] px-4 py-2.5 text-ink-2">{n.message}</td>
                  <td className="px-4 py-2.5">
                    <Tag
                      tone={
                        n.status === "sent"
                          ? "success"
                          : n.status === "failed"
                            ? "danger"
                            : "neutral"
                      }
                    >
                      {n.status === "skipped"
                        ? "Not sent"
                        : n.status === "sent"
                          ? "Sent"
                          : "Failed"}
                    </Tag>
                    {n.error && <div className="mt-1 text-[11px] text-ink-3">{n.error}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
