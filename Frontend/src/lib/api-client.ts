// The app's single data layer. Routes and components call `apiClient` and never
// fetch the Django API directly, so URL construction, auth headers, token
// refresh and error shaping all live in one place.
const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://127.0.0.1:8000/api";

/* ------------------------------------------------------------------ types */
/* These mirror the Django serializers. When a serializer's field list changes,
   update the matching type here — nothing enforces the correspondence at build
   time, since responses are parsed as JSON. */

export type Branch = {
  id: string;
  branch_name: string;
  branch_area: string;
  active: boolean;
};

export type StatusResult = {
  reference_number: string;
  full_name: string;
  programme_name: string;
  status: string;
  status_reason: string | null;
  paid: boolean;
  zone: string;
  fee_amount: number;
  payment_method: string;
  created_at: string;
};

export type RequestRow = {
  id: string;
  reference_number: string;
  full_name: string;
  reg_number: string;
  programme_name: string;
  year_completed: number;
  phone_number: string;
  email: string | null;
  cleared_department: boolean;
  cleared_accounts: boolean;
  cleared_library: boolean;
  zone: "harare" | "outside_harare";
  harare_address: string | null;
  fee_amount: number;
  payment_method: string;
  paid: boolean;
  status: "submitted" | "in_transit" | "collected" | "rejected";
  status_reason: string | null;
  exported_at: string | null;
  created_at: string;
  zimpost_branches?: { branch_name: string; branch_area: string } | null;
};

export type NewRequest = {
  full_name: string;
  reg_number: string;
  programme_name: string;
  year_completed: number;
  phone_number: string;
  email: string | null;
  cleared_department: boolean;
  cleared_accounts: boolean;
  cleared_library: boolean;
  zone: "harare" | "outside_harare";
  harare_address: string | null;
  zimpost_branch_id: string | null;
  fee_amount: number;
  payment_method: string;
};

export type CurrentUser = {
  id: string;
  email: string;
  roles: string[];
  is_admin: boolean;
};

export type ExportFilters = {
  search: string;
  status: string;
  zone: string;
  exported: string;
};

/* ------------------------------------------------------- token management */
/* Tokens live in localStorage so a session survives a page reload. Every
   accessor is guarded against `window` being undefined, because route loaders
   also run during server-side rendering. */

const ACCESS_KEY = "msu.access_token";
const REFRESH_KEY = "msu.refresh_token";

function readToken(key: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
}

function storeTokens(access: string, refresh?: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCESS_KEY, access);
  if (refresh) window.localStorage.setItem(REFRESH_KEY, refresh);
}

function clearTokens() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}

/* ------------------------------------------------------ request plumbing */

/** Pull a human-readable message out of a DRF error body.
 *
 * DRF replies in several shapes: `{detail: "..."}` for permission and auth
 * errors, `{field: ["msg"]}` for validation errors, and occasionally a bare
 * string. This digs out the first usable string so callers can surface it in a
 * toast instead of showing a raw status code. */
function messageFromBody(body: unknown, fallback: string): string {
  if (typeof body === "string" && body.trim()) return body;
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.detail === "string") return record.detail;
    for (const value of Object.values(record)) {
      if (typeof value === "string") return value;
      if (Array.isArray(value) && typeof value[0] === "string") return value[0];
    }
  }
  return fallback;
}

async function toError(response: Response): Promise<Error> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON error body (HTML error page, empty response, …) — fall through.
  }
  return new Error(messageFromBody(body, `Request failed (${response.status})`));
}

/** Exchange the refresh token for a new access token.
 *
 * Returns false (and clears both tokens) if the refresh token is expired or
 * blacklisted, which is the signal that the user must sign in again. */
async function refreshAccessToken(): Promise<boolean> {
  const refresh = readToken(REFRESH_KEY);
  if (!refresh) return false;

  const response = await fetch(`${API_URL}/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (!response.ok) {
    clearTokens();
    return false;
  }

  const data = (await response.json()) as { access: string; refresh?: string };
  storeTokens(data.access, data.refresh);
  return true;
}

/** Perform a request with auth attached, retrying once after a token refresh.
 *
 * Returns the raw Response so callers can treat specific statuses as normal
 * outcomes (the status lookup, for instance, reads 404 as "no match" rather
 * than an error). Use `request()` instead when any non-2xx should throw. */
async function send(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const headers = new Headers(init.headers);
  const access = readToken(ACCESS_KEY);
  if (access) headers.set("Authorization", `Bearer ${access}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    // fetch() rejects on transport failures (server down, connection reset,
    // request aborted by a navigation). Raise something a toast can show
    // instead of the browser's bare "Failed to fetch".
    throw new Error("Could not reach the server. Check that the API is running and try again.");
  }

  // Access tokens are short-lived; refresh once transparently before failing.
  if (response.status === 401 && retry && readToken(REFRESH_KEY)) {
    if (await refreshAccessToken()) return send(path, init, false);
  }
  return response;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await send(path, init);
  if (!response.ok) throw await toError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function exportQueryString(filters: ExportFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.zone !== "all") params.set("zone", filters.zone);
  if (filters.exported !== "all") params.set("exported", filters.exported);
  const query = params.toString();
  return query ? `?${query}` : "";
}

