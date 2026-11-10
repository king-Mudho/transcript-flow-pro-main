import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { apiClient, OtpRequiredError } from "@/lib/api-client";
import { homeFor } from "@/lib/auth-home";
import { Card, Field, Note, TextInput } from "@/components/ds";
import { BrandMark } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ idle: z.boolean().optional().catch(undefined) }),
  head: () => ({
    meta: [
      { title: "Staff sign in — MSU Transcript Collection" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { idle } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [keep, setKeep] = useState(false);
  const [needOtp, setNeedOtp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgot, setForgot] = useState(false);

  useEffect(() => {
    apiClient.me().then(async (user) => {
      if (user && (user.is_team || user.is_msu)) navigate({ to: await homeFor() });
    });
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { mfa_setup_required } = await apiClient.login(
        email.trim(),
        password,
        needOtp ? otp : undefined,
        keep,
      );
      navigate({ to: mfa_setup_required ? "/security" : await homeFor() });
    } catch (err) {
      if (err instanceof OtpRequiredError) {
        if (needOtp) toast.error(err.message);
        setNeedOtp(true);
      } else {
        toast.error(err instanceof Error ? err.message : "Sign in failed");
      }
    } finally {
      setLoading(false);
    }
  }

  async function sendReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiClient.requestPasswordReset(email.trim());
      toast.success("If that email has an account, a reset link is on its way.");
      setForgot(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the reset email");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-navy">
      <div className="mx-auto w-full max-w-md px-4 pt-10">
        <Link to="/" className="inline-block rounded-lg">
          <BrandMark />
        </Link>
      </div>
      <main id="main" className="mx-auto flex w-full max-w-md flex-1 items-start px-4 py-8">
        <Card className="w-full p-6 sm:p-8">
          <h1 className="text-[24px] font-bold">
            {forgot ? "Reset your password" : needOtp ? "Two-step sign in" : "Staff sign in"}
          </h1>
          <p className="mt-1 text-[14px] text-ink-3">
            {forgot
              ? "We will email you a link to choose a new password."
              : needOtp
                ? "Enter the six-digit code from your authenticator app."
                : "For the operations team and MSU staff."}
          </p>
          {idle && !forgot && (
            <Note tone="info" className="mt-4">
              You were signed out after {30} minutes without activity.
            </Note>
          )}
          <form onSubmit={forgot ? sendReset : signIn} className="mt-6 space-y-4">
            {!needOtp && (
              <Field label="Email" htmlFor="email">
                <TextInput
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Field>
            )}
            {!forgot && !needOtp && (
              <Field label="Password" htmlFor="password">
                <TextInput
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Field>
            )}
            {needOtp && (
              <Field label="Six-digit code" htmlFor="otp">
                <TextInput
                  id="otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  autoFocus
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="text-center text-[22px] tracking-[0.3em]"
                  required
                />
              </Field>
            )}
            {!forgot && !needOtp && (
              <label className="flex cursor-pointer items-center gap-2.5 text-[14px]">
                <input
                  type="checkbox"
                  checked={keep}
                  onChange={(e) => setKeep(e.target.checked)}
                  className="h-4 w-4 accent-[var(--navy)]"
                />
                Keep me signed in for 7 days on this device
              </label>
            )}
            <Button type="submit" variant="navy" size="lg" className="w-full" disabled={loading}>
              {loading && <Loader2 className="animate-spin" />}
              {forgot ? "Send reset link" : needOtp ? "Verify and sign in" : "Sign in"}
            </Button>
          </form>
          <div className="mt-5 flex justify-between text-[14px]">
            {needOtp ? (
              <button
                type="button"
                className="text-ink-3 underline"
                onClick={() => {
                  setNeedOtp(false);
                  setOtp("");
                }}
              >
                Use a different account
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setForgot(!forgot)}
                className="text-ink-3 underline"
              >
                {forgot ? "Back to sign in" : "Forgot password?"}
              </button>
            )}
            <Link to="/" className="text-ink-3 underline">
              Back to the website
            </Link>
          </div>
          {!forgot && (
            <p className="mt-6 border-t border-line pt-4 text-[13px] text-ink-3">
              There is no public sign-up. An admin invites each team member from Settings.
            </p>
          )}
        </Card>
      </main>
    </div>
  );
}
