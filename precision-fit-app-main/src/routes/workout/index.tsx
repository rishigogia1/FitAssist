import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { Dumbbell, Clock, Flame, Play, Filter, Search, Eye } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { getWorkouts, createWorkoutSession, getTodaySessionStatus, getWorkoutHistory } from "@/lib/api-client";
import { WorkoutPreviewModal } from "@/components/workout/WorkoutPreviewModal";
import { TodayWorkoutPlan } from "@/components/workout/TodayWorkoutPlan";
import { WorkoutProgressSummary } from "@/components/workout/WorkoutProgressSummary";
import type { Workout, WorkoutRecommendationResponse, WorkoutHistoryStats, WorkoutHistoryItem } from "@/types/workout";

export const Route = createFileRoute("/workout/")({
  head: () => ({
    meta: [
      { title: "Workout — FitAssist" },
      {
        name: "description",
        content: "Browse AI-curated workout sessions tailored to your goals and recovery.",
      },
    ],
  }),
  component: WorkoutPage,
});

function WorkoutPage() {
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [workoutsData, setWorkoutsData] = useState<WorkoutRecommendationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [todaySessionStatus, setTodaySessionStatus] = useState<{
    has_completed_today: boolean;
    completed_workout_id: string | null;
    completed_workout_ids: string[];
    completed_at?: string | null;
  }>({
    has_completed_today: false,
    completed_workout_id: null,
    completed_workout_ids: [],
  });
  const [historyData, setHistoryData] = useState<{
    stats: WorkoutHistoryStats | null;
    history: WorkoutHistoryItem[];
  }>({
    stats: null,
    history: [],
  });

  const navigate = useNavigate();

  const handleOpenDetails = (workout: Workout) => {
    setSelectedWorkout(workout);
    setIsDetailsOpen(true);
  };

  const handleCloseDetails = () => {
    setIsDetailsOpen(false);
  };

  const handleStartWorkout = async (workout: Workout) => {
    if (isStartingSession) return;
    try {
      setIsStartingSession(true);
      const session = await createWorkoutSession(workout.id);
      localStorage.setItem("active_workout_session", session.id);
      setIsDetailsOpen(false);
      navigate({ to: "/workout/$id", params: { id: workout.id } });
    } catch (err: unknown) {
      console.error("Failed to start workout session:", err);
      // Let modal or handler display error if needed
    } finally {
      setIsStartingSession(false);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [workoutsRes, sessionRes, historyRes] = await Promise.all([
        getWorkouts(),
        getTodaySessionStatus().catch(() => ({
          has_completed_today: false,
          completed_workout_id: null,
          completed_workout_ids: [],
          active_session_id: null,
        })),
        getWorkoutHistory(10).catch(() => ({
          stats: {
            total_completed: 0,
            completed_this_week: 0,
            total_duration_minutes: 0,
            has_scheduled_plan: false,
            scheduled_total: 0,
            scheduled_completed: 0,
            scheduled_remaining: 0,
            completion_rate_percentage: 0,
          },
          history: [],
        })),
      ]);
      setWorkoutsData(workoutsRes);
      if (sessionRes) {
        setTodaySessionStatus({
          has_completed_today: Boolean(sessionRes.has_completed_today),
          completed_workout_id: sessionRes.completed_workout_id || null,
          completed_workout_ids: sessionRes.completed_workout_ids || (sessionRes.completed_workout_id ? [sessionRes.completed_workout_id] : []),
          completed_at: sessionRes.completed_at || null,
        });
      }
      if (historyRes) {
        setHistoryData({
          stats: historyRes.stats || null,
          history: historyRes.history || [],
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load workouts";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatGoal = (goal: string) => {
    return goal
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  };

  const formatLevel = (level: string) => {
    return level.charAt(0).toUpperCase() + level.slice(1);
  };

  // Deterministically select today's workout based on the authenticated user and local calendar date
  const todayWorkout = useMemo<Workout | null>(() => {
    if (!workoutsData?.workouts || workoutsData.workouts.length === 0) {
      return null;
    }
    const list: Workout[] = workoutsData.workouts;

    // Use local calendar date string (YYYY-MM-DD) to compute day index
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 (Sun) to 6 (Sat)

    // Choose primary workouts first if multiple exist
    const primaryWorkouts = list.filter((w) => w.category !== "Mobility");
    const pool = primaryWorkouts.length > 0 ? primaryWorkouts : list;

    // Select index deterministically for today
    const index = dayOfWeek % pool.length;
    return pool[index];
  }, [workoutsData]);

  // Check if today's selected workout (or another) was completed today
  const isTodayCompleted = useMemo(() => {
    if (!todaySessionStatus.has_completed_today) return false;
    if (!todayWorkout) return todaySessionStatus.has_completed_today;
    const ids = todaySessionStatus.completed_workout_ids || [];
    if (ids.length > 0) {
      return ids.includes(todayWorkout.id);
    }
    if (todaySessionStatus.completed_workout_id) {
      return todaySessionStatus.completed_workout_id === todayWorkout.id;
    }
    return todaySessionStatus.has_completed_today;
  }, [todaySessionStatus, todayWorkout]);

  // Exclude the daily workout that is featured in Today's Workout Plan
  const availableWorkouts = useMemo<Workout[]>(() => {
    const all: Workout[] = workoutsData?.workouts || [];
    if (!todayWorkout?.id) {
      return all;
    }
    return all.filter((w) => w.id !== todayWorkout.id);
  }, [workoutsData, todayWorkout]);

  let content;

  if (loading) {
    content = (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground animate-pulse">Loading personalized workouts...</p>
      </div>
    );
  } else if (error) {
    content = (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <p className="text-destructive">Couldn't load your personalized workouts.</p>
        <button
          onClick={loadData}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Retry
        </button>
      </div>
    );
  } else if (!workoutsData || workoutsData.workouts.length === 0) {
    content = (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">
          Unable to find workouts matching your current preferences.
        </p>
        <button
          onClick={() => {
            setFilter("All");
            setSearch("");
          }}
          className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          Reset Filters
        </button>
      </div>
    );
  } else {
    // Filter and Search logic on the available workouts
    let filteredSessions = availableWorkouts;

    if (filter !== "All") {
      filteredSessions = filteredSessions.filter((s: Workout) => s.category === filter);
    }

    if (search.trim() !== "") {
      const q = search.toLowerCase();
      filteredSessions = filteredSessions.filter(
        (s: Workout) =>
          s.name.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q) ||
          s.focus.toLowerCase().includes(q),
      );
    }

    content = (
      <section className="space-y-6">
        {/* Explore Workouts Header */}
        <div className="flex flex-col gap-1">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Explore Workouts
          </h2>
          <p className="text-sm text-muted-foreground">
            Discover workouts that match your goals and preferences.
          </p>
        </div>

        {/* Category Tabs & Filter Button */}
        <div className="flex flex-wrap items-center gap-2">
          {["All", "Strength", "Cardio", "Mobility", "HIIT"].map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                filter === t
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
          <button className="ml-auto inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
            <Filter className="h-3.5 w-3.5" /> Filter
          </button>
        </div>

        {availableWorkouts.length === 0 ? (
          <div className="flex h-36 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 p-6 text-center">
            <p className="text-sm font-medium text-foreground">No additional workouts available</p>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              Today's planned workout is currently the only session in your routine. Check back
              tomorrow for more options!
            </p>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex h-36 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-card/50 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No workouts match your search or filter.
            </p>
            <button
              onClick={() => {
                setFilter("All");
                setSearch("");
              }}
              className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-medium text-foreground hover:bg-muted"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredSessions.map((s: Workout) => (
              <div
                key={s.id}
                className="group rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] transition hover:border-primary/40"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-card-elevated text-primary">
                    <Dumbbell className="h-5 w-5" />
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      s.difficulty === "beginner"
                        ? "bg-success/15 text-[color:var(--success)]"
                        : s.difficulty === "intermediate"
                          ? "bg-primary/15 text-primary"
                          : "bg-warning/15 text-[color:var(--warning)]"
                    }`}
                  >
                    {formatLevel(s.difficulty)}
                  </span>
                </div>

                <h3 className="mt-4 text-base font-semibold">{s.name}</h3>
                <p className="text-xs text-muted-foreground">{s.focus}</p>

                <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" /> {s.duration_minutes} min
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Flame className="h-3.5 w-3.5" /> {s.estimated_calories} kcal
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenDetails(s)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card-elevated px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted hover:border-border/80 transition-colors"
                  >
                    <Eye className="h-3.5 w-3.5 text-primary" /> View Details
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStartWorkout(s)}
                    disabled={isStartingSession}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity shadow-sm disabled:opacity-50"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" /> Start Session
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <AppLayout
      title="Workout library"
      subtitle="AI-curated sessions based on your recent performance."
    >
      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search workouts, muscles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-4 text-sm outline-none focus:border-primary/50"
          />
        </div>
      </div>

      {/* Today's Workout Plan Section */}
      <TodayWorkoutPlan
        workout={todayWorkout}
        status={loading ? "loading" : error ? "error" : !todayWorkout ? "empty" : "ready"}
        errorMessage={error}
        onRetry={loadData}
        onOpenDetails={handleOpenDetails}
        onStartWorkout={handleStartWorkout}
        isStarting={isStartingSession}
        hasCompletedToday={isTodayCompleted}
        completedAt={todaySessionStatus.completed_at}
        userGoal={workoutsData?.personalized_for?.goal}
        userLevel={workoutsData?.personalized_for?.fitness_level}
      />

      {/* Workout Progress & Persistent History */}
      <WorkoutProgressSummary
        stats={historyData.stats}
        history={historyData.history}
        hasCompletedToday={isTodayCompleted}
        todayWorkoutName={todayWorkout?.name}
        loading={loading}
      />

      {/* Explore Workouts Section (Redundant banner removed) */}
      {content}

      <WorkoutPreviewModal
        workout={selectedWorkout}
        isOpen={isDetailsOpen}
        onClose={handleCloseDetails}
        onStartWorkout={handleStartWorkout}
        isStarting={isStartingSession}
      />
    </AppLayout>
  );
}
