from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
from zoneinfo import ZoneInfo

from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.services.coach.engine import AdaptiveCoachEngine
from app.services.coach.context_builder import CoachContextBuilder
from app.services.coach.intent import CoachIntent
from app.models.coach_conversation import CoachConversation
from app.models.workout_session import WorkoutSession
from app.models.nutrition_log import NutritionLog
from app.schemas.coach import (
    CoachMessage,
    CoachResponse,
    CoachInsightResponse,
    CoachSuggestionsResponse,
    CoachHistoryResponse,
    CoachHistoryItem,
    CoachSessionItem,
    CoachSessionsResponse
)
from typing import Optional

router = APIRouter()
coach_engine = AdaptiveCoachEngine()
context_builder = CoachContextBuilder()

@router.post("/chat", response_model=CoachResponse)
def coach_chat(
    payload: CoachMessage,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_id = current_user["user_id"]
    if not payload.message.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message cannot be empty."
        )
    if len(payload.message) > 500:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message is too long. Please keep it under 500 characters."
        )
    
    try:
        response = coach_engine.chat(db, user_id, payload.message, session_id=payload.session_id)
        return response
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred processing your request. Please try again."
        )

@router.get("/insight", response_model=CoachInsightResponse)
def get_coach_insight(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_id = current_user["user_id"]
    try:
        context = context_builder.build_context(
            db, 
            user_id, 
            intent=CoachIntent.PROGRESS_ANALYSIS, 
            force_analytics=True
        )
        
        # Check if user has any activity history at all
        total_workouts = db.query(WorkoutSession).filter(WorkoutSession.user_id == user_id).count()
        total_meals = db.query(NutritionLog).filter(NutritionLog.user_id == user_id).count()
        
        if total_workouts == 0 and total_meals == 0:
            return CoachInsightResponse(
                content="No workout or meal logs recorded yet. Track your first activity to start generating personalized daily insights.",
                insight_type="empty"
            )

        # Check today's completed workout in user local time (IST)
        IST = ZoneInfo("Asia/Kolkata")
        today_iso = datetime.now(IST).date().isoformat()
        
        completed_today = any(
            s.get("status") == "completed" and s.get("completed_at") and str(s["completed_at"]).startswith(today_iso)
            for s in (context.recent_workout_sessions or [])
        )
        
        rem_pro = context.nutrition_remaining.get("protein", 0) if context.nutrition_remaining else 0
        consumed_pro = round(context.nutrition_consumed.get("protein", 0)) if context.nutrition_consumed else 0
        target_pro = context.nutrition_targets.get("protein", 0) if context.nutrition_targets else 0
        pro_pct = round(context.nutrition_progress.get("protein", 0)) if context.nutrition_progress else 0
        logged_meals_today = context.logged_meals_count or 0
        goal_formatted = context.fitness_goal.replace("_", " ") if context.fitness_goal else "fitness"

        if logged_meals_today > 0 and rem_pro > 25:
            content = f"Your protein intake is {pro_pct}% of target ({consumed_pro}g / {target_pro}g). Add a protein-rich snack to hit your macro goal."
            insight_type = "nutrition"
        elif not completed_today:
            content = f"You haven't completed a workout today. A quick {context.fitness_level} session will keep your {goal_formatted} goal on track."
            insight_type = "workout"
        elif completed_today and rem_pro > 25:
            content = f"Workout completed today! You still have {round(rem_pro)}g of protein remaining—fuel up with a protein-rich recovery meal."
            insight_type = "nutrition"
        elif context.fitness_score and context.fitness_score > 70:
            percentile_str = f", putting you in the {context.fitness_score_percentile} group" if context.fitness_score_percentile else ""
            content = f"Great consistency! Your FitAssist Fitness Score is {context.fitness_score}/100{percentile_str}."
            insight_type = "progress"
        else:
            content = "Keep logging your meals and workouts daily to see dynamic fitness progress and scores."
            insight_type = "general"
            
        return CoachInsightResponse(content=content, insight_type=insight_type)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not retrieve coach insight."
        )

