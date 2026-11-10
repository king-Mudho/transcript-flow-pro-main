/**
 * The four-step request flow (B8.2, designs G02–G05): Your details, Clearance,
 * Documents and delivery, Check and submit. Used by graduates on /request and
 * by staff taking a request by phone, WhatsApp or in person (B9.2).
 *
 * Answers are kept in the browser until submitted, so a refresh or a dropped
 * connection loses nothing.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, FileImage, FileText, Loader2, Upload, X } from "lucide-react";
import {
  apiClient,
  DuplicateRequestError,
  type Branch,
  type ClearanceFile,
  type Item,
  type SubmitResult,
  type Zone,
} from "@/lib/api-client";
import {
  CheckCard,
  Field,
  NativeSelect,
  Note,
  QuantityStepper,
  RadioCard,
  TextArea,
  TextInput,
} from "@/components/ds";
import { Combobox, type ComboOption } from "@/components/combobox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  DOCUMENT_TYPES,
  formatPhone,
  money,
  normalisePhone,
  normaliseReg,
  regLooksRight,
  yearOptions,
} from "@/lib/msu";
import { trackStep, useSite } from "@/lib/site";
import { toast } from "sonner";

export type Draft = {
  step: number;
  full_name: string;
  reg_number: string;
  programme_name: string;
  year_completed: number;
  phone_local: string;
  email: string;
  cleared_department: boolean;
  cleared_accounts: boolean;
  cleared_library: boolean;
  files: ClearanceFile[];
  transcripts: number;
  certificates: number;
  zone: Zone;
  suburb: string;
  street: string;
  directions: string;
  branch_id: string;
  consent: boolean;
  channel: "whatsapp" | "phone" | "walk_in";
};

const EMPTY: Draft = {
  step: 1,
  full_name: "",
  reg_number: "",
  programme_name: "",
  year_completed: new Date().getFullYear(),
  phone_local: "",
  email: "",
  cleared_department: false,
  cleared_accounts: false,
  cleared_library: false,
  files: [],
  transcripts: 1,
  certificates: 0,
  zone: "harare",
  suburb: "",
  street: "",
  directions: "",
  branch_id: "",
  consent: false,
  channel: "whatsapp",
};

const NEXT_LABEL = [
  "",
  "Next: clearance",
  "Next: documents and delivery",
  "Next: review",
  "Last step",
];
const MAX_FILE = 5 * 1024 * 1024;

function storageKey(mode: string) {
  return mode === "staff" ? "msu.request.staff-draft" : "msu.request.draft";
}

function loadDraft(mode: string): Draft {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(storageKey(mode));
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Draft>) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

export type Submitted = SubmitResult & {
  name: string;
  phone: string;
  reg: string;
  zone: Zone;
  deliverTo: string;
  documents: string;
};

export function documentsSummary(d: Pick<Draft, "transcripts" | "certificates">): string {
  const parts = [];
  if (d.transcripts) parts.push(`Academic transcript × ${d.transcripts}`);
  if (d.certificates) parts.push(`Degree certificate × ${d.certificates}`);
  return parts.join(", ");
}

function shortDocs(d: Pick<Draft, "transcripts" | "certificates">): string {
  const parts = [];
  if (d.transcripts) parts.push(`${d.transcripts} transcript${d.transcripts > 1 ? "s" : ""}`);
  if (d.certificates) parts.push(`${d.certificates} certificate${d.certificates > 1 ? "s" : ""}`);
  return parts.join(" + ") || "No documents";
}

type Errors = Partial<Record<string, string>>;

function validate(step: number, d: Draft): Errors {
  const e: Errors = {};
  if (step === 1) {
    if (d.full_name.trim().length < 2)
      e.full_name = "Enter your full name as it appears on your MSU records.";
    if (normaliseReg(d.reg_number).length < 3)
      e.reg_number = "Enter your registration number, for example R123456X.";
    if (d.programme_name.trim().length < 2) e.programme_name = "Enter your programme.";
    if (!normalisePhone(d.phone_local))
      e.phone = "Enter a Zimbabwe mobile number, for example 77 123 4567.";
    if (d.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim()))
      e.email = "Check the email address, or leave it empty.";
  }
  if (step === 2) {
    if (!(d.cleared_department && d.cleared_accounts && d.cleared_library))
      e.clearance =
        "Tick all three. MSU only releases documents to graduates approved by all three offices.";
  }
  if (step === 3) {
    if (d.transcripts + d.certificates < 1) e.documents = "Choose at least one document.";
    if (d.zone === "harare") {
      if (!d.suburb.trim()) e.suburb = "Choose your suburb from the list, or type it.";
      if (d.street.trim().length < 5) e.street = "Enter the house number and street.";
    } else if (!d.branch_id) {
      e.branch = "Choose the Zimpost branch you will collect from.";
    }
  }
  if (step === 4 && !d.consent) e.consent = "Tick the box to agree before you submit.";
  return e;
}

export function RequestFlow({
  mode = "public",
  onSubmitted,
  onCancel,
}: {
  mode?: "public" | "staff";
  onSubmitted: (result: Submitted) => void;
  onCancel: () => void;
}) {
  const site = useSite();
  const [d, setD] = useState<Draft>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [fromReview, setFromReview] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [duplicate, setDuplicate] = useState<{ message: string; reference: string | null } | null>(
    null,
  );
  const [confirmCancel, setConfirmCancel] = useState(false);
  const honeypot = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setD(loadDraft(mode));
    setHydrated(true);
  }, [mode]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey(mode), JSON.stringify(d));
    } catch {
      // Private mode: the flow still works, it just is not kept.
    }
  }, [d, hydrated, mode]);

  useEffect(() => {
    apiClient
      .listBranches()
      .then(setBranches)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (mode === "public") trackStep(`step${d.step}`);
    headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [d.step, hydrated, mode]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setD((prev) => ({ ...prev, [key]: value }));

  const blurCheck = (name: string) => {
    setTouched((t) => ({ ...t, [name]: true }));
    setErrors(validate(d.step, d));
  };
  const err = (name: string) => (touched[name] ? errors[name] : undefined);

  useEffect(() => {
    // Re-check live once a field has been left, so a fixed error disappears.
    if (Object.keys(touched).length) setErrors(validate(d.step, d));
  }, [d, touched]);

  const fee = d.zone === "harare" ? site.fee_harare : site.fee_outside;
  const branch = branches.find((b) => b.id === d.branch_id);
  const deliverTo =
    d.zone === "harare"
      ? [d.street.trim(), d.suburb.trim()].filter(Boolean).join(", ")
      : branch
        ? `Zimpost ${branch.branch_name}, ${branch.branch_area}`
        : "";

  function go(step: number) {
    setTouched({});
    setErrors({});
    setD((prev) => ({ ...prev, step }));
  }

  function next() {
    const e = validate(d.step, d);
    if (Object.keys(e).length) {
      setErrors(e);
      setTouched(Object.fromEntries(Object.keys(e).map((k) => [k, true])));
      toast.error(Object.values(e)[0]!);
      return;
    }
    if (fromReview && d.step < 4) {
      setFromReview(false);
      go(4);
      return;
    }
    go(d.step + 1);
  }

  function back() {
    if (d.step === 1) {
      setConfirmCancel(true);
      return;
    }
    if (fromReview) {
      setFromReview(false);
      go(4);
      return;
    }
    go(d.step - 1);
  }

  async function submit(confirmDuplicate = false) {
    const e = validate(4, d);
    if (Object.keys(e).length) {
      setErrors(e);
      setTouched({ consent: true });
      return;
    }
    const phone = normalisePhone(d.phone_local)!;
    const items: Item[] = [];
    if (d.transcripts) items.push({ document_type: "transcript", quantity: d.transcripts });
    if (d.certificates)
      items.push({ document_type: "degree_certificate", quantity: d.certificates });
    setSubmitting(true);
    try {
      const result = await apiClient.createRequest({
        full_name: d.full_name.trim(),
        reg_number: normaliseReg(d.reg_number),
        programme_name: d.programme_name.trim(),
        year_completed: d.year_completed,
        phone_number: phone,
        email: d.email.trim() || null,
        cleared_department: d.cleared_department,
        cleared_accounts: d.cleared_accounts,
        cleared_library: d.cleared_library,
        zone: d.zone,
        harare_address: d.zone === "harare" ? d.street.trim() : null,
        suburb: d.zone === "harare" ? d.suburb.trim() : null,
        directions: d.zone === "harare" ? d.directions.trim() : null,
        zimpost_branch_id: d.zone === "outside_harare" ? d.branch_id : null,
        items,
        clearance_file_ids: d.files.map((f) => f.id),
        consent: d.consent,
        confirm_duplicate: confirmDuplicate,
        website: honeypot.current?.value ?? "",
        channel: mode === "staff" ? d.channel : undefined,
      });
      try {
        window.localStorage.removeItem(storageKey(mode));
      } catch {
        // ignore
      }
      if (mode === "public") trackStep("submitted");
      onSubmitted({
        ...result,
        name: d.full_name.trim(),
        phone,
        reg: normaliseReg(d.reg_number),
        zone: d.zone,
        deliverTo,
        documents: documentsSummary(d),
      });
      setD(EMPTY);
    } catch (error) {
      if (error instanceof DuplicateRequestError) {
        setDuplicate({ message: error.message, reference: error.reference });
      } else {
        toast.error(error instanceof Error ? error.message : "Your request could not be sent.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-ink-3">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const progress = (
    <div className="mb-5">
      <div className="flex items-center justify-between text-[14px] text-ink-3">
        <span>Step {d.step} of 4</span>
        <span>{NEXT_LABEL[d.step]}</span>
      </div>
      <div
        className="mt-2 grid grid-cols-4 gap-1.5"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={4}
        aria-valuenow={d.step}
        aria-label={`Step ${d.step} of 4`}
      >
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={cn("h-1.5 rounded-full", n <= d.step ? "bg-navy" : "bg-line")} />
        ))}
      </div>
    </div>
  );

  return (
    <div className={cn("min-h-screen", mode === "public" ? "bg-white" : "")}>
      {/* Top bar */}
      <div
        className={cn(
          "sticky top-0 z-20 border-b border-line bg-white",
          mode === "staff" && "rounded-t-xl",
        )}
      >
        <div className="mx-auto grid h-14 max-w-xl grid-cols-[1fr_auto_1fr] items-center px-2">
          <button
            type="button"
            onClick={back}
            className="inline-flex h-11 items-center gap-1 justify-self-start rounded-lg px-2 text-[16px] text-ink-2 hover:bg-ground"
          >
            <ChevronLeft className="h-5 w-5" /> Back
          </button>
          <span className="text-[16px] font-semibold">
            {mode === "staff" ? "New request for a graduate" : "Request a document"}
          </span>
          <button
            type="button"
            aria-label="Cancel request"
            onClick={() => setConfirmCancel(true)}
            className="inline-flex h-11 w-11 items-center justify-center justify-self-end rounded-lg text-ink-2 hover:bg-ground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <main id="main" className="mx-auto max-w-xl px-4 pb-40 pt-5 sm:px-6">
        {progress}

        {/* Hidden from people; bots that fill every field give themselves away. */}
        <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            Website
            <input ref={honeypot} name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        {d.step === 1 && (
          <section aria-labelledby="step-heading">
            <h1
              id="step-heading"
              ref={headingRef}
              tabIndex={-1}
              className="text-[28px] font-bold leading-tight outline-none"
            >
              Your details
            </h1>
            <p className="mt-2 text-[16px] text-ink-2">
              We use these to find your record at MSU and to keep you updated.
            </p>
            <div className="mt-6 space-y-5">
              {mode === "staff" && (
                <Field label="How did the graduate contact us?">
                  <NativeSelect
                    value={d.channel}
                    onChange={(e) => set("channel", e.target.value as Draft["channel"])}
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="phone">Phone call</option>
                    <option value="walk_in">Walk-in</option>
                  </NativeSelect>
                </Field>
              )}
              <Field
                label="Full name"
                hint="As it appears on your MSU records"
                error={err("full_name")}
                htmlFor="full_name"
              >
                <TextInput
                  id="full_name"
                  autoComplete="name"
                  value={d.full_name}
                  onChange={(e) => set("full_name", e.target.value)}
                  onBlur={() => blurCheck("full_name")}
                />
              </Field>
              <Field
                label="Registration number"
                hint={
                  d.reg_number && !regLooksRight(normaliseReg(d.reg_number)) && !err("reg_number")
                    ? "That does not look like R123456X. Check it against your student card; you can still continue."
                    : "As on your student card, for example R123456X"
                }
                error={err("reg_number")}
                htmlFor="reg_number"
              >
                <TextInput
                  id="reg_number"
                  autoCapitalize="characters"
                  value={d.reg_number}
                  onChange={(e) => set("reg_number", e.target.value)}
                  onBlur={() => {
                    set("reg_number", normaliseReg(d.reg_number));
                    blurCheck("reg_number");
                  }}
                />
              </Field>
              <Field label="Programme" error={err("programme_name")} htmlFor="programme">
                <TextInput
                  id="programme"
                  value={d.programme_name}
                  onChange={(e) => set("programme_name", e.target.value)}
                  onBlur={() => blurCheck("programme_name")}
                />
              </Field>
              <Field label="Year completed" htmlFor="year">
                <NativeSelect
                  id="year"
                  value={d.year_completed}
                  onChange={(e) => set("year_completed", Number(e.target.value))}
                >
                  {yearOptions().map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field
                label="Mobile number"
                hint={
                  mode === "staff"
                    ? "The graduate's number. Updates and the reference are sent here."
                    : "Your driver and our team will use this number"
                }
                error={err("phone")}
                htmlFor="phone"
              >
                <div className="flex gap-2">
                  <span className="flex h-12 w-[84px] shrink-0 items-center justify-center rounded-lg border border-line bg-ground text-[16px] text-ink-2">
                    +263
                  </span>
                  <TextInput
                    id="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="77 123 4567"
                    value={d.phone_local}
                    onChange={(e) => set("phone_local", e.target.value)}
                    onBlur={() => blurCheck("phone")}
                    aria-invalid={err("phone") ? true : undefined}
                  />
                </div>
              </Field>
              <Field
                label="Email"
                optional
                hint="We will email your confirmation and every status change"
                error={err("email")}
                htmlFor="email"
              >
                <TextInput
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={d.email}
                  onChange={(e) => set("email", e.target.value)}
                  onBlur={() => blurCheck("email")}
                />
              </Field>
            </div>
          </section>
        )}

        {d.step === 2 && (
          <section aria-labelledby="step-heading">
            <h1
              id="step-heading"
              ref={headingRef}
              tabIndex={-1}
              className="text-[28px] font-bold leading-tight outline-none"
            >
              Your clearance
            </h1>
            <p className="mt-2 text-[16px] text-ink-2">
              MSU only releases documents to graduates approved by all three offices on the student
              portal.
            </p>
            <fieldset className="mt-6">
              <legend className="mb-3 text-[15px] font-semibold">
                I have been approved on the student portal by
              </legend>
              <div className="space-y-3">
                <CheckCard
                  checked={d.cleared_department}
                  onChange={(v) => set("cleared_department", v)}
                  title="My Department"
                  description="Shows as approved on the portal"
                />
                <CheckCard
                  checked={d.cleared_accounts}
                  onChange={(v) => set("cleared_accounts", v)}
                  title="Accounts"
                  description="No balance owing"
                />
                <CheckCard
                  checked={d.cleared_library}
                  onChange={(v) => set("cleared_library", v)}
                  title="The Library"
                  description="All books returned"
                />
              </div>
              {err("clearance") && (
                <p role="alert" className="mt-2 text-[13px] font-medium text-danger">
                  {err("clearance")}
                </p>
              )}
            </fieldset>

            <ProofUpload files={d.files} onChange={(files) => set("files", files)} />

            <Note tone="info" className="mt-5">
              If an office has not approved you, MSU will reject the request and we will tell you
              why.
            </Note>
          </section>
        )}

        {d.step === 3 && (
          <section aria-labelledby="step-heading">
            <h1
              id="step-heading"
              ref={headingRef}
              tabIndex={-1}
              className="text-[28px] font-bold leading-tight outline-none"
            >
              Documents and delivery
            </h1>

            <h2 className="mt-6 text-[15px] font-semibold">Which documents do you need?</h2>
            <p className="text-[14px] text-ink-3">One delivery fee covers them all.</p>
            <div className="mt-3 divide-y divide-line rounded-xl border border-line">
              {DOCUMENT_TYPES.map((doc) => {
                const key = doc.value === "transcript" ? "transcripts" : "certificates";
                return (
                  <div
                    key={doc.value}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div>
                      <div className="text-[16px] font-semibold">{doc.label}</div>
                      <div className="text-[14px] text-ink-3">{doc.hint}</div>
                    </div>
                    <QuantityStepper
                      label={doc.label}
                      value={d[key]}
                      onChange={(v) => set(key, v)}
                    />
                  </div>
                );
              })}
            </div>
            {err("documents") && (
              <p role="alert" className="mt-2 text-[13px] font-medium text-danger">
                {err("documents")}
              </p>
            )}

            <fieldset className="mt-6">
              <legend className="mb-3 text-[15px] font-semibold">Where should we deliver?</legend>
              <div className="space-y-3">
                <RadioCard
                  name="zone"
                  value="harare"
                  checked={d.zone === "harare"}
                  onChange={() => set("zone", "harare")}
                  title="Harare doorstep"
                  price={money(site.fee_harare)}
                  description="A driver brings it to your address. Pay cash on delivery."
                />
                <RadioCard
                  name="zone"
                  value="outside_harare"
                  checked={d.zone === "outside_harare"}
                  onChange={() => set("zone", "outside_harare")}
                  title="Zimpost branch"
                  price={money(site.fee_outside)}
                  description="Outside Harare. Collect it from the branch you choose. Cash deposit before dispatch."
                />
              </div>
            </fieldset>

            {d.zone === "harare" ? (
              <div className="mt-6 space-y-5">
                <Field
                  label="Suburb"
                  hint="Start typing and pick from the list"
                  error={err("suburb")}
                  htmlFor="suburb"
                >
                  <Combobox
                    options={site.suburbs.map((s) => ({ value: s.name, label: s.name }))}
                    value={d.suburb}
                    allowCustom
                    customLabel={(t) => `Other: "${t}"`}
                    id="suburb"
                    placeholder="Search suburbs"
                    invalid={!!err("suburb")}
                    onChange={(v) => {
                      set("suburb", v);
                      setTouched((t) => ({ ...t, suburb: true }));
                    }}
                  />
                </Field>
                <Field label="House number and street" error={err("street")} htmlFor="street">
                  <TextInput
                    id="street"
                    autoComplete="street-address"
                    value={d.street}
                    onChange={(e) => set("street", e.target.value)}
                    onBlur={() => blurCheck("street")}
                  />
                </Field>
                <Field label="Directions for the driver" optional htmlFor="directions">
                  <TextArea
                    id="directions"
                    value={d.directions}
                    onChange={(e) => set("directions", e.target.value)}
                  />
                </Field>
              </div>
            ) : (
              <div className="mt-6">
                <Field
                  label="Zimpost branch"
                  hint="Type a town to filter, for example Kwekwe"
                  error={err("branch")}
                  htmlFor="branch"
                >
                  <Combobox
                    options={branches
                      .slice()
                      .sort(
                        (a, b) =>
                          a.branch_area.localeCompare(b.branch_area) ||
                          a.branch_name.localeCompare(b.branch_name),
                      )
                      .map<ComboOption>((b) => ({
                        value: b.id,
                        label: b.branch_name,
                        group: b.branch_area,
                      }))}
                    value={d.branch_id}
                    id="branch"
                    placeholder="Search branches"
                    invalid={!!err("branch")}
                    onChange={(v) => {
                      set("branch_id", v);
                      setTouched((t) => ({ ...t, branch: true }));
                    }}
                  />
                </Field>
              </div>
            )}
          </section>
        )}

        {d.step === 4 && (
          <section aria-labelledby="step-heading">
            <h1
              id="step-heading"
              ref={headingRef}
              tabIndex={-1}
              className="text-[28px] font-bold leading-tight outline-none"
            >
              Check and submit
            </h1>
            <p className="mt-2 text-[16px] text-ink-2">
              Make sure everything is right. You can change any section.
            </p>

            <div className="mt-6 divide-y divide-line rounded-xl border border-line">
              <ReviewSection
                title="Your details"
                onChange={() => {
                  setFromReview(true);
                  go(1);
                }}
              >
                <dl className="space-y-1 text-[15px]">
                  <ReviewRow k="Name" v={d.full_name} />
                  <ReviewRow k="Reg number" v={normaliseReg(d.reg_number)} />
                  <ReviewRow k="Programme" v={`${d.programme_name}, ${d.year_completed}`} />
                  <ReviewRow k="Mobile" v={formatPhone(normalisePhone(d.phone_local))} />
                  <ReviewRow
                    k="Email"
                    v={d.email.trim() || <span className="font-normal text-ink-3">Not given</span>}
                  />
                </dl>
              </ReviewSection>
              <ReviewSection
                title="Clearance"
                onChange={() => {
                  setFromReview(true);
                  go(2);
                }}
              >
                <p className="text-[15px]">Department, Accounts and Library approved</p>
                <p className="mt-1 text-[13px] text-ink-3">
                  {d.files.length
                    ? `${d.files.length} file${d.files.length > 1 ? "s" : ""} attached`
                    : "No proof attached"}
                </p>
              </ReviewSection>
              <ReviewSection
                title="Documents"
                onChange={() => {
                  setFromReview(true);
                  go(3);
                }}
              >
                <p className="text-[15px]">{documentsSummary(d)}</p>
              </ReviewSection>
              <ReviewSection
                title="Delivery"
                onChange={() => {
                  setFromReview(true);
                  go(3);
                }}
              >
                <p className="text-[15px]">
                  {d.zone === "harare" ? "Harare doorstep" : "Zimpost branch"}
                </p>
                <p className="text-[15px]">{deliverTo}</p>
                {d.zone === "harare" && d.directions.trim() && (
                  <p className="mt-1 text-[13px] text-ink-3">{d.directions}</p>
                )}
              </ReviewSection>
            </div>

            <div className="mt-5 rounded-xl border border-gold/40 bg-gold-tint p-5">
              <div className="flex items-baseline justify-between">
                <span className="text-[16px] font-semibold">To pay</span>
                <span className="text-[28px] font-bold tabular">{money(fee)}</span>
              </div>
              <p className="mt-1 text-[15px] text-warn-ink">
                {d.zone === "harare"
                  ? "Cash on delivery. Pay the driver when your document is handed to you. Nothing to pay now."
                  : "Cash deposit. Pay once your document reaches our Harare hub, before it goes to Zimpost. Nothing to pay now."}
              </p>
            </div>

            <label className="mt-5 flex cursor-pointer gap-3 text-[15px] leading-snug">
              <input
                type="checkbox"
                checked={d.consent}
                onChange={(e) => set("consent", e.target.checked)}
                aria-invalid={err("consent") ? true : undefined}
                className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[var(--navy)]"
              />
              <span>
                {mode === "staff" ? "The graduate agrees to the " : "I agree to the "}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-navy underline"
                >
                  Terms
                </a>{" "}
                and{" "}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-navy underline"
                >
                  Privacy notice
                </a>
                , and {mode === "staff" ? "allows their" : "allow my"} details to be used to collect
                and deliver {mode === "staff" ? "their" : "my"} documents.
              </span>
            </label>
            {err("consent") && (
              <p role="alert" className="mt-2 text-[13px] font-medium text-danger">
                {err("consent")}
              </p>
            )}
          </section>
        )}
      </main>

      {/* Fixed bottom bar: Back and Continue within thumb reach. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-xl px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 sm:px-6">
          {d.step === 3 && (
            <div className="mb-2 flex items-center justify-between text-[14px] text-ink-3">
              <span>
                {shortDocs(d)} · {d.zone === "harare" ? "Harare doorstep" : "Zimpost branch"}
              </span>
              <span className="text-[18px] font-bold text-ink tabular">{money(fee)}</span>
            </div>
          )}
          <div className={cn("grid gap-3", d.step > 1 ? "grid-cols-[1fr_1.4fr]" : "grid-cols-1")}>
            {d.step > 1 && (
              <Button variant="outline" size="lg" onClick={back}>
                Back
              </Button>
            )}
            {d.step < 4 ? (
              <Button variant="gold" size="lg" onClick={next}>
                {fromReview ? "Back to check" : "Continue"}
              </Button>
            ) : (
              <Button
                variant="gold"
                size="lg"
                onClick={() => submit(false)}
                disabled={submitting || !d.consent}
              >
                {submitting && <Loader2 className="animate-spin" />}
                Submit request
              </Button>
            )}
          </div>
        </div>
      </div>

      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Leave this request?</DialogTitle>
          </DialogHeader>
          <p className="text-[15px] text-ink-2">
            Your answers are kept on this device, so you can come back and finish later.
          </p>
          <div className="mt-2 grid gap-2">
            <Button variant="navy" size="lg" onClick={() => setConfirmCancel(false)}>
              Keep going
            </Button>
            <Button variant="outline" size="lg" onClick={onCancel}>
              Leave
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                try {
                  window.localStorage.removeItem(storageKey(mode));
                } catch {
                  // ignore
                }
                setD(EMPTY);
                onCancel();
              }}
            >
              Leave and clear my answers
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!duplicate} onOpenChange={(o) => !o && setDuplicate(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {duplicate?.reference
                ? "You already have a request in progress"
                : "A request is already in progress"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-[15px] text-ink-2">{duplicate?.message}</p>
          <p className="text-[15px] text-ink-2">
            If you need another document, you can still send this request.
          </p>
          <div className="mt-2 grid gap-2">
            {duplicate?.reference && mode === "public" && (
              <Button asChild variant="navy" size="lg">
                <a href={`/status?ref=${duplicate.reference}`}>Track {duplicate.reference}</a>
              </Button>
            )}
            <Button
              variant="gold"
              size="lg"
              disabled={submitting}
              onClick={() => {
                setDuplicate(null);
                submit(true);
              }}
            >
              Continue anyway
            </Button>
            <Button variant="ghost" onClick={() => setDuplicate(null)}>
              Go back
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReviewSection({
  title,
  onChange,
  children,
}: {
  title: string;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="p-4 sm:p-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold">{title}</h2>
        <Button
          variant="outline"
          size="sm"
          className="h-9 px-3.5 text-[14px]"
          onClick={onChange}
          aria-label={`Change ${title.toLowerCase()}`}
        >
          Change
        </Button>
      </div>
      {children}
    </div>
  );
}

function ReviewRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3">
      <dt className="text-ink-3">{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </div>
  );
}

function ProofUpload({
  files,
  onChange,
}: {
  files: ClearanceFile[];
  onChange: (files: ClearanceFile[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function add(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    const added: ClearanceFile[] = [];
    for (const file of Array.from(list).slice(0, 5 - files.length)) {
      if (file.size > MAX_FILE) {
        toast.error(`${file.name} is over 5 MB.`);
        continue;
      }
      if (!/^(image\/(jpeg|png)|application\/pdf)$/.test(file.type)) {
        toast.error(`${file.name}: use a JPG, PNG or PDF.`);
        continue;
      }
      try {
        added.push(await apiClient.uploadClearance(file));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Could not upload ${file.name}`);
      }
    }
    onChange([...files, ...added]);
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="mt-6">
      <div className="text-[15px] font-semibold">
        Proof of clearance <span className="font-normal text-ink-3">(recommended)</span>
      </div>
      <p className="mt-0.5 text-[14px] text-ink-3">
        A screenshot of your clearance page helps us avoid a wasted trip to MSU.
      </p>
      {files.length < 5 && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="mt-3 flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-line px-4 py-6 text-center hover:bg-ground"
        >
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin text-ink-2" />
          ) : (
            <Upload className="h-5 w-5 text-ink-2" />
          )}
          <span className="text-[16px] font-semibold">
            {busy ? "Uploading…" : "Add a screenshot or PDF"}
          </span>
          <span className="text-[14px] text-ink-3">JPG, PNG or PDF, up to 5 MB each</span>
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        multiple
        className="sr-only"
        aria-label="Add proof of clearance"
        onChange={(e) => add(e.target.files)}
      />
      {files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-info-tint text-info-ink">
                {f.content_type === "application/pdf" ? (
                  <FileText className="h-5 w-5" />
                ) : (
                  <FileImage className="h-5 w-5" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{f.original_name}</span>
                <span className="text-[13px] text-ink-3">
                  {Math.max(1, Math.round(f.size / 1024))} KB · uploaded
                </span>
              </span>
              <button
                type="button"
                aria-label={`Remove ${f.original_name}`}
                onClick={() => onChange(files.filter((x) => x.id !== f.id))}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-2 hover:bg-ground"
              >
                <X className="h-5 w-5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
