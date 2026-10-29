export interface Exercise {
  name: string;
  sets: number;
  reps: string;
  rest_seconds: number;
  target_muscles?: string | null;
  equipment?: string | null;
  instructions?: string | null;
  form_tips?: string | null;
  media_url?: string | null;
}

export type FitnessLevel = "beginner" | "intermediate" | "advanced";

export interface Workout {
  id: string;
  name: string;
  category: string;
  difficulty: FitnessLevel | string;
  focus: string;
  duration_minutes: number;
  estimated_calories: number;
  description: string;
  equipment?: string | null;
  exercises: Exercise[];
}

export interface PersonalizedFor {
  goal: string;
  fitness_level: string;
}

export interface WorkoutRecommendationResponse {
  personalized_for: PersonalizedFor;
  workouts: Workout[];
}

export interface TodaySessionStatus {
  has_completed_today: boolean;
  completed_workout_id?: string | null;
  completed_workout_ids?: string[];
  completed_at?: string | null;
  active_session_id?: string | null;
}

export interface WorkoutHistoryItem {
  id: string;
  workout_id: string;
  workout_name: string;
  category: string;
  status: string;
  completed_exercises: number;
  total_exercises: number;
  duration_seconds: number;
  completed_at?: string | null;
  started_at: string;
  estimated_calories: number;
  completion_percentage: number;
}

export interface WorkoutHistoryStats {
  total_completed: number;
  completed_this_week: number;
  total_duration_minutes: number;
  has_scheduled_plan: boolean;
  scheduled_total: number;
  scheduled_completed: number;
  scheduled_remaining: number;
  completion_rate_percentage: number;
}

export interface WorkoutHistoryResponse {
  stats: WorkoutHistoryStats;
  history: WorkoutHistoryItem[];
}

