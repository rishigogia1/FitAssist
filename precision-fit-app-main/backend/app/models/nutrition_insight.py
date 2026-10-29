from sqlalchemy import Column, String, Integer, DateTime, Text, JSON
from sqlalchemy.sql import func
from app.database.connection import Base

class NutritionInsight(Base):
    __tablename__ = "nutrition_insights"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True, nullable=False)
    insight_type = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    context_hash = Column(String, nullable=True)
    provider = Column(String, nullable=False, default="deterministic")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=True)
