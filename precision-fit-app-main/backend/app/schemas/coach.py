from pydantic import BaseModel, ConfigDict
from typing import List, Dict, Any, Optional
from datetime import datetime

class CoachMessage(BaseModel):
    message: str
    session_id: Optional[str] = None

class SuggestedAction(BaseModel):
    type: str  # e.g., "START_WORKOUT", "NUTRITION_RECOMMENDATION", etc.
    label: str
    payload: Optional[Dict[str, Any]] = None

class CoachResponse(BaseModel):
    message: str
    recommendation_type: str  # e.g., "nutrition", "workout", "progress", "general"
    reasoning: List[str] = []
    supporting_metrics: Dict[str, Any] = {}
    suggested_actions: List[SuggestedAction] = []
    session_id: Optional[str] = None

class CoachInsightResponse(BaseModel):
    content: str
    insight_type: str = "general"

class CoachSuggestionsResponse(BaseModel):
    suggestions: List[str]

class CoachHistoryItem(BaseModel):
    id: Optional[int] = None
    role: str
    message: str
    intent: Optional[str] = None
    response_metadata: Optional[str] = None
    session_id: Optional[str] = None
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class CoachHistoryResponse(BaseModel):
    session_id: Optional[str] = None
    history: List[CoachHistoryItem]

class CoachSessionItem(BaseModel):
    session_id: str
    title: str
    last_message: str
    message_count: int
    updated_at: datetime
    created_at: datetime

class CoachSessionsResponse(BaseModel):
    sessions: List[CoachSessionItem]
