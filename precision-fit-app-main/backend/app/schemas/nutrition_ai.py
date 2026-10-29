from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import date
from app.schemas.nutrition import NutritionTarget, PersonalizedContext, NutritionLogResponse, NutritionDashboardConsumed, NutritionPreferencesResponse
from app.schemas.profile import ProfileResponse
from app.schemas.workout_session import WorkoutSessionResponse

class WeeklyAdherence(BaseModel):
    calories: int
    protein: int
    carbs: int
    fat: int

class WeeklyNutritionAnalysis(BaseModel):
    period: str = "7_days"
    average: NutritionDashboardConsumed
    targets: NutritionTarget
    adherence: WeeklyAdherence
    logged_meals: int
    insights: List[str] = []

class MealFeedbackCreate(BaseModel):
    meal_id: str
    feedback_type: str # liked, disliked, replaced
    reason: Optional[str] = None

class NutritionModelContext(BaseModel):
    user_profile: ProfileResponse
    nutrition_preferences: NutritionPreferencesResponse
    today_targets: NutritionTarget
    today_consumed: NutritionDashboardConsumed
    logged_meals: List[NutritionLogResponse]
    weekly_analysis: Optional[WeeklyNutritionAnalysis] = None
    recent_workouts: List[WorkoutSessionResponse] = []
    target_meal: Optional[dict] = None
    replacement_reason: Optional[str] = None

class AIMealRecommendation(BaseModel):
    id: str
    type: str
    name: str
    description: Optional[str] = None
    calories: int
    protein_g: int
    carbs_g: int
    fat_g: int
    ingredients: List[str]
    instructions: Optional[str] = None
    prep_time: Optional[int] = None
    dietary_tags: List[str] = []
    cuisine_tags: List[str] = []
    allergen_tags: List[str] = []
    reason: str

class NutritionInsight(BaseModel):
    content: str
    insight_type: str

class AdaptiveNutritionRecommendation(BaseModel):
    status: str
    primary_gap: str
    title: str
    explanation: str
    recommended_action: str
    meal: Optional[AIMealRecommendation] = None
    nutrition_delta: Optional[dict] = None

class NutritionAIResponse(BaseModel):
    insights: List[NutritionInsight] = []
    recommendations: List[AIMealRecommendation] = []
    meal_replacements: List[AIMealRecommendation] = []
    priority: Optional[str] = None
    reasoning_summary: Optional[str] = None
    provider: str = "quantized_slm"
    fallback_used: bool = False
    adaptive_recommendation: Optional[AdaptiveNutritionRecommendation] = None

class MealReplacementRequest(BaseModel):
    reason: str
    meal_id: Optional[str] = None

REASON_MAP = {
    "too many calories": "too_many_calories",
    "too_many_calories": "too_many_calories",
    "need more protein": "need_more_protein",
    "need_more_protein": "need_more_protein",
    "don't like the ingredients": "disliked_ingredients",
    "disliked_ingredients": "disliked_ingredients",
    "takes too long to prep": "too_long_to_prepare",
    "too_long_to_prepare": "too_long_to_prepare",
    "just want something else": "something_different",
    "something_different": "something_different"
}

def normalize_replacement_reason(reason_raw: str) -> Optional[str]:
    if not reason_raw:
        return None
    key = reason_raw.strip().lower()
    return REASON_MAP.get(key)


class AdaptiveRecommendationsRequest(BaseModel):
    exclude_ids: List[str] = []


