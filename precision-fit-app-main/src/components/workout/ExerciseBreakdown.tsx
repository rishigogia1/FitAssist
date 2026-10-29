import React from "react";
import { Timer, Repeat, Dumbbell, Target, Info, Lightbulb, Film } from "lucide-react";
import type { Exercise } from "@/types/workout";

interface ExerciseBreakdownProps {
  exercises?: Exercise[];
  className?: string;
}

/**
 * Distinguishes whether the prescription is time-based (e.g. "30 mins", "60 sec")
 * or count-based repetitions (e.g. "10", "8-12", "AMRAP").
 */
export function formatPrescription(reps: string | number | undefined): { isDuration: boolean; label: string } {
  if (reps === undefined || reps === null || reps === "") {
    return { isDuration: false, label: "As prescribed" };
  }
  const str = String(reps).trim();
  const lower = str.toLowerCase();
  if (lower.includes("min") || lower.includes("sec") || lower.endsWith("s")) {
    return { isDuration: true, label: str };
  }
  if (lower === "amrap") {
    return { isDuration: false, label: "AMRAP (Max Reps)" };
  }
  return { isDuration: false, label: `${str} reps` };
}

export function ExerciseBreakdown({ exercises, className = "" }: ExerciseBreakdownProps) {
  if (!exercises || exercises.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
        <Dumbbell className="mx-auto mb-2 h-8 w-8 opacity-40" />
        <p className="text-sm font-medium">No exercise details available for this workout.</p>
        <p className="mt-1 text-xs">Exercises will be populated once updated by your trainer or AI plan.</p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {exercises.map((ex, idx) => {
        const prescription = formatPrescription(ex.reps);
        const hasInstructions = Boolean(ex.instructions && ex.instructions.trim().length > 0);
        const hasFormTips = Boolean(ex.form_tips && ex.form_tips.trim().length > 0);
        const hasEquipment = Boolean(ex.equipment && ex.equipment.trim().length > 0);
        const hasTargetMuscles = Boolean(ex.target_muscles && ex.target_muscles.trim().length > 0);

        return (
          <div
            key={`${ex.name}-${idx}`}
            className="group rounded-2xl border border-border bg-card/80 p-4 sm:p-5 transition-all hover:border-primary/40 hover:bg-card hover:shadow-sm"
          >
            {/* Top header row */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 font-mono text-sm font-bold text-primary">
                  {idx + 1}
                </div>
                <div>
                  <h4 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                    {ex.name}
                  </h4>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {hasTargetMuscles && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-secondary/15 px-2 py-0.5 text-secondary-foreground font-medium">
                        <Target className="h-3 w-3 text-secondary" />
                        {ex.target_muscles}
                      </span>
                    )}
                    {hasEquipment && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-muted-foreground">
                        <Dumbbell className="h-3 w-3" />
                        {ex.equipment}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Rest interval pill */}
              {typeof ex.rest_seconds === "number" && (
                <div
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                    ex.rest_seconds > 0
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Timer className="h-3.5 w-3.5" />
                  {ex.rest_seconds > 0 ? `${ex.rest_seconds}s rest` : "No rest interval"}
                </div>
              )}
            </div>

            {/* Prescribed sets and reps / duration bar */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 rounded-xl bg-card-elevated/60 p-3 text-xs border border-border/50">
              <div>
                <span className="text-muted-foreground block text-[11px] uppercase tracking-wider font-medium">
                  Prescribed Sets
                </span>
                <span className="mt-0.5 block font-semibold text-foreground text-sm">
                  {typeof ex.sets === "number" ? `${ex.sets} ${ex.sets === 1 ? "set" : "sets"}` : "Custom"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px] uppercase tracking-wider font-medium">
                  {prescription.isDuration ? "Prescribed Duration" : "Target Repetitions"}
                </span>
                <span className="mt-0.5 flex items-center gap-1 font-semibold text-foreground text-sm">
                  <Repeat className="h-3.5 w-3.5 text-primary opacity-80" />
                  {prescription.label}
                </span>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <span className="text-muted-foreground block text-[11px] uppercase tracking-wider font-medium">
                  Rest Between Sets
                </span>
                <span className="mt-0.5 block font-semibold text-foreground text-sm">
                  {typeof ex.rest_seconds === "number" && ex.rest_seconds > 0
                    ? `${ex.rest_seconds} seconds`
                    : "Continuous / None"}
                </span>
              </div>
            </div>

            {/* Instructions section (if available) */}
            {hasInstructions && (
              <div className="mt-3.5 rounded-xl border border-border/80 bg-background/50 p-3 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  <Info className="h-3.5 w-3.5 text-primary" />
                  Execution Instructions
                </div>
                <p className="mt-1 leading-relaxed text-muted-foreground">
                  {ex.instructions}
                </p>
              </div>
            )}

            {/* Form tips section (if available) */}
            {hasFormTips && (
              <div className="mt-2.5 rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-[color:var(--warning)]">
                  <Lightbulb className="h-3.5 w-3.5 text-[color:var(--warning)]" />
                  Form & Safety Tips
                </div>
                <p className="mt-1 leading-relaxed text-muted-foreground">
                  {ex.form_tips}
                </p>
              </div>
            )}

            {/* Demonstration media (if available) */}
            {ex.media_url && (
              <div className="mt-3 overflow-hidden rounded-xl border border-border">
                {ex.media_url.endsWith(".mp4") || ex.media_url.endsWith(".webm") ? (
                  <video
                    src={ex.media_url}
                    controls
                    className="max-h-56 w-full object-cover"
                  />
                ) : (
                  <img
                    src={ex.media_url}
                    alt={`${ex.name} demonstration`}
                    className="max-h-56 w-full object-cover"
                  />
                )}
                <div className="flex items-center gap-1.5 bg-card px-3 py-1.5 text-[11px] text-muted-foreground">
                  <Film className="h-3 w-3 text-primary" /> Demonstration Media
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
