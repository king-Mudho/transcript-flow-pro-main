import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  FileText,
  MessageCircle,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Card, Field, Note, TextInput } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { useWhatsAppUrl } from "@/components/whatsapp-contact";
import { money, normaliseReg } from "@/lib/msu";
import { trackStep, useSite } from "@/lib/site";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MSU Transcript Collection Solution — your transcript, delivered" },
      {
        name: "description",
        content:
          "Request your MSU transcript or certificate online. We collect it from MSU and deliver it to your door in Harare or any Zimpost branch.",
      },
    ],
  }),
  component: Home,
});

const STEPS = [
  ["Request online", "Your details, your clearance and where to deliver."],
  [
    "We collect from MSU",
    "We submit your request to MSU and collect your document once it is released.",
  ],
  [
    "We deliver it",
    "A driver brings it to your door in Harare, or we send it to your Zimpost branch.",
  ],
  [
    "Pay and receive",
    "Pay in cash when it reaches you. Follow every step with your reference number.",
  ],
] as const;

function Home() {
  const site = useSite();
  const wa = useWhatsAppUrl();

  useEffect(() => trackStep("home"), []);

  const faqs: [string, string][] = [
    [
      "How do I pay?",
      "In cash. In Harare, pay the driver when your document is handed to you. Outside Harare, pay the deposit once your document reaches our Harare hub, before it goes to Zimpost.",
    ],
    [
      "What if MSU rejects my request?",
      "We tell you why on your tracking page and by message, usually a clearance that is not approved yet. You owe nothing for a rejected request. Once the office approves you on the portal, send a new request.",
    ],
    [
      "Can someone else receive it for me?",
      "Yes. In Harare, anyone at the address can receive it and pay the driver; tell us their name on WhatsApp first. At a Zimpost branch, the branch's own rules for collecting on someone's behalf apply.",
    ],
    [
      "I lost my reference number",
      "Go to Track a request and choose Lost your reference number. Enter your registration number and the mobile number you used, and we show your reference.",
    ],
  ];

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader action="track" />
      <main id="main">
        {/* Hero */}
        <section className="bg-navy text-white">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-10 pt-6 md:px-6 md:pb-20 md:pt-16 lg:grid-cols-[1fr_400px] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[13px] font-medium">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gold" />
                For Midlands State University graduates
              </div>
              <h1 className="mt-5 text-[40px] font-bold leading-[1.05] tracking-tight md:text-[56px]">
                Your transcript,
                <span className="block text-gold">delivered to you.</span>
              </h1>
              <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-white/85">
                Request your transcript or certificate online. We collect it from MSU and bring it
                to your door in Harare, or send it to any Zimpost branch in Zimbabwe.
              </p>
              <div className="mt-7 grid gap-3 sm:flex">
                <Button asChild variant="gold" size="lg">
                  <Link to="/request">
                    Start a request <ArrowRight />
                  </Link>
                </Button>
                <Button asChild variant="outline-light" size="lg" className="lg:hidden">
                  <Link to="/status">Track a request</Link>
                </Button>
                <Button asChild variant="outline-light" size="lg" className="hidden lg:inline-flex">
                  <a href="#prices">See prices</a>
                </Button>
              </div>
              <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
                <PriceStat value={money(site.fee_harare)} label="Harare doorstep, per request" />
                <PriceStat value={money(site.fee_outside)} label="Zimpost branch, per request" />
                <PriceStat
                  value="Cash"
                  label="Pay when it reaches you"
                  className="hidden sm:block"
                />
              </dl>
            </div>
            <div className="hidden lg:block">
              <HeroTrackCard />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-20 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-20">
            <p className="eyebrow">How it works</p>
            <h2 className="mt-2 text-[28px] font-bold leading-tight md:text-[32px]">
              Four steps, no trip to campus
            </h2>
            <ol className="mt-8 grid gap-6 md:grid-cols-4 md:gap-6">
              {STEPS.map(([title, text], i) => (
                <li
                  key={title}
                  className={`flex gap-4 md:block md:border-t-2 md:pt-4 ${i === 3 ? "md:border-gold" : "md:border-navy"}`}
                >
                  <span
                    aria-hidden
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-tint text-[16px] font-semibold text-navy md:hidden"
                  >
                    {i + 1}
                  </span>
                  <div>
                    <p
                      className={`hidden text-[12px] font-semibold uppercase tracking-wider md:block ${i === 3 ? "text-warn-ink" : "text-ink-3"}`}
                    >
                      Step {i + 1}
                    </p>
                    <h3 className="text-[17px] font-semibold md:mt-2 md:text-[18px]">{title}</h3>
                    <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Prices */}
        <section id="prices" className="scroll-mt-20 bg-ground">
          <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-20">
            <p className="eyebrow">Prices</p>
            <h2 className="mt-2 text-[28px] font-bold leading-tight md:text-[32px]">
              One price per request
            </h2>
            <p className="mt-2 text-[16px] text-ink-2">
              The fee covers every document in the request, whether you need one or several.
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <PriceCard
                title="Harare doorstep"
                tag="Cash on delivery"
                price={money(site.fee_harare)}
                points={[
                  "Delivered to your address",
                  "See your driver's name and number while it is on the way",
                ]}
              />
              <PriceCard
                title="Zimpost branch"
                tag="Cash deposit"
                price={money(site.fee_outside)}
                points={[
                  "Any Zimpost branch in Zimbabwe",
                  "Zimpost tracking number on your tracking page",
                ]}
              />
              <div className="hidden md:block">
                <ReadyList />
              </div>
            </div>
          </div>
        </section>

        {/* Before you start (phones) */}
        <section className="bg-white md:hidden">
          <div className="mx-auto max-w-6xl px-4 py-12">
            <p className="eyebrow">Before you start</p>
            <h2 className="mt-2 text-[28px] font-bold">Have these ready</h2>
            <ul className="mt-5 space-y-3 text-[16px] text-ink-2">
              <ReadyItem icon={ShieldCheck}>
                Approval from your Department, Accounts and the Library on the student portal
              </ReadyItem>
              <ReadyItem icon={FileText}>Your registration number and programme</ReadyItem>
              <ReadyItem icon={Phone}>A phone number we can reach you on</ReadyItem>
            </ul>
            <Note tone="warn" icon={false} className="mt-5 text-[15px]">
              Not cleared yet? MSU will reject the request, so check the student portal first.
            </Note>

            <Card className="mt-8 border-gold/40 bg-gold-tint p-6">
              <h3 className="text-[18px] font-semibold">Already sent a request?</h3>
              <p className="mt-2 text-[16px] text-ink-2">
                Use your reference number and registration number to see exactly where your document
                is.
              </p>
              <Button asChild variant="navy" size="lg" className="mt-4 w-full">
                <Link to="/status">Track a request</Link>
              </Button>
            </Card>
          </div>
        </section>

        {/* Questions */}
        <section id="questions" className="scroll-mt-20 bg-white">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 pb-14 md:grid-cols-[320px_1fr] md:px-6 md:py-20">
            <div>
              <p className="eyebrow">Questions</p>
              <h2 className="mt-2 hidden text-[32px] font-bold md:block">Good to know</h2>
              <p className="mt-2 hidden text-[15px] text-ink-2 md:block">
                Something else?{" "}
                <a
                  href={wa.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-navy underline"
                >
                  WhatsApp us on {wa.display}
                </a>
                .
              </p>
            </div>
            <div>
              <Card className="divide-y divide-line overflow-hidden">
                {faqs.map(([q, a], i) => (
                  <details key={q} className="group" open={i === 0}>
                    <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[16px] font-semibold [&::-webkit-details-marker]:hidden">
                      {q}
                      <ChevronDown
                        aria-hidden
                        className="h-5 w-5 shrink-0 text-ink-3 transition-transform group-open:rotate-180"
                      />
                    </summary>
                    <p className="px-5 pb-5 text-[16px] leading-relaxed text-ink-2">{a}</p>
                  </details>
                ))}
              </Card>
              <Card className="mt-6 flex items-center gap-4 p-5 md:hidden">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-success-tint text-whatsapp">
                  <MessageCircle className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[16px] font-semibold">Need help?</div>
                  <div className="text-[14px] text-ink-3">WhatsApp us on {wa.display}</div>
                </div>
                <Button asChild variant="outline" size="default" className="h-11">
                  <a href={wa.url} target="_blank" rel="noopener noreferrer">
                    Chat
                  </a>
                </Button>
              </Card>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function PriceStat({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={`border-t border-white/20 pt-3 ${className ?? ""}`}>
      <dt className="sr-only">{label}</dt>
      <dd className="text-[24px] font-bold tabular">{value}</dd>
      <dd className="text-[14px] text-white/75">{label}</dd>
    </div>
  );
}

function PriceCard({
  title,
  tag,
  price,
  points,
}: {
  title: string;
  tag: string;
  price: string;
  points: string[];
}) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[17px] font-semibold">{title}</h3>
        <span className="rounded-md border border-line bg-ground px-2 py-0.5 text-[12px] font-medium text-ink-2">
          {tag}
        </span>
      </div>
      <p className="mt-3">
        <span className="text-[40px] font-bold leading-none tabular">{price}</span>
        <span className="ml-2 text-[14px] text-ink-3">per request</span>
      </p>
      <ul className="mt-4 space-y-2">
        {points.map((p) => (
          <li key={p} className="flex gap-2.5 text-[15px] text-ink-2">
            <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            {p}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ReadyList() {
  return (
    <Card className="h-full border-gold/40 bg-gold-tint p-6">
      <h3 className="text-[17px] font-semibold">Have these ready</h3>
      <ul className="mt-3 space-y-3 text-[15px] text-ink-2">
        <li>Approval from your Department, Accounts and the Library on the student portal</li>
        <li>Your registration number and programme</li>
        <li>A phone number we can reach you on</li>
      </ul>
      <p className="mt-4 text-[14px] text-warn-ink">
        Not cleared yet? MSU will reject the request, so check the student portal first.
      </p>
    </Card>
  );
}

function ReadyItem({
  icon: Icon,
  children,
}: {
  icon: typeof ShieldCheck;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-navy" />
      <span>{children}</span>
    </li>
  );
}

function HeroTrackCard() {
  const navigate = useNavigate();
  const [ref, setRef] = useState("");
  const [reg, setReg] = useState("");
  return (
    <Card className="p-6 text-ink shadow-xl">
      <h2 className="text-[20px] font-semibold">Track your request</h2>
      <p className="mt-1 text-[14px] text-ink-3">Use the reference number we gave you.</p>
      <form
        className="mt-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          navigate({
            to: "/status",
            search: { ref: ref.trim().toUpperCase(), reg: normaliseReg(reg) },
          });
        }}
      >
        <Field label="Reference number">
          <TextInput
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="MSU-2026-000000"
            required
          />
        </Field>
        <Field label="Registration number">
          <TextInput
            value={reg}
            onChange={(e) => setReg(e.target.value)}
            placeholder="R123456X"
            required
          />
        </Field>
        <Button type="submit" variant="navy" size="lg" className="w-full">
          Track
        </Button>
      </form>
      <Link
        to="/status"
        search={{ lost: true }}
        className="mt-4 block text-center text-[14px] text-ink-3 underline"
      >
        Lost your reference number?
      </Link>
    </Card>
  );
}
