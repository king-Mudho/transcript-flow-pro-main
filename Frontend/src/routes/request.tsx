import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { apiClient } from "@/lib/api-client";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { FEE_HARARE, FEE_OUTSIDE, yearOptions } from "@/lib/msu";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, CheckCircle2, Copy, Loader2 } from "lucide-react";

export const Route = createFileRoute("/request")({
  head: () => ({
    meta: [
      { title: "Start a Request — MSU Transcript Collection" },
      {
        name: "description",
        content: "Submit your transcript delivery request in a few short steps.",
      },
      { property: "og:title", content: "Start a Request — MSU Transcript Collection" },
      { property: "og:description", content: "Submit your transcript delivery request." },
    ],
  }),
  component: RequestPage,
});

const step1Schema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name").max(120),
  reg_number: z.string().trim().min(3, "Registration number is required").max(40),
  programme_name: z.string().trim().min(2, "Programme name is required").max(160),
  year_completed: z.number().int(),
  phone_number: z.string().trim().min(6, "Phone number is required").max(30),
  email: z.string().trim().email("Invalid email").max(160).optional().or(z.literal("")),
});

type Branch = { id: string; branch_name: string; branch_area: string };

function RequestPage() {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState<string | null>(null);

  const [full_name, setFullName] = useState("");
  const [reg_number, setRegNumber] = useState("");
  const [programme_name, setProgramme] = useState("");
  const [year_completed, setYear] = useState<number>(yearOptions()[0]);
  const [phone_number, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [cleared_department, setCD] = useState(false);
  const [cleared_accounts, setCA] = useState(false);
  const [cleared_library, setCL] = useState(false);

  const [zone, setZone] = useState<"harare" | "outside_harare">("harare");
  const [harare_address, setHarareAddress] = useState("");
  const [suburb, setSuburb] = useState("");
  const [branchId, setBranchId] = useState<string>("");

  const [branches, setBranches] = useState<Branch[]>([]);
  useEffect(() => {
    apiClient.listBranches().then((data) => setBranches(data));
  }, []);

  const fee = zone === "harare" ? FEE_HARARE : FEE_OUTSIDE;

  const totalSteps = 5;
  const progress = ((step - 1) / (totalSteps - 1)) * 100;

  function next() {
    if (step === 1) {
      const r = step1Schema.safeParse({
        full_name,
        reg_number,
        programme_name,
        year_completed,
        phone_number,
        email,
      });
      if (!r.success) {
        toast.error(r.error.issues[0]?.message ?? "Please complete the form");
        return;
      }
    }
    if (step === 2) {
      if (!(cleared_department && cleared_accounts && cleared_library)) {
        toast.error("Please confirm all three clearance approvals to continue");
        return;
      }
    }
    if (step === 3) {
      if (zone === "harare" && harare_address.trim().length < 5) {
        toast.error("Please enter your collection address in Harare");
        return;
      }
      if (zone === "harare" && !suburb.trim()) {
        toast.error("Please enter your suburb");
        return;
      }
      if (zone === "outside_harare" && !branchId) {
        toast.error("Please choose a Zimpost branch");
        return;
      }
    }
    setStep(step + 1);
  }

  async function submit() {
    setSubmitting(true);
    try {
      const payload = {
        full_name,
        reg_number,
        programme_name,
        year_completed,
        phone_number,
        email: email || null,
        cleared_department,
        cleared_accounts,
        cleared_library,
        zone,
        harare_address: zone === "harare" ? harare_address : null,
        suburb: zone === "harare" ? suburb : null,
        zimpost_branch_id: zone === "outside_harare" ? branchId : null,
      };
      // The reference number is generated server-side as part of this call.
      const { reference_number } = await apiClient.createRequest(payload);

      setReference(reference_number);
      setStep(5);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Step {Math.min(step, totalSteps)} of {totalSteps}
            </span>
            <span>
              {step === 1 && "Your details"}
              {step === 2 && "Clearance"}
              {step === 3 && "Delivery"}
              {step === 4 && "Fee & Review"}
              {step === 5 && "Confirmation"}
            </span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>

        <div className="rounded-lg border bg-card p-6 sm:p-8">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h1 className="text-xl font-semibold">Identification</h1>
                <p className="text-sm text-muted-foreground">
                  Tell us who you are so we can locate your record.
                </p>
              </div>
              <Field label="Full Name" required>
                <Input
                  value={full_name}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Tendai Moyo"
                />
              </Field>
              <Field label="Registration Number" required>
                <Input
                  value={reg_number}
                  onChange={(e) => setRegNumber(e.target.value)}
                  placeholder="e.g. R123456X"
                />
              </Field>
              <Field label="Programme Name" required>
                <Input
                  value={programme_name}
                  onChange={(e) => setProgramme(e.target.value)}
                  placeholder="e.g. BSc Computer Science"
                />
              </Field>
              <Field label="Year Completed" required>
                <Select value={String(year_completed)} onValueChange={(v) => setYear(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions().map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Phone Number" required>
                  <Input
                    value={phone_number}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+263..."
                  />
                </Field>
                <Field label="Email (optional)">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </Field>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h1 className="text-xl font-semibold">Clearance confirmation</h1>
                <p className="text-sm text-muted-foreground">
                  All three approvals are required before we can process your request.
                </p>
              </div>
              <ClearanceBox
                label="I have been approved online on the student portal by the Department"
                checked={cleared_department}
                onChange={setCD}
              />
              <ClearanceBox
                label="I have been approved online on the student portal by Accounts"
                checked={cleared_accounts}
                onChange={setCA}
              />
              <ClearanceBox
                label="I have been approved online on the student portal by the Library"
                checked={cleared_library}
                onChange={setCL}
              />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-semibold">Collection / delivery preference</h1>
                <p className="text-sm text-muted-foreground">
                  Where should we deliver your transcript?
                </p>
              </div>
              <RadioGroup
                value={zone}
                onValueChange={(v) => setZone(v as typeof zone)}
                className="grid gap-3 sm:grid-cols-2"
              >
                <ZoneCard
                  value="harare"
                  title="Harare"
                  desc="Cash on delivery to your address"
                  checked={zone === "harare"}
                />
                <ZoneCard
                  value="outside_harare"
                  title="Outside Harare"
                  desc="Via Zimpost branch"
                  checked={zone === "outside_harare"}
                />
              </RadioGroup>

              {zone === "harare" && (
                <>
                  <Field label="Delivery address (street and house number)" required>
                    <Input
                      value={harare_address}
                      onChange={(e) => setHarareAddress(e.target.value)}
                      placeholder="e.g. 42 Samora Machel Ave"
                    />
                  </Field>
                  <Field label="Suburb" required>
                    <Input
                      value={suburb}
                      onChange={(e) => setSuburb(e.target.value)}
                      placeholder="e.g. Avondale"
                    />
                  </Field>
                </>
              )}
              {zone === "outside_harare" && (
                <Field label="Zimpost branch" required>
                  <Select value={branchId} onValueChange={setBranchId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.branch_name} — {b.branch_area}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-semibold">Fee & payment</h1>
                <p className="text-sm text-muted-foreground">
                  All payment is cash, handled offline.
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-5">
                <div className="flex items-baseline justify-between">
                  <div className="text-sm text-muted-foreground">
                    {zone === "harare"
                      ? "Harare — Cash on Delivery"
                      : "Outside Harare — Cash Deposit"}
                  </div>
                  <div className="text-3xl font-semibold">US${fee}</div>
                </div>
                <p className="mt-3 text-sm">
                  {zone === "harare"
                    ? "Pay the courier when your document is handed to you."
                    : "Payable once your document arrives at our Harare hub and is ready to move to your chosen Zimpost branch."}
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="text-sm font-semibold">Review your details</h3>
                <dl className="mt-3 grid gap-2 text-sm">
                  <Row k="Name" v={full_name} />
                  <Row k="Reg #" v={reg_number} />
                  <Row k="Programme" v={programme_name} />
                  <Row k="Year completed" v={String(year_completed)} />
                  <Row k="Phone" v={phone_number} />
                  {email && <Row k="Email" v={email} />}
                  <Row
                    k="Delivery"
                    v={
                      zone === "harare"
                        ? `Harare — ${harare_address}, ${suburb}`
                        : `Zimpost — ${branches.find((b) => b.id === branchId)?.branch_name ?? "—"}`
                    }
                  />
                </dl>
              </div>
            </div>
          )}

          {step === 5 && reference && (
            <div className="space-y-5 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-status-collected/15 text-status-collected">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold">Request received</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Save this reference number — you'll need it to check your status.
                </p>
              </div>
              <div className="mx-auto flex max-w-sm items-center justify-between gap-2 rounded-lg border bg-muted/40 p-4">
                <code className="font-mono text-lg font-semibold text-primary">{reference}</code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(reference);
                    toast.success("Copied");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex justify-center gap-2">
                <Button asChild variant="outline">
                  <Link to="/status">Check status</Link>
                </Button>
                <Button asChild>
                  <Link to="/">Done</Link>
                </Button>
              </div>
            </div>
          )}

          {step < 5 && (
            <div className="mt-8 flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={step === 1}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Back
              </Button>
              {step < 4 ? (
                <Button onClick={next}>
                  Continue <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={submit} disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit request
                </Button>
              )}
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-sm">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

function ClearanceBox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 hover:bg-muted/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        className="mt-0.5"
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}

function ZoneCard({
  value,
  title,
  desc,
  checked,
}: {
  value: string;
  title: string;
  desc: string;
  checked: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-4 hover:bg-muted/50 ${checked ? "border-primary bg-primary/5" : ""}`}
    >
      <div className="flex items-center gap-3">
        <RadioGroupItem value={value} />
        <span className="font-medium">{title}</span>
      </div>
      <span className="pl-6 text-xs text-muted-foreground">{desc}</span>
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  );
}
