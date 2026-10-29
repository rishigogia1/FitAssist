import React from "react";
import { 
  Trophy, 
  Calendar, 
  Clock, 
  Flame, 
  CheckCircle2, 
  TrendingUp, 
  Dumbbell, 
  Info,
  History,
  Target
} from "lucide-react";
import type { WorkoutHistoryItem, WorkoutHistoryStats } from "@/types/workout";

interface WorkoutProgressSummaryProps {
  stats: WorkoutHistoryStats | null;
  history: WorkoutHistoryItem[];
  hasCompletedToday: boolean;
  todayWorkoutName?: string | null;
  loading?: boolean;
}

export function WorkoutProgressSummary({
  stats,
  history,
  hasCompletedToday,
  todayWorkoutName,
  loading = false,
}: WorkoutProgressSummaryProps) {
  const formatDuration = (totalSeconds: number) => {
    const mins = Math.round(totalSeconds / 60);
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${remMins}m`;
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "Recently";
    try {
      const d = new Date(dateStr);
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(d);
    } catch {
      return "Recently";
    }
  };

  if (loading && !stats) {
    return (
      <div className="mb-8 rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-card)] animate-pulse">
        <div className="h-5 w-44 rounded bg-muted mb-4" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-card-elevated" />
          ))}
        </div>
      </div>
    );
  }

  const completedThisWeek = stats?.completed_this_week ?? 0;
  const totalCompleted = stats?.total_completed ?? 0;
  const totalDurationMinutes = stats?.total_duration_minutes ?? 0;

  return (
    <section className="mb-8 space-y-6">
      {/* Overview Metric Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {/* Today's Target Status */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] transition hover:border-primary/30">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Today's Goal</span>
            <Target className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${hasCompletedToday ? "text-[color:var(--success)]" : "text-foreground"}`}>
              {hasCompletedToday ? "Completed" : "1 Pending"}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {hasCompletedToday ? "Daily target accomplished" : "Scheduled session remaining"}
          </p>
        </div>

        {/* This Week's Completions */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] transition hover:border-primary/30">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">This Week</span>
            <Calendar className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground">{completedThisWeek}</span>
            <span className="text-xs text-muted-foreground">sessions</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Mon – Sun calendar week
          </p>
        </div>

        {/* Total Workouts Completed */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] transition hover:border-primary/30">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Completed</span>
            <Trophy className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground">{totalCompleted}</span>
            <span className="text-xs text-muted-foreground">all-time</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Persisted workout history
          </p>
        </div>

        {/* Total Training Duration */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] transition hover:border-primary/30">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Training Time</span>
            <Clock className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground">
              {totalDurationMinutes < 60
                ? `${totalDurationMinutes}m`
                : `${Math.floor(totalDurationMinutes / 60)}h ${totalDurationMinutes % 60}m`}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Total active session duration
          </p>
        </div>
      </div>

      {/* Plan vs Catalog Clarification Callout */}
      <div className="flex items-start gap-3 rounded-2xl border border-border/80 bg-card/60 p-4 text-xs text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-semibold text-foreground">Understanding your workout plan: </span>
          FitAssist recommends <span className="font-medium text-foreground">1 dedicated session per day</span> based on your goals and recovery. The remaining workouts listed in the Explore section below constitute your curated library templates, not an overdue backlog.
        </div>
      </div>

      {/* Recent Completed History Section */}
      <div className="rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between pb-4 border-b border-border/60">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <h3 className="text-base font-semibold text-foreground">Completed Workout History</h3>
          </div>
          <span className="text-xs text-muted-foreground font-medium">
            {history.length} {history.length === 1 ? "record" : "records"}
          </span>
        </div>

        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-card-elevated text-muted-foreground mb-3">
              <Dumbbell className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-foreground">No completed workouts yet</p>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              Complete your first workout above to begin building your persistent training log and tracking your stats.
            </p>
          </div>
        ) : (
          <div className="mt-4 divide-y divide-border/60">
            {history.slice(0, 5).map((item) => (
              <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between py-3.5 gap-2">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-success/15 text-[color:var(--success)] mt-0.5">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">{item.workout_name}</h4>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span className="rounded-md bg-secondary px-1.5 py-0.5 font-medium">{item.category}</span>
                      <span>·</span>
                      <span>{item.completed_exercises} / {item.total_exercises} exercises</span>
                      <span>·</span>
                      <span>{formatDate(item.completed_at)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground self-end sm:self-center">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-primary" /> {formatDuration(item.duration_seconds)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Flame className="h-3.5 w-3.5 text-primary" /> {item.estimated_calories} kcal
                  </span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                    {Math.round(item.completion_percentage)}% done
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
