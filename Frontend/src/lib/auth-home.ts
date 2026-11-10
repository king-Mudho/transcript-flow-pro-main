import { apiClient } from "@/lib/api-client";

/** Where a signed-in person belongs. */
export async function homeFor(): Promise<"/admin" | "/msu" | "/security" | "/no-access"> {
  const user = await apiClient.me();
  if (!user) return "/no-access";
  if (user.mfa_required && !user.mfa_verified) return "/security";
  if (user.is_team) return "/admin";
  if (user.is_msu) return "/msu";
  return "/no-access";
}
