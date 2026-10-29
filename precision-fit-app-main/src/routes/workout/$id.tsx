import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { Clock, Flame, Play, ArrowLeft, Target, Timer, Dumbbell, Pause, SkipForward, CheckCircle2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getWorkouts, createWorkoutSession, updateWorkoutSession, completeWorkoutSession, abandonWorkoutSession, getWorkoutSession } from "@/lib/api-client";
import { ExerciseBreakdown } from "@/components/workout/ExerciseBreakdown";

export const Route = createFileRoute("/workout/$id")({
  component: WorkoutDetail,
});

type SessionState = "idle" | "running" | "paused" | "rest" | "completed";

function WorkoutDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  
  const [workout, setWorkout] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<"load" | "start" | "recover" | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  
  // Session State Machine
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [completedExercises, setCompletedExercises] = useState(0);
  
  // Timers
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [restSecondsRemaining, setRestSecondsRemaining] = useState(0);

  // Global Workout Timer
  useEffect(() => {
    let interval: any = null;
    if (sessionState === "running" || sessionState === "rest") {
      interval = setInterval(() => {
        setElapsedSeconds(s => s + 1);
      }, 1000);
    } else if (sessionState === "paused" || sessionState === "completed" || sessionState === "idle") {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [sessionState]);

  // Rest Countdown Timer
  useEffect(() => {
    let restInterval: any = null;
    if (sessionState === "rest") {
      restInterval = setInterval(() => {
        setRestSecondsRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(restInterval);
            handleRestComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(restInterval);
  }, [sessionState]);

  // Load Workout
  useEffect(() => {
    async function fetchWorkoutAndSession() {
      try {
        setLoading(true);
        setError(null);
        setErrorType(null);
        
        // 1. Fetch Workout
        const data = await getWorkouts();
        const found = data.workouts.find((w: any) => w.id === id);
        if (!found) {
          setError("Workout not found in your personalized recommendations.");
          setErrorType("load");
          setLoading(false);
          return;
        }
        setWorkout(found);

        // 2. Check for active session recovery
        const savedSessionId = localStorage.getItem("active_workout_session");
        if (savedSessionId) {
          try {
            const activeSession = await getWorkoutSession(savedSessionId);
            if (activeSession && activeSession.workout_id === found.id && activeSession.status !== "completed" && activeSession.status !== "abandoned") {
              setSessionId(activeSession.id);
              setSessionState(activeSession.status === "started" ? "running" : (activeSession.status as SessionState));
              setCurrentExerciseIndex(activeSession.current_exercise_index || 0);
              setCurrentSetIndex(activeSession.current_set_index || 0);
              setCompletedExercises(activeSession.completed_exercises || 0);
              setElapsedSeconds(activeSession.duration_seconds || 0);
            } else {
              localStorage.removeItem("active_workout_session");
            }
          } catch (sessionErr) {
            console.error("Session recovery failed", sessionErr);
            localStorage.removeItem("active_workout_session");
            setError("We couldn't restore your workout session.");
            setErrorType("recover");
          }
        }
      } catch (err: any) {
        setError(err.message);
        setErrorType("load");
      } finally {
        setLoading(false);
      }
    }
    fetchWorkoutAndSession();
  }, [id]);

  // Format Helpers
  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleStartSession = async () => {
    try {
      setLoading(true);
      setError(null);
      setErrorType(null);
      const session = await createWorkoutSession(id);
      setSessionId(session.id);
      localStorage.setItem("active_workout_session", session.id);
      setSessionState("running");
      setCurrentExerciseIndex(0);
      setCurrentSetIndex(0);
      setElapsedSeconds(0);
    } catch (err: any) {
      setError("Unable to start workout. Please try again.");
      setErrorType("start");
    } finally {
      setLoading(false);
    }
  };

  const handlePause = () => {
    setSessionState("paused");
    if (sessionId) {
      updateWorkoutSession(sessionId, { status: "paused", duration_seconds: elapsedSeconds }).catch(console.error);
    }
  };

  const handleResume = () => {
    setSessionState("running");
    if (sessionId) {
      updateWorkoutSession(sessionId, { status: "in_progress", duration_seconds: elapsedSeconds }).catch(console.error);
    }
  };

  const syncProgress = async (c_ex_idx: number, c_set_idx: number, comp_ex: number) => {
    if (sessionId) {
      await updateWorkoutSession(sessionId, {
        current_exercise_index: c_ex_idx,
        current_set_index: c_set_idx,
        completed_exercises: comp_ex,
        duration_seconds: elapsedSeconds,
        status: "in_progress"
      }).catch(console.error);
    }
  };

  const handleCompleteSet = () => {
    const currentEx = workout.exercises[currentExerciseIndex];
    const isLastSet = currentSetIndex >= currentEx.sets - 1;
    
    if (isLastSet) {
      // Completed the whole exercise
      const newCompleted = completedExercises + 1;
      setCompletedExercises(newCompleted);
      syncProgress(currentExerciseIndex, currentSetIndex, newCompleted);
      
      const isLastExercise = currentExerciseIndex >= workout.exercises.length - 1;
      if (isLastExercise) {
        handleCompleteWorkout(newCompleted);
      } else {
        // Show rest timer before next exercise if there is rest
        if (currentEx.rest_seconds > 0) {
          setRestSecondsRemaining(currentEx.rest_seconds);
          setSessionState("rest");
        } else {
          // Immediately go to next exercise
          setCurrentExerciseIndex(prev => prev + 1);
          setCurrentSetIndex(0);
          syncProgress(currentExerciseIndex + 1, 0, newCompleted);
        }
      }
    } else {
      // Completed one set of many, show rest
      syncProgress(currentExerciseIndex, currentSetIndex + 1, completedExercises);
      if (currentEx.rest_seconds > 0) {
        setRestSecondsRemaining(currentEx.rest_seconds);
        setSessionState("rest");
      } else {
        setCurrentSetIndex(prev => prev + 1);
      }
    }
  };

  const handleRestComplete = () => {
    const currentEx = workout.exercises[currentExerciseIndex];
    if (currentSetIndex >= currentEx.sets - 1) {
      // Moving to next exercise
      setCurrentExerciseIndex(prev => prev + 1);
      setCurrentSetIndex(0);
      syncProgress(currentExerciseIndex + 1, 0, completedExercises);
    } else {
      // Moving to next set
      setCurrentSetIndex(prev => prev + 1);
    }
    setSessionState("running");
  };

  const queryClient = useQueryClient();

  const handleCompleteWorkout = async (totalComp: number) => {
    setIsCompleting(true);
    setCompletionError(null);
    try {
      if (sessionId) {
        const percentage = Math.round((totalComp / workout.exercises.length) * 100);
        await completeWorkoutSession(sessionId, {
          completed_exercises: totalComp,
          total_exercises: workout.exercises.length,
          duration_seconds: elapsedSeconds,
          completion_percentage: percentage,
          estimated_calories: workout.estimated_calories
        });

        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["workouts"] });
        queryClient.invalidateQueries({ queryKey: ["workout-sessions"] });
        queryClient.invalidateQueries({ queryKey: ["progress"] });
      }
      localStorage.removeItem("active_workout_session");
      setSessionState("completed");
    } catch (err: any) {
      console.error("Failed to complete workout session:", err);
      setCompletionError(err?.message || "Failed to save workout completion. Please retry.");
    } finally {
      setIsCompleting(false);
    }
  };

  const handleNavigateBack = () => {
    if (sessionState === "running" || sessionState === "paused" || sessionState === "rest") {
      const leave = window.confirm("Leave workout? Your current progress will not be marked as completed.");
      if (!leave) return;
      localStorage.removeItem("active_workout_session");
      if (sessionId) {
        abandonWorkoutSession(sessionId).catch(console.error);
      }
    }
    navigate({ to: "/workout" });
  };

  if (loading && !workout) {
    return (
      <AppLayout title="Loading Workout...">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-32 rounded-lg bg-card"></div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 rounded-2xl bg-card"></div>
            ))}
          </div>
          <div className="h-14 w-full rounded-2xl bg-card"></div>
          <div className="space-y-3">
            <div className="h-6 w-24 rounded bg-card"></div>
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 rounded-xl bg-card"></div>
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !workout) {
    return (
      <AppLayout title="Workout Session">
        <div className="flex h-64 flex-col items-center justify-center gap-4">
          <p className="text-destructive text-center font-medium">{error || "Workout not found"}</p>
          <div className="flex gap-4">
            {(errorType === "start" || errorType === "recover") && (
              <button 
                onClick={() => {
                  setError(null);
                  setErrorType(null);
                  if (errorType === "start") handleStartSession();
                  if (errorType === "recover") window.location.reload();
                }}
                className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity shadow-lg shadow-primary/20"
              >
                {errorType === "start" ? "Retry" : "Try Again"}
              </button>
            )}
            <button 
              onClick={() => navigate({ to: "/workout" })}
              className="rounded-xl border border-border bg-card px-6 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
            >
              Back to Workout Library
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  // --- RENDER IDLE STATE ---
  if (sessionState === "idle") {
    return (
      <AppLayout title={workout.name} subtitle={workout.description}>
        <div className="mb-6 flex items-center">
          <button 
            onClick={handleNavigateBack}
            className="mr-3 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-muted-foreground">Back to library</span>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Duration</span>
            </div>
            <p className="mt-2 text-xl font-semibold text-foreground">{workout.duration_minutes} min</p>
          </div>
          
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Flame className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Burn</span>
            </div>
            <p className="mt-2 text-xl font-semibold text-foreground">{workout.estimated_calories} kcal</p>
          </div>
          
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Target className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Focus</span>
            </div>
            <p className="mt-2 text-xl font-semibold text-foreground">{workout.focus}</p>
          </div>
          
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Dumbbell className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Level</span>
            </div>
            <p className="mt-2 text-xl font-semibold text-primary">{workout.difficulty.charAt(0).toUpperCase() + workout.difficulty.slice(1)}</p>
          </div>
        </div>

        <button 
          onClick={handleStartSession}
          disabled={loading}
          className="mb-10 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:opacity-90 disabled:opacity-50"
        >
          <Play className="h-5 w-5 fill-current" />
          {loading ? "Starting..." : "Begin Workout"}
        </button>

        <div>
          <h3 className="mb-4 text-lg font-semibold">Exercises ({workout.exercises.length})</h3>
          <ExerciseBreakdown exercises={workout.exercises} />
        </div>
      </AppLayout>
    );
  }

  // --- RENDER COMPLETED STATE ---
  if (sessionState === "completed") {
    const percentage = Math.round((completedExercises / workout.exercises.length) * 100);
    return (
      <AppLayout title="Workout Complete">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full bg-success/20 text-[color:var(--success)]">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <h2 className="mb-2 text-3xl font-bold">Great work!</h2>
          <p className="mb-8 text-muted-foreground">You've successfully finished {workout.name}.</p>
          
          <div className="mb-8 grid grid-cols-2 gap-4 rounded-2xl border border-border bg-card p-6 md:grid-cols-4">
            <div className="text-center">
              <p className="text-xs font-medium uppercase text-muted-foreground">Duration</p>
              <p className="mt-2 text-2xl font-bold">{formatTime(elapsedSeconds)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs font-medium uppercase text-muted-foreground">Exercises</p>
              <p className="mt-2 text-2xl font-bold">{completedExercises} / {workout.exercises.length}</p>
            </div>
            <div className="text-center">
              <p className="text-xs font-medium uppercase text-muted-foreground">Burn</p>
              <p className="mt-2 text-2xl font-bold">{workout.estimated_calories}</p>
            </div>
            <div className="text-center">
              <p className="text-xs font-medium uppercase text-muted-foreground">Complete</p>
              <p className="mt-2 text-2xl font-bold text-primary">{percentage}%</p>
            </div>
          </div>
          
          <button 
            onClick={() => navigate({ to: "/workout" })}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-medium text-primary-foreground hover:opacity-90"
          >
            Back to Workout Library
          </button>
        </div>
      </AppLayout>
    );
  }

  // --- RENDER RUNNING / PAUSED / REST STATE ---
  const currentEx = workout.exercises[currentExerciseIndex];
  const progressPercentage = (completedExercises / workout.exercises.length) * 100;

  return (
    <AppLayout title={workout.name}>
      <div className="mb-6 flex items-center justify-between">
        <button 
          onClick={handleNavigateBack}
          disabled={isCompleting}
          className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Library
        </button>
        <div className="flex items-center gap-2 rounded-lg bg-card px-3 py-1.5 font-mono text-sm font-medium border border-border shadow-sm">
          <Clock className="h-4 w-4 text-primary" /> {formatTime(elapsedSeconds)}
        </div>
      </div>

      {completionError && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
          <span className="text-sm font-medium">{completionError}</span>
          <button
            onClick={() => handleCompleteWorkout(completedExercises)}
            disabled={isCompleting}
            className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground hover:opacity-90 disabled:opacity-50"
          >
            {isCompleting ? "Retrying..." : "Retry Completion"}
          </button>
        </div>
      )}

      {isCompleting && (
        <div className="mb-6 flex items-center justify-center gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4 text-primary">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm font-medium">Saving workout progress and recording completion...</span>
        </div>
      )}

      {/* Progress Bar & Tracker */}
      <div className="mb-8 rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between text-sm font-medium">
          <span>Workout Progress</span>
          <span className="text-primary">{completedExercises} / {workout.exercises.length} exercises</span>
        </div>
        <div className="h-2.5 mb-4 w-full overflow-hidden rounded-full bg-secondary">
          <div 
            className="h-full bg-primary transition-all duration-500 ease-in-out" 
            style={{ width: `${progressPercentage}%` }} 
          />
        </div>
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          {workout.exercises.map((ex: any, idx: number) => {
            const isCompleted = idx < completedExercises;
            const isCurrent = idx === currentExerciseIndex;
            return (
              <div key={idx} className={`flex items-center gap-3 text-sm ${isCompleted ? 'text-muted-foreground' : isCurrent ? 'text-foreground font-medium' : 'text-muted-foreground/60'}`}>
                {isCompleted ? (
                  <CheckCircle2 className="h-4 w-4 text-[color:var(--success)]" />
                ) : isCurrent ? (
                  <div className="h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                    <div className="h-1.5 w-1.5 rounded-full bg-card" />
                  </div>
                ) : (
                  <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/40" />
                )}
                <span>{ex.name}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Exercise Card */}
      <div className="relative mb-8 overflow-hidden rounded-2xl border border-primary/20 bg-card p-8 text-center shadow-[var(--shadow-card)]">
        {sessionState === "rest" ? (
          <div className="py-12">
            <h3 className="mb-4 text-2xl font-bold text-muted-foreground">REST</h3>
            <div className="mb-8 font-mono text-7xl font-light tracking-tighter text-foreground">
              00:{restSecondsRemaining.toString().padStart(2, '0')}
            </div>
            <button 
              onClick={handleRestComplete}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-background px-6 py-2.5 text-sm font-medium hover:bg-muted"
            >
              Skip Rest <SkipForward className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="py-6">
            <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-primary">
              Exercise {currentExerciseIndex + 1} of {workout.exercises.length}
            </p>
            <h2 className="mb-6 text-4xl font-bold text-foreground">{currentEx.name}</h2>
            
            <div className="mx-auto mb-8 flex max-w-sm items-center justify-center gap-6 rounded-xl bg-secondary/50 p-4">
              <div className="text-center">
                <p className="text-xs font-medium uppercase text-muted-foreground">Sets</p>
                <p className="mt-1 text-2xl font-semibold">
                  {currentSetIndex + 1} <span className="text-muted-foreground">/ {currentEx.sets}</span>
                </p>
              </div>
              <div className="h-12 w-px bg-border"></div>
              <div className="text-center">
                <p className="text-xs font-medium uppercase text-muted-foreground">Target</p>
                <p className="mt-1 text-2xl font-semibold">
                  {currentEx.reps ? `${currentEx.reps} Reps` : `${currentEx.duration_seconds}s`}
                </p>
              </div>
            </div>

            {sessionState === "paused" && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                <h2 className="text-3xl font-bold tracking-widest text-primary">PAUSED</h2>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-4">
        {sessionState === "running" && (
          <>
            <button 
              onClick={handlePause}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-4 font-semibold hover:bg-muted"
            >
              <Pause className="h-5 w-5" /> Pause
            </button>
            <button 
              onClick={handleCompleteSet}
              className="flex-[2] inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-4 font-semibold text-primary-foreground hover:opacity-90"
            >
              <CheckCircle2 className="h-5 w-5" /> 
              {currentSetIndex >= currentEx.sets - 1 ? "Complete Exercise" : "Complete Set"}
            </button>
          </>
        )}
        
        {sessionState === "paused" && (
          <button 
            onClick={handleResume}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-4 font-semibold text-primary-foreground hover:opacity-90"
          >
            <Play className="h-5 w-5" /> Resume Workout
          </button>
        )}
      </div>

    </AppLayout>
  );
}
