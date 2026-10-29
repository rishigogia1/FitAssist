from pydantic import BaseModel, ConfigDict
from typing import List

class ExerciseBase(BaseModel):
    name: str
    sets: int
    reps: int
    rest_seconds: int

class WorkoutDay(BaseModel):
    day: str
    focus: str
    duration_minutes: int
    exercises: List[ExerciseBase]

class WorkoutPlanData(BaseModel):
    goal: str
    duration_days: int
    workout_plan: List[WorkoutDay]

class RecommendationResponse(BaseModel):
    id: int
    user_id: str
    plan_data: WorkoutPlanData
    model_name: str

    model_config = ConfigDict(from_attributes=True)
