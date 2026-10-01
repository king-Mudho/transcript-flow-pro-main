import type { BatchDetail, RequestRow } from "@/lib/api-client";
import { waDigits } from "@/lib/msu";

/** Cash the driver must collect for a document: blank when already paid. */
export function cashToCollect(r: RequestRow): number {
  return r.paid || r.payment_method !== "cash_on_delivery" ? 0 : Number(r.fee_amount);
}

export function waybillFilename(batch: BatchDetail): string {
  return `waybill-${batch.batch_number}.pdf`;
}

export function batchSummary(batch: BatchDetail): { count: number; cash: number } {
  return {
    count: batch.requests.length,
    cash: batch.requests.reduce((sum, r) => sum + cashToCollect(r), 0),
  };
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

/** Build the A4 portrait waybill in the browser. The libraries are imported on
 *  demand so they stay out of the public pages' bundle. */
export async function buildWaybill(batch: BatchDetail): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const { count, cash } = batchSummary(batch);
  const d = batch.driver;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("MSU Transcript Collection", 14, 15);
  doc.setFontSize(11);
  doc.text(`Waybill ${batch.batch_number}`, 14, 22);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Out: ${formatWhen(batch.dispatched_at)}`, 14, 28);
  doc.text(`Driver: ${d.full_name}`, 14, 33);
  doc.text(`Phone: ${d.phone}`, 90, 33);
  doc.text(`Bike: ${d.bike_registration || "—"}`, 150, 33);

  autoTable(doc, {
    startY: 38,
    head: [
      ["#", "Reference", "Graduate", "Phone", "Suburb / address", "Cash (US$)", "Received by"],
    ],
    body: batch.requests.map((r, i) => {
      const cashDue = cashToCollect(r);
      return [
        String(i + 1),
        r.reference_number,
        r.full_name,
        r.phone_number,
        [r.suburb, r.harare_address].filter(Boolean).join(" — "),
        cashDue ? cashDue.toFixed(2) : "",
        "",
      ];
    }),
    styles: { fontSize: 8, cellPadding: 2, valign: "middle", minCellHeight: 12 },
    headStyles: { fillColor: [30, 41, 90] },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 31 },
      2: { cellWidth: 27 },
      3: { cellWidth: 24 },
      4: { cellWidth: "auto" },
      5: { cellWidth: 18, halign: "right" },
      6: { cellWidth: 28 },
    },
  });

  const lastTable = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
  let y = (lastTable?.finalY ?? 60) + 10;
  if (y > 240) {
    doc.addPage();
    y = 20;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`Documents: ${count}`, 14, y);
  doc.text(`Total cash to collect: US$${cash.toFixed(2)}`, 14, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const line = (label: string, x: number, yy: number) => {
    doc.line(x, yy, x + 55, yy);
    doc.text(label, x, yy + 5);
  };
  line("Dispatcher signature", 14, y + 24);
  line("Driver signature", 80, y + 24);
  line("Time back", 146, y + 24);

  return doc.output("blob");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Share the waybill to WhatsApp.
 *
 *  Phones: the Web Share API opens the share sheet with the PDF attached.
 *  Computers (no file sharing): the PDF is downloaded and a WhatsApp chat with
 *  the driver opens with a short summary, ready to attach the file.
 *  Returns which route was used. */
export async function shareWaybill(batch: BatchDetail): Promise<"shared" | "downloaded"> {
  const blob = await buildWaybill(batch);
  const filename = waybillFilename(batch);
  const { count, cash } = batchSummary(batch);
  const summary = `Waybill ${batch.batch_number}: ${count} document${count === 1 ? "" : "s"}, US$${cash.toFixed(2)} cash to collect.`;

  const file = new File([blob], filename, { type: "application/pdf" });
  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: batch.batch_number, text: summary });
      return "shared";
    } catch (e) {
      // The person closing the share sheet is not an error.
      if (e instanceof DOMException && e.name === "AbortError") return "shared";
    }
  }

  downloadBlob(blob, filename);
  const phone = waDigits(batch.driver.whatsapp_phone || batch.driver.phone);
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(summary)}`, "_blank", "noopener");
  return "downloaded";
}
