import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { GraduationCap, Loader2 } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  validateSearch: z.object({ uid: z.string().catch(""), token: z.string().catch("") }),
  head: () => ({
    meta: [
      { title: "Choose a new password — MSU Transcript" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { uid, token } = Route.useSearch();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return toast.error("The two passwords do not match");
    setLoading(true);
    try {
      await apiClient.confirmPasswordReset(uid, token, password);
      toast.success("Password changed. Sign in with your new password.");
      navigate({ to: "/auth" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reset the password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary/5 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2 text-primary">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <GraduationCap className="h-6 w-6" />
          </div>
          <span className="font-semibold">MSU Transcript · Admin</span>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-lg border bg-card p-6 shadow-sm">
          <h1 className="text-lg font-semibold">Choose a new password</h1>
          <div>
            <Label>New password</Label>
            <Input
              className="mt-1.5"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div>
            <Label>Confirm new password</Label>
            <Input
              className="mt-1.5"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <Button type="submit" disabled={loading || !uid || !token} className="w-full">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Change password
          </Button>
          {(!uid || !token) && (
            <p className="text-xs text-destructive">This link is incomplete. Request a new one.</p>
          )}
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          <Link to="/auth" className="hover:text-foreground">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
