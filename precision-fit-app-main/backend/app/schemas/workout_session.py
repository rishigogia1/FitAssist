from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.models.workout_session import SessionStatus

class WorkoutSessionCreate(BaseModel):
    workout_id: str

class WorkoutSessionUpdate(BaseModel):
    status: Optional[SessionStatus] = None
    current_exercise_index: Optional[int] = None
    current_set_index: Optional[int] = None
    completed_exercises: Optional[int] = None
    completed_sets: Optional[int] = None
    duration_seconds: Optional[int] = None

class WorkoutSessionComplete(BaseModel):
    completed_exercises: int
    total_exercises: int
    duration_seconds: int
    completion_percentage: float
    estimated_calories: int

class WorkoutSessionResponse(BaseModel):
    id: str
    user_id: str
    workout_id: str
    status: SessionStatus
    current_exercise_index: int
    current_set_index: int
    completed_exercises: int
    completed_sets: int
    total_exercises: int
    duration_seconds: int
    completion_percentage: float
    estimated_calories: int
    started_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class TodaySessionStatusResponse(BaseModel):
    has_completed_today: bool
    completed_workout_id: Optional[str] = None
    completed_workout_ids: list[str] = []
    completed_at: Optional[datetime] = None
    active_session_id: Optional[str] = None

class WorkoutHistoryItem(BaseModel):
    id: str
    workout_id: str
    workout_name: str
    category: str
    status: str
    completed_exercises: int
    total_exercises: int
    duration_seconds: int
    completed_at: Optional[datetime] = None
    started_at: datetime
    estimated_calories: int
    completion_percentage: float

class WorkoutHistoryStats(BaseModel):
    total_completed: int
    completed_this_week: int
    total_duration_minutes: int
    has_scheduled_plan: bool = False
    scheduled_total: int = 0
    scheduled_completed: int = 0
    scheduled_remaining: int = 0
    completion_rate_percentage: float = 0.0

class WorkoutHistoryResponse(BaseModel):
    stats: WorkoutHistoryStats
    history: list[WorkoutHistoryItem]
