import { useState } from "react";
import { Bell, Search, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

interface TopBarProps {
  title: string;
  subtitle?: string;
}

export function TopBar({ title, subtitle }: TopBarProps) {
  const { email, displayName: globalName } = useAuth();
  const name = globalName || email?.split('@')[0] || "Guest";
  const initials = name.substring(0, 2).toUpperCase();
  const displayName = name;

  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/80 px-6 py-4 backdrop-blur">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>

      <div className="relative hidden md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search workouts, meals…"
          className="h-9 w-72 rounded-xl border border-border bg-card pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-ring/40"
        />
      </div>

      <div className="relative">
        <button 
          onClick={() => setShowNotifications(!showNotifications)}
          className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground transition-colors"
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
        </button>

        {showNotifications && (
          <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-border bg-card p-4 shadow-xl z-50 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-2 mb-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">Notifications</h4>
              <button 
                onClick={() => setShowNotifications(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="py-6 text-center text-xs text-muted-foreground">
              No new notifications
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-2 py-1.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary text-xs font-semibold text-primary-foreground uppercase">
          {initials}
        </div>
        <div className="hidden pr-2 sm:block">
          <p className="text-xs font-medium leading-tight capitalize">{displayName}</p>
          <p className="text-[10px] text-muted-foreground">Pro Member</p>
        </div>
      </div>
    </header>
  );
}

