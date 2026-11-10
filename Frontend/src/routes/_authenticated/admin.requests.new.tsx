import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check } from "lucide-react";
import { RequestFlow, type Submitted } from "@/components/request-flow";
import { Card, Note } from "@/components/ds";
import { WhatsAppIcon } from "@/components/whatsapp-contact";
import { Button } from "@/components/ui/button";
import { formatPhone, money, openWhatsApp } from "@/lib/msu";
import { useSite } from "@/lib/site";

export const Route = createFileRoute("/_authenticated/admin/requests/new")({
  head: () => ({
    meta: [{ title: "New request — MSU Transcript admin" }, { name: "robots", content: "noindex" }],
  }),
  component: NewRequest,
});

/** Staff take a request for a graduate who called, WhatsApped or walked in.
 *  Same four steps and checks as the public form; the channel and the staff
 *  member are saved, and consent is recorded as given to them. */
function NewRequest() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const site = useSite();
  const [done, setDone] = useState<Submitted | null>(null);

  if (done) {
    const text = `Hello ${done.name.split(/\s+/)[0]}, we have your request ${done.reference_number}. Track it with your registration number at ${window.location.origin}/status?ref=${done.reference_number}. ${
      done.zone === "harare"
        ? `You pay ${money(done.fee_amount)} cash on delivery.`
        : `You pay a ${money(done.fee_amount)} cash deposit before it goes to Zimpost.`
    } Questions? WhatsApp ${formatPhone(site.support_whatsapp)}.`;
    return (
      <div className="min-h-screen bg-ground px-4 py-10">
        <Card className="mx-auto max-w-lg p-6 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-tint text-success">
            <Check className="h-7 w-7" />
          </span>
          <h1 className="mt-3 text-[24px] font-bold">Request created</h1>
          <p className="mt-1 text-[15px] text-ink-2">
            {done.name} · {done.documents}
          </p>
          <div className="mt-4 rounded-xl border-2 border-navy p-4 font-mono text-[24px] font-bold">
            {done.reference_number}
          </div>
          <Note tone="info" className="mt-4 text-left">
            An update with the reference is sent to {formatPhone(done.phone)} automatically when SMS
            is set up. Send it on WhatsApp now as well.
          </Note>
          <div className="mt-5 grid gap-2">
            <Button variant="whatsapp" size="lg" onClick={() => openWhatsApp(done.phone, text)}>
              <WhatsAppIcon className="h-4 w-4" /> Send the reference on WhatsApp
            </Button>
            <Button asChild variant="navy" size="lg">
              <Link to="/admin/requests/$requestId" params={{ requestId: done.id }}>
                Open the request
              </Link>
            </Button>
            <Button variant="ghost" onClick={() => setDone(null)}>
              Take another request
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <RequestFlow
      mode="staff"
      onCancel={() => navigate({ to: "/admin/requests", search: { page: 1 } })}
      onSubmitted={(result) => {
        queryClient.invalidateQueries({ queryKey: ["sidebar-counts"] });
        setDone(result);
      }}
    />
  );
}
