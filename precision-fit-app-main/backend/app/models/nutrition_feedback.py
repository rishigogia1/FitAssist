from sqlalchemy import Column, String, Integer, DateTime, Text
from sqlalchemy.sql import func
from app.database.connection import Base

class NutritionFeedback(Base):
    __tablename__ = "nutrition_feedback"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True, nullable=False)
    meal_id = Column(String, index=True, nullable=False)
    feedback_type = Column(String, nullable=False) # liked, disliked, replaced
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
