import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { apiClient, type StatusResult } from "@/lib/api-client";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { TrackingStepper } from "@/components/tracking-stepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, statusClasses, statusLabel } from "@/lib/msu";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";

export const Route = createFileRoute("/status")({
  head: () => ({
    meta: [
      { title: "Check Request Status — MSU Transcript Collection" },
      {
        name: "description",
        content:
          "Enter your reference number and registration number to check your transcript request status.",
      },
      { property: "og:title", content: "Check Request Status" },
      { property: "og:description", content: "Check your MSU transcript request status." },
    ],
  }),
  component: StatusPage,
});

function StatusPage() {
  const [ref, setRef] = useState("");
  const [reg, setReg] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StatusResult | null>(null);
  const [searched, setSearched] = useState(false);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSearched(true);
    setResult(null);
    try {
      const row = await apiClient.lookupStatus(ref.trim(), reg.trim());
      setResult(row);
      if (!row) toast.error("No matching request found");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <SiteHeader />
      <main className="mx-auto max-w-xl px-4 py-10">
        <h1 className="text-2xl font-semibold">Check your request status</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter both your reference number and registration number.
        </p>

        <form onSubmit={search} className="mt-6 space-y-4 rounded-lg border bg-card p-6">
          <div>
            <Label>Reference Number</Label>
            <Input
              className="mt-1.5"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="MSU-2026-000000"
              required
            />
          </div>
          <div>
            <Label>Registration Number</Label>
            <Input
              className="mt-1.5"
              value={reg}
              onChange={(e) => setReg(e.target.value)}
              placeholder="R123456X"
              required
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            Check status
          </Button>
        </form>

        {result && (
          <div className="mt-6 rounded-lg border bg-card p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-mono text-sm text-muted-foreground">
                  {result.reference_number}
                </div>
                <div className="mt-1 text-lg font-semibold">{result.full_name}</div>
                <div className="text-sm text-muted-foreground">{result.programme_name}</div>
              </div>
              <span
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${statusClasses(result.status)}`}
              >
                {statusLabel(result.status)}
              </span>
            </div>

            <TrackingStepper result={result} />

            <dl className="mt-6 grid gap-2 border-t pt-5 text-sm">
              <Row
                k="Delivery"
                v={
                  result.zone === "harare"
                    ? "Harare (Cash on Delivery)"
                    : "Outside Harare (Cash Deposit)"
                }
              />
              <Row k="Fee" v={`US$${result.fee_amount}`} />
              <Row k="Paid" v={result.paid ? "Yes" : "Not yet"} />
              <Row k="Submitted" v={formatDate(result.created_at)} />
            </dl>
          </div>
        )}

        {searched && !loading && !result && (
          <div className="mt-6 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No request matches that reference + registration number. Double-check both.
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b pb-2 last:border-0">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
