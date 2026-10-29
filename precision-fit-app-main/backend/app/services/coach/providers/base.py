from abc import ABC, abstractmethod
from typing import List, Dict, Any
from app.services.coach.context_builder import CoachContext
from app.schemas.coach import CoachResponse

class BaseCoachAIProvider(ABC):
    @abstractmethod
    def generate_response(
        self,
        user_message: str,
        context: CoachContext,
        intent: str,
        history: List[Dict[str, Any]]
    ) -> CoachResponse:
        pass
