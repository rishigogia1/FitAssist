import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Dumbbell, Apple, TrendingUp, Bot, Settings, LogOut, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/workout", label: "Workout", icon: Dumbbell },
  { to: "/nutrition", label: "Nutrition", icon: Apple },
  { to: "/progress", label: "Progress", icon: TrendingUp },
  { to: "/ai-coach", label: "AI Coach", icon: Bot },
] as const;

export function AppSidebar() {
  const { location } = useRouterState();
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <aside className="hidden md:flex fixed inset-y-0 left-0 w-64 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-2 px-6 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-primary-foreground">
          <Activity className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-tight">FitAssist</p>
          <p className="text-[11px] text-muted-foreground">AI Fitness Coach</p>
        </div>
      </div>

      <p className="px-6 pb-2 pt-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Menu
      </p>
      <nav className="flex-1 space-y-1 px-3">
        {nav.map((item) => {
  const active = location?.pathname === item.to || location?.pathname?.startsWith(item.to + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
              <span>{item.label}</span>
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
            </Link>
          );
        })}
      </nav>

      <div className="m-3 rounded-xl border border-sidebar-border bg-card-elevated p-4">
        <p className="text-xs font-medium text-foreground">Upgrade to Pro</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Unlock advanced AI plans and analytics.</p>
        <button 
          onClick={() => navigate({ to: "/pro" })}
          className="mt-3 w-full rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
        >
          Upgrade
        </button>
      </div>

      <div className="space-y-1 px-3 pb-4">
        <Link 
          to="/settings"
          className={cn(
            "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
            location?.pathname === "/settings" 
              ? "bg-sidebar-accent text-foreground" 
              : "text-sidebar-foreground hover:bg-sidebar-accent/60"
          )}
        >
          <Settings className={cn("h-4 w-4", location?.pathname === "/settings" ? "text-primary" : "")} /> Settings
        </Link>
        <button
          onClick={() => { logout(); navigate({ to: "/" }); }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/60"
        >
          <LogOut className="h-4 w-4" /> Logout
        </button>
      </div>
    </aside>
  );
}
