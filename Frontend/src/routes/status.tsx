import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { AlertCircle, ChevronLeft, Download, Loader2, Phone } from "lucide-react";
import { apiClient, type StatusResult, type StatusValue } from "@/lib/api-client";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { summaryNow, TrackingStepper, documentWord } from "@/components/tracking-stepper";
import { Card, DefRow, Field, Note, StageChip, TextInput } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { WhatsAppButton, WhatsAppIcon, useWhatsAppUrl } from "@/components/whatsapp-contact";
import {
  formatPhone,
  formatTime,
  initials,
  money,
  normalisePhone,
  normaliseReg,
  waDigits,
} from "@/lib/msu";
import { confirmationPdf } from "@/lib/pdf";
import { useSite } from "@/lib/site";
import { toast } from "sonner";

const searchSchema = z.object({
  ref: z.string().optional().catch(undefined),
  reg: z.string().optional().catch(undefined),
  lost: z.boolean().optional().catch(undefined),
});

export const Route = createFileRoute("/status")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Track your request — MSU Transcript Collection" },
      {
        name: "description",
        content:
          "Enter your reference and registration number to see exactly where your document is.",
      },
    ],
  }),
  component: StatusPage,
});

function StatusPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/status" });
  const [ref, setRef] = useState(search.ref ?? "");
  const [reg, setReg] = useState(search.reg ?? "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StatusResult | null>(null);
  const [notFound, setNotFound] = useState(false);

  async function lookup(r: string, g: string) {
    setLoading(true);
    setNotFound(false);
    try {
      const row = await apiClient.lookupStatus(r.trim().toUpperCase(), normaliseReg(g));
      setResult(row);
      setNotFound(!row);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (search.ref) setRef(search.ref);
    if (search.ref && search.reg) lookup(search.ref, search.reg);
  }, [search.ref, search.reg]);

  if (result) {
    return (
      <Shell>
        <button
          type="button"
          onClick={() => {
            setResult(null);
            navigate({ search: {} });
          }}
          className="mb-4 inline-flex h-11 items-center gap-1 rounded-lg pr-2 text-[16px] font-medium text-ink-2 hover:text-ink"
        >
          <ChevronLeft className="h-5 w-5" /> Track another request
        </button>
        <TrackingResult result={result} reg={normaliseReg(reg)} />
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-[28px] font-bold">Track your request</h1>
      <p className="mt-2 text-[16px] text-ink-2">
        Enter the reference number we gave you and your registration number.
      </p>
      <form
        className="mt-6 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          navigate({ search: { ref: ref.trim().toUpperCase(), reg: normaliseReg(reg) } });
          lookup(ref, reg);
        }}
      >
        <Field label="Reference number" htmlFor="ref">
          <TextInput
            id="ref"
            autoCapitalize="characters"
            placeholder="MSU-2026-000000"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            required
          />
        </Field>
        <Field label="Registration number" htmlFor="reg">
          <TextInput
            id="reg"
            autoCapitalize="characters"
            placeholder="R123456X"
            value={reg}
            onChange={(e) => setReg(e.target.value)}
            required
          />
        </Field>
        {notFound && (
          <Note tone="danger">
            No request matches that reference and registration number. Check both and try again.
          </Note>
        )}
        <Button type="submit" variant="gold" size="lg" className="w-full" disabled={loading}>
          {loading && <Loader2 className="animate-spin" />} Track
        </Button>
      </form>

      <LostReference
        open={!!search.lost}
        onFound={(found) => {
          setRef(found);
          toast.success(`Your reference is ${found}`);
        }}
        prefillReg={reg}
      />

      <HelpLine />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ground">
      <SiteHeader action="new" />
      <main id="main" className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-10">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

function HelpLine() {
  const wa = useWhatsAppUrl();
  return (
    <p className="mt-8 text-center text-[14px] text-ink-3">
      Need help?{" "}
      <a
        href={wa.url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-navy underline"
      >
        WhatsApp {wa.display}
      </a>
    </p>
  );
}

function LostReference({
  open,
  onFound,
  prefillReg,
}: {
  open: boolean;
  onFound: (ref: string) => void;
  prefillReg: string;
}) {
  const [reg, setReg] = useState(prefillReg);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<{ reference_number: string; status: StatusValue }[] | null>(
    null,
  );

  async function find(e: React.FormEvent) {
    e.preventDefault();
    const normalised = normalisePhone(phone);
    if (!normalised) {
      toast.error("Enter the mobile number you used, for example 77 123 4567.");
      return;
    }
    setBusy(true);
    try {
      const rows = await apiClient.findReference(normaliseReg(reg), normalised);
      setFound(rows);
      if (rows[0]) onFound(rows[0].reference_number);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not search");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="group mt-8 rounded-xl border border-line bg-white" open={open}>
      <summary className="flex min-h-[56px] cursor-pointer list-none items-center px-5 text-[17px] font-semibold [&::-webkit-details-marker]:hidden">
        Lost your reference number?
      </summary>
      <form onSubmit={find} className="space-y-5 px-5 pb-5">
        <p className="text-[15px] text-ink-2">
          Find it with your registration number and the mobile number you used on the request.
        </p>
        <Field label="Registration number">
          <TextInput value={reg} onChange={(e) => setReg(e.target.value)} required />
        </Field>
        <Field label="Mobile number">
          <div className="flex gap-2">
            <span className="flex h-12 w-[84px] shrink-0 items-center justify-center rounded-lg border border-line bg-ground text-[16px] text-ink-2">
              +263
            </span>
            <TextInput
              type="tel"
              inputMode="tel"
              placeholder="77 123 4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>
        </Field>
        <Button type="submit" variant="navy" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Find my reference
        </Button>
        {found && found.length === 0 && (
          <Note tone="warn">
            Nothing matches that registration and mobile number. WhatsApp us and we will help.
          </Note>
        )}
        {found && found.length > 0 && (
          <Note tone="success" icon={false}>
            {found.map((f) => (
              <div key={f.reference_number}>
                <Link
                  to="/status"
                  search={{ ref: f.reference_number, reg: normaliseReg(reg) }}
                  className="font-semibold underline"
                >
                  {f.reference_number}
                </Link>
              </div>
            ))}
            <div className="mt-1 text-[14px]">Tap a reference to track it.</div>
          </Note>
        )}
      </form>
    </details>
  );
}

function TrackingResult({ result, reg }: { result: StatusResult; reg: string }) {
  const site = useSite();
  const fee = money(result.fee_amount);
  const now = summaryNow(result, fee);
  const harare = result.zone === "harare";
  const delivery = harare
    ? "Harare doorstep"
    : `Zimpost ${result.branch?.branch_name ?? ""}`.trim();

  async function downloadConfirmation() {
    try {
      const blob = await confirmationPdf(
        {
          reference: result.reference_number,
          name: result.full_name,
          reg,
          phone: "",
          documents: result.documents,
          zone: result.zone,
          deliverTo: result.deliver_to,
          fee: Number(result.fee_amount),
          trackUrl: `${window.location.origin}/status?ref=${result.reference_number}`,
        },
        site,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `confirmation-${result.reference_number}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error("Could not make the PDF.");
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="font-mono text-[15px] tracking-wide text-ink-3">
            {result.reference_number}
          </span>
          <StageChip status={result.status} />
        </div>
        <h1 className="mt-1 text-[24px] font-bold">{result.full_name}</h1>
        <p className="text-[15px] text-ink-3">
          {result.documents} · {delivery}
        </p>
        {result.status !== "rejected" && (
          <p
            className="mt-4 rounded-lg bg-gold-tint px-4 py-3 text-[15px] text-warn-ink"
            aria-live="polite"
          >
            <strong className="font-semibold text-ink">{now.lead}</strong> {now.text}
          </p>
        )}
      </Card>

      {result.driver && <DriverCard driver={result.driver} />}

      {result.status === "rejected" && <RejectionPanel result={result} />}

      <Card className="p-5">
        <h2 className="text-[17px] font-semibold">Progress</h2>
        <TrackingStepper result={result} />
      </Card>

      {result.status !== "rejected" && (
        <Card className="p-5">
          <h2 className="text-[17px] font-semibold">Delivery and payment</h2>
          <dl className="mt-3">
            {result.deliver_to && <DefRow k="Deliver to" v={result.deliver_to} />}
            <DefRow k="To pay" v={`${fee} ${harare ? "cash on delivery" : "cash deposit"}`} />
            <DefRow
              k="Paid"
              v={
                result.paid
                  ? "Yes"
                  : result.amount_paid > 0
                    ? `${money(result.amount_paid)} so far`
                    : "Not yet"
              }
            />
          </dl>
          {result.address_editable && (
            <Note tone="info" icon={false} className="mt-4">
              Wrong {harare ? "address" : "branch"}? WhatsApp us before your document is dispatched
              and we will change it.
            </Note>
          )}
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <WhatsAppButton text={`Hello, my reference is ${result.reference_number}.`} />
        <Button variant="outline" size="lg" onClick={downloadConfirmation}>
          <Download /> Confirmation
        </Button>
      </div>
    </div>
  );
}

function DriverCard({ driver }: { driver: NonNullable<StatusResult["driver"]> }) {
  return (
    <Card className="border-2 border-navy p-5">
      <div className="eyebrow">Your driver</div>
      <div className="mt-3 flex items-center gap-4">
        {driver.photo_url ? (
          <img
            src={driver.photo_url}
            alt=""
            className="h-14 w-14 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gold-tint text-[18px] font-bold text-navy">
            {initials(driver.full_name)}
          </span>
        )}
        <div className="min-w-0">
          <div className="text-[18px] font-semibold">{driver.full_name}</div>
          <div className="text-[15px] text-ink-2">{formatPhone(driver.phone)}</div>
          <div className="text-[14px] text-ink-3">
            {driver.bike_registration ? `Bike ${driver.bike_registration} · ` : ""}out since{" "}
            {formatTime(driver.dispatched_at)}
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button asChild variant="navy" size="lg">
          <a href={`tel:${driver.phone}`}>
            <Phone /> Call
          </a>
        </Button>
        <Button asChild variant="outline" size="lg">
          <a
            href={`https://wa.me/${waDigits(driver.whatsapp_phone)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <WhatsAppIcon className="h-4 w-4 text-whatsapp" /> WhatsApp
          </a>
        </Button>
      </div>
      <p className="mt-3 text-[13px] text-ink-3">
        Driver details show only while your document is on its way.
      </p>
    </Card>
  );
}

function RejectionPanel({ result }: { result: StatusResult }) {
  const doc = documentWord(result);
  return (
    <Card className="border-danger/40 p-5">
      <div className="flex gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-tint text-danger">
          <AlertCircle className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-[18px] font-semibold">MSU could not release your {doc}</h2>
          {result.status_reason && (
            <p className="mt-1 text-[15px] text-ink-2">
              <strong className="text-ink">Reason:</strong> {result.status_reason}
            </p>
          )}
        </div>
      </div>
      <hr className="my-4 border-line" />
      <h3 className="text-[15px] font-semibold">What to do now</h3>
      <p className="mt-1 text-[15px] text-ink-2">
        Ask the office concerned to approve you on the student portal, then send a new request. You
        owe nothing for this one.
      </p>
      <div className="mt-4 grid gap-3">
        <Button asChild variant="gold" size="lg">
          <Link to="/request">Start a new request</Link>
        </Button>
        <WhatsAppButton
          label="Ask us on WhatsApp"
          text={`Hello, my request ${result.reference_number} was rejected.`}
        />
      </div>
    </Card>
  );
}
