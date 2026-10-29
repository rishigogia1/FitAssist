import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Clock,
  Flame,
  Target,
  Dumbbell,
  Play,
  Layers,
  Wrench,
  AlertCircle,
  X,
  Loader2,
} from "lucide-react";
import type { Workout } from "@/types/workout";
import { ExerciseBreakdown } from "./ExerciseBreakdown";

interface WorkoutPreviewModalProps {
  workout: Workout | null;
  isOpen: boolean;
  onClose: () => void;
  onStartWorkout: (workout: Workout) => Promise<void> | void;
  isStarting?: boolean;
}

export function WorkoutPreviewModal({
  workout,
  isOpen,
  onClose,
  onStartWorkout,
  isStarting = false,
}: WorkoutPreviewModalProps) {
  const [startError, setStartError] = useState<string | null>(null);

  if (!workout) return null;

  // Calculate derived summary statistics safely
  const totalExercises = workout.exercises?.length ?? 0;
  const totalSets = (workout.exercises ?? []).reduce(
    (sum, ex) => sum + (typeof ex.sets === "number" ? ex.sets : 0),
    0
  );

  // Derived or explicit equipment requirements
  const equipmentRequirement =
    workout.equipment ||
    Array.from(
      new Set(
        (workout.exercises ?? [])
          .map((e) => e.equipment)
          .filter((eq): eq is string => Boolean(eq && eq.trim().length > 0))
      )
    ).join(", ") ||
    null;

  const formatLevel = (level: string) => {
    if (!level) return "All Levels";
    return level.charAt(0).toUpperCase() + level.slice(1);
  };

  const handleStart = async () => {
    if (isStarting) return; // Prevent double-clicks
    setStartError(null);
    try {
      await onStartWorkout(workout);
    } catch (err: any) {
      setStartError(err.message || "Failed to start workout session. Please try again.");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden p-0 border-border bg-card shadow-2xl flex flex-col">
        {/* Sticky Header with Workout Overview */}
        <div className="border-b border-border bg-card/95 px-6 pt-6 pb-5 backdrop-blur-md">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 pr-6">
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

              <DialogTitle className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                {workout.name}
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs sm:text-sm text-muted-foreground line-clamp-2">
                {workout.description}
              </DialogDescription>
            </div>
          </div>

          {/* Key Metric Highlights */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-card-elevated/40 p-2.5">
              <Clock className="h-4 w-4 text-primary shrink-0" />
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Duration</p>
                <p className="text-xs sm:text-sm font-semibold text-foreground">{workout.duration_minutes} min</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-card-elevated/40 p-2.5">
              <Flame className="h-4 w-4 text-primary shrink-0" />
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Est. Calories</p>
                <p className="text-xs sm:text-sm font-semibold text-foreground">{workout.estimated_calories} kcal</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-card-elevated/40 p-2.5">
              <Target className="h-4 w-4 text-secondary shrink-0" />
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Target Focus</p>
                <p className="text-xs sm:text-sm font-semibold text-foreground truncate max-w-[120px]">{workout.focus}</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-card-elevated/40 p-2.5">
              <Layers className="h-4 w-4 text-primary shrink-0" />
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Exercises</p>
                <p className="text-xs sm:text-sm font-semibold text-foreground">{totalExercises} movements</p>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Content: Summary & Exercise Breakdown */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Workout Summary Card */}
          <div className="rounded-2xl border border-border/70 bg-card-elevated/30 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Dumbbell className="h-3.5 w-3.5 text-primary" /> Session Overview
            </h3>
            <div className="grid grid-cols-2 gap-y-3 gap-x-6 sm:grid-cols-3 text-xs">
              <div>
                <span className="text-muted-foreground block">Total Prescribed Sets:</span>
                <span className="font-semibold text-foreground text-sm">{totalSets > 0 ? `${totalSets} sets` : "Varies"}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Target Muscles:</span>
                <span className="font-semibold text-foreground text-sm">{workout.focus || "Full Body"}</span>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <span className="text-muted-foreground block">Equipment Needed:</span>
                <span className="font-semibold text-foreground text-sm flex items-center gap-1">
                  <Wrench className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="truncate">{equipmentRequirement || "Bodyweight / Mat"}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Exercise Breakdown List */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                Exercise Breakdown
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {totalExercises}
                </span>
              </h3>
              <span className="text-xs text-muted-foreground">Ordered sequence</span>
            </div>

            <ExerciseBreakdown exercises={workout.exercises} />
          </div>

          {/* Error Banner if start failed */}
          {startError && (
            <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <div className="flex-1">
                <p className="font-medium">{startError}</p>
              </div>
              <button
                onClick={handleStart}
                className="rounded-lg bg-destructive px-2.5 py-1 text-[11px] font-semibold text-destructive-foreground hover:opacity-90"
              >
                Retry
              </button>
            </div>
          )}
        </div>

        {/* Sticky Footer */}
        <div className="border-t border-border bg-card px-6 py-4 flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            Close Preview
          </button>

          <button
            type="button"
            onClick={handleStart}
            disabled={isStarting}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            {isStarting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Starting Workout...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 fill-current" />
                Start Workout
              </>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
