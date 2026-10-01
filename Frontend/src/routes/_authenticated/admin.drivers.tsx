import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiClient, type Driver } from "@/lib/api-client";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/drivers")({
  head: () => ({ meta: [{ title: "Admin — Drivers" }, { name: "robots", content: "noindex" }] }),
  component: DriversPage,
});

type Form = {
  full_name: string;
  phone: string;
  whatsapp_phone: string;
  bike_registration: string;
  photo_url: string;
  notes: string;
  active: boolean;
};

const EMPTY: Form = {
  full_name: "",
  phone: "",
  whatsapp_phone: "",
  bike_registration: "",
  photo_url: "",
  notes: "",
  active: true,
};

function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Driver | "new" | null>(null);

  async function load() {
    setLoading(true);
    try {
      setDrivers(await apiClient.listDrivers());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load drivers");
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleActive(d: Driver) {
    try {
      await apiClient.saveDriver({ active: !d.active }, d.id);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <AdminShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Drivers</h1>
          <p className="text-sm text-muted-foreground">
            Drivers carry Harare deliveries. Inactive drivers cannot be given a new batch.
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus className="mr-2 h-4 w-4" /> Add driver
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Bike</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {drivers.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.full_name}</TableCell>
                  <TableCell>{d.phone}</TableCell>
                  <TableCell>{d.whatsapp_phone}</TableCell>
                  <TableCell>{d.bike_registration || "—"}</TableCell>
                  <TableCell>
                    <Checkbox checked={d.active} onCheckedChange={() => toggleActive(d)} />
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => setEditing(d)}>
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {drivers.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    No drivers yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {editing && (
        <DriverDialog
          driver={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </AdminShell>
  );
}

function DriverDialog({
  driver,
  onClose,
  onSaved,
}: {
  driver: Driver | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Form>(
    driver
      ? {
          full_name: driver.full_name,
          phone: driver.phone,
          whatsapp_phone: driver.whatsapp_phone,
          bike_registration: driver.bike_registration,
          photo_url: driver.photo_url,
          notes: driver.notes,
          active: driver.active,
        }
      : EMPTY,
  );
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiClient.saveDriver(form, driver?.id);
      toast.success(driver ? "Driver updated" : "Driver added");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save driver");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{driver ? "Edit driver" : "Add driver"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div>
            <Label>Full name</Label>
            <Input
              className="mt-1.5"
              value={form.full_name}
              onChange={(e) => set({ full_name: e.target.value })}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Phone</Label>
              <Input
                className="mt-1.5"
                value={form.phone}
                onChange={(e) => set({ phone: e.target.value })}
                placeholder="0771234567"
                required
              />
              <p className="mt-1 text-xs text-muted-foreground">Saved as +263…</p>
            </div>
            <div>
              <Label>WhatsApp (if different)</Label>
              <Input
                className="mt-1.5"
                value={form.whatsapp_phone}
                onChange={(e) => set({ whatsapp_phone: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Bike registration</Label>
            <Input
              className="mt-1.5"
              value={form.bike_registration}
              onChange={(e) => set({ bike_registration: e.target.value })}
            />
          </div>
          <div>
            <Label>Photo link (optional)</Label>
            <Input
              className="mt-1.5"
              type="url"
              value={form.photo_url}
              onChange={(e) => set({ photo_url: e.target.value })}
              placeholder="https://…"
            />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              className="mt-1.5"
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.active} onCheckedChange={(v) => set({ active: v === true })} />
            Active
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
