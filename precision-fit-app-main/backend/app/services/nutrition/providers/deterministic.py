import random
import logging
from typing import List, Optional
from app.services.nutrition.providers.base import BaseNutritionAIProvider
from app.schemas.nutrition_ai import (
    NutritionModelContext,
    NutritionAIResponse,
    MealReplacementRequest,
    AIMealRecommendation,
    NutritionInsight,
    normalize_replacement_reason
)
from app.services.nutrition_service import MealDatabase, Meal
from app.services.nutrition.validation import (
    is_allergy_safe as val_is_allergy_safe,
    is_dietary_safe as val_is_dietary_safe,
    is_disliked_safe as val_is_disliked_safe,
    calculate_liked_bonus,
    parse_allergies_list
)

logger = logging.getLogger(__name__)

def is_allergy_safe(meal: Meal, allergies: any) -> bool:
    safe, _ = val_is_allergy_safe(meal, allergies)
    return safe

def is_dietary_safe(meal: Meal, diet: Optional[str]) -> bool:
    safe, _ = val_is_dietary_safe(meal, diet)
    return safe

def is_disliked_safe(meal: Meal, foods_disliked: Optional[str]) -> bool:
    safe, _ = val_is_disliked_safe(meal, foods_disliked)
    return safe


class DeterministicNutritionProvider(BaseNutritionAIProvider):
    """
    Fallback deterministic provider with personalized candidate selection and strict safety checks.
    """
    def __init__(self):
        self.meal_db = MealDatabase()

    def generate_recommendations(self, context: NutritionModelContext) -> NutritionAIResponse:
        meals = self.meal_db.get_meals(
            target=context.today_targets,
            prefs=context.nutrition_preferences,
            goal=context.user_profile.fitness_goal
        )
        
        recs = []
        for m in meals:
            recs.append(
                AIMealRecommendation(
                    id=m.id,
                    type=m.type,
                    name=m.name,
                    description=m.description,
                    calories=m.calories,
                    protein_g=m.protein,
                    carbs_g=m.carbs,
                    fat_g=m.fat,
                    ingredients=m.ingredients,
                    instructions=m.instructions,
                    prep_time=m.prep_time,
                    dietary_tags=m.dietary_tags,
                    cuisine_tags=m.cuisine_tags,
                    allergen_tags=m.allergen_tags,
                    reason=f"Recommended for your {context.user_profile.fitness_goal.replace('_', ' ')} goal and {context.nutrition_preferences.cuisine_preference} cuisine."
                )
            )

        insights = [
            NutritionInsight(
                content="Your daily meal plan has been customized to your preferences and dietary restrictions.",
                insight_type="general"
            )
        ]

        return NutritionAIResponse(
            insights=insights,
            recommendations=recs,
            meal_replacements=[],
            provider="deterministic",
            fallback_used=True
        )

    def generate_meal_replacement(self, context: NutritionModelContext, request: MealReplacementRequest) -> NutritionAIResponse:
        all_meals = self.meal_db.meals
        
        # Target meal details from context or request
        target_meal_dict = context.target_meal or {}
        meal_id = request.meal_id or target_meal_dict.get("id")
        
        target_meal_obj = next((m for m in all_meals if m.id == meal_id), None)
        meal_type = target_meal_dict.get("type") or (target_meal_obj.type if target_meal_obj else "lunch")
        meal_name = target_meal_dict.get("name") or (target_meal_obj.name if target_meal_obj else "")
        orig_calories = target_meal_dict.get("calories", target_meal_obj.calories if target_meal_obj else 500)
        orig_protein = target_meal_dict.get("protein", target_meal_obj.protein if target_meal_obj else 20)
        orig_ingredients = target_meal_dict.get("ingredients", target_meal_obj.ingredients if target_meal_obj else [])

        normalized_reason = normalize_replacement_reason(request.reason) or "something_different"
        prefs = context.nutrition_preferences

        # 1. Filter candidates by type, ID/name difference, allergies, diet, and disliked foods
        candidates = []
        for m in all_meals:
            if m.type.lower() != meal_type.lower():
                continue
            if m.id == meal_id or m.name.lower() == meal_name.lower():
                continue
            # HARD ALLERGY CONSTRAINT
            if not is_allergy_safe(m, prefs.allergies):
                continue
            # HARD DIETARY CONSTRAINT
            if not is_dietary_safe(m, prefs.dietary_preference):
                continue
            if not is_disliked_safe(m, prefs.foods_disliked):
                continue
            candidates.append(m)

        # Fallback 1: Relax only the disliked food constraint if needed, but KEEP ALLERGIES AND DIET STRICT!
        if not candidates:
            for m in all_meals:
                if m.type.lower() != meal_type.lower():
                    continue
                if m.id == meal_id or m.name.lower() == meal_name.lower():
                    continue
                if not is_allergy_safe(m, prefs.allergies):
                    continue
                if not is_dietary_safe(m, prefs.dietary_preference):
                    continue
                candidates.append(m)

        # Fallback 2: If still no other meal of the same type, allow other safe meal types
        if not candidates:
            for m in all_meals:
                if m.id == meal_id or m.name.lower() == meal_name.lower():
                    continue
                if not is_allergy_safe(m, prefs.allergies):
                    continue
                if not is_dietary_safe(m, prefs.dietary_preference):
                    continue
                candidates.append(m)

        if not candidates:
            # Cannot find any safe meal
            logger.warning("No safe replacement candidate found satisfying allergies and dietary preference.")
            return NutritionAIResponse(
                insights=[],
                recommendations=[],
                meal_replacements=[],
                provider="deterministic",
                fallback_used=True
            )

        # 2. Score/Rank candidates based on normalized reason and liked ingredients
        if normalized_reason == "need_more_protein":
            # Prioritize higher protein than original, sorted by protein desc
            high_protein = [m for m in candidates if m.protein >= orig_protein]
            pool = high_protein if high_protein else candidates
            pool.sort(key=lambda x: (x.protein, calculate_liked_bonus(x, prefs.foods_liked)), reverse=True)
            chosen = pool[0]
            reason_text = f"Selected for higher protein content ({chosen.protein}g protein) while fitting your calories."

        elif normalized_reason == "too_many_calories":
            # Prioritize lower calories than original, sorted by calories asc
            lower_cal = [m for m in candidates if m.calories <= orig_calories]
            pool = lower_cal if lower_cal else candidates
            pool.sort(key=lambda x: (x.calories, -calculate_liked_bonus(x, prefs.foods_liked)))
            chosen = pool[0]
            reason_text = f"Selected for lower calorie density ({chosen.calories} kcal) to help reach your target."

        elif normalized_reason == "disliked_ingredients":
            # Exclude overlapping ingredients with original meal
            orig_ing_set = set(i.lower() for i in orig_ingredients)
            differing = [m for m in candidates if not any(i.lower() in orig_ing_set for i in m.ingredients)]
            pool = differing if differing else candidates
            pool.sort(key=lambda x: calculate_liked_bonus(x, prefs.foods_liked), reverse=True)
            chosen = pool[0]
            reason_text = "Alternative ingredients selected to avoid disliked items."

        elif normalized_reason == "too_long_to_prepare":
            # Sort by preparation time ascending
            candidates.sort(key=lambda x: (x.prep_time or 15, -calculate_liked_bonus(x, prefs.foods_liked)))
            chosen = candidates[0]
            reason_text = f"Quick preparation meal ({chosen.prep_time or 10} mins prep time)."

        else: # something_different
            # Sort by liked foods and cuisine
            candidates.sort(key=lambda x: calculate_liked_bonus(x, prefs.foods_liked), reverse=True)
            chosen = candidates[0]
            reason_text = "Alternative recipe selected to vary your daily diet."

        replacement = AIMealRecommendation(
            id=chosen.id,
            type=chosen.type,
            name=chosen.name,
            description=chosen.description,
            calories=chosen.calories,
            protein_g=chosen.protein,
            carbs_g=chosen.carbs,
            fat_g=chosen.fat,
            ingredients=chosen.ingredients,
            instructions=chosen.instructions,
            prep_time=chosen.prep_time,
            dietary_tags=chosen.dietary_tags,
            cuisine_tags=chosen.cuisine_tags,
            allergen_tags=chosen.allergen_tags,
            reason=reason_text
        )

        return NutritionAIResponse(
            insights=[],
            recommendations=[],
            meal_replacements=[replacement],
            provider="deterministic",
            fallback_used=True
        )
