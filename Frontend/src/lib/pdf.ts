/**
 * Every PDF the service produces, built in the browser with jsPDF: the
 * graduate's confirmation slip (B5.1), the driver's waybill (B3.3/A07),
 * delivery labels with barcodes (B9.8/A10–A11), MSU hand-in lists (B9.4),
 * collection pick-up lists (B10.3) and the monthly report (B10.4).
 *
 * The libraries load on demand, so they stay out of the public pages' first
 * download. Brand text comes from Settings (B11.4).
 */
import type { jsPDF as JsPDF } from "jspdf";
import type {
  BatchDetail,
  HandInDetail,
  MonthlyReport,
  MsuRequest,
  PublicSettings,
  RequestRow,
} from "@/lib/api-client";
import { code128B } from "@/lib/code128";
import { formatPhone, money } from "@/lib/msu";

export type Brand = Pick<
  PublicSettings,
  "service_name" | "short_name" | "operator_line" | "support_whatsapp" | "primary_color"
> & { hub_address?: string };

async function libs() {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  return { jsPDF, autoTable };
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt((hex || "#0F2750").slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function finalY(doc: JsPDF, fallback: number): number {
  return (
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? fallback
  );
}

function header(doc: JsPDF, brand: Brand, title: string, subtitle?: string) {
  doc.setFillColor(...rgb(brand.primary_color));
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(brand.service_name, 14, 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(brand.operator_line, 14, 16);
  doc.setTextColor(14, 22, 36);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(title, 14, 33);
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(68, 77, 91);
    doc.text(subtitle, 14, 39);
    doc.setTextColor(14, 22, 36);
  }
}

function signLine(doc: JsPDF, label: string, x: number, y: number, width = 55) {
  doc.setDrawColor(98, 107, 120);
  doc.line(x, y, x + width, y);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(label, x, y + 5);
}

/* --------------------------------------------------------- confirmation */

export type ConfirmationData = {
  reference: string;
  name: string;
  reg: string;
  phone: string;
  documents: string;
  zone: "harare" | "outside_harare";
  deliverTo: string;
  fee: number;
  trackUrl: string;
};

export async function confirmationPdf(data: ConfirmationData, brand: Brand): Promise<Blob> {
  const { jsPDF, autoTable } = await libs();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  header(
    doc,
    brand,
    "Request received",
    `Keep this page. You need the reference to track your request.`,
  );

  doc.setDrawColor(...rgb(brand.primary_color));
  doc.setLineWidth(0.6);
  doc.roundedRect(14, 46, 182, 26, 3, 3);
  doc.setFontSize(9);
  doc.setTextColor(98, 107, 120);
  doc.text("YOUR REFERENCE", 20, 54);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(14, 22, 36);
  doc.text(data.reference, 20, 66);
  doc.setLineWidth(0.2);

  const harare = data.zone === "harare";
  autoTable(doc, {
    startY: 80,
    theme: "plain",
    styles: { fontSize: 10.5, cellPadding: { top: 2, bottom: 2, left: 0, right: 4 } },
    columnStyles: { 0: { cellWidth: 45, textColor: [98, 107, 120] }, 1: { fontStyle: "bold" } },
    body: [
      ["Name", data.name],
      ["Registration number", data.reg],
      ...(data.phone ? [["Mobile", formatPhone(data.phone)]] : []),
      ["Documents", data.documents],
      ["Delivery", harare ? "Harare doorstep" : "Zimpost branch"],
      [harare ? "Address" : "Branch", data.deliverTo],
      ["To pay", `${money(data.fee)} in cash`],
      [
        "When to pay",
        harare
          ? "Pay the driver when your document is handed to you. Nothing to pay now."
          : "Pay the deposit once your document reaches our Harare hub, before it goes to Zimpost.",
      ],
    ],
  });

  let y = finalY(doc, 140) + 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("How to track", 14, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  y += 6;
  doc.text(
    doc.splitTextToSize(
      `Open ${data.trackUrl} and enter your registration number.` +
        (data.phone ? ` We will also text every update to ${formatPhone(data.phone)}.` : ""),
      182,
    ),
    14,
    y,
  );
  y += 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Questions?", 14, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.text(`WhatsApp ${formatPhone(brand.support_whatsapp)} and quote your reference.`, 14, y + 6);

  doc.setFontSize(8.5);
  doc.setTextColor(98, 107, 120);
  doc.text(`Issued ${when(new Date().toISOString())}`, 14, 285);
  return doc.output("blob");
}

/* -------------------------------------------------------------- waybill */

/** Cash the driver must collect for a document: blank when already paid. */
export function cashToCollect(r: RequestRow): number {
  return r.payment_method !== "cash_on_delivery" ? 0 : Math.max(Number(r.cash_due ?? 0), 0);
}

export function batchSummary(batch: BatchDetail): {
  count: number;
  cash: number;
  documents: number;
} {
  return {
    count: batch.requests.length,
    documents: batch.requests.reduce(
      (sum, r) => sum + (r.items?.reduce((s, i) => s + i.quantity, 0) || 1),
      0,
    ),
    cash: batch.requests.reduce((sum, r) => sum + cashToCollect(r), 0),
  };
}

export function waybillFilename(batch: BatchDetail): string {
  return `waybill-${batch.batch_number}.pdf`;
}

export async function waybillPdf(
  batch: BatchDetail,
  brand: Brand,
  dispatcher?: string,
): Promise<Blob> {
  const { jsPDF, autoTable } = await libs();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const { count, cash, documents } = batchSummary(batch);
  const d = batch.driver;
  header(doc, brand, `Waybill ${batch.batch_number}`, `Out ${when(batch.dispatched_at)}`);

  doc.setFontSize(10);
  doc.text(`Driver: ${d.full_name}`, 14, 47);
  doc.text(`Phone: ${formatPhone(d.phone)}`, 90, 47);
  doc.text(`Bike: ${d.bike_registration || "—"}`, 150, 47);

  autoTable(doc, {
    startY: 52,
    head: [
      ["#", "Reference", "Graduate", "Phone", "Suburb and address", "Cash US$", "Received by"],
    ],
    body: batch.requests.map((r, i) => {
      const due = cashToCollect(r);
      return [
        String(i + 1),
        r.reference_number,
        `${r.full_name}\n${r.documents}`,
        formatPhone(r.phone_number),
        [r.suburb, r.harare_address, r.directions].filter(Boolean).join(" — "),
        due ? due.toFixed(2) : "",
        "",
      ];
    }),
    styles: { fontSize: 8, cellPadding: 2, valign: "middle", minCellHeight: 13 },
    headStyles: { fillColor: rgb(brand.primary_color) },
    columnStyles: {
      0: { cellWidth: 7 },
      1: { cellWidth: 29 },
      2: { cellWidth: 32 },
      3: { cellWidth: 25 },
      4: { cellWidth: "auto" },
      5: { cellWidth: 16, halign: "right" },
      6: { cellWidth: 28 },
    },
  });

  let y = finalY(doc, 60) + 10;
  if (y > 240) {
    doc.addPage();
    y = 20;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text(`Requests: ${count}   Documents: ${documents}`, 14, y);
  doc.text(`Total cash to collect: US$${cash.toFixed(2)}`, 14, y + 6);
  doc.setFont("helvetica", "normal");
  signLine(doc, `Dispatcher${dispatcher ? `: ${dispatcher}` : ""}`, 14, y + 26);
  signLine(doc, "Driver signature", 80, y + 26);
  signLine(doc, "Time back", 146, y + 26, 50);
  doc.setFontSize(8);
  doc.setTextColor(98, 107, 120);
  doc.text("Holds graduates' phone numbers and addresses. For the assigned driver only.", 14, 290);
  return doc.output("blob");
}

/* --------------------------------------------------------------- labels */

export type LabelInput = {
  reference: string;
  name: string;
  phone: string;
  zone: "harare" | "outside_harare";
  address: string;
  directions?: string;
  branch?: string;
  reg: string;
  runNumber?: string;
  zimpostNumber?: string;
  documents: string;
  cashDue: number;
  fee: number;
  paid: boolean;
};

function drawBarcode(
  doc: JsPDF,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const widths = code128B(text);
  const modules = widths.reduce((a, b) => a + b, 0) + 20;
  const unit = width / modules;
  let cursor = x + unit * 10;
  doc.setFillColor(0, 0, 0);
  widths.forEach((w, i) => {
    if (i % 2 === 0) doc.rect(cursor, y, unit * w, height, "F");
    cursor += unit * w;
  });
}

/** One label in a w × h box (mm). Black on white for thermal printers. */
function drawLabel(
  doc: JsPDF,
  data: LabelInput,
  brand: Brand,
  trackBase: string,
  x: number,
  y: number,
  w: number,
  h: number,
  pageText: string,
) {
  const s = h / 150; // layout was designed at 100 × 150 mm
  const pad = 4 * s;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.rect(x, y, w, h);

  // Logo panel and service.
  doc.setFillColor(0, 0, 0);
  doc.rect(x, y, w, 16 * s, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12 * s);
  doc.text(brand.short_name.toUpperCase(), x + pad, y + 7 * s);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5 * s);
  doc.text(brand.service_name, x + pad, y + 12 * s);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10 * s);
  doc.text(data.zone === "harare" ? "HARARE DOORSTEP" : "ZIMPOST BRANCH", x + w - pad, y + 7 * s, {
    align: "right",
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8 * s);
  doc.text(pageText, x + w - pad, y + 12 * s, { align: "right" });
  doc.setTextColor(0, 0, 0);

  // Date and pickup.
  let cy = y + 22 * s;
  doc.setFontSize(7 * s);
  doc.text("FROM", x + pad, cy);
  doc.text("DATE", x + w - pad - 28 * s, cy);
  doc.setFontSize(8.5 * s);
  doc.text(
    doc.splitTextToSize(brand.hub_address || brand.service_name, w - 40 * s),
    x + pad,
    cy + 4 * s,
  );
  doc.text(new Date().toLocaleDateString("en-GB"), x + w - pad - 28 * s, cy + 4 * s);

  // Drop-off.
  cy += 12 * s;
  doc.setLineWidth(0.2);
  doc.line(x + pad, cy, x + w - pad, cy);
  cy += 5 * s;
  doc.setFontSize(7 * s);
  doc.text("DELIVER TO", x + pad, cy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13 * s);
  doc.text(doc.splitTextToSize(data.name, w - 2 * pad), x + pad, cy + 6 * s);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10 * s);
  const where = data.zone === "harare" ? data.address : `Zimpost ${data.branch ?? ""}`;
  const lines = doc.splitTextToSize(where, w - 2 * pad).slice(0, 3);
  doc.text(lines, x + pad, cy + 12 * s);
  let ly = cy + 12 * s + lines.length * 4.5 * s;
  if (data.directions) {
    doc.setFontSize(8.5 * s);
    const dir = doc.splitTextToSize(data.directions, w - 2 * pad).slice(0, 2);
    doc.text(dir, x + pad, ly);
    ly += dir.length * 4 * s;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5 * s);
  doc.text(formatPhone(data.phone), x + pad, ly + 1 * s);
  doc.setFont("helvetica", "normal");

  // Barcode.
  const by = y + 84 * s;
  drawBarcode(doc, data.reference, x + pad, by, w - 2 * pad, 18 * s);
  doc.setFontSize(10 * s);
  doc.setFont("helvetica", "bold");
  doc.text(data.reference, x + w / 2, by + 23 * s, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7 * s);
  doc.text(`${trackBase}/status?ref=${data.reference}`, x + w / 2, by + 27 * s, {
    align: "center",
  });

  // Details and cash box.
  const dy = y + 116 * s;
  doc.line(x + pad, dy - 2 * s, x + w - pad, dy - 2 * s);
  doc.setFontSize(7.5 * s);
  const facts = [
    `Reg: ${data.reg}`,
    data.zone === "harare"
      ? `Batch: ${data.runNumber ?? "—"}`
      : `Zimpost no: ${data.zimpostNumber || "—"}`,
    `Docs: ${data.documents}`,
  ];
  facts.forEach((f, i) =>
    doc.text(doc.splitTextToSize(f, 52 * s)[0], x + pad, dy + 3 * s + i * 4.5 * s),
  );
  const bx = x + w - pad - 38 * s;
  doc.setLineWidth(0.8);
  doc.rect(bx, dy, 38 * s, 26 * s);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8 * s);
  let line1: string;
  let line2: string;
  if (data.zone === "harare") {
    line1 = data.cashDue > 0 ? "COLLECT CASH" : "PAID";
    line2 = data.cashDue > 0 ? `US$${data.cashDue.toFixed(0)}` : "Nothing to collect";
  } else {
    line1 = data.paid ? "DEPOSIT PAID" : "DEPOSIT DUE";
    line2 = `US$${data.fee.toFixed(0)}`;
  }
  doc.text(line1, bx + 19 * s, dy + 8 * s, { align: "center" });
  doc.setFontSize(line2.length > 8 ? 8 * s : 16 * s);
  doc.text(line2, bx + 19 * s, dy + 19 * s, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setLineWidth(0.2);
}

/** All labels for a run as one PDF: 4 × 6 inch (100 × 150 mm) thermal labels,
 *  or `a4` with four labels per page for ordinary printers. */
export async function labelsPdf(
  labels: LabelInput[],
  brand: Brand,
  trackBase: string,
  format: "thermal" | "a4" = "thermal",
): Promise<Blob> {
  const { jsPDF } = await libs();
  const total = labels.length;
  if (format === "thermal") {
    const doc = new jsPDF({ unit: "mm", format: [100, 150] });
    labels.forEach((label, i) => {
      if (i > 0) doc.addPage([100, 150]);
      drawLabel(doc, label, brand, trackBase, 0, 0, 100, 150, `${i + 1}/${total}`);
    });
    return doc.output("blob");
  }
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = 95;
  const h = 142.5;
  labels.forEach((label, i) => {
    const slot = i % 4;
    if (i > 0 && slot === 0) doc.addPage();
    const x = 7 + (slot % 2) * (w + 6);
    const y = 4 + Math.floor(slot / 2) * (h + 4);
    drawLabel(doc, label, brand, trackBase, x, y, w, h, `${i + 1}/${total}`);
  });
  return doc.output("blob");
}

export function labelFromRequest(r: RequestRow, runNumber?: string): LabelInput {
  return {
    reference: r.reference_number,
    name: r.full_name,
    phone: r.phone_number,
    zone: r.zone,
    address: [r.harare_address, r.suburb].filter(Boolean).join(", "),
    directions: r.directions,
    branch: r.zimpost_branches
      ? `${r.zimpost_branches.branch_name}, ${r.zimpost_branches.branch_area}`
      : "",
    reg: r.reg_number,
    runNumber: runNumber ?? r.batch_number ?? undefined,
    zimpostNumber: r.zimpost_tracking_number,
    documents: r.documents,
    cashDue: cashToCollect(r),
    fee: Number(r.fee_amount),
    paid: r.paid,
  };
}

/* -------------------------------------------------------- hand-in lists */

export async function handinPdf(list: HandInDetail, brand: Brand): Promise<Blob> {
  const { jsPDF, autoTable } = await libs();
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  header(
    doc,
    brand,
    `Hand-in list ${list.number}`,
    `${when(list.created_at)} · by ${list.created_by} · ${list.requests.length} request(s)`,
  );
  autoTable(doc, {
    startY: 45,
    head: [
      [
        "#",
        "Reference",
        "Graduate",
        "Reg number",
        "Programme",
        "Year",
        "Documents",
        "MSU sign or stamp",
      ],
    ],
    body: list.requests.map((r, i) => [
      String(i + 1),
      r.reference_number,
      r.full_name,
      r.reg_number,
      r.programme_name,
      String(r.year_completed),
      r.documents,
      "",
    ]),
    styles: { fontSize: 8.5, cellPadding: 2, minCellHeight: 12, valign: "middle" },
    headStyles: { fillColor: rgb(brand.primary_color) },
    columnStyles: { 0: { cellWidth: 8 }, 7: { cellWidth: 45 } },
  });
  const y = Math.min(finalY(doc, 60) + 14, 185);
  signLine(doc, "Handed in by", 14, y, 70);
  signLine(doc, "Received for MSU (name, signature, date)", 110, y, 90);
  return doc.output("blob");
}

/* ------------------------------------------------- collection pick-up */

export async function pickupPdf(rows: (RequestRow | MsuRequest)[], brand: Brand): Promise<Blob> {
  const { jsPDF, autoTable } = await libs();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  header(
    doc,
    brand,
    "Collection run: pick-up list",
    `${when(new Date().toISOString())} · ${rows.length} document request(s) ready at MSU`,
  );
  autoTable(doc, {
    startY: 45,
    head: [["#", "Reference", "Graduate", "Reg number", "Documents", "Hand-in", "Collected"]],
    body: rows.map((r, i) => [
      String(i + 1),
      r.reference_number,
      r.full_name,
      r.reg_number,
      r.documents,
      r.handin_number ?? "—",
      "",
    ]),
    styles: { fontSize: 9, cellPadding: 2, minCellHeight: 11, valign: "middle" },
    headStyles: { fillColor: rgb(brand.primary_color) },
    columnStyles: { 0: { cellWidth: 8 }, 6: { cellWidth: 22 } },
  });
  const y = Math.min(finalY(doc, 60) + 14, 270);
  signLine(doc, "Collected by", 14, y, 70);
  signLine(doc, "Released by MSU", 110, y, 80);
  return doc.output("blob");
}

/* -------------------------------------------------------- monthly report */

export async function monthlyPdf(report: MonthlyReport, brand: Brand): Promise<Blob> {
  const { jsPDF, autoTable } = await libs();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const label = new Date(`${report.month}-01T00:00:00`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
  header(doc, brand, `Monthly report: ${label}`, "Volume, speed and rejection reasons");
  const days = (v: number | null) => (v == null ? "—" : `${v} days`);
  autoTable(doc, {
    startY: 46,
    head: [["Measure", "Value"]],
    body: [
      ["Requests handed in to MSU", String(report.handed_in)],
      ["Released by MSU", String(report.released)],
      ["Rejected by MSU", String(report.rejected)],
      ["Average days with MSU", days(report.avg_days_with_msu)],
      ["Longest days with MSU", days(report.longest_days_with_msu)],
      ["Deliveries: Harare doorstep", String(report.deliveries.harare ?? 0)],
      ["Deliveries: Zimpost branch", String(report.deliveries.outside_harare ?? 0)],
      ["Average days end to end", days(report.avg_days_end_to_end)],
    ],
    headStyles: { fillColor: rgb(brand.primary_color) },
    styles: { fontSize: 10.5, cellPadding: 3 },
  });
  autoTable(doc, {
    startY: finalY(doc, 120) + 8,
    head: [["Rejection reason", "Requests"]],
    body: report.rejected_by_reason.length
      ? report.rejected_by_reason.map((r) => [r.reason, String(r.count)])
      : [["No rejections this month", ""]],
    headStyles: { fillColor: rgb(brand.primary_color) },
    styles: { fontSize: 10.5, cellPadding: 3 },
  });
  return doc.output("blob");
}

/* ------------------------------------------------------------ sharing */

/** Share a PDF: the phone's share sheet with the file attached when the
 *  browser can, otherwise download it and (optionally) open WhatsApp. */
export async function sharePdf(
  blob: Blob,
  filename: string,
  text: string,
  whatsappTo?: string,
): Promise<"shared" | "downloaded"> {
  const file = new File([blob], filename, { type: "application/pdf" });
  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename, text });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "shared";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  if (whatsappTo !== undefined) {
    const to = whatsappTo.replace(/\D/g, "");
    window.open(`https://wa.me/${to}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }
  return "downloaded";
}
