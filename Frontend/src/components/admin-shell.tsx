import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { FileText, GraduationCap, LogOut, MapPin } from "lucide-react";
import { toast } from "sonner";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await apiClient.logout();
    toast.success("Signed out");
    navigate({ to: "/auth" });
  }

  const nav = [
    { to: "/admin", label: "Requests", icon: FileText },
    { to: "/admin/branches", label: "Zimpost Branches", icon: MapPin },
  ] as const;

  return (
    <div className="flex min-h-screen bg-muted/20">
      <aside className="hidden w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="text-sm">
            <div className="font-semibold">MSU Transcript</div>
            <div className="text-[11px] opacity-70">Admin</div>
          </div>
        </div>
        <nav className="mt-4 flex-1 px-3">
          {nav.map((item) => {
            const active = item.to === "/admin" ? path === "/admin" : path.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`mb-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm ${active ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60"}`}
              >
                <item.icon className="h-4 w-4" /> {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3">
          <Button
            variant="ghost"
            onClick={signOut}
            className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-card px-4 py-3 md:hidden">
          <Link to="/admin" className="flex items-center gap-2 font-semibold">
            <GraduationCap className="h-5 w-5" /> Admin
          </Link>
          <Button size="sm" variant="ghost" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
