import unittest
from datetime import date, datetime, timezone
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import IntegrityError
from alembic.script import ScriptDirectory
from alembic.config import Config

from app.database.connection import Base
from app.models.daily_step_log import DailyStepLog


class TestDailyStepLogModel(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Create an in-memory SQLite database
        cls.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False}
        )
        cls.TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=cls.engine)
        DailyStepLog.__table__.create(bind=cls.engine)

    def setUp(self):
        self.db = self.TestingSessionLocal()
        self.db.query(DailyStepLog).delete()
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_create_daily_step_record(self):
        target_date = date(2026, 10, 15)
        step_log = DailyStepLog(
            user_id="user_test@example.com",
            log_date=target_date,
            step_count=8500,
            step_goal=10000,
            source="manual"
        )
        self.db.add(step_log)
        self.db.commit()
        self.db.refresh(step_log)

        self.assertIsNotNone(step_log.id)
        self.assertEqual(step_log.user_id, "user_test@example.com")
        self.assertEqual(step_log.log_date, target_date)
        self.assertEqual(step_log.step_count, 8500)
        self.assertEqual(step_log.step_goal, 10000)
        self.assertEqual(step_log.source, "manual")

    def test_create_record_with_zero_step_count(self):
        target_date = date(2026, 10, 15)
        step_log = DailyStepLog(
            user_id="user_zero@example.com",
            log_date=target_date,
            step_count=0,
            step_goal=7000,
            source="manual"
        )
        self.db.add(step_log)
        self.db.commit()
        self.db.refresh(step_log)

        self.assertEqual(step_log.step_count, 0)
        self.assertEqual(step_log.step_goal, 7000)

    def test_reject_negative_step_counts(self):
        # Attribute validation should reject negative step count on init
        with self.assertRaises(ValueError) as ctx:
            DailyStepLog(
                user_id="user_neg@example.com",
                log_date=date(2026, 10, 15),
                step_count=-100,
                step_goal=7000
            )
        self.assertIn("non-negative", str(ctx.exception))

        # Attribute validation should also reject negative on assignment
        valid_log = DailyStepLog(
            user_id="user_neg2@example.com",
            log_date=date(2026, 10, 15),
            step_count=100,
            step_goal=7000
        )
        with self.assertRaises(ValueError):
            valid_log.step_count = -1

    def test_reject_invalid_daily_goals(self):
        # Goal must be > 0: reject 0
        with self.assertRaises(ValueError):
            DailyStepLog(
                user_id="user_goal@example.com",
                log_date=date(2026, 10, 15),
                step_count=500,
                step_goal=0
            )

        # Goal must be > 0: reject negative
        with self.assertRaises(ValueError):
            DailyStepLog(
                user_id="user_goal@example.com",
                log_date=date(2026, 10, 15),
                step_count=500,
                step_goal=-1000
            )

        # Goal cannot be None
        with self.assertRaises(ValueError):
            DailyStepLog(
                user_id="user_goal@example.com",
                log_date=date(2026, 10, 15),
                step_count=500,
                step_goal=None
            )

        # Goal cannot be non-int (e.g. bool or float)
        with self.assertRaises(TypeError):
            DailyStepLog(
                user_id="user_goal@example.com",
                log_date=date(2026, 10, 15),
                step_count=500,
                step_goal=True
            )

    def test_allow_rest_day_with_zero_steps(self):
        # Rest day with 0 steps
        rest_date = date(2026, 10, 16)
        rest_log = DailyStepLog(
            user_id="user_rest@example.com",
            log_date=rest_date,
            step_count=0,
            step_goal=5000,
            source="manual"
        )
        self.db.add(rest_log)
        self.db.commit()
        self.db.refresh(rest_log)

        self.assertIsNotNone(rest_log.id)
        self.assertEqual(rest_log.step_count, 0)
        self.assertEqual(rest_log.step_goal, 5000)

    def test_reject_duplicate_records_same_user_and_date(self):
        target_date = date(2026, 10, 15)
        log1 = DailyStepLog(
            user_id="user_dup@example.com",
            log_date=target_date,
            step_count=5000,
            step_goal=7000
        )
        self.db.add(log1)
        self.db.commit()

        # Second record for the same user and date must violate unique constraint
        log2 = DailyStepLog(
            user_id="user_dup@example.com",
            log_date=target_date,
            step_count=8000,
            step_goal=7000
        )
        self.db.add(log2)
        with self.assertRaises(IntegrityError):
            self.db.commit()
        self.db.rollback()

    def test_allow_different_users_same_date(self):
        target_date = date(2026, 10, 15)
        log_u1 = DailyStepLog(
            user_id="user_alpha@example.com",
            log_date=target_date,
            step_count=6000,
            step_goal=7000
        )
        log_u2 = DailyStepLog(
            user_id="user_beta@example.com",
            log_date=target_date,
            step_count=9000,
            step_goal=8000
        )
        self.db.add(log_u1)
        self.db.add(log_u2)
        self.db.commit()

        count = self.db.query(DailyStepLog).filter_by(log_date=target_date).count()
        self.assertEqual(count, 2)

    def test_update_existing_record_without_duplicate(self):
        target_date = date(2026, 10, 15)
        user = "user_updater@example.com"
        initial_log = DailyStepLog(
            user_id=user,
            log_date=target_date,
            step_count=3000,
            step_goal=7000
        )
        self.db.add(initial_log)
        self.db.commit()

        # Retrieve and update
        record = self.db.query(DailyStepLog).filter_by(user_id=user, log_date=target_date).first()
        self.assertIsNotNone(record)
        record.step_count = 7500
        self.db.commit()

        # Ensure still only 1 record exists and value is updated
        all_records = self.db.query(DailyStepLog).filter_by(user_id=user, log_date=target_date).all()
        self.assertEqual(len(all_records), 1)
        self.assertEqual(all_records[0].step_count, 7500)

    def test_preserve_historical_step_goal(self):
        user = "user_history@example.com"
        day1 = date(2026, 10, 14)
        day2 = date(2026, 10, 15)

        # Day 1: User had a goal of 7000
        log_day1 = DailyStepLog(
            user_id=user,
            log_date=day1,
            step_count=7200,
            step_goal=7000
        )
        self.db.add(log_day1)
        self.db.commit()

        # Day 2: User increased goal to 10000
        log_day2 = DailyStepLog(
            user_id=user,
            log_date=day2,
            step_count=10500,
            step_goal=10000
        )
        self.db.add(log_day2)
        self.db.commit()

        # Refresh and verify day 1 historical goal is unchanged
        rec_day1 = self.db.query(DailyStepLog).filter_by(user_id=user, log_date=day1).first()
        rec_day2 = self.db.query(DailyStepLog).filter_by(user_id=user, log_date=day2).first()

        self.assertEqual(rec_day1.step_goal, 7000)
        self.assertEqual(rec_day2.step_goal, 10000)

    def test_model_registration_and_metadata(self):
        # 1. Verify table is in Base metadata
        self.assertIn("daily_step_logs", Base.metadata.tables)
        table = Base.metadata.tables["daily_step_logs"]

        # 2. Verify all required columns exist
        col_names = {c.name for c in table.columns}
        expected_cols = {
            "id", "user_id", "log_date", "step_count",
            "step_goal", "source", "created_at", "updated_at"
        }
        self.assertTrue(expected_cols.issubset(col_names))

        # 3. Verify unique constraint
        uq_names = {uc.name for uc in table.constraints if hasattr(uc, "name") and uc.name}
        self.assertIn("uq_user_daily_step_date", uq_names)

        # 4. Verify check constraints
        self.assertIn("chk_step_count_non_negative", uq_names)
        self.assertIn("chk_step_goal_positive", uq_names)

        # 5. Verify registered in db_base
        import app.database.base as db_base
        self.assertTrue(hasattr(db_base, "DailyStepLog"))

        # 6. Verify registered in alembic/env.py
        backend_dir = os.path.dirname(os.path.abspath(__file__))
        env_py_path = os.path.join(backend_dir, "alembic", "env.py")
        with open(env_py_path, "r", encoding="utf-8") as f:
            env_content = f.read()
        self.assertIn("from app.models.daily_step_log import DailyStepLog", env_content)

    def test_alembic_migration_configuration(self):
        backend_dir = os.path.dirname(os.path.abspath(__file__))
        alembic_ini_path = os.path.join(backend_dir, "alembic.ini")
        config = Config(alembic_ini_path)
        script_dir = ScriptDirectory.from_config(config)

        # Current head must be a10937cbeea6
        head_rev = script_dir.get_current_head()
        self.assertEqual(head_rev, "a10937cbeea6")

        # Head revision must revise a6b6048c80cb
        rev_item = script_dir.get_revision(head_rev)
        self.assertEqual(rev_item.down_revision, "a6b6048c80cb")


if __name__ == "__main__":
    unittest.main()
