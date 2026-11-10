import type { MonthlyReport } from "@/lib/api-client";
import { Card, CardHeader, Empty, KpiTile } from "@/components/ds";

/** The monthly report for MSU (B10.4), shared by the admin Reports page and
 *  the MSU staff portal. */
export function MonthlyReportView({ report }: { report: MonthlyReport }) {
  const days = (v: number | null) => (v == null ? "—" : `${v}`);
  const maxReason = Math.max(1, ...report.rejected_by_reason.map((r) => r.count));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Handed in to MSU" value={report.handed_in} />
        <KpiTile label="Released by MSU" value={report.released} />
        <KpiTile
          label="Rejected by MSU"
          value={report.rejected}
          tone={report.rejected ? "danger" : undefined}
        />
        <KpiTile
          label="Average days end to end"
          value={days(report.avg_days_end_to_end)}
          hint="Submitted to collected"
        />
        <KpiTile label="Average days with MSU" value={days(report.avg_days_with_msu)} />
        <KpiTile label="Longest days with MSU" value={days(report.longest_days_with_msu)} />
        <KpiTile label="Harare deliveries" value={report.deliveries.harare ?? 0} />
        <KpiTile label="Zimpost deliveries" value={report.deliveries.outside_harare ?? 0} />
      </div>
      <Card className="p-5">
        <CardHeader title="Rejections by reason" />
        {report.rejected_by_reason.length === 0 ? (
          <Empty>No rejections this month.</Empty>
        ) : (
          <ul className="mt-3 space-y-2">
            {report.rejected_by_reason.map((r) => (
              <li key={r.reason}>
                <div className="flex justify-between text-[13px]">
                  <span>{r.reason}</span>
                  <span className="font-semibold tabular">{r.count}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-ground">
                  <div
                    className="h-2 rounded-full bg-danger"
                    style={{ width: `${(r.count / maxReason) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
