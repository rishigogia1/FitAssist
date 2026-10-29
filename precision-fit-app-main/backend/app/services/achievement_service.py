"""
AchievementService — evaluates achievement conditions from real user data
and persists UserAchievement records when conditions are first met.

Achievement definitions are Python constants (no DB table needed for static definitions).
Only UserAchievement (unlock records) are persisted to the database.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.models.workout_session import WorkoutSession, SessionStatus
from app.models.nutrition_log import NutritionLog
from app.models.weight_log import WeightLog
from app.models.user_achievement import UserAchievement
from app.models.user_profile import UserProfile
from app.services.nutrition_service import NutritionService

logger = logging.getLogger(__name__)

IST = ZoneInfo("Asia/Kolkata")
nutrition_svc = NutritionService()


# ---------------------------------------------------------------------------
# Static Achievement Definitions
# ---------------------------------------------------------------------------
ACHIEVEMENT_DEFINITIONS: List[Dict[str, Any]] = [
    {
        "code": "FIRST_WORKOUT",
        "name": "First Step",
        "description": "Completed your very first workout session",
        "category": "workout",
        "icon": "dumbbell",
    },
    {
        "code": "WORKOUT_10",
        "name": "Consistent Athlete",
        "description": "Completed 10 workout sessions",
        "category": "workout",
        "icon": "trophy",
    },
    {
        "code": "WORKOUT_25",
        "name": "Iron Dedication",
        "description": "Completed 25 workout sessions",
        "category": "workout",
        "icon": "award",
    },
    {
        "code": "STREAK_7",
        "name": "Week Warrior",
        "description": "Maintained a 7-day active streak",
        "category": "streak",
        "icon": "flame",
    },
    {
        "code": "STREAK_30",
        "name": "Unstoppable",
        "description": "Maintained a 30-day active streak",
        "category": "streak",
        "icon": "zap",
    },
    {
        "code": "FIRST_MEAL",
        "name": "Nutrition Starter",
        "description": "Logged your first meal",
        "category": "nutrition",
        "icon": "apple",
    },
    {
        "code": "NUTRITION_7_DAYS",
        "name": "Clean Week",
        "description": "Logged nutrition on 7 different days",
        "category": "nutrition",
        "icon": "salad",
    },
    {
        "code": "PROTEIN_TARGET_7",
        "name": "Protein Pro",
        "description": "Hit your protein target 7 days in a row or total",
        "category": "nutrition",
        "icon": "target",
    },
    {
        "code": "WEIGHT_LOSS_1KG",
        "name": "First Kilo",
        "description": "Lost (or changed) 1 kg from your starting weight",
        "category": "weight",
        "icon": "trending-down",
    },
    {
        "code": "GOAL_CRUSHER",
        "name": "Goal Crusher",
        "description": "Completed 5 monthly goals",
        "category": "general",
        "icon": "star",
    },
]

ACHIEVEMENT_CODES = {a["code"] for a in ACHIEVEMENT_DEFINITIONS}


class AchievementService:

    def evaluate_and_unlock(
        self,
        db: Session,
        user_id: str,
        profile: UserProfile,
        streak_data: Optional[Dict[str, int]] = None,
        completed_monthly_goals: int = 0,
    ) -> List[Dict[str, Any]]:
        """
        Evaluates each achievement against real data.
        Unlocks (inserts UserAchievement) for newly met conditions.
        Returns full achievement list with unlocked status.
        """
        # --- Fetch raw data needed for evaluation ---

        total_completed_sessions = db.query(func.count(WorkoutSession.id)).filter(
            WorkoutSession.user_id == user_id,
            WorkoutSession.status == SessionStatus.completed.value,
        ).scalar() or 0

        total_nutrition_logs = db.query(func.count(NutritionLog.id)).filter(
            NutritionLog.user_id == user_id
        ).scalar() or 0

        distinct_nutrition_days = db.query(NutritionLog.log_date).filter(
            NutritionLog.user_id == user_id
        ).distinct().count()

        # Protein target days
        protein_target = nutrition_svc.calculate_targets(profile).protein
        protein_target_days = 0
        if protein_target > 0:
            all_log_dates = db.query(NutritionLog.log_date).filter(
                NutritionLog.user_id == user_id
            ).distinct().all()
            for (log_date,) in all_log_dates:
                day_protein = db.query(func.sum(NutritionLog.protein_g)).filter(
                    NutritionLog.user_id == user_id,
                    NutritionLog.log_date == log_date,
                ).scalar() or 0
                if day_protein >= protein_target:
                    protein_target_days += 1

        # Weight change
        weight_records = db.query(WeightLog).filter(
            WeightLog.user_id == user_id
        ).order_by(WeightLog.recorded_at.asc()).all()
        weight_change_abs = 0.0
        if len(weight_records) >= 2:
            weight_change_abs = abs(
                weight_records[-1].weight - weight_records[0].weight
            )

        # Max streak (use passed value or 0)
        max_streak = max(
            streak_data.get("current", 0),
            streak_data.get("longest", 0)
        ) if streak_data else 0

        # --- Evaluate conditions ---
        conditions: Dict[str, bool] = {
            "FIRST_WORKOUT": total_completed_sessions >= 1,
            "WORKOUT_10": total_completed_sessions >= 10,
            "WORKOUT_25": total_completed_sessions >= 25,
            "STREAK_7": max_streak >= 7,
            "STREAK_30": max_streak >= 30,
            "FIRST_MEAL": total_nutrition_logs >= 1,
            "NUTRITION_7_DAYS": distinct_nutrition_days >= 7,
            "PROTEIN_TARGET_7": protein_target_days >= 7,
            "WEIGHT_LOSS_1KG": weight_change_abs >= 1.0,
            "GOAL_CRUSHER": completed_monthly_goals >= 5,
        }

        # --- Fetch already unlocked achievements ---
        existing = db.query(UserAchievement).filter(
            UserAchievement.user_id == user_id
        ).all()
        existing_codes = {ua.achievement_code: ua.unlocked_at for ua in existing}

        # --- Unlock new achievements ---
        now_ist = datetime.now(IST)
        for code, met in conditions.items():
            if met and code not in existing_codes:
                try:
                    ua = UserAchievement(
                        user_id=user_id,
                        achievement_code=code,
                        unlocked_at=now_ist,
                    )
                    db.add(ua)
                    db.flush()
                    existing_codes[code] = now_ist
                except IntegrityError:
                    db.rollback()
                    logger.warning(f"Achievement {code} already exists for {user_id} (race condition)")

        db.commit()

        # Refresh unlock map
        existing = db.query(UserAchievement).filter(
            UserAchievement.user_id == user_id
        ).all()
        unlocked_map = {ua.achievement_code: ua.unlocked_at for ua in existing}

        # --- Build response ---
        result = []
        for defn in ACHIEVEMENT_DEFINITIONS:
            code = defn["code"]
            unlocked = code in unlocked_map
            item = {
                **defn,
                "unlocked": unlocked,
                "unlocked_at": (
                    unlocked_map[code].astimezone(IST).isoformat()
                    if unlocked and unlocked_map[code]
                    else None
                ),
            }
            result.append(item)

        unlocked_count = sum(1 for r in result if r["unlocked"])
        return {
            "unlocked": unlocked_count,
            "total": len(result),
            "items": result,
        }
