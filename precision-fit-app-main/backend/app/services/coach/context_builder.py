from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from typing import Dict, Any, List, Optional
from pydantic import BaseModel

from app.models.user_profile import UserProfile
from app.models.nutrition_preferences import NutritionPreferences
from app.models.nutrition_log import NutritionLog
from app.models.workout_session import WorkoutSession
from app.services.nutrition_service import NutritionService
from app.services.fitness_score_service import FitnessScoreService
from app.services.coach.intent import CoachIntent

class CoachContext(BaseModel):
    intent: Optional[str] = CoachIntent.GENERAL_FITNESS
    user_id: str
    age: int
    weight: float
    height: Optional[float]
    sex: Optional[str]
    fitness_goal: str
    fitness_level: str
    
    # Nutrition Preferences (Always useful for food questions)
    dietary_preference: str
    cuisine_preference: str
    allergies: List[str]
    foods_liked: Optional[str]
    foods_disliked: Optional[str]

    # Optional Analytics (Only loaded when requested)
    nutrition_targets: Optional[Dict[str, int]] = None
    nutrition_consumed: Optional[Dict[str, float]] = None
    nutrition_remaining: Optional[Dict[str, float]] = None
    nutrition_progress: Optional[Dict[str, float]] = None
    logged_meals_count: Optional[int] = None
    
    completed_sessions_count_last_7_days: Optional[int] = None
    recent_workout_sessions: Optional[List[Dict[str, Any]]] = None
    weekly_workout_consistency: Optional[float] = None
    fitness_score: Optional[int] = None
    fitness_score_percentile: Optional[str] = None
    fitness_score_breakdown: Optional[Dict[str, float]] = None
    recent_activity_minutes: Optional[int] = None


class CoachContextBuilder:
    def __init__(self):
        self.nutrition_service = NutritionService()
        self.fitness_score_service = FitnessScoreService()

    def build_context(
        self, 
        db: Session, 
        user_id: str, 
        intent: Optional[str] = None, 
        force_analytics: bool = False
    ) -> CoachContext:
        effective_intent = intent or CoachIntent.GENERAL_FITNESS
        IST = ZoneInfo("Asia/Kolkata")
        local_now = datetime.now(IST)
        today_date = local_now.date()
        
        # 1. User profile (always needed)
        profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        if not profile:
            profile = UserProfile(
                user_id=user_id,
                age=25,
                weight=70.0,
                height=170.0,
                sex="male",
                fitness_goal="general_fitness",
                fitness_level="intermediate"
            )
            db.add(profile)
            db.commit()
            db.refresh(profile)
            
        # 2. Nutrition preferences (always needed for context)
        prefs = db.query(NutritionPreferences).filter(NutritionPreferences.user_id == user_id).first()
        if not prefs:
            prefs = NutritionPreferences(user_id=user_id)
            db.add(prefs)
            db.commit()
            db.refresh(prefs)
            
        # Parse allergies safely
        allergies = prefs.allergies if prefs.allergies is not None else []
        if isinstance(allergies, str):
            import json
            try:
                allergies = json.loads(allergies)
            except Exception:
                allergies = [allergies] if allergies else []
        elif not isinstance(allergies, list):
            allergies = []
            
        ctx = CoachContext(
            intent=effective_intent,
            user_id=user_id,
            age=profile.age,
            weight=profile.weight,
            height=profile.height,
            sex=profile.sex,
            fitness_goal=profile.fitness_goal,
            fitness_level=profile.fitness_level,
            dietary_preference=prefs.dietary_preference,
            cuisine_preference=prefs.cuisine_preference,
            allergies=allergies,
            foods_liked=prefs.foods_liked,
            foods_disliked=prefs.foods_disliked
        )
        
        # 3. Conditional Analytics Loading
        needs_analytics = force_analytics or (effective_intent in [
            CoachIntent.PROGRESS_ANALYSIS, 
            CoachIntent.CALORIES, 
            CoachIntent.MACROS,
            CoachIntent.PROTEIN,
            CoachIntent.POST_WORKOUT_MEAL,
            CoachIntent.PRE_WORKOUT_MEAL,
            CoachIntent.MEAL_PLAN,
            CoachIntent.NUTRITION,
            CoachIntent.GENERAL_NUTRITION,
            CoachIntent.WORKOUT_PLAN,
            CoachIntent.WORKOUT_EXERCISE,
            CoachIntent.RECOVERY,
            CoachIntent.WEIGHT_GOAL,
            CoachIntent.MUSCLE_GAIN,
            CoachIntent.FAT_LOSS
        ])
        
        if needs_analytics:
            targets = self.nutrition_service.calculate_targets(profile)
            
            today_logs = db.query(NutritionLog).filter(
                NutritionLog.user_id == user_id,
                NutritionLog.log_date == today_date
            ).all()
            
            c_cal = sum(log.calories for log in today_logs)
            c_pro = sum(log.protein_g for log in today_logs)
            c_carb = sum(log.carbs_g for log in today_logs)
            c_fat = sum(log.fat_g for log in today_logs)
            
            ctx.nutrition_targets = {
                "calories": targets.calories,
                "protein": targets.protein,
                "carbs": targets.carbs,
                "fat": targets.fat
            }
            ctx.nutrition_consumed = {
                "calories": c_cal, "protein": c_pro, "carbs": c_carb, "fat": c_fat
            }
            ctx.nutrition_remaining = {
                "calories": max(0, targets.calories - c_cal),
                "protein": max(0.0, targets.protein - c_pro),
                "carbs": max(0.0, targets.carbs - c_carb),
                "fat": max(0.0, targets.fat - c_fat)
            }
            ctx.nutrition_progress = {
                "calories": min(100.0, (c_cal / max(1.0, targets.calories)) * 100.0),
                "protein": min(100.0, (c_pro / max(1.0, targets.protein)) * 100.0),
                "carbs": min(100.0, (c_carb / max(1.0, targets.carbs)) * 100.0),
                "fat": min(100.0, (c_fat / max(1.0, targets.fat)) * 100.0)
            }
            ctx.logged_meals_count = len(today_logs)
            
            # Workout sessions
            start_date = today_date - timedelta(days=7)
            recent_sessions = db.query(WorkoutSession).filter(
                WorkoutSession.user_id == user_id,
                WorkoutSession.completed_at >= start_date
            ).all()
            
            completed_sessions = [s for s in recent_sessions if s.status == "completed"]
            
            recent_workout_data = []
            for s in recent_sessions:
                recent_workout_data.append({
                    "id": s.id, "workout_id": s.workout_id, "status": s.status,
                    "duration_seconds": s.duration_seconds,
                    "estimated_calories": s.estimated_calories,
                    "completed_at": s.completed_at.isoformat() if s.completed_at else None
                })
                
            ctx.completed_sessions_count_last_7_days = len(completed_sessions)
            ctx.recent_workout_sessions = recent_workout_data
            ctx.weekly_workout_consistency = round(len(completed_sessions) / 4.0, 2)
            ctx.recent_activity_minutes = sum(s.duration_seconds for s in completed_sessions) // 60
            
            # Score
            score_data = self.fitness_score_service.calculate_score(
                profile=profile,
                recent_sessions=completed_sessions,
                today_logs=today_logs,
                calorie_target=targets.calories
            )
            ctx.fitness_score = score_data["score"]
            ctx.fitness_score_percentile = score_data["percentile"]
            ctx.fitness_score_breakdown = score_data["breakdown"]

        return ctx
