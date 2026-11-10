import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { apiClient } from "@/lib/api-client";

/**
 * Layout route wrapping every admin page.
 *
 * IMPORTANT: this guard is a user-experience convenience, not a security
 * boundary. The real gate is the permission class on each Django endpoint.
 * Its job is to send each person to the workspace they can use:
 *
 *   signed out                          → /auth
 *   second factor required, not set up  → /security (enrolment)
 *   MSU staff only                      → /msu
 *   no team role                        → /no-access
 *
 * `ssr: false` because the check depends on a token held in localStorage.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const user = await apiClient.me();
    if (!user) throw redirect({ to: "/auth" });

    if (user.mfa_required && !user.mfa_verified) {
      throw redirect({ to: "/security" });
    }

    if (!user.is_team) {
      if (user.is_msu) throw redirect({ to: "/msu" });
      await apiClient.logout().catch(() => undefined);
      throw redirect({ to: "/no-access" });
    }

    return { user };
  },
  component: () => <Outlet />,
});
