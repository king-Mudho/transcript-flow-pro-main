import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/branches")({
  head: () => ({
    meta: [{ title: "Admin — Zimpost Branches" }, { name: "robots", content: "noindex" }],
  }),
  component: BranchesPage,
});

type Branch = { id: string; branch_name: string; branch_area: string; active: boolean };

function BranchesPage() {
  const [rows, setRows] = useState<Branch[]>([]);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [open, setOpen] = useState(false);

  async function load() {
    try {
      setRows(await apiClient.listAllBranches());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load branches");
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function save(b: Branch) {
    const fields = { branch_name: b.branch_name, branch_area: b.branch_area, active: b.active };
    try {
      if (b.id) {
        await apiClient.updateBranch(b.id, fields);
      } else {
        await apiClient.createBranch(fields);
      }
    } catch (e) {
      return toast.error(e instanceof Error ? e.message : "Save failed");
    }
    toast.success("Saved");
    setOpen(false);
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this branch?")) return;
    try {
      await apiClient.deleteBranch(id);
    } catch (e) {
      return toast.error(e instanceof Error ? e.message : "Delete failed");
    }
    toast.success("Deleted");
    load();
  }

  return (
    <AdminShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Zimpost Branches</h1>
          <p className="text-sm text-muted-foreground">
            Manage branches shown on the public request form.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing({ id: "", branch_name: "", branch_area: "", active: true });
            setOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" /> Add branch
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Branch</TableHead>
              <TableHead>Area</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium">{b.branch_name}</TableCell>
                <TableCell>{b.branch_area}</TableCell>
                <TableCell>{b.active ? "Yes" : "No"}</TableCell>
                <TableCell className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setEditing(b);
                      setOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(b.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                  No branches.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit branch" : "New branch"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <label className="text-sm">Branch name</label>
                <Input
                  value={editing.branch_name}
                  onChange={(e) => setEditing({ ...editing, branch_name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm">Area / city</label>
                <Input
                  value={editing.branch_area}
                  onChange={(e) => setEditing({ ...editing, branch_area: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={editing.active}
                  onCheckedChange={(v) => setEditing({ ...editing, active: v === true })}
                />{" "}
                Active
              </label>
              <Button
                className="w-full"
                onClick={() => save(editing)}
                disabled={!editing.branch_name.trim() || !editing.branch_area.trim()}
              >
                Save
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
