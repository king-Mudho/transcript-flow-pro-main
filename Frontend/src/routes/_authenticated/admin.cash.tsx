import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AdminShell } from "@/components/admin-shell";
import { Card, CardHeader, Empty, KpiTile, Tag } from "@/components/ds";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";
import { formatDate, money } from "@/lib/msu";

export const Route = createFileRoute("/_authenticated/admin/cash")({
  head: () => ({
    meta: [
      { title: "Cash and payments — MSU Transcript admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CashPage,
});

function CashPage() {
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const { data: report } = useQuery({
    queryKey: ["cash-report", day],
    queryFn: () => apiClient.cashReport(day),
  });
  const { data: open } = useQuery({
    queryKey: ["batches", "open"],
    queryFn: () => apiClient.listBatches("out_for_delivery"),
  });
  const { data: overview } = useQuery({
    queryKey: ["overview", "", ""],
    queryFn: () => apiClient.overview(),
  });

  const expected = report?.drivers.reduce((s, d) => s + Number(d.expected), 0) ?? 0;
  const handed = report?.drivers.reduce((s, d) => s + Number(d.handed_in), 0) ?? 0;

  return (
    <AdminShell
      title="Cash and payments"
      actions={
        <label className="flex items-center gap-2 text-[13px] text-ink-3">
          Day{" "}
          <Input
            type="date"
            className="w-[160px]"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </label>
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="Expected from drivers"
          value={money(expected)}
          hint="Batches closed this day"
        />
        <KpiTile label="Handed in" value={money(handed)} />
        <KpiTile
          label="Variance"
          value={money(handed - expected)}
          tone={handed - expected !== 0 ? "danger" : undefined}
        />
        <KpiTile
          label="Cash still out"
          value={money(overview?.cash.outstanding ?? 0)}
          tone="gold"
          hint="Dispatched or delivered, unpaid"
        />
      </div>

      <Card className="mt-5 p-5">
        <CardHeader title="Daily cash per driver" />
        {!report || report.drivers.length === 0 ? (
          <Empty>No batches were closed on this day.</Empty>
        ) : (
          <table className="mt-3 w-full text-left text-[13px]">
            <thead className="border-b border-line text-[12px] uppercase tracking-wider text-ink-3">
              <tr>
                <th className="py-2">Driver</th>
                <th className="py-2">Batches</th>
                <th className="py-2 text-right">Expected</th>
                <th className="py-2 text-right">Handed in</th>
                <th className="py-2 text-right">Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {report.drivers.map((d) => (
                <tr key={d.driver}>
                  <td className="py-2.5 font-semibold">{d.driver}</td>
                  <td className="py-2.5">
                    {d.batches.map((b) => (
                      <div key={b.id}>
                        <Link
                          to="/admin/batch/$batchId"
                          params={{ batchId: b.id }}
                          className="font-mono text-navy underline"
                        >
                          {b.batch_number}
                        </Link>
                        {b.note && <span className="text-ink-3"> · {b.note}</span>}
                      </div>
                    ))}
                  </td>
                  <td className="py-2.5 text-right tabular">{money(d.expected)}</td>
                  <td className="py-2.5 text-right tabular">{money(d.handed_in)}</td>
                  <td
                    className={`py-2.5 text-right font-semibold tabular ${Number(d.variance) !== 0 ? "text-danger" : "text-success"}`}
                  >
                    {money(d.variance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="mt-5 p-5">
        <CardHeader title="Batches still out" action={<Tag tone="info">{open?.length ?? 0}</Tag>} />
        {!open || open.length === 0 ? (
          <Empty>No batches are out.</Empty>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {open.map((b) => (
              <li key={b.id} className="flex items-center justify-between py-2.5">
                <Link
                  to="/admin/batch/$batchId"
                  params={{ batchId: b.id }}
                  className="font-mono font-semibold text-navy underline"
                >
                  {b.batch_number}
                </Link>
                <span className="text-[13px] text-ink-3">
                  {b.driver.full_name} · {b.delivered}/{b.document_count} delivered ·{" "}
                  {money(b.cash_to_collect)} so far · out {formatDate(b.dispatched_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="mt-4 text-[12px] text-ink-3">
        Deposits for Zimpost and other single payments are recorded on each request with Record
        payment.{" "}
        <Link
          to="/admin/requests"
          search={{
            zone: "outside_harare",
            payment: "unpaid",
            status: "collected_from_msu",
            page: 1,
          }}
          className="underline"
        >
          See unpaid deposits
        </Link>
        .
      </p>
    </AdminShell>
  );
}
