from sqlalchemy import Column, Integer, String, DateTime, JSON
from sqlalchemy.sql import func
from app.database.connection import Base

class DailyMealPlan(Base):
    __tablename__ = "daily_meal_plans"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True, nullable=False)
    plan_date = Column(String, index=True, nullable=False) # YYYY-MM-DD
    meals_json = Column(JSON, nullable=False) # List of meal dicts
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
