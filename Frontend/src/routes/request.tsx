import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Copy, Download, MessageCircle, Share2 } from "lucide-react";
import { RequestFlow, type Submitted } from "@/components/request-flow";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { formatPhone, money } from "@/lib/msu";
import { confirmationPdf } from "@/lib/pdf";
import { useSite } from "@/lib/site";
import { useWhatsAppUrl } from "@/components/whatsapp-contact";
import { toast } from "sonner";

export const Route = createFileRoute("/request")({
  head: () => ({
    meta: [
      { title: "Request a document — MSU Transcript Collection" },
      {
        name: "description",
        content: "Request your MSU transcript or certificate in four short steps.",
      },
    ],
  }),
  component: RequestPage,
});

const DONE_KEY = "msu.request.done";

function RequestPage() {
  const navigate = useNavigate();
  const [done, setDone] = useState<Submitted | null>(null);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(DONE_KEY);
      if (raw) setDone(JSON.parse(raw) as Submitted);
    } catch {
      // ignore
    }
  }, []);

  if (done) {
    return (
      <Confirmation
        data={done}
        onNew={() => {
          window.sessionStorage.removeItem(DONE_KEY);
          setDone(null);
        }}
      />
    );
  }

  return (
    <RequestFlow
      onCancel={() => navigate({ to: "/" })}
      onSubmitted={(result) => {
        try {
          window.sessionStorage.setItem(DONE_KEY, JSON.stringify(result));
        } catch {
          // ignore
        }
        setDone(result);
        window.scrollTo({ top: 0 });
      }}
    />
  );
}

/** G06: the reference, ways to keep it, and what happens next. */
function Confirmation({ data, onNew }: { data: Submitted; onNew: () => void }) {
  const site = useSite();
  const wa = useWhatsAppUrl(`Hello, my reference is ${data.reference_number}.`);
  const [copied, setCopied] = useState(false);
  const first = data.name.split(/\s+/)[0];
  const trackUrl = `${window.location.origin}/status?ref=${data.reference_number}`;
  const harare = data.zone === "harare";
  const [refStart, refEnd] = [data.reference_number.slice(0, 9), data.reference_number.slice(9)];

  async function copy() {
    try {
      await navigator.clipboard.writeText(data.reference_number);
      setCopied(true);
      toast.success("Reference copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy. Write the reference down.");
    }
  }

  async function pdf() {
    return confirmationPdf(
      {
        reference: data.reference_number,
        name: data.name,
        reg: data.reg,
        phone: data.phone,
        documents: data.documents,
        zone: data.zone,
        deliverTo: data.deliverTo,
        fee: Number(data.fee_amount),
        trackUrl,
      },
      site,
    );
  }

  async function download() {
    try {
      const blob = await pdf();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `confirmation-${data.reference_number}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error("Could not make the PDF. Please try again.");
    }
  }

  async function saveToWhatsApp() {
    const text = `My ${site.short_name} request: ${data.reference_number}. Track it with my reg number at ${trackUrl}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: data.reference_number, text, url: trackUrl });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  // "transcript" / "certificate" for one document, "documents" for several.
  const count = (data.documents.match(/× (\d+)/g) ?? []).reduce(
    (n, m) => n + Number(m.slice(2)),
    0,
  );
  const docWord =
    count > 1 ? "documents" : data.documents.includes("certificate") ? "certificate" : "transcript";
  const it = count > 1 ? "them" : "it";

  const nextSteps = [
    "We submit your request to MSU.",
    `We collect your ${docWord} once MSU releases ${it}.`,
    harare
      ? `A driver brings ${it} to ${data.deliverTo}. You will see their name and number.`
      : `We send ${it} to ${data.deliverTo}. Your tracking page shows the Zimpost tracking number.`,
    harare
      ? `You pay ${money(data.fee_amount)} in cash when it is handed to you.`
      : `You pay the ${money(data.fee_amount)} deposit in cash once it reaches our Harare hub, before it goes to Zimpost.`,
  ];

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader action="track" />
      <main id="main" className="mx-auto max-w-xl px-4 py-8 sm:px-6">
        <div className="text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-tint text-success">
            <Check className="h-8 w-8" aria-hidden />
          </span>
          <h1 className="mt-4 text-[28px] font-bold">Request received</h1>
          <p className="mt-2 text-[16px] text-ink-2">
            Thank you, {first}. Keep your reference number. You need it, with your registration
            number, to track your request.
          </p>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border-2 border-navy p-5">
          <div className="min-w-0">
            <div className="eyebrow">Your reference</div>
            <div className="mt-1 font-bold leading-tight tracking-wide tabular text-[26px] sm:text-[28px]">
              <span className="block sm:inline">{refStart}</span>
              <span className="block sm:inline">{refEnd}</span>
            </div>
          </div>
          <Button variant="outline" size="lg" className="h-11 shrink-0 px-4" onClick={copy}>
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
          </Button>
        </div>

        <div className="mt-5 grid gap-3">
          <Button asChild variant="gold" size="lg">
            <Link to="/status" search={{ ref: data.reference_number }}>
              Track this request
            </Link>
          </Button>
          <Button variant="outline" size="lg" onClick={download}>
            <Download /> Download confirmation (PDF)
          </Button>
          <Button variant="outline" size="lg" onClick={saveToWhatsApp}>
            <Share2 /> Save it to WhatsApp
          </Button>
        </div>
        <p className="mt-3 text-center text-[14px] text-ink-3">
          We will text every update to {formatPhone(data.phone)}.
        </p>

        <hr className="my-7 border-line" />

        <h2 className="text-[20px] font-semibold">What happens next</h2>
        <ol className="mt-4 space-y-3.5">
          {nextSteps.map((text, i) => (
            <li key={i} className="flex gap-3 text-[16px] text-ink-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ground text-[13px] font-semibold text-ink">
                {i + 1}
              </span>
              <span className="pt-0.5">{text}</span>
            </li>
          ))}
        </ol>

        <a
          href={wa.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-7 flex gap-3 rounded-xl bg-ground p-4 text-[15px] text-ink-2 hover:bg-line/60"
        >
          <MessageCircle aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
          <span>Questions? WhatsApp {wa.display} and quote your reference.</span>
        </a>

        <button
          type="button"
          onClick={onNew}
          className="mt-6 block w-full text-center text-[14px] text-ink-3 underline"
        >
          Send another request
        </button>
      </main>
      <SiteFooter />
    </div>
  );
}
