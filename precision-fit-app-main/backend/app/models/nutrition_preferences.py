from sqlalchemy import Column, Integer, String, DateTime, JSON
from sqlalchemy.sql import func
from app.database.connection import Base

class NutritionPreferences(Base):
    __tablename__ = "nutrition_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, unique=True, index=True, nullable=False)
    dietary_preference = Column(String, nullable=False, default="no_preference")
    cuisine_preference = Column(String, nullable=False, default="mixed")
    meals_per_day = Column(Integer, nullable=False, default=3)
    allergies = Column(JSON, nullable=False, default=list)
    foods_liked = Column(String, nullable=True)
    foods_disliked = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