const djangoClient = {
  async listBranches(): Promise<Branch[]> {
    return request<Branch[]>("/branches/?active=true");
  },

  async listAllBranches(): Promise<Branch[]> {
    return request<Branch[]>("/branches/");
  },

  async createBranch(branch: Omit<Branch, "id">): Promise<Branch> {
    return request<Branch>("/branches/", { method: "POST", body: JSON.stringify(branch) });
  },

  async updateBranch(id: string, branch: Omit<Branch, "id">): Promise<Branch> {
    return request<Branch>(`/branches/${id}/`, { method: "PATCH", body: JSON.stringify(branch) });
  },

  async deleteBranch(id: string): Promise<void> {
    await request<void>(`/branches/${id}/`, { method: "DELETE" });
  },

  async createRequest(payload: NewRequest): Promise<{ reference_number: string }> {
    // The reference number is generated server-side inside this call, replacing
    // the separate generate_reference_number() RPC round-trip.
    const { zimpost_branch_id, ...rest } = payload;
    return request<{ reference_number: string }>("/requests/", {
      method: "POST",
      body: JSON.stringify({ ...rest, zimpost_branch: zimpost_branch_id }),
    });
  },

  /** Public status check. Resolves to null when nothing matches — "not found"
   *  is an expected answer here, not an error, so the page can show its empty
   *  state rather than an error toast. */
  async lookupStatus(ref: string, reg: string): Promise<StatusResult | null> {
    const params = new URLSearchParams({ reference_number: ref, reg_number: reg });
    const response = await send(`/requests/status/?${params.toString()}`);
    if (response.status === 404) return null;
    if (!response.ok) throw await toError(response);
    return (await response.json()) as StatusResult;
  },

  async listRequests(): Promise<RequestRow[]> {
    return request<RequestRow[]>("/requests/");
  },

  /** Move several requests to a new status at once.
   *
   *  `reason` is three-valued on purpose: omit it to leave any existing reason
   *  untouched, or pass null to clear it. The API keys off whether
   *  `status_reason` is present in the payload at all. */
  async bulkUpdateStatus(ids: string[], status: string, reason?: string | null): Promise<void> {
    const payload: Record<string, unknown> = { ids, status };
    if (reason !== undefined) payload.status_reason = reason;
    await request<void>("/requests/bulk-update-status/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async updateRequestPaid(id: string, paid: boolean): Promise<void> {
    await request<void>(`/requests/${id}/`, { method: "PATCH", body: JSON.stringify({ paid }) });
  },

  /** Download the filtered requests as an .xlsx blob.
   *
   *  Filters are sent as query params rather than a list of ids: the server
   *  re-applies the same filtering, which keeps the URL short no matter how
   *  many rows are selected. The server also stamps `exported_at` as part of
   *  this call, so callers should refresh the table afterwards. */
  async exportRequests(filters: ExportFilters): Promise<Blob> {
    const response = await send(`/requests/export/${exportQueryString(filters)}`);
    if (!response.ok) throw await toError(response);
    return await response.blob();
  },

  async login(email: string, password: string): Promise<void> {
    const data = await request<{ access: string; refresh: string }>("/auth/login/", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    storeTokens(data.access, data.refresh);
  },

  /** Create an account. The API returns tokens, but they are deliberately
   *  discarded: the UI asks the new user to sign in explicitly, which keeps
   *  "account created" and "signed in" as two visible, separate steps. */
  async signup(email: string, password: string): Promise<void> {
    await request<{ access: string; refresh: string }>("/auth/signup/", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  /** Blacklist the refresh token server-side, then drop both tokens locally.
   *  Local tokens are cleared in a `finally` so a failed or unreachable server
   *  still signs the user out on this device. */
  async logout(): Promise<void> {
    const refresh = readToken(REFRESH_KEY);
    try {
      if (refresh) {
        await request<void>("/auth/logout/", { method: "POST", body: JSON.stringify({ refresh }) });
      }
    } finally {
      clearTokens();
    }
  },

  /** The signed-in user, or null.
   *
   *  This never throws, and that matters: it runs inside the `_authenticated`
   *  route guard's `beforeLoad`, where an exception breaks the route with an
   *  error boundary instead of redirecting. Every failure mode — no token, an
   *  expired token, the API being unreachable — collapses to "not signed in",
   *  which the guard turns into a clean redirect to /auth. */
  async me(): Promise<CurrentUser | null> {
    if (!readToken(ACCESS_KEY)) return null;
    try {
      const response = await send("/auth/me/");
      if (!response.ok) return null;
      return (await response.json()) as CurrentUser;
    } catch {
      return null;
    }
  },
};

export const apiClient = djangoClient;
