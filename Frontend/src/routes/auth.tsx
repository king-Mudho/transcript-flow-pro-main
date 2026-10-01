import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { GraduationCap, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Admin Sign In — MSU Transcript Collection" },
      { name: "description", content: "Sign in to the MSU transcript admin dashboard." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgot, setForgot] = useState(false);

  useEffect(() => {
    apiClient.me().then((user) => {
      if (user?.is_admin) navigate({ to: "/admin" });
    });
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiClient.login(email, password);
      navigate({ to: "/admin" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  async function sendReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiClient.requestPasswordReset(email);
      // Same message whether or not the address has an account.
      toast.success("If that email has an account, a reset link is on its way.");
      setForgot(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the reset email");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary/5 p-4">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2 text-primary">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <GraduationCap className="h-6 w-6" />
          </div>
          <span className="font-semibold">MSU Transcript · Admin</span>
        </Link>
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h1 className="text-lg font-semibold">{forgot ? "Reset your password" : "Sign in"}</h1>
          <form onSubmit={forgot ? sendReset : signIn} className="mt-4 space-y-4">
            {forgot && (
              <p className="text-xs text-muted-foreground">
                Enter your admin email and we will send you a link to choose a new password.
              </p>
            )}
            <div>
              <Label>Email</Label>
              <Input
                className="mt-1.5"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {!forgot && (
              <div>
                <Label>Password</Label>
                <Input
                  className="mt-1.5"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            )}
            <Button type="submit" disabled={loading} className="w-full">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {forgot ? "Send reset link" : "Sign in"}
            </Button>
          </form>
          <button
            type="button"
            onClick={() => setForgot(!forgot)}
            className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground"
          >
            {forgot ? "Back to sign in" : "Forgot password?"}
          </button>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
