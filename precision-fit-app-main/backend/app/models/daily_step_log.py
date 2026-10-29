from sqlalchemy import Column, Integer, String, Date, DateTime, UniqueConstraint, CheckConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import validates
from app.database.connection import Base


class DailyStepLog(Base):
    __tablename__ = "daily_step_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=False)
    log_date = Column(Date, nullable=False, index=True)
    step_count = Column(Integer, nullable=False, default=0)
    step_goal = Column(Integer, nullable=False, default=7000)
    source = Column(String(50), nullable=False, default="manual")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "log_date", name="uq_user_daily_step_date"),
        CheckConstraint("step_count >= 0", name="chk_step_count_non_negative"),
        CheckConstraint("step_goal > 0", name="chk_step_goal_positive"),
    )

    @validates("step_count")
    def validate_step_count(self, key, value):
        if value is None:
            raise ValueError("Step count cannot be None.")
        if not isinstance(value, int) or isinstance(value, bool):
            raise TypeError("Step count must be an integer.")
        if value < 0:
            raise ValueError("Step count must be a non-negative integer (>= 0).")
        return value

    @validates("step_goal")
    def validate_step_goal(self, key, value):
        if value is None:
            raise ValueError("Step goal cannot be None.")
        if not isinstance(value, int) or isinstance(value, bool):
            raise TypeError("Step goal must be an integer.")
        if value <= 0:
            raise ValueError("Step goal must be a positive integer (> 0).")
        return value
