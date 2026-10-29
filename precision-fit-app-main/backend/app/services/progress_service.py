"""
ProgressService — aggregates real user data from PostgreSQL for the Progress page.

All date calculations use IST (Asia/Kolkata) timezone.
No data is fabricated or hardcoded.
"""
from __future__ import annotations

import logging
from datetime import datetime, date, timedelta, timezone
from typing import List, Dict, Any, Optional
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.user_profile import UserProfile
from app.models.workout_session import WorkoutSession, SessionStatus
from app.models.nutrition_log import NutritionLog
from app.models.weight_log import WeightLog
from app.services.fitness_score_service import FitnessScoreService
from app.services.nutrition_service import NutritionService

logger = logging.getLogger(__name__)

IST = ZoneInfo("Asia/Kolkata")
fitness_score_svc = FitnessScoreService()
nutrition_svc = NutritionService()


def _ist_now() -> datetime:
    return datetime.now(IST)


def _to_ist_date(dt: datetime) -> date:
    """Convert any datetime (naive or aware) to IST date."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(IST).date()


class ProgressService:

    # ------------------------------------------------------------------
    # Streak
    # ------------------------------------------------------------------

    def get_streak(self, db: Session, user_id: str) -> Dict[str, int]:
        """
        Active day = at least one completed WorkoutSession OR one NutritionLog on that IST date.
        Returns current streak and longest ever streak.
        """
        today = _ist_now().date()

        # Gather all active IST dates
        active_dates: set[date] = set()

        completed_sessions = db.query(WorkoutSession).filter(
            WorkoutSession.user_id == user_id,
            WorkoutSession.status == SessionStatus.completed.value,
            WorkoutSession.completed_at.isnot(None),
        ).all()
        for s in completed_sessions:
            active_dates.add(_to_ist_date(s.completed_at))

        logged_dates = db.query(NutritionLog.log_date).filter(
            NutritionLog.user_id == user_id
        ).distinct().all()
        for (d,) in logged_dates:
            active_dates.add(d)

        if not active_dates:
            return {"current": 0, "longest": 0}

        sorted_dates = sorted(active_dates, reverse=True)

        # Current streak: backwards from today (or yesterday if today inactive)
        current = 0
        check = today if today in active_dates else today - timedelta(days=1)
        while check in active_dates:
            current += 1
            check -= timedelta(days=1)

        # Longest streak: scan all active dates
        longest = 0
        streak = 1
        prev = sorted_dates[0]
        for d in sorted_dates[1:]:
            if (prev - d).days == 1:
                streak += 1
            else:
                longest = max(longest, streak)
                streak = 1
            prev = d
        longest = max(longest, streak)
        longest = max(longest, current)  # ensure current is included

        return {"current": current, "longest": longest}

    # ------------------------------------------------------------------
    # Goals (monthly)
    # ------------------------------------------------------------------

    def get_goals(
        self,
        db: Session,
        user_id: str,
        profile: UserProfile,
    ) -> Dict[str, Any]:
        """
        Deterministic monthly goals based on actual DB records.
        Never hardcoded. Each goal is either completed (True/False) based on real data.
        """
        now = _ist_now()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        targets = nutrition_svc.calculate_targets(profile)

        # --- Raw queries ---

        # Completed workout sessions this month
        month_sessions = db.query(WorkoutSession).filter(
            WorkoutSession.user_id == user_id,
            WorkoutSession.status == SessionStatus.completed.value,
            WorkoutSession.completed_at >= month_start.replace(tzinfo=None),
        ).all()
        completed_workouts_month = len(month_sessions)

        # All completed sessions (all time)
        all_sessions_count = db.query(func.count(WorkoutSession.id)).filter(
            WorkoutSession.user_id == user_id,
            WorkoutSession.status == SessionStatus.completed.value,
        ).scalar() or 0

        # Distinct nutrition log days this month
        nutrition_days_month = db.query(NutritionLog.log_date).filter(
            NutritionLog.user_id == user_id,
            NutritionLog.log_date >= month_start.date(),
        ).distinct().count()

        # Activity minutes this month (sum of duration_seconds / 60)
        activity_seconds_month = db.query(func.sum(WorkoutSession.duration_seconds)).filter(
            WorkoutSession.user_id == user_id,
            WorkoutSession.status == SessionStatus.completed.value,
            WorkoutSession.completed_at >= month_start.replace(tzinfo=None),
        ).scalar() or 0
        activity_minutes_month = int(activity_seconds_month / 60)

        # Days this month where protein >= target
        protein_target = targets.protein
        protein_days = 0
        if protein_target > 0:
            distinct_log_dates_month = db.query(NutritionLog.log_date).filter(
                NutritionLog.user_id == user_id,
                NutritionLog.log_date >= month_start.date(),
            ).distinct().all()
            for (log_date,) in distinct_log_dates_month:
                day_protein = db.query(func.sum(NutritionLog.protein_g)).filter(
                    NutritionLog.user_id == user_id,
                    NutritionLog.log_date == log_date,
                ).scalar() or 0
                if day_protein >= protein_target:
                    protein_days += 1

        # Days where calories within 20% of target (adherent)
        calorie_target = targets.calories
        adherent_days = 0
        if calorie_target > 0:
            distinct_log_dates_month2 = db.query(NutritionLog.log_date).filter(
                NutritionLog.user_id == user_id,
                NutritionLog.log_date >= month_start.date(),
            ).distinct().all()
            for (log_date,) in distinct_log_dates_month2:
                day_cals = db.query(func.sum(NutritionLog.calories)).filter(
                    NutritionLog.user_id == user_id,
                    NutritionLog.log_date == log_date,
                ).scalar() or 0
                if day_cals > 0 and abs(day_cals - calorie_target) / calorie_target <= 0.20:
                    adherent_days += 1

        # Streak for goal evaluation
        streak_data = self.get_streak(db, user_id)
        max_streak = max(streak_data["current"], streak_data["longest"])

        # Weight log count
        weight_log_count = db.query(func.count(WeightLog.id)).filter(
            WeightLog.user_id == user_id
        ).scalar() or 0

        # Current fitness score
        today_date = now.date()
        week_start = today_date - timedelta(days=6)
        week_sessions_raw = db.query(WorkoutSession).filter(
            WorkoutSession.user_id == user_id,
            WorkoutSession.status == SessionStatus.completed.value,
            WorkoutSession.completed_at.isnot(None),
        ).all()
        week_sessions = [
            s for s in week_sessions_raw
            if week_start <= _to_ist_date(s.completed_at) <= today_date
        ]
        today_logs = db.query(NutritionLog).filter(
            NutritionLog.user_id == user_id,
            NutritionLog.log_date == today_date,
        ).all()
        score_result = fitness_score_svc.calculate_score(
            profile=profile,
            recent_sessions=week_sessions,
            today_logs=today_logs,
            calorie_target=calorie_target,
        )
        fitness_score = score_result["score"]

        # --- Goal definitions ---
        goals = [
            {
                "id": "workouts_10_month",
                "title": "Complete 10 Workouts",
                "description": "Finish 10 workout sessions this month",
                "current": min(completed_workouts_month, 10),
                "target": 10,
                "percentage": min(100, int((completed_workouts_month / 10) * 100)),
                "completed": completed_workouts_month >= 10,
            },
            {
                "id": "nutrition_20_days",
                "title": "Log Nutrition 20 Days",
                "description": "Track your nutrition on 20 different days this month",
                "current": min(nutrition_days_month, 20),
                "target": 20,
                "percentage": min(100, int((nutrition_days_month / 20) * 100)),
                "completed": nutrition_days_month >= 20,
            },
            {
                "id": "activity_600_minutes",
                "title": "600 Activity Minutes",
                "description": "Complete 600 minutes of workouts this month",
                "current": min(activity_minutes_month, 600),
                "target": 600,
                "percentage": min(100, int((activity_minutes_month / 600) * 100)),
                "completed": activity_minutes_month >= 600,
            },
            {
                "id": "protein_target_15_days",
                "title": "Hit Protein Target 15 Days",
                "description": f"Consume ≥{protein_target}g protein on 15 days this month",
                "current": min(protein_days, 15),
                "target": 15,
                "percentage": min(100, int((protein_days / 15) * 100)),
                "completed": protein_days >= 15,
            },
            {
                "id": "streak_7",
                "title": "7-Day Active Streak",
                "description": "Stay active (workout or nutrition log) for 7 consecutive days",
                "current": min(max_streak, 7),
                "target": 7,
                "percentage": min(100, int((max_streak / 7) * 100)),
                "completed": max_streak >= 7,
            },
            {
                "id": "streak_14",
                "title": "14-Day Active Streak",
                "description": "Maintain a 14-day activity streak",
                "current": min(max_streak, 14),
                "target": 14,
                "percentage": min(100, int((max_streak / 14) * 100)),
                "completed": max_streak >= 14,
            },
            {
                "id": "workouts_20_alltime",
                "title": "Complete 20 Sessions (All-Time)",
                "description": "Reach 20 total completed workout sessions",
                "current": min(int(all_sessions_count), 20),
                "target": 20,
                "percentage": min(100, int((all_sessions_count / 20) * 100)),
                "completed": all_sessions_count >= 20,
            },
            {
                "id": "weight_log_4",
                "title": "Record Weight 4 Times",
                "description": "Log your weight at least 4 times",
                "current": min(weight_log_count, 4),
                "target": 4,
                "percentage": min(100, int((weight_log_count / 4) * 100)),
                "completed": weight_log_count >= 4,
            },
            {
                "id": "nutrition_adherent_10",
                "title": "10 Nutrition-Adherent Days",
                "description": "Stay within 20% of your calorie target on 10 days",
                "current": min(adherent_days, 10),
                "target": 10,
                "percentage": min(100, int((adherent_days / 10) * 100)),
                "completed": adherent_days >= 10,
            },
            {
                "id": "fitness_score_60",
                "title": "Reach Fitness Score 60",
                "description": "Achieve a FitAssist Fitness Score of 60 or above",
                "current": min(fitness_score, 60),
                "target": 60,
                "percentage": min(100, int((fitness_score / 60) * 100)),
                "completed": fitness_score >= 60,
            },
        ]

        completed_count = sum(1 for g in goals if g["completed"])
        total = len(goals)

        return {
            "completed": completed_count,
            "total": total,
            "remaining": total - completed_count,
            "items": goals,
        }

    # ------------------------------------------------------------------
    # Weekly Activity
    # ------------------------------------------------------------------

    def get_weekly_activity(self, db: Session, user_id: str) -> Dict[str, Any]:
        """
        For each day Mon-Sun of the current IST week, sum completed workout duration in minutes.
        Only status == 'completed' sessions count.
        """
        today = _ist_now().date()
        # Monday = weekday 0
        week_monday = today - timedelta(days=today.weekday())

        week_days = [week_monday + timedelta(days=i) for i in range(7)]
        day_labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

        # Query all completed sessions with a completed_at in this week range
        week_end = week_monday + timedelta(days=6)
        sessions = db.query(WorkoutSession).filter(
            WorkoutSession.user_id == user_id,
            WorkoutSession.status == SessionStatus.completed.value,
            WorkoutSession.completed_at.isnot(None),
        ).all()

        # Bucket by IST date
        minutes_by_date: Dict[date, int] = {}
        for s in sessions:
            d = _to_ist_date(s.completed_at)
            if week_monday <= d <= week_end:
                minutes = int(round(s.duration_seconds / 60))
                minutes_by_date[d] = minutes_by_date.get(d, 0) + minutes

        days = []
        for d, label in zip(week_days, day_labels):
            days.append({
                "date": d.isoformat(),
                "label": label,
                "minutes": minutes_by_date.get(d, 0),
            })

        total_mins = sum(d["minutes"] for d in days)
        active_days = sum(1 for d in days if d["minutes"] > 0)
        avg_minutes = round(total_mins / max(active_days, 1)) if active_days > 0 else 0

        return {
            "days": days,
            "average_minutes": avg_minutes,
            "total_minutes": total_mins,
        }

    # ------------------------------------------------------------------
    # Weight History
    # ------------------------------------------------------------------

    def get_weight_history(
        self,
        db: Session,
        user_id: str,
        range_key: str = "4w",
        profile: Optional[UserProfile] = None,
    ) -> Dict[str, Any]:
        """
        Returns real weight log records for the user.
        No interpolation or fabrication.
        """
        now = _ist_now()

        # Date range filter
        if range_key == "7d":
            since = now - timedelta(days=7)
        elif range_key == "4w":
            since = now - timedelta(weeks=4)
        elif range_key == "12w":
            since = now - timedelta(weeks=12)
        else:  # "all"
            since = None

        query = db.query(WeightLog).filter(WeightLog.user_id == user_id)
        if since:
            query = query.filter(WeightLog.recorded_at >= since)

        records = query.order_by(WeightLog.recorded_at.asc()).all()

        # All-time records for starting weight
        all_records = db.query(WeightLog).filter(
            WeightLog.user_id == user_id
        ).order_by(WeightLog.recorded_at.asc()).all()

        if not all_records:
            return {"has_data": False}

        current_weight = all_records[-1].weight
        starting_weight = all_records[0].weight
        weight_change = round(current_weight - starting_weight, 2)

        goal_weight = profile.goal_weight if profile else None
        percentage_to_goal = None
        if goal_weight and starting_weight != goal_weight:
            total_change_needed = goal_weight - starting_weight
            achieved = current_weight - starting_weight
            pct = (achieved / total_change_needed) * 100
            percentage_to_goal = max(0, min(100, round(pct, 1)))

        history = [
            {
                "date": r.recorded_at.astimezone(IST).strftime("%b %d"),
                "kg": round(r.weight, 2),
                "recorded_at": r.recorded_at.astimezone(IST).isoformat(),
            }
            for r in records
        ]

        return {
            "has_data": True,
            "current": current_weight,
            "starting": starting_weight,
            "goal": goal_weight,
            "change": weight_change,
            "percentage_to_goal": percentage_to_goal,
            "history": history,
        }

    # ------------------------------------------------------------------
    # Summary / Fitness Score
    # ------------------------------------------------------------------

    def get_summary(
        self,
        db: Session,
        user_id: str,
        profile: UserProfile,
    ) -> Dict[str, Any]:
        """
        Aggregates fitness score, sessions, activity, nutrition adherence.
        Reuses FitnessScoreService — no duplicate algorithm.
        """
        now = _ist_now()
        today = now.date()
        targets = nutrition_svc.calculate_targets(profile)

        # Current week (last 7 days) sessions
        week_start = today - timedelta(days=6)
        all_completed = db.query(WorkoutSession).filter(
            WorkoutSession.user_id == user_id,
            WorkoutSession.status == SessionStatus.completed.value,
            WorkoutSession.completed_at.isnot(None),
        ).all()

        current_week_sessions = [
            s for s in all_completed
            if week_start <= _to_ist_date(s.completed_at) <= today
        ]

        # Previous week sessions (7-13 days ago)
        prev_week_end = today - timedelta(days=7)
        prev_week_start = today - timedelta(days=13)
        prev_week_sessions = [
            s for s in all_completed
            if prev_week_start <= _to_ist_date(s.completed_at) <= prev_week_end
        ]

        today_logs = db.query(NutritionLog).filter(
            NutritionLog.user_id == user_id,
            NutritionLog.log_date == today,
        ).all()

        # Current fitness score
        score_result = fitness_score_svc.calculate_score(
            profile=profile,
            recent_sessions=current_week_sessions,
            today_logs=today_logs,
            calorie_target=targets.calories,
        )
        current_score = score_result["score"]

        # Previous fitness score
        prev_logs = db.query(NutritionLog).filter(
            NutritionLog.user_id == user_id,
            NutritionLog.log_date == prev_week_end,
        ).all()
        prev_score_result = fitness_score_svc.calculate_score(
            profile=profile,
            recent_sessions=prev_week_sessions,
            today_logs=prev_logs,
            calorie_target=targets.calories,
        )
        prev_score = prev_score_result["score"]

        # All-time session count & activity minutes
        total_sessions = len(all_completed)
        total_activity_minutes = int(
            sum(s.duration_seconds for s in all_completed) / 60
        )

        # Calendar week completed sessions (Monday-Sunday IST)
        cal_week_monday = today - timedelta(days=today.weekday())
        cal_week_sunday = cal_week_monday + timedelta(days=6)
        completed_this_week = sum(
            1 for s in all_completed
            if cal_week_monday <= _to_ist_date(s.completed_at) <= cal_week_sunday
        )

        # Nutrition adherence (% of days in last 30 days with any log)
        thirty_days_ago = today - timedelta(days=30)
        logged_days_30 = db.query(NutritionLog.log_date).filter(
            NutritionLog.user_id == user_id,
            NutritionLog.log_date >= thirty_days_ago,
        ).distinct().count()
        nutrition_adherence = min(100, round((logged_days_30 / 30) * 100))

        streak_data = self.get_streak(db, user_id)

        # Weight change
        weight_records = db.query(WeightLog).filter(
            WeightLog.user_id == user_id
        ).order_by(WeightLog.recorded_at.asc()).all()
        weight_change = None
        if len(weight_records) >= 2:
            weight_change = round(weight_records[-1].weight - weight_records[0].weight, 2)

        return {
            "fitness_score": current_score,
            "previous_fitness_score": prev_score,
            "fitness_score_change": current_score - prev_score,
            "workout_sessions": total_sessions,
            "completed_this_week": completed_this_week,
            "activity_minutes": total_activity_minutes,
            "nutrition_adherence": nutrition_adherence,
            "current_streak": streak_data["current"],
            "weight_change": weight_change,
        }

    # ------------------------------------------------------------------
    # Goal-specific Progress
    # ------------------------------------------------------------------

    def get_goal_progress(
        self,
        db: Session,
        user_id: str,
        profile: UserProfile,
    ) -> Dict[str, Any]:
        """
        Returns goal-specific progress card data based on user's fitness_goal.
        """
        goal = profile.fitness_goal

        weight_records = db.query(WeightLog).filter(
            WeightLog.user_id == user_id
        ).order_by(WeightLog.recorded_at.asc()).all()

        if goal in ("weight_loss", "muscle_gain") and weight_records:
            start_w = weight_records[0].weight
            current_w = weight_records[-1].weight
            change = round(current_w - start_w, 2)
            goal_w = profile.goal_weight

            data: Dict[str, Any] = {
                "type": goal,
                "starting_weight": start_w,
                "current_weight": current_w,
                "weight_change": change,
                "goal_weight": goal_w,
            }
            if goal_w and start_w != goal_w:
                total_needed = goal_w - start_w
                achieved = current_w - start_w
                pct = max(0.0, min(100.0, round((achieved / total_needed) * 100, 1)))
                remaining = round(goal_w - current_w, 2)
                data["percentage_to_goal"] = pct
                data["remaining"] = remaining
            return data

        # Fallback: fitness score progression
        summary = self.get_summary(db, user_id, profile)
        return {
            "type": "fitness_score",
            "current_score": summary["fitness_score"],
            "previous_score": summary["previous_fitness_score"],
            "score_change": summary["fitness_score_change"],
        }
