"""
Progress API routes.

All endpoints are scoped to the authenticated user.
User identity is always derived from the JWT token, never from request body.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user_profile import UserProfile
from app.models.nutrition_preferences import NutritionPreferences
from app.models.weight_log import WeightLog
from app.services.progress_service import ProgressService
from app.services.achievement_service import AchievementService

logger = logging.getLogger(__name__)
router = APIRouter()

IST = ZoneInfo("Asia/Kolkata")
progress_svc = ProgressService()
achievement_svc = AchievementService()


def _get_or_create_profile(db: Session, user_id: str) -> UserProfile:
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if not profile:
        profile = UserProfile(
            user_id=user_id,
            age=25,
            weight=70.0,
            height=170.0,
            sex="male",
            fitness_goal="general_fitness",
            fitness_level="intermediate",
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class WeightLogRequest(BaseModel):
    weight: float = Field(..., gt=0, lt=500, description="Weight in kg, must be positive")
    recorded_at: Optional[str] = Field(
        None,
        description="ISO datetime string (optional). Defaults to current IST time.",
    )

    @field_validator("weight")
    @classmethod
    def validate_weight(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Weight must be positive")
        return round(v, 2)


# ---------------------------------------------------------------------------
# GET /api/v1/progress — full progress dashboard
# ---------------------------------------------------------------------------

@router.get("")
def get_progress(
    range: str = Query("4w", description="Weight history range: 7d, 4w, 12w, all"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = current_user["user_id"]

    if range not in ("7d", "4w", "12w", "all"):
        raise HTTPException(status_code=400, detail="Invalid range. Use: 7d, 4w, 12w, all")

    try:
        profile = _get_or_create_profile(db, user_id)

        # Ensure nutrition preferences exist (needed for calorie target)
        prefs = db.query(NutritionPreferences).filter(
            NutritionPreferences.user_id == user_id
        ).first()
        if not prefs:
            prefs = NutritionPreferences(user_id=user_id)
            db.add(prefs)
            db.commit()

        # --- Core aggregations ---
        streak = progress_svc.get_streak(db, user_id)
        goals = progress_svc.get_goals(db, user_id, profile)
        weekly_activity = progress_svc.get_weekly_activity(db, user_id)
        weight = progress_svc.get_weight_history(db, user_id, range_key=range, profile=profile)
        summary = progress_svc.get_summary(db, user_id, profile)
        goal_progress = progress_svc.get_goal_progress(db, user_id, profile)

        # Achievements (also evaluates & unlocks new ones)
        achievements = achievement_svc.evaluate_and_unlock(
            db=db,
            user_id=user_id,
            profile=profile,
            streak_data=streak,
            completed_monthly_goals=goals["completed"],
        )

        return {
            "streak": streak,
            "goals": goals,
            "achievements": achievements,
            "weight": weight,
            "weekly_activity": weekly_activity,
            "summary": summary,
            "goal_progress": goal_progress,
        }

    except Exception as e:
        logger.exception(f"Error building progress dashboard for user {user_id}")
        raise HTTPException(
            status_code=500,
            detail="Unable to load your progress. Please try again.",
        )


# ---------------------------------------------------------------------------
# POST /api/v1/progress/weight — add weight log
# ---------------------------------------------------------------------------

@router.post("/weight", status_code=status.HTTP_201_CREATED)
def add_weight_log(
    payload: WeightLogRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = current_user["user_id"]

    if payload.recorded_at:
        try:
            recorded_at = datetime.fromisoformat(payload.recorded_at)
            if recorded_at.tzinfo is None:
                recorded_at = recorded_at.replace(tzinfo=IST)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Invalid recorded_at format. Use ISO 8601 datetime string.",
            )
    else:
        recorded_at = datetime.now(IST)

    log = WeightLog(
        user_id=user_id,
        weight=payload.weight,
        recorded_at=recorded_at,
    )
    db.add(log)
    db.commit()
    db.refresh(log)

    return {
        "id": log.id,
        "weight": log.weight,
        "recorded_at": log.recorded_at.astimezone(IST).isoformat(),
        "message": f"Weight {log.weight} kg recorded successfully.",
    }


# ---------------------------------------------------------------------------
# GET /api/v1/progress/weight — weight history
# ---------------------------------------------------------------------------

@router.get("/weight")
def get_weight_history(
    range: str = Query("4w", description="7d, 4w, 12w, all"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = current_user["user_id"]

    if range not in ("7d", "4w", "12w", "all"):
        raise HTTPException(status_code=400, detail="Invalid range.")

    profile = _get_or_create_profile(db, user_id)
    return progress_svc.get_weight_history(db, user_id, range_key=range, profile=profile)
