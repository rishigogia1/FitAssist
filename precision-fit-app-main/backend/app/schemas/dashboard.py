from pydantic import BaseModel
from typing import List, Optional

class DashboardCalories(BaseModel):
    consumed: int
    target: int
    trend: str = "+0%"
    trend_positive: bool = True

class DashboardSteps(BaseModel):
    completed: int
    target: int = 7000
    average_per_day: int
    trend: str = "78%"
    trend_positive: bool = True
    source_available: bool = False
    source: str = "unavailable"

class DashboardActivity(BaseModel):
    minutes: int
    sessions: int
    calories_burned: int
    trend: str = "0m"
    trend_positive: bool = True

class FitnessScoreBreakdown(BaseModel):
    workout_consistency: float
    activity_steps: float
    nutrition_adherence: float
    goal_progress: float

class DashboardFitnessScore(BaseModel):
    score: int
    max_score: int = 100
    percentile: str = "Top 15%"
    trend: str = "+3"
    trend_positive: bool = True
    breakdown: Optional[FitnessScoreBreakdown] = None

class DashboardNutritionSplit(BaseModel):
    protein: int
    carbs: int
    fats: int

class WeeklyProgressPoint(BaseModel):
    d: str
    score: int
    goal: int

class DailyStepPoint(BaseModel):
    d: str
    steps: int

class DashboardRecommendation(BaseModel):
    title: str
    description: str
    workout_id: str
    exercise_count: int
    duration_minutes: int
    calories: int
    focus: str
    goal: str

class DashboardUser(BaseModel):
    name: str
    goal: str
    fitness_level: str

class DashboardResponse(BaseModel):
    user: DashboardUser
    date_formatted: str
    greeting: str
    calories: DashboardCalories
    steps: DashboardSteps
    activity: DashboardActivity
    fitness_score: DashboardFitnessScore
    nutrition_split: DashboardNutritionSplit
    progress_history: List[WeeklyProgressPoint]
    steps_history: List[DailyStepPoint]
    recommendation: Optional[DashboardRecommendation] = None
