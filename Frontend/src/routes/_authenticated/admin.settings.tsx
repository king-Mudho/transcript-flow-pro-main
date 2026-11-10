import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Download, Plus, Upload } from "lucide-react";
import { AdminShell, RequireAdmin, useCurrentUser } from "@/components/admin-shell";
import { Card, CardHeader, Empty, Note, Spinner, Switch, Tag } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiClient, type SiteSettings, type TeamMember } from "@/lib/api-client";
import { downloadBlob, formatDate, statusLabel } from "@/lib/msu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const SECTIONS = [
  ["prices", "Prices"],
  ["branches", "Zimpost branches"],
  ["suburbs", "Harare suburbs"],
  ["team", "Team and roles"],
  ["messages", "Messages to graduates"],
  ["stages", "Stage warnings"],
  ["msu", "MSU staff portal"],
  ["brand", "Brand"],
  ["data", "Data protection"],
  ["audit", "Audit log"],
] as const;
type Section = (typeof SECTIONS)[number][0];

export const Route = createFileRoute("/_authenticated/admin/settings")({
  validateSearch: z.object({
    section: z.enum(SECTIONS.map(([s]) => s) as [Section, ...Section[]]).catch("prices"),
  }),
  head: () => ({
    meta: [{ title: "Settings — MSU Transcript admin" }, { name: "robots", content: "noindex" }],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { section } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: user } = useCurrentUser();
  return (
    <AdminShell title="Settings" wide>
      <RequireAdmin user={user}>
        <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
          <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto lg:flex-col">
            {SECTIONS.map(([value, label]) => (
              <button
                key={value}
                onClick={() => navigate({ search: { section: value } })}
                aria-current={section === value ? "page" : undefined}
                className={cn(
                  "h-9 shrink-0 rounded-lg px-3 text-left text-[13px] font-semibold",
                  section === value ? "bg-navy text-white" : "text-ink-2 hover:bg-white",
                )}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="min-w-0">
            {section === "prices" && <SettingsForm section="prices" />}
            {section === "brand" && <SettingsForm section="brand" />}
            {section === "messages" && <SettingsForm section="messages" />}
            {section === "stages" && <SettingsForm section="stages" />}
            {section === "msu" && <SettingsForm section="msu" />}
            {section === "data" && <DataProtection />}
            {section === "branches" && <Branches />}
            {section === "suburbs" && <Suburbs />}
            {section === "team" && <Team />}
            {section === "audit" && <AuditLog />}
          </div>
        </div>
      </RequireAdmin>
    </AdminShell>
  );
}

/* ----------------------------------------------------------- settings */

const MESSAGE_KEYS: [string, string][] = [
  ["received", "Received"],
  ["submitted_to_msu", "Submitted to MSU"],
  ["collected_from_msu", "Collected from MSU"],
  ["rejected", "Rejected"],
  ["dispatched_harare", "Dispatched (Harare, with driver)"],
  ["dispatched_zimpost", "Dispatched (Zimpost)"],
  ["collected", "Collected"],
];

function SettingsForm({
  section,
}: {
  section: "prices" | "brand" | "messages" | "stages" | "msu";
}) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => apiClient.settings() });
  const [form, setForm] = useState<SiteSettings | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);
  if (!form) return <Spinner />;

  const set = <K extends keyof SiteSettings>(k: K, v: SiteSettings[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  async function save(fields: (keyof SiteSettings)[]) {
    if (!form) return;
    setSaving(true);
    try {
      const changes = Object.fromEntries(fields.map((f) => [f, form[f]])) as Partial<SiteSettings>;
      const updated = await apiClient.updateSettings(changes);
      queryClient.setQueryData(["settings"], updated);
      queryClient.invalidateQueries({ queryKey: ["public-settings"] });
      toast.success("Saved. The change is in the audit log.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  if (section === "prices") {
    return (
      <Card className="p-5">
        <CardHeader title="Prices" />
        <p className="mt-1 text-[13px] text-ink-3">
          One price per request, however many documents. New requests use these prices; existing
          requests keep the fee they were made with.
        </p>
        <div className="mt-4 grid max-w-md gap-4 sm:grid-cols-2">
          <div>
            <Label>Harare doorstep (US$)</Label>
            <Input
              className="mt-1.5"
              type="number"
              min={1}
              step="0.01"
              value={form.fee_harare}
              onChange={(e) => set("fee_harare", Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Zimpost branch (US$)</Label>
            <Input
              className="mt-1.5"
              type="number"
              min={1}
              step="0.01"
              value={form.fee_outside}
              onChange={(e) => set("fee_outside", Number(e.target.value))}
            />
          </div>
        </div>
        <Button
          className="mt-5"
          disabled={saving}
          onClick={() => save(["fee_harare", "fee_outside"])}
        >
          Save prices
        </Button>
      </Card>
    );
  }

  if (section === "brand") {
    return (
      <Card className="p-5">
        <CardHeader title="Brand" />
        <p className="mt-1 text-[13px] text-ink-3">
          Every screen, PDF and message reads these. The defaults are today&apos;s name, navy and
          gold.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextSetting
            label="Service name"
            value={form.service_name}
            onChange={(v) => set("service_name", v)}
          />
          <TextSetting
            label="Short name (header)"
            value={form.short_name}
            onChange={(v) => set("short_name", v)}
          />
          <TextSetting
            label="Second line (header)"
            value={form.tagline}
            onChange={(v) => set("tagline", v)}
          />
          <TextSetting
            label="Operator line (footer)"
            value={form.operator_line}
            onChange={(v) => set("operator_line", v)}
          />
          <TextSetting
            label="Support WhatsApp number"
            value={form.support_whatsapp}
            onChange={(v) => set("support_whatsapp", v)}
          />
          <TextSetting
            label="Logo image link (optional)"
            value={form.logo_url}
            onChange={(v) => set("logo_url", v)}
          />
          <TextSetting
            label="Hub pickup address (labels)"
            value={form.hub_address}
            onChange={(v) => set("hub_address", v)}
          />
          <div className="grid grid-cols-2 gap-3">
            <ColourSetting
              label="Main colour"
              value={form.primary_color}
              onChange={(v) => set("primary_color", v)}
            />
            <ColourSetting
              label="Accent colour"
              value={form.accent_color}
              onChange={(v) => set("accent_color", v)}
            />
          </div>
        </div>
        <Button
          className="mt-5"
          disabled={saving}
          onClick={() =>
            save([
              "service_name",
              "short_name",
              "tagline",
              "operator_line",
              "support_whatsapp",
              "logo_url",
              "hub_address",
              "primary_color",
              "accent_color",
            ])
          }
        >
          Save brand
        </Button>
      </Card>
    );
  }

  if (section === "messages") {
    return (
      <Card className="p-5">
        <CardHeader title="Messages to graduates" />
        <p className="mt-1 text-[13px] text-ink-3">
          Used for the Send update WhatsApp button and the automatic SMS and email at each stage.
          Placeholders:{" "}
          <code className="text-[12px]">
            {
              "{first_name} {name} {reference} {link} {fee} {branch} {driver} {driver_phone} {reason} {support}"
            }
          </code>
        </p>
        <div className="mt-4 space-y-4">
          {MESSAGE_KEYS.map(([key, label]) => (
            <div key={key}>
              <Label>{label}</Label>
              <Textarea
                className="mt-1.5"
                value={form.message_templates[key] ?? ""}
                onChange={(e) =>
                  set("message_templates", { ...form.message_templates, [key]: e.target.value })
                }
              />
            </div>
          ))}
        </div>
        <Button className="mt-5" disabled={saving} onClick={() => save(["message_templates"])}>
          Save messages
        </Button>
      </Card>
    );
  }

  if (section === "stages") {
    const stages = ["received", "submitted_to_msu", "collected_from_msu", "dispatched"];
    return (
      <Card className="p-5">
        <CardHeader title="Stage warnings" />
        <p className="mt-1 text-[13px] text-ink-3">
          Days in a stage before the requests list turns amber, then red. Red requests show on the
          Overview and under the bell.
        </p>
        <table className="mt-4 text-[13px]">
          <thead className="text-left text-[12px] uppercase tracking-wider text-ink-3">
            <tr>
              <th className="py-2 pr-6">Stage</th>
              <th className="py-2 pr-4">Amber after</th>
              <th className="py-2">Red after</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((s) => {
              const pair = form.stage_thresholds[s] ?? [2, 4];
              return (
                <tr key={s}>
                  <td className="py-1.5 pr-6 font-medium">{statusLabel(s)}</td>
                  {[0, 1].map((i) => (
                    <td key={i} className="py-1.5 pr-4">
                      <Input
                        type="number"
                        min={0}
                        className="w-20"
                        value={pair[i]}
                        onChange={(e) => {
                          const next: [number, number] = [...pair] as [number, number];
                          next[i] = Number(e.target.value);
                          set("stage_thresholds", { ...form.stage_thresholds, [s]: next });
                        }}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        <Button className="mt-5" disabled={saving} onClick={() => save(["stage_thresholds"])}>
          Save warnings
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <CardHeader title="MSU staff portal" />
      <p className="mt-1 text-[13px] text-ink-3">
        Off by default. While off, MSU staff accounts cannot sign in and your team handles every
        stage. When on, MSU staff confirm releases and rejections themselves at /msu. They never see
        phone numbers or addresses. Graduates see no change.
      </p>
      <label className="mt-4 flex max-w-md items-center justify-between rounded-lg border border-line px-4 py-3 text-[14px] font-semibold">
        MSU staff portal
        <Switch
          label="MSU staff portal"
          checked={form.msu_portal_enabled}
          onChange={async (v) => {
            set("msu_portal_enabled", v);
            try {
              const updated = await apiClient.updateSettings({ msu_portal_enabled: v });
              queryClient.setQueryData(["settings"], updated);
              toast.success(v ? "MSU portal switched on" : "MSU portal switched off");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Could not save");
            }
          }}
        />
      </label>
      <Note tone="info" className="mt-4 max-w-xl">
        Invite MSU staff from Team and roles with the MSU staff role.
      </Note>
    </Card>
  );
}

function TextSetting({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input className="mt-1.5" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function ColourSetting({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1.5 flex gap-2">
        <input
          type="color"
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-9 w-10 cursor-pointer rounded border border-line"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- branches */

function Branches() {
  const { data, refetch } = useQuery({
    queryKey: ["branches-all"],
    queryFn: () => apiClient.listAllBranches(),
  });
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [filter, setFilter] = useState("");
  const file = useRef<HTMLInputElement>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiClient.createBranch({
        branch_name: name.trim(),
        branch_area: area.trim(),
        active: true,
      });
      setName("");
      setArea("");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add");
    }
  }

  async function importCsv(f: File | undefined) {
    if (!f) return;
    try {
      const res = await apiClient.importBranches(f);
      toast.success(`Imported: ${res.created} new, ${res.updated} updated`);
      if (res.errors.length) toast.error(res.errors.slice(0, 3).join(" "));
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      if (file.current) file.current.value = "";
    }
  }

  const rows = (data ?? []).filter((b) =>
    `${b.branch_name} ${b.branch_area}`.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <Card className="p-5">
      <CardHeader
        title="Zimpost branches"
        action={
          <>
            <input
              ref={file}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              aria-label="Import CSV"
              onChange={(e) => importCsv(e.target.files?.[0])}
            />
            <Button variant="outline" size="sm" onClick={() => file.current?.click()}>
              <Upload /> Import CSV
            </Button>
          </>
        }
      />
      <p className="mt-1 text-[13px] text-ink-3">
        CSV columns: branch_name, branch_area, and optionally active. A branch any request uses can
        only be deactivated.
      </p>
      <form onSubmit={add} className="mt-4 flex flex-wrap gap-2">
        <Input
          placeholder="Branch (town)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-48"
          required
        />
        <Input
          placeholder="Area or province"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          className="w-48"
          required
        />
        <Button type="submit">
          <Plus /> Add branch
        </Button>
        <Input
          placeholder="Filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="ml-auto w-48"
        />
      </form>
      {!data ? (
        <Spinner />
      ) : (
        <table className="mt-4 w-full text-left text-[13px]">
          <thead className="border-b border-line text-[12px] uppercase tracking-wider text-ink-3">
            <tr>
              <th className="py-2">Branch</th>
              <th className="py-2">Area</th>
              <th className="py-2">Active</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((b) => (
              <tr key={b.id}>
                <td className="py-2 font-medium">{b.branch_name}</td>
                <td className="py-2 text-ink-3">{b.branch_area}</td>
                <td className="py-2">
                  <Switch
                    label={`${b.branch_name} active`}
                    checked={b.active}
                    onChange={async (v) => {
                      await apiClient.updateBranch(b.id, { active: v });
                      refetch();
                    }}
                  />
                </td>
                <td className="py-2 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (!window.confirm(`Delete ${b.branch_name}?`)) return;
                      try {
                        await apiClient.deleteBranch(b.id);
                        refetch();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Could not delete");
                      }
                    }}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

/* ----------------------------------------------------------- suburbs */

function Suburbs() {
  const queryClient = useQueryClient();
  const { data, refetch } = useQuery({ queryKey: ["suburbs"], queryFn: () => apiClient.suburbs() });
  const { data: unmapped, refetch: refetchUnmapped } = useQuery({
    queryKey: ["suburbs-unmapped"],
    queryFn: () => apiClient.unmappedSuburbs(),
  });
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [mapTo, setMapTo] = useState<Record<string, string>>({});

  const after = () => {
    refetch();
    refetchUnmapped();
    queryClient.invalidateQueries({ queryKey: ["public-settings"] });
  };

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <CardHeader
          title="Typed as Other, to map"
          action={<Tag tone={unmapped?.length ? "gold" : "neutral"}>{unmapped?.length ?? 0}</Tag>}
        />
        <p className="mt-1 text-[13px] text-ink-3">
          Graduates can type a suburb that is not on the list. Point it at a listed suburb so
          dispatch groups it correctly, or add it to the list.
        </p>
        {unmapped && unmapped.length > 0 ? (
          <ul className="mt-3 divide-y divide-line">
            {unmapped.map((u) => (
              <li key={u.name} className="flex flex-wrap items-center gap-2 py-2.5 text-[13px]">
                <span className="min-w-[160px] font-semibold">“{u.name}”</span>
                <span className="text-ink-3">{u.count} request(s)</span>
                <select
                  aria-label={`Map ${u.name} to`}
                  value={mapTo[u.name] ?? ""}
                  onChange={(e) => setMapTo({ ...mapTo, [u.name]: e.target.value })}
                  className="ml-auto h-9 rounded-lg border border-line px-2"
                >
                  <option value="">Choose a suburb…</option>
                  {data
                    ?.filter((s) => s.active)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
                <Button
                  size="sm"
                  disabled={!mapTo[u.name]}
                  onClick={async () => {
                    const res = await apiClient.mapSuburb(u.name, Number(mapTo[u.name]));
                    toast.success(`Mapped ${res.mapped} request(s)`);
                    after();
                  }}
                >
                  Map
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      const s = await apiClient.saveSuburb({ name: u.name, area: "" });
                      await apiClient.mapSuburb(u.name, s.id);
                      after();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Could not add");
                    }
                  }}
                >
                  Add to list
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Nothing to map.</Empty>
        )}
      </Card>
      <Card className="p-5">
        <CardHeader title="Harare suburbs" />
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await apiClient.saveSuburb({ name, area });
              setName("");
              setArea("");
              after();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not add");
            }
          }}
        >
          <Input
            placeholder="Suburb"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-48"
            required
          />
          <Input
            placeholder="Area (optional)"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="w-48"
          />
          <Button type="submit">
            <Plus /> Add suburb
          </Button>
        </form>
        <ul className="mt-4 grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
          {data?.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-2 border-b border-line py-2 text-[13px]"
            >
              <span className={s.active ? "" : "text-ink-3 line-through"}>
                {s.name} {s.area && <span className="text-ink-3">· {s.area}</span>}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-[11px] text-ink-3">{s.request_count}</span>
                <Switch
                  label={`${s.name} active`}
                  checked={!!s.active}
                  onChange={async (v) => {
                    await apiClient.saveSuburb({ active: v }, s.id);
                    after();
                  }}
                />
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/* --------------------------------------------------------------- team */

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  staff: "Staff",
  msu_staff: "MSU staff",
};

function Team() {
  const { data: me } = useCurrentUser();
  const { data, refetch } = useQuery({ queryKey: ["team"], queryFn: () => apiClient.team() });
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("staff");

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiClient.invite(email.trim(), name.trim(), role);
      toast.success(`Invitation sent to ${email}`);
      setEmail("");
      setName("");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not invite");
    }
  }

  async function update(m: TeamMember, changes: Partial<TeamMember>) {
    try {
      await apiClient.updateMember(m.id, changes);
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update");
    }
  }

  return (
    <Card className="p-5">
      <CardHeader title="Team and roles" />
      <p className="mt-1 text-[13px] text-ink-3">
        Staff run requests, dispatch and payments. Only admins change prices, branches, drivers, the
        team and settings. MSU staff see only the MSU portal, and only while it is switched on.
      </p>
      <form onSubmit={invite} className="mt-4 flex flex-wrap gap-2">
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-56"
          required
        />
        <Input
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-48"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="h-9 rounded-lg border border-line px-2"
          aria-label="Role"
        >
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
          <option value="msu_staff">MSU staff</option>
        </select>
        <Button type="submit">Invite by email</Button>
      </form>
      {!data ? (
        <Spinner />
      ) : (
        <table className="mt-4 w-full text-left text-[13px]">
          <thead className="border-b border-line text-[12px] uppercase tracking-wider text-ink-3">
            <tr>
              <th className="py-2">Person</th>
              <th className="py-2">Role</th>
              <th className="py-2">Two-step</th>
              <th className="py-2">Last sign in</th>
              <th className="py-2">Active</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.map((m) => (
              <tr key={m.id}>
                <td className="py-2">
                  <div className="font-semibold">{m.full_name || m.email}</div>
                  <div className="text-[12px] text-ink-3">{m.email}</div>
                </td>
                <td className="py-2">
                  <select
                    aria-label={`Role for ${m.email}`}
                    value={m.role ?? "staff"}
                    disabled={m.id === me?.id}
                    onChange={(e) => update(m, { role: e.target.value as TeamMember["role"] })}
                    className="h-8 rounded-lg border border-line px-2"
                  >
                    {Object.entries(ROLE_LABEL).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2">
                  {m.mfa_enabled ? (
                    <span className="flex items-center gap-2">
                      <Tag tone="success">On</Tag>
                      <button
                        type="button"
                        className="text-[12px] text-ink-3 underline"
                        onClick={async () => {
                          if (
                            !window.confirm(
                              `Reset two-step sign in for ${m.email}? They set it up again at their next sign in.`,
                            )
                          )
                            return;
                          await apiClient.resetMemberMfa(m.id);
                          refetch();
                        }}
                      >
                        Reset
                      </button>
                    </span>
                  ) : (
                    <Tag>Not set up</Tag>
                  )}
                </td>
                <td className="py-2 text-ink-3">
                  {m.last_login ? formatDate(m.last_login) : "Never"}
                </td>
                <td className="py-2">
                  <Switch
                    label={`${m.email} active`}
                    checked={m.is_active}
                    disabled={m.id === me?.id}
                    onChange={(v) => update(m, { is_active: v })}
                  />
                </td>
                <td className="py-2 text-right">
                  {m.id !== me?.id && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger"
                      onClick={async () => {
                        if (
                          !window.confirm(
                            `Delete ${m.email}? They can no longer sign in. History keeps their name, marked as a deleted account. To pause access instead, switch Active off.`,
                          )
                        )
                          return;
                        try {
                          await apiClient.deleteMember(m.id);
                          toast.success(`${m.email} deleted`);
                          refetch();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Could not delete");
                        }
                      }}
                    >
                      Delete
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

/* --------------------------------------------------- data protection */

function DataProtection() {
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => apiClient.settings() });
  const queryClient = useQueryClient();
  const [reg, setReg] = useState("");
  const [months, setMonths] = useState<number | "">("");
  useEffect(() => {
    if (data) setMonths(data.retention_months);
  }, [data]);

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <CardHeader title="Retention" />
        <p className="mt-1 text-[13px] text-ink-3">
          After this many months, closed requests (collected or rejected) lose their street address,
          directions, phone number, email and clearance files. Names, references, dates and fees
          stay for reports. The job runs daily and writes to the audit log.
        </p>
        <div className="mt-4 flex items-end gap-2">
          <div>
            <Label>Months to keep contact details</Label>
            <Input
              className="mt-1.5 w-28"
              type="number"
              min={1}
              value={months}
              onChange={(e) => setMonths(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </div>
          <Button
            onClick={async () => {
              try {
                const updated = await apiClient.updateSettings({
                  retention_months: Number(months),
                });
                queryClient.setQueryData(["settings"], updated);
                toast.success("Saved");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Could not save");
              }
            }}
          >
            Save
          </Button>
        </div>
      </Card>
      <Card className="p-5">
        <CardHeader title="One graduate's data" />
        <p className="mt-1 text-[13px] text-ink-3">
          When a graduate asks to see or delete their data. Both actions go in the audit log.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div>
            <Label>Registration number</Label>
            <Input className="mt-1.5 w-48" value={reg} onChange={(e) => setReg(e.target.value)} />
          </div>
          <Button
            variant="outline"
            disabled={!reg.trim()}
            onClick={async () => {
              try {
                downloadBlob(
                  await apiClient.exportGraduate(reg.trim()),
                  `graduate-${reg.trim().toUpperCase()}.json`,
                );
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Export failed");
              }
            }}
          >
            <Download /> Export their data
          </Button>
          <Button
            variant="danger"
            disabled={!reg.trim()}
            onClick={async () => {
              if (
                !window.confirm(
                  `Remove the address, phone, email and files of every request for ${reg.trim().toUpperCase()}? This cannot be undone.`,
                )
              )
                return;
              try {
                const res = await apiClient.eraseGraduate(reg.trim());
                toast.success(`Anonymised ${res.anonymised} request(s)`);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Could not erase");
              }
            }}
          >
            Erase their contact details
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------- audit log */

function AuditLog() {
  const [entity, setEntity] = useState("");
  const [search, setSearch] = useState("");
  const { data } = useQuery({
    queryKey: ["audit", entity, search],
    queryFn: () => apiClient.auditLog({ entity, search }),
  });
  const show = (v: unknown) =>
    v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return (
    <Card className="p-5">
      <CardHeader
        title="Audit log"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={async () => downloadBlob(await apiClient.auditLogXlsx(), "audit-log.xlsx")}
          >
            <Download /> Export
          </Button>
        }
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <select
          value={entity}
          onChange={(e) => setEntity(e.target.value)}
          className="h-9 rounded-lg border border-line px-2 text-[13px]"
          aria-label="What changed"
        >
          <option value="">Everything</option>
          <option value="settings">Prices and settings</option>
          <option value="user">Team and roles</option>
          <option value="branch">Branches</option>
          <option value="suburb">Suburbs</option>
          <option value="driver">Drivers</option>
          <option value="graduate">Graduate data</option>
          <option value="requests">Retention</option>
        </select>
        <Input
          placeholder="Search by person or item"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56"
        />
      </div>
      {!data ? (
        <Spinner />
      ) : data.length === 0 ? (
        <Empty>No entries.</Empty>
      ) : (
        <table className="mt-4 w-full text-left text-[12px]">
          <thead className="border-b border-line uppercase tracking-wider text-ink-3">
            <tr>
              <th className="py-2">When</th>
              <th className="py-2">Who</th>
              <th className="py-2">What</th>
              <th className="py-2">Old</th>
              <th className="py-2">New</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line align-top">
            {data.map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap py-2 pr-3 text-ink-3">
                  {formatDate(a.created_at)}
                </td>
                <td className="py-2 pr-3">{a.actor}</td>
                <td className="py-2 pr-3">
                  <div className="font-semibold">{a.action}</div>
                  <div className="text-ink-3">{a.entity_id}</div>
                </td>
                <td className="max-w-[220px] break-words py-2 pr-3 text-ink-3">
                  {show(a.old_value)}
                </td>
                <td className="max-w-[220px] break-words py-2">{show(a.new_value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
