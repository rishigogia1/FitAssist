from pydantic import BaseModel, ConfigDict
from typing import List, Optional

class NutritionPreferencesBase(BaseModel):
    dietary_preference: str = "no_preference"
    cuisine_preference: str = "mixed"
    meals_per_day: int = 3
    allergies: List[str] = []
    foods_liked: Optional[str] = None
    foods_disliked: Optional[str] = None

class NutritionPreferencesCreate(NutritionPreferencesBase):
    pass

class NutritionPreferencesUpdate(NutritionPreferencesBase):
    pass

class NutritionPreferencesResponse(NutritionPreferencesBase):
    id: int
    user_id: str
    
    model_config = ConfigDict(from_attributes=True)

class NutritionTarget(BaseModel):
    calories: int
    protein: int
    carbs: int
    fat: int

class Meal(BaseModel):
    id: str
    type: str
    name: str
    description: Optional[str] = None
    calories: int
    protein: int
    carbs: int
    fat: int
    ingredients: List[str]
    instructions: Optional[str] = None
    prep_time: Optional[int] = None
    dietary_tags: List[str] = []
    cuisine_tags: List[str] = []
    allergen_tags: List[str] = []

class NutritionDashboardConsumed(BaseModel):
    calories: int = 0
    protein: int = 0
    carbs: int = 0
    fat: int = 0

class NutritionDashboardScore(BaseModel):
    value: int = 0
    status: str = "pending"
    explanation: Optional[str] = None

class NutritionProgress(BaseModel):
    calories: int = 0
    protein: int = 0
    carbs: int = 0
    fat: int = 0

class PlannedMealsStatus(BaseModel):
    total: int = 3
    logged: int = 0
    remaining: int = 3

class PersonalizedContext(BaseModel):
    goal: str
    fitness_level: str
    dietary_preference: str
    cuisine: str

class NutritionLogCreate(BaseModel):
    meal_id: str
    meal_type: str
    meal_name: str
    calories: int
    protein_g: float
    carbs_g: float
    fat_g: float

class NutritionLogResponse(BaseModel):
    id: str
    meal_id: str
    meal_type: str
    meal_name: str
    calories: int
    protein_g: float
    carbs_g: float
    fat_g: float
    
    model_config = ConfigDict(from_attributes=True)

class SimpleInsight(BaseModel):
    content: str
    insight_type: str

class DailyNutritionDashboard(BaseModel):
    personalized_for: PersonalizedContext
    targets: NutritionTarget
    consumed: NutritionDashboardConsumed
    remaining: NutritionTarget
    progress: NutritionProgress
    planned_meals: PlannedMealsStatus
    score: NutritionDashboardScore
    meals: List[Meal]
    logged_meals: List[NutritionLogResponse]
    ai_insight: Optional[SimpleInsight] = None
