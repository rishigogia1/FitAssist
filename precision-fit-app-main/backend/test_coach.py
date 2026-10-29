import os
import sys
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

# Setup environment to load app modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "app")))

from app.services.coach.intent import detect_intent, CoachIntent
from app.services.coach.context_builder import CoachContextBuilder
from app.database.connection import SessionLocal
from app.models.user_profile import UserProfile
from app.models.nutrition_log import NutritionLog
from app.models.workout_session import WorkoutSession
from app.api.routes.coach import get_coach_insight, get_coach_suggestions

def test_intent_detection():
    print("Testing Intent Detection...")
    cases = [
        ("Can you help me plan my post workout meal?", "POST_WORKOUT_MEAL"),
        ("What should I eat before gym?", "PRE_WORKOUT_MEAL"),
        ("Give me some high protein foods", "PROTEIN"),
        ("Create a workout plan for me", "WORKOUT_PLAN"),
        ("How many sets of bench press should I do?", "WORKOUT_EXERCISE"),
        ("How do I perform a squat correctly?", "EXERCISE_FORM"),
        ("How am I progressing this week?", "PROGRESS_ANALYSIS"),
        ("How many calories did I consume today?", "CALORIES"),
        ("What is progressive overload?", "GENERAL_FITNESS"),
        ("Hello coach", "GREETING"),
        ("Can you help me?", "UNKNOWN"),
    ]
    
    passed = True
    for msg, expected in cases:
        actual = detect_intent(msg)
        if actual != expected:
            print(f"FAILED: '{msg}' -> expected {expected}, got {actual}")
            passed = False
        else:
            print(f"PASSED: '{msg}' -> {actual}")
    
    if passed:
        print("All intent detection tests passed!\n")

def test_context_builder():
    print("Testing CoachContextBuilder defaults & analytics loading...")
    db = SessionLocal()
    cb = CoachContextBuilder()
    test_uid = f"test_cb_user_{uuid.uuid4().hex[:8]}"

    # 1. Calling without intent should default smoothly
    ctx_default = cb.build_context(db, test_uid)
    assert ctx_default.intent == CoachIntent.GENERAL_FITNESS, f"Expected GENERAL_FITNESS, got {ctx_default.intent}"
    print("PASSED: build_context without intent succeeds with default intent")

    # 2. Calling with force_analytics=True should populate analytics fields
    ctx_analytics = cb.build_context(db, test_uid, force_analytics=True)
    assert ctx_analytics.nutrition_targets is not None, "nutrition_targets should not be None"
    assert ctx_analytics.nutrition_remaining is not None, "nutrition_remaining should not be None"
    assert ctx_analytics.recent_workout_sessions is not None, "recent_workout_sessions should not be None"
    print("PASSED: build_context with force_analytics=True properly loads analytics\n")
    db.close()

def test_coach_insight_empty_and_active_states():
    print("Testing Today's Insight Empty and Active states...")
    db = SessionLocal()
    
    # 1. Brand new user with no logs -> Empty state
    empty_uid = f"empty_user_{uuid.uuid4().hex[:8]}"
    insight_empty = get_coach_insight(current_user={"user_id": empty_uid, "email": empty_uid}, db=db)
    assert insight_empty.insight_type == "empty", f"Expected insight_type='empty', got {insight_empty.insight_type}"
    assert "No workout or meal logs recorded yet" in insight_empty.content
    print("PASSED: Empty history returns appropriate empty state message without fabricating data")

    # 2. User with nutrition activity -> Success / Nutrition insight
    active_uid = f"active_user_{uuid.uuid4().hex[:8]}"
    profile = UserProfile(user_id=active_uid, age=26, weight=72.0, height=174.0, fitness_goal="muscle_gain", fitness_level="intermediate")
    db.add(profile)
    
    IST = ZoneInfo("Asia/Kolkata")
    today = datetime.now(IST).date()
    n_log = NutritionLog(
        id=str(uuid.uuid4()),
        user_id=active_uid,
        log_date=today,
        meal_id="test_meal",
        meal_type="lunch",
        meal_name="Chicken & Rice",
        calories=500,
        protein_g=40.0,
        carbs_g=50.0,
        fat_g=10.0
    )
    db.add(n_log)
    db.commit()

    insight_active = get_coach_insight(current_user={"user_id": active_uid, "email": active_uid}, db=db)
    assert insight_active.insight_type in ["nutrition", "workout", "progress", "general"], f"Unexpected type: {insight_active.insight_type}"
    assert insight_active.insight_type != "empty"
    assert len(insight_active.content) > 10
    print(f"PASSED: Active user returns personalized insight [{insight_active.insight_type}]: '{insight_active.content}'")

    # 3. Suggestions endpoint
    suggestions = get_coach_suggestions(current_user={"user_id": active_uid, "email": active_uid}, db=db)
    assert len(suggestions.suggestions) >= 3, "Expected at least 3 suggestions"
    print(f"PASSED: Suggestions generated dynamically: {suggestions.suggestions}\n")
    db.close()

