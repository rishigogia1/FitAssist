import unittest
from datetime import date, datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import IntegrityError

from app.database.connection import Base
from app.models.workout_session import WorkoutSession
from app.models.scheduled_workout import ScheduledWorkout, ScheduleStatus

class TestScheduledWorkoutModel(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Create an in-memory SQLite database
        cls.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False}
        )
        cls.TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=cls.engine)
        Base.metadata.create_all(bind=cls.engine)

    def setUp(self):
        self.db = self.TestingSessionLocal()
        self.db.query(ScheduledWorkout).delete()
        self.db.query(WorkoutSession).delete()
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_persist_scheduled_training_day(self):
        target_date = date(2026, 10, 12)
        scheduled = ScheduledWorkout(
            user_id="user_1",
            scheduled_date=target_date,
            day_of_week=0,
            workout_id="mg-adv-1",
            workout_name="Push Day Volume",
            category="strength",
            status=ScheduleStatus.planned.value
        )
        self.db.add(scheduled)
        self.db.commit()
        self.db.refresh(scheduled)

        self.assertIsNotNone(scheduled.id)
        self.assertEqual(scheduled.user_id, "user_1")
        self.assertEqual(scheduled.scheduled_date, target_date)
        self.assertEqual(scheduled.day_of_week, 0)
        self.assertEqual(scheduled.workout_id, "mg-adv-1")
        self.assertEqual(scheduled.workout_name, "Push Day Volume")
        self.assertEqual(scheduled.category, "strength")
        self.assertEqual(scheduled.status, "planned")
        self.assertIsNone(scheduled.completed_session_id)
        self.assertIsNone(scheduled.completed_at)

    def test_persist_rest_day_with_null_workout_id(self):
        target_date = date(2026, 10, 14)
        rest_day = ScheduledWorkout(
            user_id="user_1",
            scheduled_date=target_date,
            day_of_week=2,
            workout_id=None,
            workout_name="Rest & Recovery",
            category="rest",
            status=ScheduleStatus.rest_day.value
        )
        self.db.add(rest_day)
        self.db.commit()
        self.db.refresh(rest_day)

        self.assertIsNotNone(rest_day.id)
        self.assertIsNone(rest_day.workout_id)
        self.assertEqual(rest_day.status, "rest_day")
        self.assertEqual(rest_day.category, "rest")

    def test_unique_constraint_user_and_scheduled_date(self):
        target_date = date(2026, 10, 12)
        scheduled1 = ScheduledWorkout(
            user_id="user_1",
            scheduled_date=target_date,
            day_of_week=0,
            workout_id="w_1",
            workout_name="Workout 1",
            category="strength",
            status=ScheduleStatus.planned.value
        )
        self.db.add(scheduled1)
        self.db.commit()

        # Attempt to insert another entry for the same user on the same date
        scheduled2 = ScheduledWorkout(
            user_id="user_1",
            scheduled_date=target_date,
            day_of_week=0,
            workout_id="w_2",
            workout_name="Workout 2",
            category="cardio",
            status=ScheduleStatus.planned.value
        )
        self.db.add(scheduled2)
        with self.assertRaises(IntegrityError):
            self.db.commit()
        self.db.rollback()

    def test_different_users_same_date(self):
        target_date = date(2026, 10, 12)
        entry_user1 = ScheduledWorkout(
            user_id="user_1",
            scheduled_date=target_date,
            day_of_week=0,
            workout_id="w_1",
            workout_name="User 1 Workout",
            category="strength",
            status=ScheduleStatus.planned.value
        )
        entry_user2 = ScheduledWorkout(
            user_id="user_2",
            scheduled_date=target_date,
            day_of_week=0,
            workout_id="w_2",
            workout_name="User 2 Workout",
            category="mobility",
            status=ScheduleStatus.planned.value
        )
        self.db.add(entry_user1)
        self.db.add(entry_user2)
        self.db.commit()

        count = self.db.query(ScheduledWorkout).filter_by(scheduled_date=target_date).count()
        self.assertEqual(count, 2)

    def test_completed_session_reference_and_timezone_aware_timestamp(self):
        # 1. Create a workout session
        session = WorkoutSession(
            user_id="user_1",
            workout_id="w_1",
            status="completed"
        )
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)

        # 2. Link completed session to scheduled workout
        target_date = date(2026, 10, 12)
        comp_time = datetime.now(timezone.utc)
        scheduled = ScheduledWorkout(
            user_id="user_1",
            scheduled_date=target_date,
            day_of_week=0,
            workout_id="w_1",
            workout_name="Workout 1",
            category="strength",
            status=ScheduleStatus.completed.value,
            completed_session_id=session.id,
            completed_at=comp_time
        )
        self.db.add(scheduled)
        self.db.commit()
        self.db.refresh(scheduled)

        self.assertEqual(scheduled.completed_session_id, session.id)
        self.assertIsNotNone(scheduled.completed_at)

if __name__ == "__main__":
    unittest.main()
