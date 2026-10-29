from pydantic import BaseModel, Field
from typing import List, Optional
from app.schemas.profile import FitnessGoal, FitnessLevel

class Exercise(BaseModel):
    name: str
    sets: int
    reps: str
    rest_seconds: int
    target_muscles: Optional[str] = None
    equipment: Optional[str] = None
    instructions: Optional[str] = None
    form_tips: Optional[str] = None
    media_url: Optional[str] = None

class Workout(BaseModel):
    id: str
    name: str
    category: str
    difficulty: FitnessLevel
    focus: str
    duration_minutes: int
    estimated_calories: int
    description: str
    equipment: Optional[str] = None
    exercises: List[Exercise]
    
class PersonalizedFor(BaseModel):
    goal: FitnessGoal
    fitness_level: FitnessLevel

class WorkoutRecommendationResponse(BaseModel):
    personalized_for: PersonalizedFor
    workouts: List[Workout]
