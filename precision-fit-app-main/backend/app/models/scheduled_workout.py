from sqlalchemy import Column, String, Integer, Date, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from app.database.connection import Base
import uuid
import enum

class ScheduleStatus(str, enum.Enum):
    planned = "planned"
    completed = "completed"
    skipped = "skipped"
    rest_day = "rest_day"

class ScheduledWorkout(Base):
    __tablename__ = "scheduled_workouts"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    user_id = Column(String, index=True, nullable=False)
    scheduled_date = Column(Date, nullable=False)
    day_of_week = Column(Integer, nullable=False) # 0=Monday, 6=Sunday
    workout_id = Column(String, nullable=True) # Null for Rest Day
    workout_name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    status = Column(String, default=ScheduleStatus.planned.value, nullable=False)
    completed_session_id = Column(String, ForeignKey("workout_sessions.id", ondelete="SET NULL"), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint('user_id', 'scheduled_date', name='uq_user_scheduled_date'),
    )
