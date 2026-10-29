from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, date, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Optional

from app.database.connection import get_db
from app.models.workout_session import WorkoutSession, SessionStatus
from app.models.user_profile import UserProfile
from app.schemas.workout_session import (
    WorkoutSessionCreate, 
    WorkoutSessionUpdate, 
    WorkoutSessionComplete, 
    WorkoutSessionResponse,
    TodaySessionStatusResponse,
    WorkoutHistoryResponse,
    WorkoutHistoryStats,
    WorkoutHistoryItem,
)
from app.auth.dependencies import get_current_user
from app.services.workout_service import WorkoutService, STATIC_WORKOUTS

router = APIRouter()
IST = ZoneInfo("Asia/Kolkata")

def _to_ist_date(dt: datetime) -> date:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(IST).date()

def _get_workout_info(workout_id: str) -> tuple[str, str]:
    """Look up human-readable workout name and category from static catalog."""
    for w in STATIC_WORKOUTS:
        if w.id == workout_id:
            return w.name, w.category
    # Fallback readable name from identifier
    return workout_id.replace("-", " ").title(), "Workout"

@router.post("", response_model=WorkoutSessionResponse)
def create_session(
    data: WorkoutSessionCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
        
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if not profile:
        raise HTTPException(status_code=400, detail="User profile not found")
        
    # Verify workout ID belongs to personalized recommendations or static catalog
    service = WorkoutService()
    recommendations = service.get_personalized_recommendations(profile)
    valid_ids = [w.id for w in recommendations.workouts]
    
    # Also allow any valid static workout id if defined
    catalog_ids = [w.id for w in STATIC_WORKOUTS]
    all_valid_ids = set(valid_ids).union(catalog_ids)

    if data.workout_id not in all_valid_ids:
        raise HTTPException(
            status_code=400, 
            detail="Invalid workout ID for this user profile"
        )
        
    # Re-use existing in-progress session if one already exists for this exact workout
    existing_active = db.query(WorkoutSession).filter(
        WorkoutSession.user_id == user_id,
        WorkoutSession.workout_id == data.workout_id,
        WorkoutSession.status.in_([
            SessionStatus.started.value,
            SessionStatus.in_progress.value,
            SessionStatus.paused.value
        ])
    ).order_by(WorkoutSession.created_at.desc()).first()

    if existing_active:
        return existing_active

    matching_workout = next((w for w in recommendations.workouts if w.id == data.workout_id), None)
    if not matching_workout:
        matching_workout = next((w for w in STATIC_WORKOUTS if w.id == data.workout_id), None)

    total_exercises = len(matching_workout.exercises) if matching_workout else 1

    session = WorkoutSession(
        user_id=user_id,
        workout_id=data.workout_id,
        total_exercises=total_exercises
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    
    return session

@router.get("/today", response_model=TodaySessionStatusResponse)
def get_today_session_status(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Check completed sessions today (calendar date in IST)
    today_date = datetime.now(IST).date()
    
    completed_sessions = db.query(WorkoutSession).filter(
        WorkoutSession.user_id == user_id,
        WorkoutSession.status == SessionStatus.completed.value,
        WorkoutSession.completed_at.isnot(None)
    ).order_by(WorkoutSession.completed_at.desc()).all()

    completed_today = next(
        (s for s in completed_sessions if _to_ist_date(s.completed_at) == today_date),
        None
    )

    today_completed_ids = [
        s.workout_id for s in completed_sessions
        if _to_ist_date(s.completed_at) == today_date
    ]

    # Check active session if any
    active = db.query(WorkoutSession).filter(
        WorkoutSession.user_id == user_id,
        WorkoutSession.status.in_([
            SessionStatus.started.value,
            SessionStatus.in_progress.value,
            SessionStatus.paused.value
        ])
    ).order_by(WorkoutSession.created_at.desc()).first()

    return TodaySessionStatusResponse(
        has_completed_today=completed_today is not None,
        completed_workout_id=completed_today.workout_id if completed_today else None,
        completed_workout_ids=today_completed_ids,
        completed_at=completed_today.completed_at if completed_today else None,
        active_session_id=active.id if active else None
    )

@router.get("/history", response_model=WorkoutHistoryResponse)
def get_workout_history(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    today = datetime.now(IST).date()
    # Monday is weekday 0 in Python (calendar week)
    week_monday = today - timedelta(days=today.weekday())
    week_sunday = week_monday + timedelta(days=6)

    # Retrieve all completed sessions for this user
    all_completed = db.query(WorkoutSession).filter(
        WorkoutSession.user_id == user_id,
        WorkoutSession.status == SessionStatus.completed.value,
        WorkoutSession.completed_at.isnot(None)
    ).order_by(WorkoutSession.completed_at.desc()).all()

    total_completed = len(all_completed)
    completed_this_week = 0
    total_duration_seconds = 0

    history_items: list[WorkoutHistoryItem] = []

    for s in all_completed:
        d = _to_ist_date(s.completed_at)
        if week_monday <= d <= week_sunday:
            completed_this_week += 1
        total_duration_seconds += s.duration_seconds or 0

        name, cat = _get_workout_info(s.workout_id)
        if len(history_items) < limit:
            history_items.append(
                WorkoutHistoryItem(
                    id=s.id,
                    workout_id=s.workout_id,
                    workout_name=name,
                    category=cat,
                    status=s.status,
                    completed_exercises=s.completed_exercises,
                    total_exercises=s.total_exercises,
                    duration_seconds=s.duration_seconds,
                    completed_at=s.completed_at,
                    started_at=s.started_at,
                    estimated_calories=s.estimated_calories,
                    completion_percentage=s.completion_percentage,
                )
            )

    stats = WorkoutHistoryStats(
        total_completed=total_completed,
        completed_this_week=completed_this_week,
        total_duration_minutes=int(round(total_duration_seconds / 60)),
        has_scheduled_plan=False,
        scheduled_total=0,
        scheduled_completed=0,
        scheduled_remaining=0,
        completion_rate_percentage=0.0,
    )

    return WorkoutHistoryResponse(
        stats=stats,
        history=history_items
    )

@router.get("/{session_id}", response_model=WorkoutSessionResponse)
def get_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")
    session = db.query(WorkoutSession).filter(
        WorkoutSession.id == session_id,
        WorkoutSession.user_id == user_id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    return session

@router.patch("/{session_id}", response_model=WorkoutSessionResponse)
def update_session(
    session_id: str,
    data: WorkoutSessionUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")
    session = db.query(WorkoutSession).filter(
        WorkoutSession.id == session_id,
        WorkoutSession.user_id == user_id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status == SessionStatus.abandoned.value:
        raise HTTPException(status_code=400, detail="Cannot update an abandoned session")

    # Do not allow updating completed session back to active
    if session.status == SessionStatus.completed.value and data.status != SessionStatus.completed:
        return session
        
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(session, key, value.value if hasattr(value, "value") else value)
        
    db.commit()
    db.refresh(session)
    
    return session

@router.post("/{session_id}/complete", response_model=WorkoutSessionResponse)
def complete_session(
    session_id: str,
    data: WorkoutSessionComplete,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")
    session = db.query(WorkoutSession).filter(
        WorkoutSession.id == session_id,
        WorkoutSession.user_id == user_id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    if session.status == SessionStatus.abandoned.value:
        raise HTTPException(status_code=400, detail="Cannot complete an abandoned session")

    # Idempotent completion check
    if session.status == SessionStatus.completed.value:
        return session

    session.status = SessionStatus.completed.value
    session.completed_exercises = max(0, data.completed_exercises)
    session.total_exercises = max(1, data.total_exercises)
    session.duration_seconds = max(0, data.duration_seconds)
    session.completion_percentage = max(0.0, min(100.0, data.completion_percentage))
    session.estimated_calories = max(0, data.estimated_calories)
    if not session.completed_at:
        session.completed_at = datetime.now(timezone.utc)
    
    db.commit()
    db.refresh(session)
    
    return session

@router.post("/{session_id}/abandon", response_model=WorkoutSessionResponse)
def abandon_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")
    session = db.query(WorkoutSession).filter(
        WorkoutSession.id == session_id,
        WorkoutSession.user_id == user_id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status == SessionStatus.completed.value:
        raise HTTPException(status_code=400, detail="Cannot abandon an already completed session")

    session.status = SessionStatus.abandoned.value
    db.commit()
    db.refresh(session)

    return session
