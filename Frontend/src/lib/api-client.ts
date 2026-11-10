// The app's single data layer. Routes and components call `apiClient` and never
// fetch the Django API directly, so URL construction, auth headers, token
// refresh and error shaping all live in one place.
export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://127.0.0.1:8000/api";

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

export type Zone = "harare" | "outside_harare";

export type StatusValue =
  "received" | "submitted_to_msu" | "collected_from_msu" | "rejected" | "dispatched" | "collected";

export type DocumentType = "transcript" | "degree_certificate" | "not_recorded";

export type Item = { document_type: DocumentType; quantity: number; label?: string };

export type Suburb = {
  id: number;
  name: string;
  area: string;
  active?: boolean;
  request_count?: number;
};

export type PublicSettings = {
  fee_harare: number;
  fee_outside: number;
  service_name: string;
  short_name: string;
  tagline: string;
  operator_line: string;
  support_whatsapp: string;
  primary_color: string;
  accent_color: string;
  logo_url: string;
  terms_version: string;
  suburbs: Suburb[];
};

export type SiteSettings = Omit<PublicSettings, "suburbs"> & {
  hub_address: string;
  msu_portal_enabled: boolean;
  retention_months: number;
  stage_thresholds: Record<string, [number, number]>;
  message_templates: Record<string, string>;
  updated_at: string;
};

export type StatusResult = {
  reference_number: string;
  full_name: string;
  programme_name: string;
  status: StatusValue;
  status_reason: string | null;
  paid: boolean;
  amount_paid: number;
  zone: Zone;
  fee_amount: number;
  payment_method: string;
  created_at: string;
  documents: string;
  items: Item[];
  deliver_to: string;
  address_editable: boolean;
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
  clearance_verified: boolean;
  clearance_file_count: number;
  zone: Zone;
  harare_address: string | null;
  suburb: string;
  suburb_mapped: boolean;
  directions: string;
  zimpost_branch: string | null;
  zimpost_branches?: { id: string; branch_name: string; branch_area: string } | null;
  items: Item[];
  documents: string;
  fee_amount: number;
  payment_method: string;
  amount_paid: number;
  paid: boolean;
  payment_state: "paid" | "part_paid" | "unpaid";
  cash_due: number;
  status: StatusValue;
  status_reason: string | null;
  status_changed_at: string | null;
  days_in_stage: number;
  stage_level: "ok" | "amber" | "red";
  exported_at: string | null;
  batch: string | null;
  batch_number: string | null;
  driver_name: string | null;
  zimpost_tracking_number: string;
  dispatched_at: string | null;
  handin_number: string | null;
  ready_at_msu_at: string | null;
  channel: "web" | "whatsapp" | "phone" | "walk_in";
  created_by_name: string | null;
  consent_at: string | null;
  terms_version: string;
  consent_via: string;
  possible_duplicate: boolean;
  anonymised_at: string | null;
  allowed_next: StatusValue[];
  locked: boolean;
  created_at: string;
  updated_at: string;
};

export type ClearanceFile = {
  id: string;
  original_name: string;
  content_type: string;
  size: number;
  created_at?: string;
};

export type Payment = {
  id: string;
  amount: number;
  method: string;
  received_by: string;
  received_at: string;
  receipt_number: string;
  note: string;
  is_reversal: boolean;
  reversed: boolean;
  created_at: string;
};

export type TeamNote = { id: number; text: string; author: string; created_at: string };

export type RequestDetail = RequestRow & {
  clearance_files: ClearanceFile[];
  payments: Payment[];
  team_notes: TeamNote[];
  duplicates: { id: string; reference_number: string; status: StatusValue }[];
  neighbours: {
    previous: string | null;
    next: string | null;
    position: number | null;
    total: number;
  };
};

export type Page<T> = { count: number; page: number; page_size: number; results: T[] };

export type RequestFilters = {
  search: string;
  status: string;
  zone: string;
  exported: string;
  date_from: string;
  date_to: string;
  payment?: string;
  duplicate?: string;
  min_days?: string;
  channel?: string;
  handin?: string;
  order?: string;
};

export type RequestEvent = {
  id: number;
  event_type:
    | "status_change"
    | "details_edit"
    | "dispatch"
    | "payment"
    | "note"
    | "msu"
    | "handin"
    | "message";
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
  off_today: boolean;
  state: "free" | "batch_out" | "off_today";
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
  delivered: number;
  cash_to_collect: number;
  cash_expected: number | null;
  cash_handed_in: number | null;
  cash_received_by_name: string | null;
  variance: number | null;
  variance_note: string;
  reconciled_at: string | null;
};

