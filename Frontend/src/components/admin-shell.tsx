import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  Banknote,
  Bell,
  Bike,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageCheck,
  Plus,
  Search,
  Settings,
  Truck,
  X,
  BarChart3,
} from "lucide-react";
import { apiClient, type CurrentUser, type SearchGroup } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { StageChip } from "@/components/ds";
import { BrandMark } from "@/components/site-header";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/lib/msu";

const IDLE_MINUTES = 30;

type NavItem = {
  to: string;
  label: string;
  icon: typeof FileText;
  count?: number;
  search?: Record<string, string>;
  title?: string;
  adminOnly?: boolean;
  match?: (path: string) => boolean;
};

export function useCurrentUser() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiClient.me(),
    staleTime: 5 * 60 * 1000,
  });
}

/** Ends the session after a period with no activity (B11.1). */
function useIdleSignOut() {
  const navigate = useNavigate();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(
        async () => {
          await apiClient.logout();
          navigate({ to: "/auth", search: { idle: true } });
        },
        IDLE_MINUTES * 60 * 1000,
      );
    };
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [navigate]);
}

export function AdminShell({
  children,
  title,
  actions,
  wide,
}: {
  children: React.ReactNode;
  title?: React.ReactNode;
  actions?: React.ReactNode;
  wide?: boolean;
}) {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: user } = useCurrentUser();
  const { data: counts } = useQuery({
    queryKey: ["sidebar-counts"],
    queryFn: () => apiClient.sidebarCounts(),
    refetchInterval: 60_000,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  useIdleSignOut();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => setMenuOpen(false), [path]);

  async function signOut() {
    await apiClient.logout();
    navigate({ to: "/auth" });
  }

  const nav: NavItem[] = [
    {
      to: "/admin",
      label: "Overview",
      icon: LayoutDashboard,
      match: (p) => p === "/admin" || p === "/admin/",
    },
    {
      to: "/admin/requests",
      search: { status: "received" },
      label: "Requests",
      icon: FileText,
      count: counts?.received,
      title: "Requests (badge: Received, waiting to go to MSU)",
    },
    {
      to: "/admin/collections",
      label: "MSU and collections",
      icon: PackageCheck,
      count: counts?.ready_at_msu,
    },
    {
      to: "/admin/dispatch",
      label: "Dispatch",
      icon: Truck,
      count: counts?.dispatch_ready,
      title: "Dispatch (badge: Harare requests ready for a batch)",
      match: (p) => p.startsWith("/admin/dispatch") || p.startsWith("/admin/batch"),
    },
    { to: "/admin/drivers", label: "Drivers", icon: Bike },
    { to: "/admin/cash", label: "Cash and payments", icon: Banknote },
    { to: "/admin/reports", label: "Reports", icon: BarChart3 },
    { to: "/admin/settings", label: "Settings", icon: Settings, adminOnly: true },
  ];

  const attention = counts?.attention;
  const attentionTotal = attention
    ? attention.stuck + attention.failed_messages + attention.unmapped_suburbs
    : 0;

  const sidebar = (
    <div className="flex h-full flex-col bg-navy text-white">
      <div className="flex h-16 items-center justify-between px-4">
        <Link to="/admin" className="rounded-lg">
          <BrandMark />
        </Link>
        <button
          type="button"
          aria-label="Close menu"
          className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-white/10 md:hidden"
          onClick={() => setMenuOpen(false)}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav aria-label="Workspace" className="mt-2 flex-1 space-y-0.5 overflow-y-auto px-3">
        {nav
          .filter((item) => !item.adminOnly || user?.is_admin)
          .map((item) => {
            const active = item.match ? item.match(path) : path.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                search={item.search}
                title={item.title}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-lg px-3 text-[14px] font-medium",
                  active
                    ? "bg-white/12 text-white"
                    : "text-white/75 hover:bg-white/8 hover:text-white",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="flex-1">{item.label}</span>
                {!!item.count && (
                  <span className="rounded-full bg-gold px-2 py-0.5 text-[11px] font-bold text-ink tabular">
                    {item.count}
                  </span>
                )}
              </Link>
            );
          })}
      </nav>
      <div className="m-3 rounded-xl bg-white/8 p-3">
        <div className="truncate text-[14px] font-semibold">{user?.full_name || user?.email}</div>
        <div className="truncate text-[12px] text-white/65">
          {user?.is_admin ? "Admin" : "Staff"} · {user?.email}
        </div>
        <button
          type="button"
          onClick={signOut}
          className="mt-2 inline-flex h-8 items-center gap-2 rounded-md px-2 text-[13px] text-white/80 hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-ground text-[14px]">
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 md:block">
        {sidebar}
      </aside>
      {menuOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-ink/40"
            onClick={() => setMenuOpen(false)}
          />
          <div className="relative h-full w-72 max-w-[85vw]">{sidebar}</div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-white px-3 md:px-6">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMenuOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-2 hover:bg-ground md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-ground px-3 text-left text-[14px] text-ink-3 hover:border-ink-3/40 md:max-w-md"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="truncate">Search reference, name, reg number or phone</span>
            <kbd className="ml-auto hidden rounded border border-line bg-white px-1.5 text-[11px] text-ink-3 sm:block">
              Ctrl K
            </kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <Button asChild size="default" className="hidden sm:inline-flex">
              <Link to="/admin/requests/new">
                <Plus /> New request
              </Link>
            </Button>
            <AttentionBell
              total={attentionTotal}
              attention={attention}
              openBatches={attention?.open_batches ?? 0}
            />
          </div>
        </header>
        <main
          id="main"
          className={cn("mx-auto w-full flex-1 p-4 md:p-6", wide ? "max-w-[1400px]" : "max-w-6xl")}
        >
          {(title || actions) && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              {typeof title === "string" ? (
                <h1 className="text-[24px] font-bold">{title}</h1>
              ) : (
                title
              )}
              {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
          )}
          {children}
        </main>
      </div>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

function AttentionBell({
  total,
  attention,
  openBatches,
}: {
  total: number;
  attention?: { stuck: number; failed_messages: number; unmapped_suburbs: number };
  openBatches: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={`Needs attention: ${total}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg text-ink-2 hover:bg-ground"
      >
        <Bell className="h-5 w-5" />
        {total > 0 && (
          <span className="absolute right-1 top-1 min-w-[18px] rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-[18px] text-white">
            {total}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-xl border border-line bg-white p-2 shadow-lg">
          <div className="px-2 py-1.5 text-[12px] font-semibold uppercase tracking-wider text-ink-3">
            Needs attention
          </div>
          <BellRow
            to="/admin"
            label="Requests stuck past their red limit"
            count={attention?.stuck ?? 0}
          />
          <BellRow
            to="/admin/reports"
            search={{ tab: "messages" }}
            label="Messages that failed to send"
            count={attention?.failed_messages ?? 0}
          />
          <BellRow
            to="/admin/settings"
            search={{ section: "suburbs" }}
            label="Suburbs typed as Other to map"
            count={attention?.unmapped_suburbs ?? 0}
          />
          <BellRow
            to="/admin/dispatch"
            label="Batches out for delivery"
            count={openBatches}
            muted
          />
        </div>
      )}
    </div>
  );
}

function BellRow({
  to,
  label,
  count,
  search,
  muted,
}: {
  to: string;
  label: string;
  count: number;
  search?: Record<string, string>;
  muted?: boolean;
}) {
  return (
    <Link
      to={to}
      search={search}
      className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-[14px] hover:bg-ground"
    >
      <span>{label}</span>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[12px] font-semibold tabular",
          count && !muted ? "bg-danger-tint text-danger" : "bg-ground text-ink-3",
        )}
      >
        {count}
      </span>
    </Link>
  );
}

/** Ctrl K search across reference, name, reg number and phone (B9.1). A
 *  scanned label types the reference and Enter, which opens the request. */
export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ exact: string | null; groups: SearchGroup[] } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setQ("");
      setData(null);
    }
  }, [open]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setData(null);
      return;
    }
    let live = true;
    setBusy(true);
    const t = setTimeout(() => {
      apiClient
        .search(q.trim())
        .then((d) => live && setData(d))
        .catch(() => undefined)
        .finally(() => live && setBusy(false));
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  function openRequest(id: string) {
    onClose();
    navigate({ to: "/admin/requests/$requestId", params: { requestId: id } });
  }

  async function onEnter() {
    const text = q.trim();
    if (!text) return;
    const result = data ?? (await apiClient.search(text).catch(() => null));
    if (result?.exact) return openRequest(result.exact);
    const first = result?.groups[0]?.results[0];
    if (first) openRequest(first.id);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="top-[12%] max-w-xl translate-y-0 gap-0 p-0">
        <DialogTitle className="sr-only">Search requests</DialogTitle>
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search className="h-4 w-4 text-ink-3" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onEnter();
              }
            }}
            placeholder="Reference, name, reg number, or the last digits of a phone"
            className="h-12 flex-1 bg-transparent text-[15px] outline-none"
            aria-label="Search"
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {q.trim().length < 2 && (
            <p className="px-3 py-6 text-center text-[14px] text-ink-3">
              Type at least two characters. Scanning a label opens the request.
            </p>
          )}
          {data && data.groups.length === 0 && !busy && (
            <p className="px-3 py-6 text-center text-[14px] text-ink-3">No requests match “{q}”.</p>
          )}
          {data?.groups.map((group) => (
            <div key={group.type} className="mb-2">
              <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                {group.label}
              </div>
              {group.results.map((r) => (
                <button
                  key={`${group.type}-${r.id}`}
                  type="button"
                  onClick={() => openRequest(r.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-ground focus:bg-ground focus:outline-none"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold">{r.full_name}</span>
                    <span className="block truncate text-[12px] text-ink-3">
                      {r.reference_number} · {r.reg_number} · {formatPhone(r.phone_number)}
                    </span>
                  </span>
                  <StageChip status={r.status} />
                </button>
              ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RequireAdmin({
  user,
  children,
}: {
  user: CurrentUser | null | undefined;
  children: React.ReactNode;
}) {
  if (!user) return null;
  if (!user.is_admin) {
    return (
      <div className="rounded-xl border border-line bg-white p-8 text-center">
        <ClipboardList className="mx-auto h-8 w-8 text-ink-3" />
        <h2 className="mt-3 text-[18px] font-semibold">Only admins can open Settings</h2>
        <p className="mt-1 text-[14px] text-ink-3">
          Ask an admin if something here needs changing.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
