from sqlalchemy import Column, Integer, String, DateTime, UniqueConstraint
from sqlalchemy.sql import func
from app.database.connection import Base


class UserAchievement(Base):
    """
    Records which achievements a specific user has unlocked.
    Achievement definitions are stored as Python constants in achievement_service.py,
    not as a DB table, since they are static.
    """
    __tablename__ = "user_achievements"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, nullable=False, index=True)
    achievement_code = Column(String(50), nullable=False)  # e.g. "FIRST_WORKOUT"
    unlocked_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "achievement_code", name="uq_user_achievement"),
    )