@router.get("/suggestions", response_model=CoachSuggestionsResponse)
def get_coach_suggestions(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_id = current_user["user_id"]
    try:
        context = context_builder.build_context(
            db, 
            user_id, 
            intent=CoachIntent.PROGRESS_ANALYSIS, 
            force_analytics=True
        )
        
        suggestions = []
        
        # 1. Protein suggestion
        rem_pro = context.nutrition_remaining.get("protein", 0) if context.nutrition_remaining else 0
        if rem_pro > 20:
            suggestions.append("Help me reach my protein goal")
            
        # 2. Workout suggestion
        IST = ZoneInfo("Asia/Kolkata")
        today_iso = datetime.now(IST).date().isoformat()
        completed_today = any(
            s.get("status") == "completed" and s.get("completed_at") and str(s["completed_at"]).startswith(today_iso)
            for s in (context.recent_workout_sessions or [])
        )
        if not completed_today:
            suggestions.append("What should I train today?")
        else:
            suggestions.append("Analyze today's workout")
            
        # 3. Nutrition suggestion
        rem_cal = context.nutrition_remaining.get("calories", 0) if context.nutrition_remaining else 0
        if rem_cal > 200:
            suggestions.append("What should I eat next?")
            
        # 4. Progress suggestion
        if (context.completed_sessions_count_last_7_days or 0) > 0:
            suggestions.append("How am I progressing?")
            
        # 5. Weekly plan
        suggestions.append("Plan my week")
        
        # Ensure we always return at least 3-4 suggestions
        suggestions = list(dict.fromkeys(suggestions))[:4]
        return CoachSuggestionsResponse(suggestions=suggestions)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return CoachSuggestionsResponse(suggestions=["Plan my week", "What should I eat next?", "How am I progressing?"])

@router.get("/sessions", response_model=CoachSessionsResponse)
def get_coach_sessions(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_id = current_user["user_id"]
    try:
        messages = db.query(CoachConversation).filter(
            CoachConversation.user_id == user_id
        ).order_by(CoachConversation.created_at.asc()).all()

        if not messages:
            return CoachSessionsResponse(sessions=[])

        from collections import OrderedDict
        sessions_map = OrderedDict()
        for m in messages:
            s_id = m.session_id if m.session_id else "default"
            if s_id not in sessions_map:
                sessions_map[s_id] = {
                    "session_id": s_id,
                    "title": "",
                    "last_message": "",
                    "message_count": 0,
                    "created_at": m.created_at,
                    "updated_at": m.created_at
                }
            item = sessions_map[s_id]
            item["message_count"] += 1
            item["updated_at"] = m.created_at
            item["last_message"] = m.message
            if m.role == "user" and not item["title"]:
                title_candidate = m.message.strip().replace("\n", " ")
                if len(title_candidate) > 40:
                    title_candidate = title_candidate[:37] + "..."
                item["title"] = title_candidate

        session_items = []
        for s_id, data in sessions_map.items():
            title = data["title"] or ("Previous Conversation" if s_id == "default" else "New Conversation")
            session_items.append(CoachSessionItem(
                session_id=s_id,
                title=title,
                last_message=data["last_message"],
                message_count=data["message_count"],
                updated_at=data["updated_at"],
                created_at=data["created_at"]
            ))

        session_items.sort(key=lambda s: s.updated_at, reverse=True)
        return CoachSessionsResponse(sessions=session_items)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not retrieve chat sessions."
        )

@router.delete("/sessions/{session_id}")
def delete_coach_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_id = current_user["user_id"]
    try:
        query = db.query(CoachConversation).filter(CoachConversation.user_id == user_id)
        if session_id == "default":
            query = query.filter(
                (CoachConversation.session_id == "default") | (CoachConversation.session_id.is_(None))
            )
        else:
            query = query.filter(CoachConversation.session_id == session_id)
        
        deleted_count = query.delete(synchronize_session=False)
        db.commit()
        return {"status": "success", "deleted_count": deleted_count}
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not delete chat session."
        )

@router.get("/history", response_model=CoachHistoryResponse)
def get_coach_history(
    session_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_id = current_user["user_id"]
    try:
        effective_session_id = session_id
        if not effective_session_id:
            latest_msg = db.query(CoachConversation).filter(
                CoachConversation.user_id == user_id
            ).order_by(CoachConversation.created_at.desc()).first()
            
            if not latest_msg:
                return CoachHistoryResponse(session_id=None, history=[])
            effective_session_id = latest_msg.session_id or "default"

        query = db.query(CoachConversation).filter(CoachConversation.user_id == user_id)
        if effective_session_id == "default":
            query = query.filter(
                (CoachConversation.session_id == "default") | (CoachConversation.session_id.is_(None))
            )
        else:
            query = query.filter(CoachConversation.session_id == effective_session_id)

        messages = query.order_by(CoachConversation.created_at.asc()).all()
        
        history = [
            CoachHistoryItem(
                id=m.id,
                role=m.role,
                message=m.message,
                intent=m.intent,
                response_metadata=m.response_metadata,
                session_id=m.session_id or "default",
                created_at=m.created_at
            )
            for m in messages
        ]
        return CoachHistoryResponse(session_id=effective_session_id, history=history)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not retrieve history."
        )