def test_coach_sessions_and_new_chat():
    print("Testing Coach Sessions and New Chat functionality...")
    from app.services.coach.engine import AdaptiveCoachEngine
    from app.api.routes.coach import get_coach_history, get_coach_sessions, delete_coach_session
    from app.models.coach_conversation import CoachConversation

    db = SessionLocal()
    user_id = f"test_chat_user_{uuid.uuid4().hex[:8]}"
    engine = AdaptiveCoachEngine()

    # 1. Start Chat 1 (New Chat with session_id=None)
    res1 = engine.chat(db, user_id, "What should I eat before workout?", session_id=None)
    session_1_id = res1.session_id
    assert session_1_id is not None, "Engine should assign a session_id if none provided"
    print(f"PASSED: Chat 1 initiated with generated session_id: {session_1_id}")

    # 2. Add follow-up to Chat 1 (resuming existing session)
    res1_followup = engine.chat(db, user_id, "Any healthy vegetarian snacks?", session_id=session_1_id)
    assert res1_followup.session_id == session_1_id, "Engine should keep same session_id on continuation"
    print("PASSED: Chat 1 continuation preserved session_id")

    # 3. Start Chat 2 (User clicks 'New Chat', sends message with session_id=None)
    res2 = engine.chat(db, user_id, "Help me plan a chest and triceps workout", session_id=None)
    session_2_id = res2.session_id
    assert session_2_id is not None and session_2_id != session_1_id, "New chat should get a separate session_id"
    print(f"PASSED: Chat 2 created separate session_id: {session_2_id}")

    # 4. Verify get_coach_sessions lists both sessions with proper titles
    sessions_resp = get_coach_sessions(current_user={"user_id": user_id, "email": user_id}, db=db)
    assert len(sessions_resp.sessions) == 2, f"Expected 2 sessions, got {len(sessions_resp.sessions)}"
    
    # Session 2 was updated most recently, should be first
    assert sessions_resp.sessions[0].session_id == session_2_id
    assert "chest and triceps" in sessions_resp.sessions[0].title.lower()
    assert sessions_resp.sessions[1].session_id == session_1_id
    assert "what should i eat" in sessions_resp.sessions[1].title.lower()
    print("PASSED: get_coach_sessions returned both sessions correctly ordered with titles")

    # 5. Verify get_coach_history for specific session
    hist1 = get_coach_history(session_id=session_1_id, current_user={"user_id": user_id, "email": user_id}, db=db)
    assert len(hist1.history) == 4, f"Session 1 should have 4 messages (2 user + 2 ai), got {len(hist1.history)}"
    assert all(m.session_id == session_1_id for m in hist1.history)
    print("PASSED: get_coach_history filtered by session_1_id isolated session 1 messages")

    hist2 = get_coach_history(session_id=session_2_id, current_user={"user_id": user_id, "email": user_id}, db=db)
    assert len(hist2.history) == 2, f"Session 2 should have 2 messages, got {len(hist2.history)}"
    print("PASSED: get_coach_history filtered by session_2_id isolated session 2 messages")

    # 6. Delete a session
    del_resp = delete_coach_session(session_id=session_1_id, current_user={"user_id": user_id, "email": user_id}, db=db)
    assert del_resp["status"] == "success" and del_resp["deleted_count"] == 4
    
    sessions_after_del = get_coach_sessions(current_user={"user_id": user_id, "email": user_id}, db=db)
    assert len(sessions_after_del.sessions) == 1
    assert sessions_after_del.sessions[0].session_id == session_2_id
    print("PASSED: delete_coach_session cleanly removed session 1\n")

    db.close()

if __name__ == "__main__":
    test_intent_detection()
    test_context_builder()
    test_coach_insight_empty_and_active_states()
    test_coach_sessions_and_new_chat()

