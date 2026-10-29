const BACKEND_URL = "http://localhost:8000";

export async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const token = sessionStorage.getItem("fitassist_auth_token");
  
  const headers = new Headers(options.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  
  const response = await fetch(`${BACKEND_URL}${endpoint}`, {
    ...options,
    headers
  });
  
  if (response.status === 401) {
    // Optionally handle token expiration / forced logout here
    sessionStorage.removeItem("fitassist_auth_email");
    sessionStorage.removeItem("fitassist_auth_token");
    window.location.href = "/";
  }
  
  return response;
}

export async function getDashboardData() {
  const response = await fetchWithAuth("/api/v1/dashboard");
  if (!response.ok) {
    throw new Error(`Failed to fetch dashboard data: ${response.statusText}`);
  }
  return response.json();
}

export async function getWorkouts() {
  const response = await fetchWithAuth("/api/v1/workouts");
  if (!response.ok) {
    throw new Error(`Failed to fetch workouts: ${response.statusText}`);
  }
  return response.json();
}

export async function createWorkoutSession(workout_id: string) {
  const response = await fetchWithAuth("/api/v1/workout-sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ workout_id })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to create workout session");
  }
  return response.json();
}

export async function getTodaySessionStatus(): Promise<{
  has_completed_today: boolean;
  completed_workout_id: string | null;
  completed_workout_ids: string[];
  active_session_id: string | null;
  completed_at?: string | null;
}> {
  try {
    const response = await fetchWithAuth("/api/v1/workout-sessions/today");
    if (!response.ok) {
      return { has_completed_today: false, completed_workout_id: null, completed_workout_ids: [], active_session_id: null };
    }
    const data = await response.json();
    return {
      has_completed_today: Boolean(data.has_completed_today),
      completed_workout_id: data.completed_workout_id || null,
      completed_workout_ids: Array.isArray(data.completed_workout_ids) ? data.completed_workout_ids : (data.completed_workout_id ? [data.completed_workout_id] : []),
      active_session_id: data.active_session_id || null,
      completed_at: data.completed_at || null,
    };
  } catch {
    return { has_completed_today: false, completed_workout_id: null, completed_workout_ids: [], active_session_id: null };
  }
}

export async function getWorkoutSession(session_id: string) {
  const response = await fetchWithAuth(`/api/v1/workout-sessions/${session_id}`);
  if (!response.ok) {
    throw new Error("Failed to load workout session");
  }
  return response.json();
}

export async function updateWorkoutSession(session_id: string, data: any) {
  const response = await fetchWithAuth(`/api/v1/workout-sessions/${session_id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error("Failed to update session");
  return response.json();
}

export async function completeWorkoutSession(session_id: string, data: any) {
  const response = await fetchWithAuth(`/api/v1/workout-sessions/${session_id}/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error("Failed to complete session");
  return response.json();
}

export async function abandonWorkoutSession(session_id: string) {
  const response = await fetchWithAuth(`/api/v1/workout-sessions/${session_id}/abandon`, {
    method: "POST",
  });
  if (!response.ok) throw new Error("Failed to abandon session");
  return response.json();
}

export async function getWorkoutHistory(limit: number = 50) {
  const response = await fetchWithAuth(`/api/v1/workout-sessions/history?limit=${limit}`);
  if (!response.ok) throw new Error("Failed to load workout history");
  return response.json();
}

export async function getNutritionPreferences() {
  const response = await fetchWithAuth("/api/v1/nutrition/preferences");
  if (!response.ok) throw new Error("Failed to load nutrition preferences");
  return response.json();
}

export async function updateNutritionPreferences(data: any) {
  const response = await fetchWithAuth("/api/v1/nutrition/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error("Failed to update nutrition preferences");
  return response.json();
}

export async function getTodayNutrition() {
  const response = await fetchWithAuth("/api/v1/nutrition/today");
  if (response.status === 404) {
    throw new Error("404: preferences not found");
  }
  if (!response.ok) throw new Error("Failed to load today's nutrition plan");
  return response.json();
}

export async function logNutritionMeal(data: any) {
  const response = await fetchWithAuth("/api/v1/nutrition/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error("Failed to log meal");
  return response.json();
}

export async function unlogNutritionMeal(logId: string) {
  const response = await fetchWithAuth(`/api/v1/nutrition/log/${logId}`, {
    method: "DELETE"
  });
  if (!response.ok) throw new Error("Failed to unlog meal");
  return;
}

export async function getWeeklyAnalysis() {
  const response = await fetchWithAuth("/api/v1/nutrition/analysis/weekly");
  if (!response.ok) throw new Error("Failed to fetch weekly analysis");
  return response.json();
}

export async function getAdaptiveRecommendations(excludeIds?: string[]) {
  const response = await fetchWithAuth("/api/v1/nutrition/recommendations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exclude_ids: excludeIds || [] })
  });
  if (!response.ok) throw new Error("Failed to fetch adaptive recommendations");
  return response.json();
}

export async function replaceMeal(mealId: string, reason: string) {
  const response = await fetchWithAuth(`/api/v1/nutrition/meals/${mealId}/replace`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason, meal_id: mealId })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to replace meal");
  }
  return response.json();
}

export async function submitMealFeedback(mealId: string, feedbackType: string, reason?: string) {
  const response = await fetchWithAuth("/api/v1/nutrition/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ meal_id: mealId, feedback_type: feedbackType, reason })
  });
  if (!response.ok) throw new Error("Failed to submit feedback");
  return response.json();
}

export async function coachChat(message: string, sessionId?: string | null) {
  const response = await fetchWithAuth("/api/v1/coach/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, session_id: sessionId || null })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to chat with coach");
  }
  return response.json();
}

export async function getCoachInsight() {
  const response = await fetchWithAuth("/api/v1/coach/insight");
  if (!response.ok) throw new Error("Failed to load coach insight");
  return response.json();
}

export async function getCoachSuggestions() {
  const response = await fetchWithAuth("/api/v1/coach/suggestions");
  if (!response.ok) throw new Error("Failed to load coach suggestions");
  return response.json();
}

export async function getCoachHistory(sessionId?: string | null) {
  const url = sessionId 
    ? `/api/v1/coach/history?session_id=${encodeURIComponent(sessionId)}`
    : "/api/v1/coach/history";
  const response = await fetchWithAuth(url);
  if (!response.ok) throw new Error("Failed to load coach history");
  return response.json();
}

export async function getCoachSessions() {
  const response = await fetchWithAuth("/api/v1/coach/sessions");
  if (!response.ok) throw new Error("Failed to load coach sessions");
  return response.json();
}

export async function deleteCoachSession(sessionId: string) {
  const response = await fetchWithAuth(`/api/v1/coach/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE"
  });
  if (!response.ok) throw new Error("Failed to delete chat session");
  return response.json();
}

export async function getProgressData(range: string = "4w") {
  const response = await fetchWithAuth(`/api/v1/progress?range=${range}`);
  if (!response.ok) throw new Error("Failed to load progress data");
  return response.json();
}

export async function addWeightLog(weight: number, recordedAt?: string) {
  const response = await fetchWithAuth("/api/v1/progress/weight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ weight, ...(recordedAt ? { recorded_at: recordedAt } : {}) }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as any).detail || "Failed to log weight");
  }
  return response.json();
}

export async function getWeightHistory(range: string = "4w") {
  const response = await fetchWithAuth(`/api/v1/progress/weight?range=${range}`);
  if (!response.ok) throw new Error("Failed to load weight history");
  return response.json();
}
