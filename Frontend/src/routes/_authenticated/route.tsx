import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";

/**
 * Layout route wrapping every admin page.
 *
 * IMPORTANT: this guard is a user-experience convenience, not a security
 * boundary. It runs in the browser and can be bypassed by anyone willing to
 * edit their own JavaScript. The real gate is the `IsAdmin` permission class on
 * each Django endpoint — without it, this check would be worth nothing. Its
 * only job here is to avoid rendering a dashboard whose every request would
 * come back 403.
 *
 * `ssr: false` because the check depends on a token held in localStorage, which
 * the server cannot see.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // me() resolves to null rather than throwing on any failure, so a network
    // blip becomes a redirect to sign-in instead of an error boundary.
    const user = await apiClient.me();

    // Signed out: redirect silently. Arriving at /auth is the expected outcome
    // here, not something worth interrupting the user about.
    if (!user) throw redirect({ to: "/auth" });

    // Signed in but not an admin: this one deserves an explanation, because
    // otherwise a successful sign-in looks like it silently failed.
    if (!user.is_admin) {
      // A fixed toast id makes sonner replace rather than stack: beforeLoad can
      // run more than once during a single navigation.
      toast.error("Your account doesn't have admin access yet.", { id: "admin-access-denied" });
      throw redirect({ to: "/auth" });
    }

    return { user };
  },
  component: () => <Outlet />,
});
