import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AdminShell } from "@/components/admin-shell";
import { Card, CardHeader, Empty, KpiTile, StageChip, Spinner } from "@/components/ds";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";
import { money, statusLabel, STATUSES } from "@/lib/msu";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [{ title: "Overview — MSU Transcript admin" }, { name: "robots", content: "noindex" }],
  }),
  component: Overview,
});

const FUNNEL_LABELS: Record<string, string> = {
  home: "Home page",
  step1: "Step 1: details",
  step2: "Step 2: clearance",
  step3: "Step 3: delivery",
  step4: "Step 4: check",
  submitted: "Submitted",
};

function Overview() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["overview", from, to],
    queryFn: () => apiClient.overview({ date_from: from, date_to: to }),
  });

  return (
    <AdminShell
      title="Overview"
      actions={
        <div className="flex items-center gap-2 text-[13px] text-ink-3">
          <label className="flex items-center gap-1.5">
            From{" "}
            <Input
              type="date"
              className="h-9 w-[150px]"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-1.5">
            To{" "}
            <Input
              type="date"
              className="h-9 w-[150px]"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
      }
    >
      {isLoading || !data ? (
        <div className="flex justify-center py-20 text-ink-3">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <KpiTile label="Open requests" value={data.open} />
            <KpiTile label="New today" value={data.new_today} />
            <KpiTile label="New this week" value={data.new_this_week} />
            <KpiTile
              label="Cash received this week"
              value={money(data.cash.received_this_week)}
              hint={`Expected from batches: ${money(data.cash.expected_this_week)}`}
            />
            <KpiTile
              label="Cash still out"
              value={money(data.cash.outstanding)}
              tone={Number(data.cash.outstanding) > 0 ? "gold" : undefined}
              hint="Dispatched or delivered, unpaid"
            />
          </div>

          <Card className="p-5">
            <CardHeader title={`Requests by stage${from || to ? " (submitted in range)" : ""}`} />
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {STATUSES.map((s) => (
                <Link
                  key={s}
                  to="/admin/requests"
                  search={{ status: s, date_from: from, date_to: to }}
                  className="rounded-xl border border-line p-3 hover:bg-ground"
                >
                  <StageChip status={s} />
                  <div className="mt-2 text-[26px] font-semibold tabular">
                    {data.by_status[s] ?? 0}
                  </div>
                  <div className="text-[12px] text-ink-3">
                    {data.avg_days_per_stage[s] != null
                      ? `${data.avg_days_per_stage[s]} days on average`
                      : " "}
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <Card className="p-5">
              <CardHeader
                title="Stuck past their red limit"
                action={<span className="text-[13px] text-ink-3">{data.stuck.length}</span>}
              />
              {data.stuck.length === 0 ? (
                <Empty>Nothing is stuck. Every request is within its stage limit.</Empty>
              ) : (
                <ul className="mt-3 divide-y divide-line">
                  {data.stuck.slice(0, 15).map((r) => (
                    <li key={r.id}>
                      <Link
                        to="/admin/requests/$requestId"
                        params={{ requestId: r.id }}
                        className="flex items-center justify-between gap-3 py-2.5 hover:bg-ground"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{r.full_name}</span>
                          <span className="block text-[12px] text-ink-3">{r.reference_number}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          <StageChip status={r.status} />
                          <span className="w-16 text-right font-semibold text-danger tabular">
                            {r.days} days
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <div className="space-y-5">
              <Card className="p-5">
                <CardHeader title="Deliveries per driver" />
                {data.deliveries_per_driver.length === 0 ? (
                  <Empty>No Harare deliveries in this period.</Empty>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {data.deliveries_per_driver.map((d) => (
                      <Bar
                        key={d.driver}
                        label={d.driver}
                        value={d.deliveries}
                        max={data.deliveries_per_driver[0]!.deliveries}
                      />
                    ))}
                  </ul>
                )}
              </Card>
              <Card className="p-5">
                <CardHeader title="Request form, last 7 days" />
                <p className="mt-1 text-[12px] text-ink-3">
                  Visitors reaching each step (no cookies, no personal data).
                </p>
                <ul className="mt-3 space-y-2">
                  {data.funnel.map((f) => (
                    <Bar
                      key={f.step}
                      label={FUNNEL_LABELS[f.step] ?? f.step}
                      value={f.visits}
                      max={Math.max(
                        1,
                        data.funnel[0]?.visits ?? 1,
                        ...data.funnel.map((x) => x.visits),
                      )}
                    />
                  ))}
                </ul>
              </Card>
            </div>
          </div>
          <p className="text-[12px] text-ink-3">
            Average days per stage are worked out from each request&apos;s history. Stage limits are
            set in Settings. {statusLabel("received")} counts include requests not yet submitted to
            MSU.
          </p>
        </div>
      )}
    </AdminShell>
  );
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <li>
      <div className="flex justify-between text-[13px]">
        <span>{label}</span>
        <span className="font-semibold tabular">{value}</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-ground">
        <div
          className="h-2 rounded-full bg-navy"
          style={{ width: `${max ? (value / max) * 100 : 0}%` }}
        />
      </div>
    </li>
  );
}
