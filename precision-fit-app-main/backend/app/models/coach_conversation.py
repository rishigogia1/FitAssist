from sqlalchemy import Column, String, Integer, DateTime, Text
from sqlalchemy.sql import func
from app.database.connection import Base

class CoachConversation(Base):
    __tablename__ = "coach_conversations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True, nullable=False)
    session_id = Column(String, index=True, nullable=True)
    role = Column(String, nullable=False)  # "user" or "ai"
    message = Column(Text, nullable=False)
    intent = Column(String, nullable=True)
    response_metadata = Column(Text, nullable=True)  # stores JSON of reasoning, metrics, actions
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
