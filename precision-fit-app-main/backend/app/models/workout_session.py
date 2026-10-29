from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Enum
from sqlalchemy.sql import func
from app.database.connection import Base
import uuid
import enum

class SessionStatus(str, enum.Enum):
    started = "started"
    in_progress = "in_progress"
    paused = "paused"
    completed = "completed"
    abandoned = "abandoned"

class WorkoutSession(Base):
    __tablename__ = "workout_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    user_id = Column(String, index=True, nullable=False)
    workout_id = Column(String, nullable=False)
    
    status = Column(String, default=SessionStatus.started.value, nullable=False)
    
    current_exercise_index = Column(Integer, default=0, nullable=False)
    current_set_index = Column(Integer, default=0, nullable=False)
    completed_exercises = Column(Integer, default=0, nullable=False)
    completed_sets = Column(Integer, default=0, nullable=False)
    total_exercises = Column(Integer, default=0, nullable=False)
    
    duration_seconds = Column(Integer, default=0, nullable=False)
    completion_percentage = Column(Float, default=0.0, nullable=False)
    estimated_calories = Column(Integer, default=0, nullable=False)
    
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
