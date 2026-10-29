import logging
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional

from app.services.coach.context_builder import CoachContextBuilder
from app.services.coach.intent import detect_intent
from app.services.coach.providers.gemini_provider import GeminiCoachProvider
from app.models.coach_conversation import CoachConversation
from app.models.user_profile import UserProfile
from app.services.workout_service import WorkoutService
from app.schemas.coach import CoachResponse, SuggestedAction

logger = logging.getLogger(__name__)

class AdaptiveCoachEngine:
    def __init__(self):
        self.context_builder = CoachContextBuilder()
        self.provider = GeminiCoachProvider()
        self.workout_service = WorkoutService()

    def get_history(self, db: Session, user_id: str, limit: int = 10, session_id: Optional[str] = None) -> List[Dict[str, Any]]:
        query = db.query(CoachConversation).filter(
            CoachConversation.user_id == user_id
        )
        if session_id:
            query = query.filter(CoachConversation.session_id == session_id)
            
        messages = query.order_by(CoachConversation.created_at.desc()).limit(limit).all()
        
        # Reverse to chronological order
        messages.reverse()
        
        return [
            {"role": m.role, "message": m.message}
            for m in messages
        ]

    def chat(self, db: Session, user_id: str, user_message: str, session_id: Optional[str] = None) -> CoachResponse:
        import uuid
        effective_session_id = session_id or str(uuid.uuid4())

        # 1. Detect Intent first
        intent = detect_intent(user_message)
        logger.info(f"Detected intent '{intent}' for user {user_id} in session {effective_session_id}")

        # 2. Build CoachContext conditionally based on intent
        context = self.context_builder.build_context(db, user_id, intent)
        
        # 3. Retrieve history
        history = self.get_history(db, user_id, limit=10, session_id=effective_session_id)
        
        # 4. Generate AI response
        response = self.provider.generate_response(user_message, context, intent, history)
        response.session_id = effective_session_id
        
        # 5. Save user message to database
        db_user_msg = CoachConversation(
            user_id=user_id,
            session_id=effective_session_id,
            role="user",
            message=user_message,
            intent=intent
        )
        db.add(db_user_msg)
        
        # 6. Validate Suggested Actions (Backend is authoritative for Workout IDs)
        validated_actions = []
        for action in response.suggested_actions:
            if action.type == "START_WORKOUT":
                # Find a real workout_id from user's recommendation
                profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
                if profile:
                    recs = self.workout_service.get_personalized_recommendations(profile)
                    if recs.workouts:
                        # Re-assign or assign first workout id
                        real_workout_id = recs.workouts[0].id
                        payload = action.payload or {}
                        payload["workout_id"] = real_workout_id
                        action.payload = payload
                        validated_actions.append(action)
                    else:
                        # Fallback to general mobility or default workout
                        payload = action.payload or {}
                        payload["workout_id"] = "mob-beg-1"
                        action.payload = payload
                        validated_actions.append(action)
                else:
                    payload = action.payload or {}
                    payload["workout_id"] = "mob-beg-1"
                    action.payload = payload
                    validated_actions.append(action)
            else:
                validated_actions.append(action)
        response.suggested_actions = validated_actions

        # 7. Apply safety and allergy disclosures
        lower_msg = user_message.lower()
        if any(w in lower_msg for w in ["hurt", "pain", "injur", "chest", "dizzi", "doctor", "medical", "swollen"]):
            response.message += (
                "\n\n*Safety Disclaimer: If you are experiencing pain, chest tightness, or injury, please pause physical activities and consult a medical professional.*"
            )
        elif context.allergies and any(w in lower_msg for w in ["eat", "food", "snack", "meal", "recipe"]):
            allergy_str = ", ".join(context.allergies)
            response.message += (
                f"\n\n*Note: Suggestions are filtered to respect your recorded allergies: {allergy_str}.*"
            )

        # 8. Save AI response to database
        import json
        metadata = {
            "recommendation_type": response.recommendation_type,
            "reasoning": response.reasoning,
            "supporting_metrics": response.supporting_metrics,
            "suggested_actions": [
                {"type": act.type, "label": act.label, "payload": act.payload}
                for act in response.suggested_actions
            ]
        }
        db_ai_msg = CoachConversation(
            user_id=user_id,
            session_id=effective_session_id,
            role="ai",
            message=response.message,
            intent=intent,
            response_metadata=json.dumps(metadata)
        )
        db.add(db_ai_msg)
        db.commit()
        
        return response