export type BatchDetail = Batch & { requests: RequestRow[] };

export type BulkResult = {
  moved: number;
  skipped: { reference_number: string; reason: string }[];
  handin_list?: { id: string; number: string } | null;
};

export type BulkExtras = {
  reason?: string;
  note?: string;
  dispatched_at?: string;
  zimpost_tracking_number?: string;
};

export type DeliveryEdit = Partial<{
  zone: Zone;
  harare_address: string | null;
  suburb: string | null;
  directions: string | null;
  zimpost_branch: string | null;
  phone_number: string;
  email: string | null;
  clearance_verified: boolean;
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
  zone: Zone;
  harare_address: string | null;
  suburb: string | null;
  directions: string | null;
  zimpost_branch_id: string | null;
  items: Item[];
  clearance_file_ids: string[];
  consent: boolean;
  confirm_duplicate?: boolean;
  website?: string;
  channel?: "whatsapp" | "phone" | "walk_in";
};

export type SubmitResult = {
  id: string;
  reference_number: string;
  fee_amount: number;
  reg_format_ok: boolean;
};

/** Thrown when the graduate already has a request in progress (HTTP 409). */
export class DuplicateRequestError extends Error {
  reference: string | null;
  constructor(message: string, reference: string | null) {
    super(message);
    this.reference = reference;
  }
}

/** Thrown at sign-in when the account needs its six-digit code. */
export class OtpRequiredError extends Error {}

export type CurrentUser = {
  id: string;
  email: string;
  full_name: string;
  roles: string[];
  is_admin: boolean;
  is_team: boolean;
  is_msu: boolean;
  mfa_enabled: boolean;
  mfa_required: boolean;
  mfa_verified: boolean;
};

export type TeamMember = {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "staff" | "msu_staff" | null;
  is_active: boolean;
  mfa_enabled: boolean;
  last_login: string | null;
};

export type SearchGroup = {
  type: string;
  label: string;
  results: {
    id: string;
    reference_number: string;
    full_name: string;
    reg_number: string;
    phone_number: string;
    status: StatusValue;
  }[];
};

export type SidebarCounts = {
  received: number;
  dispatch_ready: number;
  zimpost_ready: number;
  ready_at_msu: number;
  attention: {
    stuck: number;
    failed_messages: number;
    unmapped_suburbs: number;
    open_batches: number;
  };
};

export type Overview = {
  by_status: Record<StatusValue, number>;
  total: number;
  new_today: number;
  new_this_week: number;
  open: number;
  stuck: {
    id: string;
    reference_number: string;
    full_name: string;
    status: StatusValue;
    days: number;
  }[];
  avg_days_per_stage: Record<string, number | null>;
  cash: { expected_this_week: number; received_this_week: number; outstanding: number };
  deliveries_per_driver: { driver: string; deliveries: number }[];
  funnel: { step: string; visits: number }[];
};

export type CashReport = {
  date: string;
  drivers: {
    driver: string;
    expected: number;
    handed_in: number;
    variance: number;
    batches: { id: string; batch_number: string; note: string }[];
  }[];
};

export type MonthlyReport = {
  month: string;
  handed_in: number;
  released: number;
  rejected: number;
  rejected_by_reason: { reason: string; count: number }[];
  avg_days_with_msu: number | null;
  longest_days_with_msu: number | null;
  deliveries: Record<string, number>;
  avg_days_end_to_end: number | null;
};

export type HandInList = {
  id: string;
  number: string;
  created_by: string;
  created_at: string;
  request_count: number;
};

export type MsuRequest = {
  id: string;
  reference_number: string;
  full_name: string;
  reg_number: string;
  programme_name: string;
  year_completed: number;
  items: Item[];
  documents: string;
  cleared_department: boolean;
  cleared_accounts: boolean;
  cleared_library: boolean;
  clearance_verified: boolean;
  clearance_files: ClearanceFile[];
  status: StatusValue;
  status_reason: string | null;
  handin_number: string | null;
  ready_at_msu_at: string | null;
  days_with_msu: number | null;
  stage_level: "ok" | "amber" | "red";
  submitted_at: string | null;
};

