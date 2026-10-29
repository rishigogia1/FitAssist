import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  trend?: string;
  trendPositive?: boolean;
  className?: string;
  to?: string;
}

export function StatCard({ icon: Icon, label, value, hint, trend, trendPositive, className, to }: StatCardProps) {
  const content = (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-5 transition-all duration-300",
        to ? "hover:border-primary/50 hover:bg-card-elevated/50 active:scale-[0.98] cursor-pointer" : "hover:border-primary/30",
        "shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-card-elevated text-primary group-hover:bg-primary/10 transition-colors">
          <Icon className="h-5 w-5" />
        </div>
        {trend && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              trendPositive ? "bg-success/15 text-[color:var(--success)]" : "bg-destructive/15 text-destructive",
            )}
          >
            {trend}
          </span>
        )}
      </div>
      <div className="mt-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );

  if (to) {
    return <Link to={to} className="group block h-full">{content}</Link>;
  }

  return content;
}

