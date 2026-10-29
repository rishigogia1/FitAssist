from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, date, timedelta, timezone
from typing import List
from zoneinfo import ZoneInfo

from app.database.connection import get_db
from app.models.user_profile import UserProfile
from app.models.nutrition_preferences import NutritionPreferences
from app.models.nutrition_log import NutritionLog
from app.models.workout_session import WorkoutSession, SessionStatus
from app.auth.dependencies import get_current_user
from app.services.nutrition_service import NutritionService
from app.services.workout_service import WorkoutService
from app.services.fitness_score_service import FitnessScoreService
from app.schemas.dashboard import (
    DashboardResponse,
    DashboardUser,
    DashboardCalories,
    DashboardSteps,
    DashboardActivity,
    DashboardFitnessScore,
    FitnessScoreBreakdown,
    DashboardNutritionSplit,
    WeeklyProgressPoint,
    DailyStepPoint,
    DashboardRecommendation
)

router = APIRouter()
nutrition_service = NutritionService()
workout_service = WorkoutService()
fitness_score_service = FitnessScoreService()

IST = ZoneInfo("Asia/Kolkata")

def to_ist(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(IST)

@router.get("", response_model=DashboardResponse)
def get_dashboard_data(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_id = current_user["user_id"]
    
    # 1. Profile & User Info
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

    prefs = db.query(NutritionPreferences).filter(NutritionPreferences.user_id == user_id).first()
    if not prefs:
        prefs = NutritionPreferences(user_id=user_id)
        db.add(prefs)
        db.commit()
        db.refresh(prefs)

    user_name = current_user.get("name") or current_user.get("email", "").split("@")[0] or "Athlete"
    user_name = user_name.split("@")[0].replace(".", " ").title()

    # 2. Local Timezone Calculations
    local_now = datetime.now(IST)
    today_date = local_now.date()

    # 3. Nutrition
    targets = nutrition_service.calculate_targets(profile)
    
    today_logs = db.query(NutritionLog).filter(
        NutritionLog.user_id == user_id,
        NutritionLog.log_date == today_date
    ).all()
    
    consumed_cals = sum(log.calories for log in today_logs)
    consumed_protein = sum(log.protein_g for log in today_logs)
    consumed_carbs = sum(log.carbs_g for log in today_logs)
    consumed_fat = sum(log.fat_g for log in today_logs)
    
    # Nutrition split percentages: 0% if no meals logged
    total_macro_cals = (consumed_protein * 4) + (consumed_carbs * 4) + (consumed_fat * 9)
    if total_macro_cals > 0:
        p_pct = round((consumed_protein * 4 / total_macro_cals) * 100)
        c_pct = round((consumed_carbs * 4 / total_macro_cals) * 100)
        f_pct = max(0, 100 - p_pct - c_pct)
    else:
        p_pct = 0
        c_pct = 0
        f_pct = 0
        
    cal_trend_pct = min(100, int((consumed_cals / max(1, targets.calories)) * 100))
    cal_trend_str = f"{cal_trend_pct}%"

    # 4. Workout Sessions & Activity
    all_completed_sessions = db.query(WorkoutSession).filter(
        WorkoutSession.user_id == user_id,
        WorkoutSession.status == SessionStatus.completed.value
    ).all()
    
    today_sessions = []
    for s in all_completed_sessions:
        if s.completed_at:
            s_local = to_ist(s.completed_at)
            if s_local.date() == today_date:
                today_sessions.append(s)

    total_duration_seconds = sum(s.duration_seconds for s in today_sessions)
    activity_minutes = int(round(total_duration_seconds / 60))
    activity_count = len(today_sessions)
    calories_burned = sum(s.estimated_calories for s in today_sessions)

    # 5. Weekly Activity & Steps (NO fabricated step data)
    start_of_week = today_date - timedelta(days=today_date.weekday())
    
    week_sessions = []
    for s in all_completed_sessions:
        if s.completed_at:
            s_local = to_ist(s.completed_at)
            if start_of_week <= s_local.date() <= today_date:
                week_sessions.append(s)
                
    days_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    steps_history = []
    
    # Return 0 since there is no connected tracker/source
    for d_name in days_names:
        steps_history.append(DailyStepPoint(d=d_name, steps=0))
            
    today_steps = 0
    avg_steps_per_day = 0
    steps_pct = 0

    # 6. Fitness Score Service
    score_result = fitness_score_service.calculate_score(
        profile=profile,
        recent_sessions=week_sessions,
        today_logs=today_logs,
        calorie_target=targets.calories,
        step_count=today_steps,
        step_target=7000
    )
    fitness_score_val = score_result["score"]

    # 7. Real Progress History (rolling 7 days score history, only populated if data exists)
    has_history = len(all_completed_sessions) > 0 or db.query(NutritionLog).filter(NutritionLog.user_id == user_id).first() is not None
    progress_history = []
    
    if has_history:
        for i in range(6, -1, -1):
            day_date = today_date - timedelta(days=i)
            day_recent_sessions = []
            rolling_start = day_date - timedelta(days=6)
            for s in all_completed_sessions:
                if s.completed_at:
                    s_local_date = to_ist(s.completed_at).date()
                    if rolling_start <= s_local_date <= day_date:
                        day_recent_sessions.append(s)
            
            day_logs = db.query(NutritionLog).filter(
                NutritionLog.user_id == user_id,
                NutritionLog.log_date == day_date
            ).all()
            
            day_score_result = fitness_score_service.calculate_score(
                profile=profile,
                recent_sessions=day_recent_sessions,
                today_logs=day_logs,
                calorie_target=targets.calories,
                step_count=0,
                step_target=7000
            )
            day_score = day_score_result["score"]
            progress_history.append(WeeklyProgressPoint(
                d=day_date.strftime("%a"),
                score=day_score,
                goal=70
            ))

    # 8. AI Recommendation
    rec_response = workout_service.get_personalized_recommendations(profile)
    rec_workout = rec_response.workouts[0] if rec_response.workouts else None
    
    recommendation_data = None
    if rec_workout:
        goal_formatted = profile.fitness_goal.replace("_", " ")
        recommendation_data = DashboardRecommendation(
            title="Today's Plan",
            description=f"{rec_workout.focus} to align with your {goal_formatted} phase.",
            workout_id=rec_workout.id,
            exercise_count=len(rec_workout.exercises),
            duration_minutes=rec_workout.duration_minutes,
            calories=rec_workout.estimated_calories,
            focus=rec_workout.focus,
            goal=profile.fitness_goal
        )

    # 9. Greeting & Date string
    hour = local_now.hour
    if hour < 12:
        greeting_text = f"Good morning, {user_name}"
    elif hour < 18:
        greeting_text = f"Good afternoon, {user_name}"
    else:
        greeting_text = f"Good evening, {user_name}"
        
    date_formatted_text = local_now.strftime("%A, %B %d")

    return DashboardResponse(
        user=DashboardUser(
            name=user_name,
            goal=profile.fitness_goal,
            fitness_level=profile.fitness_level
        ),
        date_formatted=date_formatted_text,
        greeting=greeting_text,
        calories=DashboardCalories(
            consumed=consumed_cals,
            target=targets.calories,
            trend=cal_trend_str,
            trend_positive=consumed_cals <= targets.calories
        ),
        steps=DashboardSteps(
            completed=today_steps,
            target=7000,
            average_per_day=avg_steps_per_day,
            trend=f"{steps_pct}%",
            trend_positive=today_steps > 0,
            source_available=False,
            source="unavailable"
        ),
        activity=DashboardActivity(
            minutes=activity_minutes,
            sessions=activity_count,
            calories_burned=calories_burned,
            trend=f"+{activity_minutes}m" if activity_minutes > 0 else "0m",
            trend_positive=activity_minutes > 0
        ),
        fitness_score=DashboardFitnessScore(
            score=fitness_score_val,
            max_score=100,
            percentile=score_result["percentile"],
            trend=f"{fitness_score_val}",
            trend_positive=fitness_score_val > 0,
            breakdown=FitnessScoreBreakdown(
                workout_consistency=score_result["breakdown"]["workout_consistency"],
                activity_steps=score_result["breakdown"]["activity_steps"],
                nutrition_adherence=score_result["breakdown"]["nutrition_adherence"],
                goal_progress=score_result["breakdown"]["goal_progress"]
            )
        ),
        nutrition_split=DashboardNutritionSplit(
            protein=p_pct,
            carbs=c_pct,
            fats=f_pct
        ),
        progress_history=progress_history,
        steps_history=steps_history,
        recommendation=recommendation_data
    )

