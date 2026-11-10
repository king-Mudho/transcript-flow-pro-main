import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { AdminShell, useCurrentUser } from "@/components/admin-shell";
import { Card, Empty, Spinner, Switch, Tag } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiClient, type Driver } from "@/lib/api-client";
import { formatPhone, initials } from "@/lib/msu";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/drivers")({
  head: () => ({
    meta: [{ title: "Drivers — MSU Transcript admin" }, { name: "robots", content: "noindex" }],
  }),
  component: DriversPage,
});

const STATE = {
  free: { label: "Free", tone: "success" as const },
  batch_out: { label: "Batch out", tone: "gold" as const },
  off_today: { label: "Off today", tone: "neutral" as const },
};

function DriversPage() {
  const { data: user } = useCurrentUser();
  const { data: drivers, refetch } = useQuery({
    queryKey: ["drivers"],
    queryFn: () => apiClient.listDrivers(),
  });
  const [editing, setEditing] = useState<Partial<Driver> | null>(null);
  const isAdmin = !!user?.is_admin;

  async function setAvailable(d: Driver, available: boolean) {
    try {
      await apiClient.setDriverAvailable(d.id, available);
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <AdminShell
      title="Drivers"
      actions={
        isAdmin && (
          <Button onClick={() => setEditing({ active: true })}>
            <Plus /> Add driver
          </Button>
        )
      }
    >
      <p className="mb-4 text-[13px] text-ink-3">
        Switch off <strong>Available today</strong> for a driver who is off, so they cannot be
        picked for a batch. It switches back on by itself tomorrow.
      </p>
      {!drivers ? (
        <div className="flex justify-center py-16 text-ink-3">
          <Spinner />
        </div>
      ) : drivers.length === 0 ? (
        <Card>
          <Empty>No drivers yet.{isAdmin ? " Add the first one." : ""}</Empty>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {drivers.map((d) => (
            <Card key={d.id} className={d.active ? "p-4" : "p-4 opacity-60"}>
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold-tint font-bold text-navy">
                  {initials(d.full_name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold">{d.full_name}</span>
                    {d.active ? (
                      <Tag tone={STATE[d.state].tone}>{STATE[d.state].label}</Tag>
                    ) : (
                      <Tag>Inactive</Tag>
                    )}
                  </div>
                  <div className="text-[13px] text-ink-3">
                    {formatPhone(d.phone)}
                    {d.bike_registration && ` · Bike ${d.bike_registration}`}
                  </div>
                  {d.notes && <div className="mt-1 text-[12px] text-ink-2">{d.notes}</div>}
                </div>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${d.full_name}`}
                    onClick={() => setEditing(d)}
                  >
                    <Pencil />
                  </Button>
                )}
              </div>
              {d.active && (
                <label className="mt-3 flex items-center justify-between rounded-lg bg-ground px-3 py-2 text-[13px] font-medium">
                  Available today
                  <Switch
                    label={`${d.full_name} available today`}
                    checked={!d.off_today}
                    onChange={(v) => setAvailable(d, v)}
                  />
                </label>
              )}
            </Card>
          ))}
        </div>
      )}
      {editing && (
        <DriverDialog driver={editing} onClose={() => setEditing(null)} onSaved={refetch} />
      )}
    </AdminShell>
  );
}

function DriverDialog({
  driver,
  onClose,
  onSaved,
}: {
  driver: Partial<Driver>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    full_name: driver.full_name ?? "",
    phone: driver.phone ?? "",
    whatsapp_phone:
      driver.whatsapp_phone && driver.whatsapp_phone !== driver.phone ? driver.whatsapp_phone : "",
    bike_registration: driver.bike_registration ?? "",
    photo_url: driver.photo_url ?? "",
    notes: driver.notes ?? "",
    active: driver.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setBusy(true);
    try {
      await apiClient.saveDriver(form, driver.id);
      toast.success("Driver saved");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (
      !driver.id ||
      !window.confirm(
        `Delete ${driver.full_name}? Drivers who have carried a batch can only be deactivated.`,
      )
    )
      return;
    try {
      await apiClient.deleteDriver(driver.id);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{driver.id ? "Edit driver" : "Add driver"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Full name</Label>
            <Input
              className="mt-1.5"
              value={form.full_name}
              onChange={(e) => set("full_name", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Phone</Label>
              <Input
                className="mt-1.5"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="077 123 4567"
              />
            </div>
            <div>
              <Label>WhatsApp (if different)</Label>
              <Input
                className="mt-1.5"
                value={form.whatsapp_phone}
                onChange={(e) => set("whatsapp_phone", e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Bike registration</Label>
            <Input
              className="mt-1.5"
              value={form.bike_registration}
              onChange={(e) => set("bike_registration", e.target.value)}
            />
          </div>
          <div>
            <Label>Photo link (optional)</Label>
            <Input
              className="mt-1.5"
              value={form.photo_url}
              onChange={(e) => set("photo_url", e.target.value)}
              placeholder="https://"
            />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              className="mt-1.5"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
          <label className="flex items-center justify-between text-[14px] font-medium">
            Active
            <Switch label="Active" checked={form.active} onChange={(v) => set("active", v)} />
          </label>
          <div className="flex justify-between gap-2 pt-2">
            {driver.id ? (
              <Button variant="ghost" className="text-danger" onClick={remove}>
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={save}
                disabled={busy || !form.full_name.trim() || !form.phone.trim()}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
