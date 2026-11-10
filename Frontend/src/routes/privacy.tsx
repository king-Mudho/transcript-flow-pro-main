import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";
import { useSite } from "@/lib/site";
import { formatPhone } from "@/lib/msu";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy notice — MSU Transcript Collection" },
      {
        name: "description",
        content: "How we collect, use and protect your personal information.",
      },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  const site = useSite();
  return (
    <LegalPage title="Privacy notice" version={site.terms_version}>
      <h2>Who we are</h2>
      <p>
        The {site.service_name} is run by Sofala Digital, an independent company. We collect
        documents from Midlands State University (MSU) on behalf of graduates and deliver them. We
        are not part of MSU. MSU decides whether to release a document; we do not.
      </p>
      <p>
        We are the data controller for the information you give us on this website. Contact us on
        WhatsApp {formatPhone(site.support_whatsapp)} about anything in this notice.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          Your full name, registration number, programme and year completed, to find your record at
          MSU.
        </li>
        <li>
          Your mobile number and, if you give it, your email, to send you updates and so the driver
          can reach you.
        </li>
        <li>Your delivery address and directions in Harare, or the Zimpost branch you chose.</li>
        <li>
          Your clearance confirmation and any screenshots or PDFs of your clearance you upload.
        </li>
        <li>Payments: the amount, when it was paid and who received it.</li>
        <li>
          Anonymous usage counts (which pages are viewed and how many people finish the form). We do
          not use advertising trackers and do not record your IP address with them.
        </li>
      </ul>

      <h2>How we use it</h2>
      <p>
        Only to collect your documents from MSU, deliver them, take payment, keep you informed and
        answer your questions. We share with MSU only what it needs to find and release your record
        (name, registration number, programme, year, documents and clearance). Drivers see the name,
        phone number and address of the deliveries they carry. Zimpost receives the envelope with
        your name and branch. We never sell your information.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep your street address, directions, phone number and email for{" "}
        <strong>12 months</strong> after your request is completed or rejected, then remove them. We
        keep your name, reference, dates and fees after that for our records and for reports to MSU.
        Uploaded clearance files are deleted when the request is anonymised.
      </p>

      <h2>How we protect it</h2>
      <p>
        Information is stored on secured servers. Only our team members with a personal account and
        a second sign-in step can see it, and every change is logged. Clearance files are never
        available through a public link.
      </p>

      <h2>Your rights</h2>
      <p>
        Under Zimbabwe&apos;s Cyber and Data Protection Act you may ask to see the information we
        hold about you, to correct it, or to have it deleted where we no longer need it. Send the
        request on WhatsApp with your registration number; we will reply within 14 days. You may
        also complain to the Postal and Telecommunications Regulatory Authority of Zimbabwe
        (POTRAZ), the data protection authority.
      </p>
    </LegalPage>
  );
}