export type HandInDetail = HandInList & { requests: (RequestRow | MsuRequest)[] };

export type SavedView = {
  id: number;
  name: string;
  params: Record<string, string>;
  created_at: string;
};

export type Notification = {
  id: number;
  request_id: string;
  reference_number: string;
  channel: string;
  recipient: string;
  message: string;
  status: "sent" | "failed" | "skipped";
  error: string;
  created_at: string;
};

export type AuditEntry = {
  id: number;
  actor: string;
  action: string;
  entity: string;
  entity_id: string;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
};

/* ------------------------------------------------------- token management */
/* Tokens live in localStorage so a session survives a page reload. Every
   accessor is guarded against `window` being undefined, because route loaders
   also run during server-side rendering. */

const ACCESS_KEY = "msu.access_token";
const REFRESH_KEY = "msu.refresh_token";

function readToken(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
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

export function hasSession(): boolean {
  return !!readToken(ACCESS_KEY);
}

/* ------------------------------------------------------ request plumbing */

/** Pull a human-readable message out of a DRF error body. */
function messageFromBody(body: unknown, fallback: string): string {
  if (typeof body === "string" && body.trim()) return body;
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.detail === "string") return record.detail;
    for (const value of Object.values(record)) {
      if (typeof value === "string") return value;
      if (Array.isArray(value) && typeof value[0] === "string") return value[0];
      if (Array.isArray(value) && value[0] && typeof value[0] === "object") {
        const nested = messageFromBody(value[0], "");
        if (nested) return nested;
      }
    }
  }
  return fallback;
}

async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function toError(response: Response): Promise<Error> {
  const body = await readBody(response);
  if (response.status === 429) {
    return new Error("Too many attempts. Please wait a few minutes and try again.");
  }
  return new Error(messageFromBody(body, `Request failed (${response.status})`));
}

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

