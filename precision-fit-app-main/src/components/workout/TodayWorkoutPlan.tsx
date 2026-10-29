import React, { useMemo } from "react";
import { 
  Calendar, 
  Dumbbell, 
  Clock, 
  Flame, 
  CheckCircle2, 
  Play, 
  Eye, 
  Sparkles, 
  Info,
  Loader2,
  RefreshCw,
  AlertCircle
} from "lucide-react";
import type { Workout } from "@/types/workout";

interface TodayWorkoutPlanProps {
  workout: Workout | null;
  status: "loading" | "error" | "empty" | "ready";
  errorMessage?: string | null;
  onRetry?: () => void;
  onOpenDetails: (workout: Workout) => void;
  onStartWorkout: (workout: Workout) => void;
  isStarting?: boolean;
  hasCompletedToday?: boolean;
  completedAt?: string | null;
  userGoal?: string;
  userLevel?: string;
}

export function TodayWorkoutPlan({
  workout,
  status,
  errorMessage,
  onRetry,
  onOpenDetails,
  onStartWorkout,
  isStarting = false,
  hasCompletedToday = false,
  completedAt,
  userGoal,
  userLevel,
}: TodayWorkoutPlanProps) {
  // Localized date formatting matching user's calendar date
  const formattedTodayDate = useMemo(() => {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    }).format(new Date());
  }, []);

  const formatLevel = (level?: string) => {
    if (!level) return "All Levels";
    return level.charAt(0).toUpperCase() + level.slice(1);
  };

  const formatGoal = (goal?: string) => {
    if (!goal) return "Fitness";
    return goal
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  };

  // Derive equipment requirements from explicit workout equipment or exercise equipment list
  const derivedEquipment = useMemo(() => {
    if (!workout) return null;
    if (workout.equipment && workout.equipment.trim().length > 0) {
      return workout.equipment;
    }
    const exerciseEquip = Array.from(
      new Set(
        (workout.exercises ?? [])
          .map((e) => e.equipment)
          .filter((eq): eq is string => Boolean(eq && eq.trim().length > 0))
      )
    );
    if (exerciseEquip.length > 0) {
      return exerciseEquip.join(", ");
    }
    return "Bodyweight / None";
  }, [workout]);

  // Derive target muscles from focus or exercises
  const derivedTargetMuscles = useMemo(() => {
    if (!workout) return null;
    const exerciseMuscles = Array.from(
      new Set(
        (workout.exercises ?? [])
          .flatMap((e) => (e.target_muscles ? e.target_muscles.split(",").map(m => m.trim()) : []))
          .filter((m) => Boolean(m && m.length > 0))
      )
    );
    if (exerciseMuscles.length > 0) {
      return exerciseMuscles.join(", ");
    }
    return workout.focus || "Full Body";
  }, [workout]);

  // Derive deterministic reason "Why this workout?" based on genuine profile and workout data
  const whyThisWorkoutExplanation = useMemo(() => {
    if (!workout) return null;
    const goalText = userGoal ? formatGoal(userGoal) : null;
    const levelText = userLevel ? formatLevel(userLevel) : null;

    if (goalText && levelText) {
      return `This workout aligns with your ${goalText} goal, matches your ${levelText} experience level, and fits your ${workout.duration_minutes}-minute daily training target.`;
    } else if (goalText) {
      return `This workout aligns with your ${goalText} goal and targets ${workout.focus || "your key muscle groups"}.`;
    } else if (levelText) {
      return `This workout matches your ${levelText} fitness level and focuses on balanced full-body conditioning.`;
    }
    return `Selected based on your curated fitness preferences to optimize muscular development and conditioning.`;
  }, [workout, userGoal, userLevel]);

  // Render Loading State
  if (status === "loading") {
    return (
      <section className="mb-8 rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between border-b border-border/60 pb-4">
          <div className="space-y-2">
            <div className="h-3 w-32 rounded bg-muted animate-pulse" />
            <div className="h-5 w-48 rounded bg-muted animate-pulse" />
          </div>
          <div className="h-6 w-24 rounded-full bg-muted animate-pulse" />
        </div>
        <div className="mt-6 flex h-40 items-center justify-center">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm font-medium">Selecting today's recommended workout...</span>
          </div>
        </div>
      </section>
    );
  }

  // Render Error State
  if (status === "error") {
    return (
      <section className="mb-8 rounded-3xl border border-destructive/30 bg-destructive/5 p-6 shadow-[var(--shadow-card)]">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-foreground">Unable to load today's workout plan</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {errorMessage || "We encountered an issue retrieving your workout for today. Please try again."}
            </p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Retry Recommendation
              </button>
            )}
          </div>
        </div>
      </section>
    );
  }

  // Render Empty State
  if (status === "empty" || !workout) {
    return (
      <section className="mb-8 rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-card)] text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-card-elevated text-muted-foreground">
          <Dumbbell className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-foreground">No Workout Scheduled for Today</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          You don't have a scheduled workout for today. Explore the workout library below to choose a session that fits your day.
        </p>
      </section>
    );
  }

  const exerciseCount = workout.exercises?.length ?? 0;

  return (
    <section className="relative mb-8 overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-card-elevated via-card to-card p-6 shadow-[var(--shadow-card)] transition-all hover:border-primary/50">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />

      {/* Top Header Row */}
      <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
            YOUR PLAN FOR TODAY
          </span>
          <p className="mt-0.5 text-xs text-muted-foreground flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium text-foreground">{formattedTodayDate}</span>
            <span>·</span>
            <span>Recommended for Today</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {hasCompletedToday ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/15 px-3 py-1 text-xs font-semibold text-[color:var(--success)] shadow-sm">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Completed Today
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/15 px-3 py-1 text-xs font-semibold text-primary shadow-sm">
              <Sparkles className="h-3.5 w-3.5" />
              Personalized Plan
            </span>
          )}
        </div>
      </div>

      {/* Main Workout Content */}
      <div className="relative mt-5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          {/* Left Column: Title & Description */}
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {workout.category}
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  workout.difficulty === "beginner"
                    ? "bg-success/15 text-[color:var(--success)]"
                    : workout.difficulty === "intermediate"
                    ? "bg-primary/15 text-primary"
                    : "bg-warning/15 text-[color:var(--warning)]"
                }`}
              >
                {formatLevel(workout.difficulty)}
              </span>
            </div>

            <h2 className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {workout.name}
            </h2>

            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
              {workout.description || "A workout selected for your current fitness goal, experience level, and training schedule."}
            </p>

            {/* Why This Workout Block */}
            <div className="mt-4 rounded-2xl border border-border/80 bg-card-elevated/40 p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                <Info className="h-3.5 w-3.5 shrink-0" />
                <span>Why this workout?</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground italic">
                "{whyThisWorkoutExplanation}"
              </p>
            </div>
          </div>

          {/* Right Column: Structured Key Detail Metrics */}
          <div className="w-full lg:w-72 xl:w-80 shrink-0">
            <div className="rounded-2xl border border-border bg-card-elevated/30 p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between pb-1.5 border-b border-border/40">
                <span className="text-muted-foreground">Target muscles</span>
                <span className="font-medium text-foreground text-right max-w-[170px] truncate" title={derivedTargetMuscles || undefined}>
                  {derivedTargetMuscles}
                </span>
              </div>

              <div className="flex items-center justify-between pb-1.5 border-b border-border/40">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-primary" /> Duration
                </span>
                <span className="font-medium text-foreground">
                  {workout.duration_minutes} minutes
                </span>
              </div>

              <div className="flex items-center justify-between pb-1.5 border-b border-border/40">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Flame className="h-3.5 w-3.5 text-primary" /> Est. Calories
                </span>
                <span className="font-medium text-foreground">
                  {workout.estimated_calories} kcal
                </span>
              </div>

              <div className="flex items-center justify-between pb-1.5 border-b border-border/40">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Dumbbell className="h-3.5 w-3.5 text-primary" /> Exercises
                </span>
                <span className="font-medium text-foreground">
                  {exerciseCount}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Equipment</span>
                <span className="font-medium text-foreground text-right max-w-[170px] truncate" title={derivedEquipment || undefined}>
                  {derivedEquipment}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons Row */}
        <div className="mt-6 flex flex-wrap items-center gap-3 pt-2">
          {hasCompletedToday ? (
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => onOpenDetails(workout)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card-elevated px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors shadow-sm"
              >
                <Eye className="h-4 w-4 text-primary" /> View Details
              </button>
              <button
                type="button"
                onClick={() => onStartWorkout(workout)}
                disabled={isStarting}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/20 transition-colors"
              >
                {isStarting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 fill-current" />
                )}
                <span>Restart Workout</span>
              </button>
              <span className="text-xs text-muted-foreground italic sm:ml-2">
                Great job! You already finished today's planned session.
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => onStartWorkout(workout)}
                disabled={isStarting}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 active:scale-[0.98] transition-all shadow-md shadow-primary/25 disabled:opacity-50"
              >
                {isStarting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 fill-current" />
                )}
                <span>Start Today's Workout</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenDetails(workout)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card-elevated px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted hover:border-border/80 transition-colors shadow-sm"
              >
                <Eye className="h-4 w-4 text-primary" /> View Details
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
