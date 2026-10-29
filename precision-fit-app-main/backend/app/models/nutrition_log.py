from sqlalchemy import Column, String, Integer, Float, Date, DateTime
from sqlalchemy.sql import func
import uuid
from app.database.connection import Base

class NutritionLog(Base):
    __tablename__ = "nutrition_logs"

    id = Column(String(36), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, index=True, nullable=False)
    
    meal_id = Column(String(50), nullable=False)
    meal_type = Column(String(50), nullable=False)
    meal_name = Column(String(255), nullable=False)
    
    calories = Column(Integer, nullable=False)
    protein_g = Column(Float, nullable=False)
    carbs_g = Column(Float, nullable=False)
    fat_g = Column(Float, nullable=False)
    
    log_date = Column(Date, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