/** Perform a request with auth attached, retrying once after a token refresh. */
async function send(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const headers = new Headers(init.headers);
  const access = readToken(ACCESS_KEY);
  if (access) headers.set("Authorization", `Bearer ${access}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.");
  }

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

async function download(path: string): Promise<Blob> {
  const response = await send(path);
  if (!response.ok) throw await toError(response);
  return await response.blob();
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function patch<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

function query(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "" && v !== "all") search.set(k, String(v));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function filterParams(filters: Partial<RequestFilters>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== "" && v !== "all") out[k] = String(v);
  }
  return out;
}

const djangoClient = {
  /* ---- public */

  async publicSettings(): Promise<PublicSettings> {
    return request<PublicSettings>("/settings/public/");
  },

  async listBranches(): Promise<Branch[]> {
    return request<Branch[]>("/branches/?active=true");
  },

  async uploadClearance(file: File): Promise<ClearanceFile> {
    const form = new FormData();
    form.append("file", file);
    return request<ClearanceFile>("/requests/clearance-upload/", { method: "POST", body: form });
  },

  async createRequest(payload: NewRequest): Promise<SubmitResult> {
    // Only what the graduate typed is sent. The server works out the fee and
    // payment method, generates the reference and sets the status.
    const { zimpost_branch_id, channel, ...rest } = payload;
    const body = { ...rest, zimpost_branch: zimpost_branch_id, ...(channel ? { channel } : {}) };
    const response = await send(channel ? "/requests/assisted/" : "/requests/", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (response.status === 409) {
      const data = (await readBody(response)) as {
        detail: string;
        reference_number: string | null;
      };
      throw new DuplicateRequestError(data.detail, data.reference_number);
    }
    if (!response.ok) throw await toError(response);
    const data = (await response.json()) as SubmitResult & { id: string };
    return data;
  },

  /** Public status check. Resolves to null when nothing matches. */
  async lookupStatus(ref: string, reg: string): Promise<StatusResult | null> {
    const response = await send(
      `/requests/status/${query({ reference_number: ref, reg_number: reg })}`,
    );
    if (response.status === 404) return null;
    if (!response.ok) throw await toError(response);
    return (await response.json()) as StatusResult;
  },

  async findReference(
    reg_number: string,
    phone_number: string,
  ): Promise<{ reference_number: string; status: StatusValue }[]> {
    const data = await post<{ results: { reference_number: string; status: StatusValue }[] }>(
      "/requests/find-reference/",
      { reg_number, phone_number },
    );
    return data.results;
  },

  track(event: { name: "page_view" | "funnel"; path?: string; step?: string; visit?: string }) {
    if (typeof window === "undefined") return;
    // keepalive lets the count finish even when the page is being left.
    fetch(`${API_URL}/analytics/`, {
      method: "POST",
      body: JSON.stringify(event),
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    }).catch(() => undefined);
  },

  reportError(payload: { message: string; stack?: string; url?: string }) {
    if (typeof window === "undefined") return;
    fetch(`${API_URL}/client-errors/`, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    }).catch(() => undefined);
  },

  /* ---- requests */

  async listRequests(filters: Partial<RequestFilters>, page: number): Promise<Page<RequestRow>> {
    return request<Page<RequestRow>>(`/requests/${query({ ...filterParams(filters), page })}`);
  },

  async requestCounts(filters: Partial<RequestFilters>): Promise<Record<string, number>> {
    return request(`/requests/counts/${query(filterParams(filters))}`);
  },

  async sidebarCounts(): Promise<SidebarCounts> {
    return request("/requests/sidebar-counts/");
  },

  async search(q: string): Promise<{ exact: string | null; groups: SearchGroup[] }> {
    return request(`/requests/search/${query({ q })}`);
  },

  async getRequest(id: string, listFilters: Partial<RequestFilters> = {}): Promise<RequestDetail> {
    return request(`/requests/${id}/${query(filterParams(listFilters))}`);
  },

  async bulkUpdateStatus(
    target: { ids: string[] } | { filters: Partial<RequestFilters> },
    status: string,
    extras: BulkExtras = {},
  ): Promise<BulkResult> {
    const payload: Record<string, unknown> =
      "filters" in target
        ? { filters: filterParams(target.filters), status }
        : { ...target, status };
    if (extras.reason) payload.status_reason = extras.reason;
    if (extras.note) payload.note = extras.note;
    if (extras.dispatched_at) payload.dispatched_at = extras.dispatched_at;
    if (extras.zimpost_tracking_number)
      payload.zimpost_tracking_number = extras.zimpost_tracking_number;
    return post<BulkResult>("/requests/bulk-update-status/", payload);
  },

  async setReadyAtMsu(ids: string[], ready = true): Promise<BulkResult> {
    return post("/requests/ready-at-msu/", { ids, ready });
  },

  async updateRequest(id: string, changes: DeliveryEdit): Promise<RequestRow> {
    return patch<RequestRow>(`/requests/${id}/`, changes);
  },

  /** Admins only. Refused for requests with payments or out for delivery. */
  async deleteRequest(id: string, reason: string): Promise<void> {
    await request<void>(`/requests/${id}/`, { method: "DELETE", body: JSON.stringify({ reason }) });
  },

  async bulkDeleteRequests(
    ids: string[],
    reason: string,
  ): Promise<{ deleted: number; skipped: { reference_number: string; reason: string }[] }> {
    return post("/requests/bulk-delete/", { ids, reason });
  },

  async requestHistory(id: string): Promise<RequestEvent[]> {
    return request<RequestEvent[]>(`/requests/${id}/history/`);
  },

  async addNote(id: string, text: string): Promise<TeamNote> {
    return post(`/requests/${id}/notes/`, { text });
  },

  async graduateMessage(id: string): Promise<{ phone: string; message: string }> {
    return request(`/requests/${id}/message/`);
  },

  async recordPayment(
    id: string,
    amount: number,
    note: string,
    received_at?: string,
  ): Promise<Payment> {
    return post(`/requests/${id}/payments/`, { amount, note, received_at });
  },

  async reversePayment(paymentId: string, reason: string): Promise<Payment> {
    return post(`/payments/${paymentId}/reverse/`, { reason });
  },

  async clearanceFile(requestId: string, fileId: string): Promise<Blob> {
    return download(`/requests/${requestId}/clearance/${fileId}/`);
  },

  async exportRequests(filters: Partial<RequestFilters>): Promise<Blob> {
    return download(`/requests/export/${query(filterParams(filters))}`);
  },

  async exportGraduate(reg: string): Promise<Blob> {
    return download(`/requests/graduate-data/${query({ reg_number: reg })}`);
  },

  async eraseGraduate(reg: string): Promise<{ anonymised: number }> {
    return post("/requests/graduate-data/", { reg_number: reg, confirm: true });
  },

  /* ---- saved views, notifications, hand-in lists */

  async savedViews(): Promise<SavedView[]> {
    return request("/saved-views/");
  },
  async saveView(name: string, params: Record<string, string>): Promise<SavedView> {
    return post("/saved-views/", { name, params });
  },
  async deleteView(id: number): Promise<void> {
    await request(`/saved-views/${id}/`, { method: "DELETE" });
  },

  async notifications(statusFilter?: string): Promise<Notification[]> {
    return request(`/notifications/${query({ status: statusFilter })}`);
  },

  async handinLists(): Promise<HandInList[]> {
    return request("/handin-lists/");
  },
  async handinList(id: string): Promise<HandInDetail> {
    return request(`/handin-lists/${id}/`);
  },

  /* ---- reports */

  async overview(filters: Partial<RequestFilters> = {}): Promise<Overview> {
    return request(`/reports/overview/${query(filterParams(filters))}`);
  },
  async cashReport(date?: string): Promise<CashReport> {
    return request(`/reports/cash/${query({ date })}`);
  },
  async monthlyReport(month: string): Promise<MonthlyReport> {
    return request(`/reports/monthly/${query({ month })}`);
  },
  async monthlyReportXlsx(month: string): Promise<Blob> {
    return download(`/reports/monthly/${query({ month, export: "xlsx" })}`);
  },

  /* ---- settings, suburbs, branches, audit */

  async settings(): Promise<SiteSettings> {
    return request("/settings/");
  },
  async updateSettings(changes: Partial<SiteSettings>): Promise<SiteSettings> {
    return patch("/settings/", changes);
  },
  async suburbs(): Promise<Suburb[]> {
    return request("/suburbs/");
  },
  async saveSuburb(suburb: Partial<Suburb>, id?: number): Promise<Suburb> {
    return id ? patch(`/suburbs/${id}/`, suburb) : post("/suburbs/", suburb);
  },
  async deleteSuburb(id: number): Promise<void> {
    await request(`/suburbs/${id}/`, { method: "DELETE" });
  },
  async unmappedSuburbs(): Promise<{ name: string; count: number }[]> {
    return request("/suburbs/unmapped/");
  },
  async mapSuburb(name: string, suburbId: number): Promise<{ mapped: number }> {
    return post("/suburbs/unmapped/", { name, suburb_id: suburbId });
  },

  async listAllBranches(): Promise<Branch[]> {
    return request<Branch[]>("/branches/");
  },
  async createBranch(branch: Omit<Branch, "id">): Promise<Branch> {
    return post<Branch>("/branches/", branch);
  },
  async updateBranch(id: string, branch: Partial<Omit<Branch, "id">>): Promise<Branch> {
    return patch<Branch>(`/branches/${id}/`, branch);
  },
  async deleteBranch(id: string): Promise<void> {
    await request<void>(`/branches/${id}/`, { method: "DELETE" });
  },
  async importBranches(
    file: File,
  ): Promise<{ created: number; updated: number; errors: string[] }> {
    const form = new FormData();
    form.append("file", file);
    return request("/branches/import/", { method: "POST", body: form });
  },

  async auditLog(
    params: { entity?: string; action?: string; search?: string } = {},
  ): Promise<AuditEntry[]> {
    return request(`/audit-log/${query(params)}`);
  },
  async auditLogXlsx(): Promise<Blob> {
    return download(`/audit-log/${query({ export: "xlsx" })}`);
  },

  /* ---- team */

  async team(): Promise<TeamMember[]> {
    return request("/team/");
  },
  async invite(email: string, full_name: string, role: string): Promise<TeamMember> {
    return post("/team/", { email, full_name, role });
  },
  async updateMember(id: string, changes: Partial<TeamMember>): Promise<TeamMember> {
    return patch(`/team/${id}/`, changes);
  },
  async deleteMember(id: string): Promise<void> {
    await request<void>(`/team/${id}/`, { method: "DELETE" });
  },
  async resetMemberMfa(id: string): Promise<TeamMember> {
    return post(`/team/${id}/reset-mfa/`);
  },

  /* ---- drivers and dispatch */

  async listDrivers(): Promise<Driver[]> {
    return request<Driver[]>("/drivers/");
  },
  async saveDriver(driver: Partial<Driver>, id?: string): Promise<Driver> {
    return id ? patch<Driver>(`/drivers/${id}/`, driver) : post<Driver>("/drivers/", driver);
  },
  async deleteDriver(id: string): Promise<void> {
    await request<void>(`/drivers/${id}/`, { method: "DELETE" });
  },
  async setDriverAvailable(id: string, available: boolean): Promise<Driver> {
    return post(`/drivers/${id}/availability/`, { available_today: available });
  },

  async dispatchReady(): Promise<RequestRow[]> {
    return request<RequestRow[]>("/dispatch/ready/");
  },
  async zimpostReady(): Promise<RequestRow[]> {
    return request<RequestRow[]>("/dispatch/zimpost-ready/");
  },
  async listBatches(statusFilter?: string): Promise<Batch[]> {
    return request<Batch[]>(`/dispatch/batches/${query({ status: statusFilter })}`);
  },
  async getBatch(id: string): Promise<BatchDetail> {
    return request<BatchDetail>(`/dispatch/batches/${id}/`);
  },
  async createBatch(requestIds: string[], driverId: string): Promise<BatchDetail> {
    return post<BatchDetail>("/dispatch/batches/", {
      request_ids: requestIds,
      driver_id: driverId,
    });
  },
  async resolveBatchItem(
    batchId: string,
    requestId: string,
    delivered: boolean,
    reason?: string,
  ): Promise<BatchDetail> {
    return post<BatchDetail>(`/dispatch/batches/${batchId}/resolve/`, {
      request_id: requestId,
      delivered,
      reason,
    });
  },
  async closeBatch(batchId: string, cashHandedIn: number, note: string): Promise<BatchDetail> {
    return post<BatchDetail>(`/dispatch/batches/${batchId}/close/`, {
      cash_handed_in: cashHandedIn,
      note,
    });
  },

  /* ---- MSU portal */

  async msuQueue(
    tab: string,
    handin?: string,
    search?: string,
  ): Promise<{
    counts: Record<string, number>;
    reasons: Record<string, string>;
    results: MsuRequest[];
  }> {
    return request(`/msu/queue/${query({ tab, handin, search })}`);
  },
  async msuReady(ids: string[]): Promise<BulkResult> {
    return post("/msu/ready/", { ids });
  },
  async msuReject(id: string, reason_code: string, note: string): Promise<MsuRequest> {
    return post(`/msu/requests/${id}/reject/`, { reason_code, note });
  },

  /* ---- auth */

  async login(
    email: string,
    password: string,
    otp?: string,
    keepSignedIn = false,
  ): Promise<{ mfa_setup_required: boolean }> {
    const response = await send(
      "/auth/login/",
      {
        method: "POST",
        body: JSON.stringify({ email, password, otp, keep_signed_in: keepSignedIn }),
      },
      false,
    );
    const body = (await readBody(response)) as Record<string, unknown> | null;
    if (response.status === 400 && body?.otp_required) {
      throw new OtpRequiredError(String(body.detail ?? "Enter your code."));
    }
    if (!response.ok) {
      if (response.status === 429)
        throw new Error("Too many attempts. Wait a while and try again.");
      throw new Error(messageFromBody(body, "Sign in failed"));
    }
    const data = body as { access: string; refresh: string; mfa_setup_required: boolean };
    storeTokens(data.access, data.refresh);
    return { mfa_setup_required: data.mfa_setup_required };
  },

  async mfaSetup(): Promise<{ secret: string; otpauth_uri: string }> {
    return post("/auth/mfa/setup/");
  },

  async mfaConfirm(code: string): Promise<void> {
    const data = await post<{ access: string; refresh: string }>("/auth/mfa/confirm/", {
      code,
      refresh: readToken(REFRESH_KEY),
    });
    storeTokens(data.access, data.refresh);
  },

  async requestPasswordReset(email: string): Promise<void> {
    await post<void>("/auth/password-reset/", { email });
  },

  async confirmPasswordReset(uid: string, token: string, password: string): Promise<void> {
    await post<void>("/auth/password-reset/confirm/", { uid, token, password });
  },

  /** Blacklist the refresh token server-side, then drop both tokens locally. */
  async logout(): Promise<void> {
    const refresh = readToken(REFRESH_KEY);
    try {
      if (refresh) await post<void>("/auth/logout/", { refresh });
    } catch {
      // Signing out locally still happens.
    } finally {
      clearTokens();
    }
  },

  /** The signed-in user, or null. Never throws (used by route guards). */
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
