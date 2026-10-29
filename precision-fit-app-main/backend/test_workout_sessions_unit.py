import unittest
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi import HTTPException

from app.database.connection import Base
from app.models.workout_session import WorkoutSession, SessionStatus
from app.models.user_profile import UserProfile
from app.schemas.workout_session import (
    WorkoutSessionCreate,
    WorkoutSessionUpdate,
    WorkoutSessionComplete
)
from app.api.routes.workout_sessions import (
    create_session,
    update_session,
    complete_session,
    abandon_session,
    get_today_session_status,
    get_workout_history,
    _to_ist_date
)

IST = ZoneInfo("Asia/Kolkata")

class TestWorkoutSessionDirect(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Create an in-memory SQLite database
        cls.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False}
        )
        cls.TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=cls.engine)
        Base.metadata.create_all(bind=cls.engine)

        cls.user_id = "test-user-123"
        cls.current_user = {"user_id": cls.user_id, "email": "test@example.com"}

        # Seed profile for test user
        db = cls.TestingSessionLocal()
        profile = UserProfile(
            user_id=cls.user_id,
            age=25,
            weight=70.0,
            fitness_goal="muscle_gain",
            fitness_level="advanced"
        )
        db.add(profile)
        db.commit()
        db.close()

    def setUp(self):
        # Clean workout_sessions table between tests
        self.db = self.TestingSessionLocal()
        self.db.query(WorkoutSession).delete()
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_create_and_reuse_session(self):
        # 1. Create initial session
        req1 = WorkoutSessionCreate(workout_id="mg-adv-1")
        session1 = create_session(data=req1, db=self.db, current_user=self.current_user)
        self.assertIsNotNone(session1.id)
        self.assertEqual(session1.status, "started")
        self.assertEqual(session1.workout_id, "mg-adv-1")
        session1_id = session1.id

        # 2. Second create call for same active workout reuses existing session
        req2 = WorkoutSessionCreate(workout_id="mg-adv-1")
        session2 = create_session(data=req2, db=self.db, current_user=self.current_user)
        self.assertEqual(session2.id, session1_id)

    def test_update_session_progress_and_duration(self):
        req = WorkoutSessionCreate(workout_id="mg-adv-1")
        session = create_session(data=req, db=self.db, current_user=self.current_user)

        update_req = WorkoutSessionUpdate(
            status=SessionStatus.in_progress,
            current_exercise_index=1,
            completed_exercises=1,
            duration_seconds=120
        )
        updated = update_session(session_id=session.id, data=update_req, db=self.db, current_user=self.current_user)
        self.assertEqual(updated.status, "in_progress")
        self.assertEqual(updated.completed_exercises, 1)
        self.assertEqual(updated.duration_seconds, 120)

    def test_complete_session_idempotence(self):
        req = WorkoutSessionCreate(workout_id="mg-adv-1")
        session = create_session(data=req, db=self.db, current_user=self.current_user)

        complete_data = WorkoutSessionComplete(
            completed_exercises=2,
            total_exercises=2,
            duration_seconds=1800,
            completion_percentage=100.0,
            estimated_calories=460
        )

        # First completion
        completed1 = complete_session(session_id=session.id, data=complete_data, db=self.db, current_user=self.current_user)
        self.assertEqual(completed1.status, "completed")
        self.assertIsNotNone(completed1.completed_at)
        completed_at_first = completed1.completed_at

        # Second idempotent completion
        completed2 = complete_session(session_id=session.id, data=complete_data, db=self.db, current_user=self.current_user)
        self.assertEqual(completed2.status, "completed")
        self.assertEqual(completed2.completed_at, completed_at_first)

    def test_abandon_session_blocks_completion(self):
        req = WorkoutSessionCreate(workout_id="mg-adv-1")
        session = create_session(data=req, db=self.db, current_user=self.current_user)

        abandoned = abandon_session(session_id=session.id, db=self.db, current_user=self.current_user)
        self.assertEqual(abandoned.status, "abandoned")

        # Attempting to complete abandoned session raises 400 HTTPException
        complete_data = WorkoutSessionComplete(
            completed_exercises=1,
            total_exercises=2,
            duration_seconds=300,
            completion_percentage=50.0,
            estimated_calories=200
        )
        with self.assertRaises(HTTPException) as cm:
            complete_session(session_id=session.id, data=complete_data, db=self.db, current_user=self.current_user)
        self.assertEqual(cm.exception.status_code, 400)
        self.assertIn("abandoned", cm.exception.detail)

    def test_completed_session_blocks_abandon(self):
        req = WorkoutSessionCreate(workout_id="mg-adv-1")
        session = create_session(data=req, db=self.db, current_user=self.current_user)

        complete_data = WorkoutSessionComplete(
            completed_exercises=2,
            total_exercises=2,
            duration_seconds=1200,
            completion_percentage=100.0,
            estimated_calories=460
        )
        complete_session(session_id=session.id, data=complete_data, db=self.db, current_user=self.current_user)

        # Attempting to abandon a completed session raises 400
        with self.assertRaises(HTTPException) as cm:
            abandon_session(session_id=session.id, db=self.db, current_user=self.current_user)
        self.assertEqual(cm.exception.status_code, 400)
        self.assertIn("completed", cm.exception.detail)

    def test_today_status_and_history_metrics(self):
        # Empty state
        today_stat = get_today_session_status(db=self.db, current_user=self.current_user)
        self.assertFalse(today_stat.has_completed_today)
        self.assertEqual(today_stat.completed_workout_ids, [])

        # Start and complete session
        req = WorkoutSessionCreate(workout_id="mg-adv-1")
        session = create_session(data=req, db=self.db, current_user=self.current_user)

        complete_data = WorkoutSessionComplete(
            completed_exercises=2,
            total_exercises=2,
            duration_seconds=2400,
            completion_percentage=100.0,
            estimated_calories=460
        )
        complete_session(session_id=session.id, data=complete_data, db=self.db, current_user=self.current_user)

        # Check today status
        today_stat2 = get_today_session_status(db=self.db, current_user=self.current_user)
        self.assertTrue(today_stat2.has_completed_today)
        self.assertIn("mg-adv-1", today_stat2.completed_workout_ids)

        # Check history
        history_resp = get_workout_history(limit=10, db=self.db, current_user=self.current_user)
        stats = history_resp.stats
        self.assertEqual(stats.total_completed, 1)
        self.assertEqual(stats.completed_this_week, 1)
        self.assertEqual(stats.total_duration_minutes, 40)
        self.assertFalse(stats.has_scheduled_plan)
        self.assertEqual(len(history_resp.history), 1)
        self.assertEqual(history_resp.history[0].workout_name, "Push Day Volume")

if __name__ == "__main__":
    unittest.main()
