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

export type StatusValue =
  "received" | "submitted_to_msu" | "collected_from_msu" | "rejected" | "dispatched" | "collected";

export type StatusResult = {
  reference_number: string;
  full_name: string;
  programme_name: string;
  status: StatusValue;
  status_reason: string | null;
  paid: boolean;
  zone: "harare" | "outside_harare";
  fee_amount: number;
  payment_method: string;
  created_at: string;
  /** When each stage was last reached (status changes only). */
  stages: Record<string, string>;
  branch: { branch_name: string; branch_area: string } | null;
  zimpost: { dispatched_at: string | null; tracking_number: string | null } | null;
  driver: {
    full_name: string;
    phone: string;
    whatsapp_phone: string;
    bike_registration: string;
    photo_url: string | null;
    dispatched_at: string | null;
  } | null;
  delivered_by: string | null;
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
  suburb: string;
  zimpost_branch: string | null;
  zimpost_branches?: { id: string; branch_name: string; branch_area: string } | null;
  fee_amount: number;
  payment_method: string;
  paid: boolean;
  status: StatusValue;
  status_reason: string | null;
  exported_at: string | null;
  batch: string | null;
  batch_number: string | null;
  driver_name: string | null;
  zimpost_tracking_number: string;
  dispatched_at: string | null;
  allowed_next: StatusValue[];
  locked: boolean;
  created_at: string;
  updated_at: string;
};

export type Page<T> = { count: number; page: number; page_size: number; results: T[] };

export type RequestFilters = {
  search: string;
  status: string;
  zone: string;
  exported: string;
  date_from: string;
  date_to: string;
};

export type RequestEvent = {
  id: number;
  event_type: "status_change" | "details_edit" | "dispatch" | "payment" | "note";
  field: string;
  from_value: string | null;
  to_value: string | null;
  note: string;
  actor: string;
  created_at: string;
};

export type Driver = {
  id: string;
  full_name: string;
  phone: string;
  whatsapp_phone: string;
  bike_registration: string;
  photo_url: string;
  active: boolean;
  notes: string;
  created_at: string;
};

export type Batch = {
  id: string;
  batch_number: string;
  status: "out_for_delivery" | "closed";
  driver: Driver;
  dispatched_at: string;
  closed_at: string | null;
  notes: string;
  document_count: number;
  outstanding: number;
};

export type BatchDetail = Batch & { requests: RequestRow[] };

export type BulkResult = {
  moved: number;
  skipped: { reference_number: string; reason: string }[];
};

export type BulkExtras = {
  reason?: string;
  note?: string;
  dispatched_at?: string;
  zimpost_tracking_number?: string;
};

export type DeliveryEdit = Partial<{
  paid: boolean;
  zone: "harare" | "outside_harare";
  harare_address: string | null;
  suburb: string | null;
  zimpost_branch: string | null;
  phone_number: string;
  email: string | null;
}>;

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
  suburb: string | null;
  zimpost_branch_id: string | null;
};

export type CurrentUser = {
  id: string;
  email: string;
  roles: string[];
  is_admin: boolean;
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

function filterQueryString(filters: RequestFilters, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams(extra);
  if (filters.search) params.set("search", filters.search);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.zone !== "all") params.set("zone", filters.zone);
  if (filters.exported !== "all") params.set("exported", filters.exported);
  if (filters.date_from) params.set("date_from", filters.date_from);
  if (filters.date_to) params.set("date_to", filters.date_to);
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
    // Only what the graduate typed is sent. The server works out the fee and
    // payment method, generates the reference and sets the status.
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

  /** One page (50) of requests, filtered on the server. */
  async listRequests(filters: RequestFilters, page: number): Promise<Page<RequestRow>> {
    return request<Page<RequestRow>>(
      `/requests/${filterQueryString(filters, { page: String(page) })}`,
    );
  },

  /** Move requests one stage. Send `ids`, or `filters` to move everything that
   *  matches. Requests that cannot move are skipped and reported back. */
  async bulkUpdateStatus(
    target: { ids: string[] } | { filters: RequestFilters },
    status: string,
    extras: BulkExtras = {},
  ): Promise<BulkResult> {
    const payload: Record<string, unknown> = { ...target, status };
    if (extras.reason) payload.status_reason = extras.reason;
    if (extras.note) payload.note = extras.note;
    if (extras.dispatched_at) payload.dispatched_at = extras.dispatched_at;
    if (extras.zimpost_tracking_number)
      payload.zimpost_tracking_number = extras.zimpost_tracking_number;
    return request<BulkResult>("/requests/bulk-update-status/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async updateRequest(id: string, changes: DeliveryEdit): Promise<RequestRow> {
    return request<RequestRow>(`/requests/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(changes),
    });
  },

  async requestHistory(id: string): Promise<RequestEvent[]> {
    return request<RequestEvent[]>(`/requests/${id}/history/`);
  },

  /** Download every request matching the filters (not just the visible page)
   *  as an .xlsx blob. The server stamps `exported_at` as part of this call. */
  async exportRequests(filters: RequestFilters): Promise<Blob> {
    const response = await send(`/requests/export/${filterQueryString(filters)}`);
    if (!response.ok) throw await toError(response);
    return await response.blob();
  },

  /* ---- drivers and dispatch */

  async listDrivers(): Promise<Driver[]> {
    return request<Driver[]>("/drivers/");
  },
  async saveDriver(driver: Partial<Driver>, id?: string): Promise<Driver> {
    return request<Driver>(id ? `/drivers/${id}/` : "/drivers/", {
      method: id ? "PATCH" : "POST",
      body: JSON.stringify(driver),
    });
  },
  async deleteDriver(id: string): Promise<void> {
    await request<void>(`/drivers/${id}/`, { method: "DELETE" });
  },

  async dispatchReady(): Promise<RequestRow[]> {
    return request<RequestRow[]>("/dispatch/ready/");
  },
  async listBatches(): Promise<Batch[]> {
    return request<Batch[]>("/dispatch/batches/");
  },
  async getBatch(id: string): Promise<BatchDetail> {
    return request<BatchDetail>(`/dispatch/batches/${id}/`);
  },
  async createBatch(requestIds: string[], driverId: string): Promise<BatchDetail> {
    return request<BatchDetail>("/dispatch/batches/", {
      method: "POST",
      body: JSON.stringify({ request_ids: requestIds, driver_id: driverId }),
    });
  },
  async resolveBatchItem(
    batchId: string,
    requestId: string,
    delivered: boolean,
    reason?: string,
  ): Promise<BatchDetail> {
    return request<BatchDetail>(`/dispatch/batches/${batchId}/resolve/`, {
      method: "POST",
      body: JSON.stringify({ request_id: requestId, delivered, reason }),
    });
  },
  async closeBatch(batchId: string): Promise<BatchDetail> {
    return request<BatchDetail>(`/dispatch/batches/${batchId}/close/`, { method: "POST" });
  },

  async login(email: string, password: string): Promise<void> {
    const data = await request<{ access: string; refresh: string }>("/auth/login/", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    storeTokens(data.access, data.refresh);
  },

  async requestPasswordReset(email: string): Promise<void> {
    await request<void>("/auth/password-reset/", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  async confirmPasswordReset(uid: string, token: string, password: string): Promise<void> {
    await request<void>("/auth/password-reset/confirm/", {
      method: "POST",
      body: JSON.stringify({ uid, token, password }),
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
