import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import QRCode from "qrcode";
import { apiClient } from "@/lib/api-client";
import { Card, Field, Note, TextInput } from "@/components/ds";
import { BrandMark } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { homeFor } from "@/lib/auth-home";

/** Two-step sign-in enrolment (B11.1). Admins and staff must set it up
 *  before they can use the workspace. */
export const Route = createFileRoute("/security")({
  ssr: false,
  beforeLoad: async () => {
    const user = await apiClient.me();
    if (!user) throw redirect({ to: "/auth" });
    return { user };
  },
  head: () => ({
    meta: [{ title: "Set up two-step sign in" }, { name: "robots", content: "noindex" }],
  }),
  component: SecurityPage,
});

function SecurityPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [secret, setSecret] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user.mfa_enabled) return;
    apiClient
      .mfaSetup()
      .then(async (data) => {
        setSecret(data.secret);
        setQr(await QRCode.toDataURL(data.otpauth_uri, { margin: 1, width: 220 }));
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Could not start set-up"));
  }, [user.mfa_enabled]);

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiClient.mfaConfirm(code);
      toast.success("Two-step sign in is on.");
      navigate({ to: await homeFor() });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That code did not work");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-navy">
      <div className="mx-auto w-full max-w-md px-4 pt-10">
        <BrandMark />
      </div>
      <main id="main" className="mx-auto w-full max-w-md px-4 py-8">
        <Card className="p-6 sm:p-8">
          <ShieldCheck className="h-8 w-8 text-navy" aria-hidden />
          <h1 className="mt-3 text-[24px] font-bold">Set up two-step sign in</h1>
          {user.mfa_enabled ? (
            <>
              <p className="mt-2 text-[15px] text-ink-2">
                Two-step sign in is already on for this account. Sign in again with your code.
              </p>
              <Button
                className="mt-5 w-full"
                size="lg"
                onClick={async () => {
                  await apiClient.logout();
                  navigate({ to: "/auth" });
                }}
              >
                Sign in again
              </Button>
            </>
          ) : (
            <>
              <p className="mt-2 text-[15px] text-ink-2">
                Graduates&apos; details are protected by a second step when you sign in. Install an
                authenticator app (Google Authenticator, Microsoft Authenticator or Authy), then:
              </p>
              <ol className="mt-4 list-decimal space-y-1 pl-5 text-[15px] text-ink-2">
                <li>Scan this code in the app.</li>
                <li>Type the six-digit code it shows.</li>
              </ol>
              <div className="mt-5 flex justify-center">
                {qr ? (
                  <img
                    src={qr}
                    alt="QR code for your authenticator app"
                    className="h-[220px] w-[220px] rounded-lg border border-line"
                  />
                ) : (
                  <Loader2 className="my-20 h-6 w-6 animate-spin text-ink-3" />
                )}
              </div>
              {secret && (
                <Note tone="neutral" icon={false} className="mt-4 text-[13px]">
                  Cannot scan? Enter this key:{" "}
                  <span className="break-all font-mono font-semibold">{secret}</span>
                </Note>
              )}
              <form onSubmit={confirm} className="mt-5 space-y-4">
                <Field label="Six-digit code" htmlFor="code">
                  <TextInput
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="text-center text-[22px] tracking-[0.3em]"
                    required
                  />
                </Field>
                <Button
                  type="submit"
                  variant="navy"
                  size="lg"
                  className="w-full"
                  disabled={busy || !secret}
                >
                  {busy && <Loader2 className="animate-spin" />} Turn on two-step sign in
                </Button>
              </form>
              <button
                type="button"
                className="mt-4 w-full text-center text-[14px] text-ink-3 underline"
                onClick={async () => {
                  await apiClient.logout();
                  navigate({ to: "/auth" });
                }}
              >
                Sign out
              </button>
            </>
          )}
        </Card>
      </main>
    </div>
  );
}
