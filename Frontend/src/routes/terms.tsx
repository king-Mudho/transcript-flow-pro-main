import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";
import { useSite } from "@/lib/site";
import { formatPhone, money } from "@/lib/msu";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of service — MSU Transcript Collection" },
      {
        name: "description",
        content: "The terms of the transcript collection and delivery service.",
      },
    ],
  }),
  component: Terms,
});

function Terms() {
  const site = useSite();
  return (
    <LegalPage title="Terms of service" version={site.terms_version}>
      <h2>The service</h2>
      <p>
        Sofala Digital runs the {site.service_name}. When you send a request, you ask us to submit
        it to Midlands State University (MSU), collect the documents MSU releases and deliver them
        to the Harare address or Zimpost branch you chose. We are independent of MSU.
      </p>

      <h2>Your clearance</h2>
      <p>
        MSU releases documents only to graduates approved by their Department, Accounts and the
        Library on the student portal. By ticking those boxes you confirm you have been approved. If
        MSU rejects the request, we tell you the reason and you owe nothing for that request.
      </p>

      <h2>Prices and payment</h2>
      <ul>
        <li>
          Harare doorstep: {money(site.fee_harare)} per request, paid in cash to the driver on
          delivery.
        </li>
        <li>
          Zimpost branch: {money(site.fee_outside)} per request, paid as a cash deposit once your
          document reaches our Harare hub and before it is sent to Zimpost.
        </li>
        <li>
          One fee covers every document in the request. The price is the one shown when you submit.
        </li>
      </ul>

      <h2>Delivery</h2>
      <p>
        You can change your address or branch until your document is dispatched; after that it is
        locked. If nobody is available to receive a Harare delivery, the driver returns it and we
        contact you to arrange another delivery. Documents sent by Zimpost are collected under
        Zimpost&apos;s own rules.
      </p>

      <h2>Times</h2>
      <p>
        How long MSU takes to release a document is outside our control. We follow up and show every
        step on your tracking page.
      </p>

      <h2>Your information</h2>
      <p>We use your details only to provide this service, as set out in our Privacy notice.</p>

      <h2>Contact</h2>
      <p>WhatsApp {formatPhone(site.support_whatsapp)} and quote your reference.</p>
    </LegalPage>
  );
}
