import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, MapPin, ShieldCheck, Truck } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MSU Transcript Collection Solution — Request Your Transcript" },
      {
        name: "description",
        content:
          "MSU graduates: request delivery of your transcripts and certificates to Harare or your nearest Zimpost branch.",
      },
      {
        property: "og:title",
        content: "MSU Transcript Collection Solution — Request Your Transcript",
      },
      {
        property: "og:description",
        content:
          "MSU graduates: request delivery of your transcripts and certificates to Harare or your nearest Zimpost branch.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        <section className="border-b bg-gradient-to-b from-primary to-primary/95 text-primary-foreground">
          <div className="mx-auto max-w-6xl px-4 py-20 md:py-28">
            <div className="max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-gold" />
                For Midlands State University Students
              </div>
              <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl md:text-6xl">
                Your transcript,
                <span className="block text-gold">delivered to you.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base text-primary-foreground/80 md:text-lg">
                MSU graduates can request delivery of their transcripts and certificates — pick up
                in Harare or receive via Zimpost at any branch countrywide.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" className="bg-gold text-gold-foreground hover:bg-gold/90">
                  <Link to="/request">
                    Start a request <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-white/30 bg-transparent text-primary-foreground hover:bg-white/10"
                >
                  <Link to="/status">Check request status</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-semibold">How it works</h2>
          <p className="mt-1 text-muted-foreground">
            Simple, transparent, and built for graduates in every corner of Zimbabwe.
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              {
                icon: ShieldCheck,
                title: "1. Confirm clearance",
                body: "Confirm you've been cleared online by your Department, Accounts and the Library.",
              },
              {
                icon: MapPin,
                title: "2. Choose delivery",
                body: "Pick up in Harare or select your nearest Zimpost branch outside Harare.",
              },
              {
                icon: Truck,
                title: "3. Track & collect",
                body: "Get a reference number, pay cash on delivery/deposit, and collect your document.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-lg border bg-card p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/5 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t bg-muted/40">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-16 md:grid-cols-2">
            <div className="rounded-lg border bg-card p-8">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Harare
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-4xl font-semibold">US$15</span>
                <span className="text-sm text-muted-foreground">per document</span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Cash on Delivery. Pay the courier when your document is handed to you at your chosen
                address.
              </p>
              <ul className="mt-4 space-y-2 text-sm">
                <li className="flex gap-2">
                  <CheckCircle2 className="h-4 w-4 text-gold" /> Same-city delivery to your address
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="h-4 w-4 text-gold" /> No upfront payment required
                </li>
              </ul>
            </div>
            <div className="rounded-lg border bg-card p-8">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Outside Harare
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-4xl font-semibold">US$20</span>
                <span className="text-sm text-muted-foreground">per document</span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Cash Deposit. Payable once your document arrives at our Harare hub and is ready to
                move to your chosen Zimpost branch.
              </p>
              <ul className="mt-4 space-y-2 text-sm">
                <li className="flex gap-2">
                  <CheckCircle2 className="h-4 w-4 text-gold" /> Any Zimpost branch countrywide
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="h-4 w-4 text-gold" /> Status updates by reference number
                </li>
              </ul>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
