import logging
from typing import Optional, List
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.models.user_profile import UserProfile
from app.models.nutrition_preferences import NutritionPreferences
from app.models.nutrition_log import NutritionLog
from app.models.workout_session import WorkoutSession
from app.schemas.nutrition import NutritionTarget, NutritionDashboardConsumed, NutritionLogResponse, NutritionPreferencesResponse
from app.schemas.nutrition_ai import NutritionModelContext, NutritionAIResponse, MealReplacementRequest, WeeklyNutritionAnalysis, WeeklyAdherence, AdaptiveNutritionRecommendation, AIMealRecommendation, NutritionInsight
from app.schemas.profile import ProfileResponse
from app.schemas.workout_session import WorkoutSessionResponse
from app.services.nutrition_service import NutritionService
from app.services.nutrition.providers.deterministic import DeterministicNutritionProvider, is_allergy_safe, is_dietary_safe, is_disliked_safe
from app.services.nutrition.providers.quantized_slm import QuantizedSLMNutritionProvider

logger = logging.getLogger(__name__)

class AdaptiveNutritionEngine:
    def __init__(self):
        self.phase1_service = NutritionService()
        self.ai_provider = QuantizedSLMNutritionProvider()
        self.fallback_provider = DeterministicNutritionProvider()
        
    def _build_context(
        self,
        db: Session,
        user_id: str,
        target_meal: Optional[dict] = None,
        replacement_reason: Optional[str] = None
    ) -> NutritionModelContext:
        profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        if not profile:
            profile = UserProfile(
                user_id=user_id,
                age=25,
                weight=70.0,
                height=170.0,
                sex="male",
                fitness_goal="general_fitness",
                fitness_level="intermediate"
            )
            db.add(profile)
            db.commit()
            db.refresh(profile)

        prefs = db.query(NutritionPreferences).filter(NutritionPreferences.user_id == user_id).first()
        if not prefs:
            prefs = NutritionPreferences(user_id=user_id)
            db.add(prefs)
            db.commit()
            db.refresh(prefs)
        
        # Use IST timezone consistently
        from zoneinfo import ZoneInfo
        IST = ZoneInfo("Asia/Kolkata")
        local_now = datetime.now(IST)
        today = local_now.date()
        
        logs = db.query(NutritionLog).filter(
            NutritionLog.user_id == user_id,
            NutritionLog.log_date == today
        ).all()
        
        consumed = NutritionDashboardConsumed(
            calories=sum(log.calories for log in logs),
            protein=int(sum(log.protein_g for log in logs)),
            carbs=int(sum(log.carbs_g for log in logs)),
            fat=int(sum(log.fat_g for log in logs))
        )
        
        targets = self.phase1_service.calculate_targets(profile)
        
        recent_workouts = db.query(WorkoutSession).filter(
            WorkoutSession.user_id == user_id,
            WorkoutSession.completed_at >= today - timedelta(days=7)
        ).all()
        
        profile_dict = profile.__dict__.copy()
        profile_dict["profile_completed"] = True
        user_profile_resp = ProfileResponse.model_validate(profile_dict)
        
        prefs_resp = NutritionPreferencesResponse.model_validate(prefs)
        logged_meals_resp = [NutritionLogResponse.model_validate(l) for l in logs]
        recent_workouts_resp = [WorkoutSessionResponse.model_validate(w) for w in recent_workouts]
        
        return NutritionModelContext(
            user_profile=user_profile_resp,
            nutrition_preferences=prefs_resp,
            today_targets=targets,
            today_consumed=consumed,
            logged_meals=logged_meals_resp,
            recent_workouts=recent_workouts_resp,
            weekly_analysis=None,
            target_meal=target_meal,
            replacement_reason=replacement_reason
        )

    def generate_adaptive_snack(
        self,
        db: Session,
        user_id: str,
        exclude_ids: Optional[List[str]] = None
    ) -> AdaptiveNutritionRecommendation:
        if exclude_ids is None:
            exclude_ids = []
            
        context = self._build_context(db, user_id)
        
        targets = context.today_targets
        consumed = context.today_consumed
        
        # Calculate remaining
        r_cal = max(0, targets.calories - consumed.calories)
        r_pro = max(0, targets.protein - consumed.protein)
        r_carb = max(0, targets.carbs - consumed.carbs)
        r_fat = max(0, targets.fat - consumed.fat)
        
        from zoneinfo import ZoneInfo
        IST = ZoneInfo("Asia/Kolkata")
        local_now = datetime.now(IST)
        today = local_now.date()
        today_str = today.isoformat()
        
        from app.models.daily_meal_plan import DailyMealPlan
        daily_plan = db.query(DailyMealPlan).filter(
            DailyMealPlan.user_id == user_id,
            DailyMealPlan.plan_date == today_str
        ).first()
        
        planned_meals = []
        if daily_plan and daily_plan.meals_json:
            from app.schemas.nutrition import Meal
            planned_meals = [Meal(**m) for m in daily_plan.meals_json]
            
        logged_planned_ids = {m.id for m in planned_meals if any(log.meal_id == m.id for log in context.logged_meals)}
        all_meals_logged = len(logged_planned_ids) >= len(planned_meals) if planned_meals else False

        # Identify primary gap: Priority: Protein -> Calories -> Carbs -> Fats (10% threshold)
        primary_gap = "none"
        status = "on_track"
        title = "You're on track today"
        explanation = "Your daily meals are fully on track, and your nutrition targets are met!"
        recommended_action = "none"
        
        if r_pro > targets.protein * 0.10:
            primary_gap = "protein"
            status = "needs_protein"
            title = "You're short on protein today"
            if all_meals_logged:
                explanation = f"Your planned meals are complete, but you are still {r_pro}g below your protein target. A high-protein snack would help close the gap without adding another full meal."
            else:
                explanation = f"Your planned meals are in progress, but you are currently {r_pro}g behind your protein target."
            recommended_action = "high_protein_snack"
        elif r_cal > targets.calories * 0.10:
            primary_gap = "calories"
            status = "needs_calories"
            title = "You're short on calories today"
            if all_meals_logged:
                explanation = f"Your planned meals are complete, but you are still {r_cal} kcal below your energy target. A calorie-dense snack would help close the gap."
            else:
                explanation = f"Your planned meals are in progress, but you are currently {r_cal} kcal behind your energy target."
            recommended_action = "calorie_dense_snack"
        elif r_carb > targets.carbs * 0.10:
            primary_gap = "carbs"
            status = "needs_carbs"
            title = "You're short on carbohydrates today"
            if all_meals_logged:
                explanation = f"Your planned meals are complete, but you are still {r_carb}g below your carb target. A healthy carb-focused option would help."
            else:
                explanation = f"Your planned meals are in progress, but you are currently {r_carb}g behind your carb target."
            recommended_action = "carb_focused_snack"
        elif r_fat > targets.fat * 0.10:
            primary_gap = "fat"
            status = "needs_fat"
            title = "You're short on healthy fats today"
            if all_meals_logged:
                explanation = f"Your planned meals are complete, but you are still {r_fat}g below your fat target. A balanced snack with healthy fats is recommended."
            else:
                explanation = f"Your planned meals are in progress, but you are currently {r_fat}g behind your fat target."
            recommended_action = "healthy_fat_snack"
            
        if status == "on_track":
            from app.schemas.nutrition_ai import AdaptiveNutritionRecommendation
            return AdaptiveNutritionRecommendation(
                status="on_track",
                primary_gap="none",
                title="You're on track today",
                explanation="Your current nutrition is sufficiently aligned with your daily targets. No additional recommendation is needed.",
                recommended_action="none",
                meal=None,
                nutrition_delta=None
            )

        # Snack Candidates
        snacks_dataset = [
            {
                "id": "s1",
                "type": "snack",
                "name": "Greek Yogurt Protein Bowl",
                "description": "Thick Greek yogurt topped with whey protein and chia seeds.",
                "calories": 250,
                "protein_g": 35,
                "carbs_g": 12,
                "fat_g": 3,
                "ingredients": ["Greek Yogurt", "Whey Protein", "Chia seeds", "Blueberries"],
                "instructions": "Mix protein powder into yogurt until smooth. Top with chia seeds and blueberries.",
                "prep_time": 5,
                "dietary_tags": ["vegetarian", "eggetarian"],
                "cuisine_tags": ["western", "mixed"],
                "allergen_tags": ["dairy"],
                "focus": "protein"
            },
            {
                "id": "s2",
                "type": "snack",
                "name": "Vegan Berry Protein Shake",
                "description": "Smooth plant-based protein shake blended with mixed berries.",
                "calories": 220,
                "protein_g": 30,
                "carbs_g": 15,
                "fat_g": 2,
                "ingredients": ["Plant Protein Powder", "Almond milk", "Mixed berries", "Spinach"],
                "instructions": "Blend all ingredients in a high-speed blender until smooth.",
                "prep_time": 5,
                "dietary_tags": ["vegan", "vegetarian", "eggetarian"],
                "cuisine_tags": ["western", "mixed"],
                "allergen_tags": [],
                "focus": "protein"
            },
            {
                "id": "s3",
                "type": "snack",
                "name": "Roasted Chickpeas & Almonds",
                "description": "Spiced chickpeas roasted to crisp perfection, mixed with whole almonds.",
                "calories": 310,
                "protein_g": 14,
                "carbs_g": 35,
                "fat_g": 12,
                "ingredients": ["Chickpeas", "Almonds", "Olive oil", "Spices"],
                "instructions": "Mix chickpeas with spices and olive oil, bake for 15 mins. Toss with almonds.",
                "prep_time": 10,
                "dietary_tags": ["vegan", "vegetarian", "eggetarian"],
                "cuisine_tags": ["mediterranean", "mixed"],
                "allergen_tags": [],
                "focus": "calories"
            },
            {
                "id": "s4",
                "type": "snack",
                "name": "Masala Peanut Salad",
                "description": "Traditional street-style Indian peanut salad with onions, tomatoes, and lime juice.",
                "calories": 280,
                "protein_g": 12,
                "carbs_g": 15,
                "fat_g": 18,
                "ingredients": ["Roasted peanuts", "Onion", "Tomato", "Lime juice", "Chaat masala"],
                "instructions": "Toss peanuts with chopped onions, tomatoes, lime juice and chaat masala.",
                "prep_time": 5,
                "dietary_tags": ["vegan", "vegetarian", "eggetarian"],
                "cuisine_tags": ["indian"],
                "allergen_tags": ["peanuts"],
                "focus": "fat"
            },
            {
                "id": "s5",
                "type": "snack",
                "name": "Oatmeal Banana Energy Bars",
                "description": "Homemade natural energy bars packed with complex carbohydrates.",
                "calories": 260,
                "protein_g": 8,
                "carbs_g": 45,
                "fat_g": 6,
                "ingredients": ["Oats", "Banana", "Honey", "Cinnamon"],
                "instructions": "Mash bananas, mix with oats and cinnamon, bake at 180C for 15 mins.",
                "prep_time": 15,
                "dietary_tags": ["vegetarian", "eggetarian"],
                "cuisine_tags": ["western", "mixed"],
                "allergen_tags": ["gluten"],
                "focus": "carbs"
            },
            {
                "id": "s6",
                "type": "snack",
                "name": "Boiled Egg Spinach Salad",
                "description": "Boiled eggs served over a bed of fresh baby spinach and olive oil dressing.",
                "calories": 180,
                "protein_g": 16,
                "carbs_g": 4,
                "fat_g": 12,
                "ingredients": ["Egg whites", "Whole egg", "Spinach", "Cherry tomatoes", "Olive oil"],
                "instructions": "Slice hard-boiled eggs and place over spinach. Drizzle with olive oil.",
                "prep_time": 10,
                "dietary_tags": ["eggetarian"],
                "cuisine_tags": ["western", "mixed"],
                "allergen_tags": ["eggs"],
                "focus": "protein"
            },
            {
                "id": "s7",
                "type": "snack",
                "name": "Paneer Tikka Skewers (Light)",
                "description": "Skewered and grilled paneer cubes marinated in yogurt and light spices.",
                "calories": 290,
                "protein_g": 22,
                "carbs_g": 10,
                "fat_g": 18,
                "ingredients": ["Paneer", "Yogurt", "Bell peppers", "Spices"],
                "instructions": "Marinate paneer in spiced yogurt, grill in pan for 5 mins each side.",
                "prep_time": 15,
                "dietary_tags": ["vegetarian", "eggetarian"],
                "cuisine_tags": ["indian"],
                "allergen_tags": ["dairy"],
                "focus": "protein"
            }
        ]

        prefs = context.nutrition_preferences
        candidates = []
        for s in snacks_dataset:
            if s["id"] in exclude_ids:
                continue
                
            from app.schemas.nutrition import Meal as DummyMeal
            m_obj = DummyMeal(
                id=s["id"],
                type=s["type"],
                name=s["name"],
                description=s["description"],
                calories=s["calories"],
                protein=s["protein_g"],
                carbs=s["carbs_g"],
                fat=s["fat_g"],
                ingredients=s["ingredients"],
                instructions=s["instructions"],
                prep_time=s["prep_time"],
                dietary_tags=s["dietary_tags"],
                cuisine_tags=s["cuisine_tags"],
                allergen_tags=s["allergen_tags"]
            )
            if not is_allergy_safe(m_obj, prefs.allergies):
                continue
            if not is_dietary_safe(m_obj, prefs.dietary_preference):
                continue
            if not is_disliked_safe(m_obj, prefs.foods_disliked):
                continue
            candidates.append(s)

        # Fallback if exclude_ids filtered out all options: retry safe options from snacks_dataset
        if not candidates:
            for s in snacks_dataset:
                from app.schemas.nutrition import Meal as DummyMeal
                m_obj = DummyMeal(
                    id=s["id"],
                    type=s["type"],
                    name=s["name"],
                    description=s["description"],
                    calories=s["calories"],
                    protein=s["protein_g"],
                    carbs=s["carbs_g"],
                    fat=s["fat_g"],
                    ingredients=s["ingredients"],
                    instructions=s["instructions"],
                    prep_time=s["prep_time"],
                    dietary_tags=s["dietary_tags"],
                    cuisine_tags=s["cuisine_tags"],
                    allergen_tags=s["allergen_tags"]
                )
                if is_allergy_safe(m_obj, prefs.allergies) and is_dietary_safe(m_obj, prefs.dietary_preference):
                    candidates.append(s)

        if not candidates:
            # Fallback to an allergen-free, vegan plant-based protein snack
            clean_allergies = [str(a).strip().lower() for a in (prefs.allergies or []) if a and str(a).strip().lower() != "none"]
            if "dairy" in clean_allergies or prefs.dietary_preference == "vegan":
                fallback_snack = {
                    "id": "fs_plant_protein",
                    "type": "snack",
                    "name": "Vegan Berry Protein Shake",
                    "description": "Smooth plant-based protein shake blended with mixed berries and almond milk.",
                    "calories": 220,
                    "protein_g": 30,
                    "carbs_g": 15,
                    "fat_g": 2,
                    "ingredients": ["Plant Protein Powder", "Almond milk", "Mixed berries", "Spinach"],
                    "instructions": "Blend all ingredients in a high-speed blender until smooth.",
                    "prep_time": 5,
                    "dietary_tags": ["vegan", "vegetarian", "eggetarian"],
                    "cuisine_tags": ["western", "mixed"],
                    "allergen_tags": [],
                    "focus": "protein"
                }
            else:
                fallback_snack = {
                    "id": "fs_protein",
                    "type": "snack",
                    "name": "Quick Protein Yogurt Bowl",
                    "description": "A customized Greek yogurt bowl tailored for protein replenishment.",
                    "calories": 250,
                    "protein_g": max(15, int(r_pro)),
                    "carbs_g": 10,
                    "fat_g": 2,
                    "ingredients": ["Greek yogurt", "Protein powder mix"],
                    "instructions": "Mix protein powder with yogurt and consume.",
                    "prep_time": 2,
                    "dietary_tags": ["vegetarian"],
                    "cuisine_tags": ["mixed"],
                    "allergen_tags": ["dairy"],
                    "focus": "protein"
                }
            candidates = [fallback_snack]

        focused_candidates = [c for c in candidates if c.get("focus") == primary_gap]
        if not focused_candidates:
            focused_candidates = candidates

        if primary_gap == "protein":
            focused_candidates.sort(key=lambda x: x["protein_g"], reverse=True)
        elif primary_gap == "calories":
            focused_candidates.sort(key=lambda x: x["calories"], reverse=True)
        elif primary_gap == "carbs":
            focused_candidates.sort(key=lambda x: x["carbs_g"], reverse=True)
        elif primary_gap == "fat":
            focused_candidates.sort(key=lambda x: x["fat_g"], reverse=True)

        chosen = focused_candidates[0]

        from app.schemas.nutrition_ai import AIMealRecommendation, AdaptiveNutritionRecommendation
        rec_meal = AIMealRecommendation(
            id=chosen["id"],
            type=chosen["type"],
            name=chosen["name"],
            description=chosen["description"],
            calories=chosen["calories"],
            protein_g=chosen["protein_g"],
            carbs_g=chosen["carbs_g"],
            fat_g=chosen["fat_g"],
            ingredients=chosen["ingredients"],
            instructions=chosen["instructions"],
            prep_time=chosen["prep_time"],
            dietary_tags=chosen["dietary_tags"],
            cuisine_tags=chosen["cuisine_tags"],
            allergen_tags=chosen["allergen_tags"],
            reason=f"High in {primary_gap} to help close your remaining gap."
        )

        return AdaptiveNutritionRecommendation(
            status=status,
            primary_gap=primary_gap,
            title=title,
            explanation=explanation,
            recommended_action=recommended_action,
            meal=rec_meal,
            nutrition_delta={
                "calories": chosen["calories"],
                "protein": chosen["protein_g"],
                "carbs": chosen["carbs_g"],
                "fat": chosen["fat_g"]
            }
        )

    def generate_daily_recommendations(self, db: Session, user_id: str, exclude_ids: Optional[List[str]] = None) -> NutritionAIResponse:
        rec = self.generate_adaptive_snack(db, user_id, exclude_ids)
        
        insights = []
        if rec.explanation:
            insights.append(NutritionInsight(content=rec.explanation, insight_type="adaptive_recs"))
            
        return NutritionAIResponse(
            insights=insights,
            recommendations=[],
            meal_replacements=[],
            provider="quantized_slm",
            fallback_used=False,
            adaptive_recommendation=rec
        )

    def replace_meal(self, db: Session, user_id: str, request: MealReplacementRequest, target_meal: Optional[dict] = None) -> NutritionAIResponse:
        context = self._build_context(db, user_id, target_meal=target_meal, replacement_reason=request.reason)
        
        try:
            response = self.ai_provider.generate_meal_replacement(context, request)
            if response and response.meal_replacements:
                rep = response.meal_replacements[0]
                from app.schemas.nutrition import Meal
                temp_meal = Meal(
                    id=rep.id,
                    type=rep.type,
                    name=rep.name,
                    description=rep.description,
                    calories=rep.calories,
                    protein=rep.protein_g,
                    carbs=rep.carbs_g,
                    fat=rep.fat_g,
                    ingredients=rep.ingredients,
                    instructions=rep.instructions,
                    prep_time=rep.prep_time,
                    dietary_tags=rep.dietary_tags,
                    cuisine_tags=rep.cuisine_tags,
                    allergen_tags=rep.allergen_tags
                )
                if is_allergy_safe(temp_meal, context.nutrition_preferences.allergies) and \
                   is_dietary_safe(temp_meal, context.nutrition_preferences.dietary_preference):
                    return response
            
            logger.warning("AI Provider produced unsafe or empty response, switching to fallback")
            return self.fallback_provider.generate_meal_replacement(context, request)
        except Exception as e:
            logger.error(f"AI Provider failed for replacement: {e}")
            return self.fallback_provider.generate_meal_replacement(context, request)


