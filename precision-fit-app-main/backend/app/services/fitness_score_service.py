from typing import Dict, List, Any
from app.models.user_profile import UserProfile
from app.models.workout_session import WorkoutSession
from app.models.nutrition_log import NutritionLog

class FitnessScoreService:
    """
    Deterministic Fitness Score calculation service.
    
    Weights:
    - Workout consistency: 40%
    - Activity / Steps adherence: 25%
    - Nutrition adherence: 20%
    - Goal progress & streak: 15%
    """
    def calculate_score(
        self,
        profile: UserProfile,
        recent_sessions: List[WorkoutSession],
        today_logs: List[NutritionLog],
        calorie_target: int,
        step_count: int = 0,
        step_target: int = 7000
    ) -> Dict[str, Any]:
        # 1. Workout consistency (40% weight -> max 40 points)
        completed_sessions_count = len(recent_sessions)
        target_weekly_workouts = 4
        workout_ratio = min(1.0, completed_sessions_count / max(1, target_weekly_workouts))
        workout_score = round(workout_ratio * 40, 1)

        # 2. Activity / Steps (25% weight -> max 25 points)
        total_activity_mins = sum(s.duration_seconds for s in recent_sessions if s.duration_seconds) // 60
        target_weekly_mins = 150  # WHO standard baseline
        activity_ratio = min(1.0, total_activity_mins / max(1, target_weekly_mins))
        
        step_ratio = min(1.0, step_count / max(1, step_target)) if step_count > 0 else activity_ratio
        activity_score = round(((activity_ratio * 0.6) + (step_ratio * 0.4)) * 25, 1)

        # 3. Nutrition adherence (20% weight -> max 20 points)
        consumed_cals = sum(log.calories for log in today_logs) if today_logs else 0
        if calorie_target > 0 and consumed_cals > 0:
            cal_diff = abs(consumed_cals - calorie_target)
            diff_ratio = max(0.0, 1.0 - (cal_diff / calorie_target))
            nutrition_score = round(diff_ratio * 20, 1)
        else:
            nutrition_score = 0.0

        # 4. Goal progress (15% weight -> max 15 points)
        base_progress = 5.0 if profile.fitness_goal else 0.0
        session_completion_avg = 10.0 if completed_sessions_count > 0 else 0.0
        goal_score = min(15.0, base_progress + session_completion_avg)

        # Total combined score
        total_score = round(workout_score + activity_score + nutrition_score + goal_score)
        total_score = max(0, min(100, total_score))

        # Percentile calculation
        if total_score >= 85:
            percentile = "Top 5%"
        elif total_score >= 70:
            percentile = "Top 15%"
        elif total_score >= 50:
            percentile = "Top 35%"
        elif total_score > 0:
            percentile = "Top 50%"
        else:
            percentile = "N/A"

        return {
            "score": total_score,
            "max_score": 100,
            "percentile": percentile,
            "breakdown": {
                "workout_consistency": workout_score,
                "activity_steps": activity_score,
                "nutrition_adherence": nutrition_score,
                "goal_progress": goal_score
            }
        }
