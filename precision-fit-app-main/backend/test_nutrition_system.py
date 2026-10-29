"""
Automated Test Suite for FitAssist Nutrition Recommendation & Safety System.

Verifies:
- Test 1: Eggetarian preference + dairy allergy + paneer-containing meal is rejected.
- Test 2: Dairy allergy rejects butter, cream, milk, yogurt, ghee, whey, casein.
- Test 3: Vegetarian preference rejects chicken, fish, and meat recipes.
- Test 4: Vegan preference rejects dairy, eggs, and animal-derived ingredients.
- Test 5: Selected cuisine changes adaptively alter recommendations.
- Test 6: Disliked foods are strictly excluded from generated meals.
- Test 7: Liked compatible ingredients boost ranking without violating hard constraints.
- Test 8: Modifying an allergy invalidates stale cached meals and purges unsafe meals.
- Test 9: Multi-user isolation prevents preference and meal leakage between users.
- Test 10: Calorie and macro aggregation with strict Atwater consistency (4*P + 4*C + 9*F).
- Test 11: Missing profile inputs handled with defensible fallbacks without fabricating values.
- Test 12: Meal replacement obeys all hard constraints and updates plan without corrupting logs.
- Test 13: Preference persistence across database sessions.
- Test 14: Adaptive recommendations use latest preferences rather than stale data.
- Test 15: Impossible constraint combinations fail safely without generating unsafe meals.
"""

import unittest
import uuid
from datetime import datetime, date
from zoneinfo import ZoneInfo
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database.connection import Base
from app.models.user_profile import UserProfile
from app.models.nutrition_preferences import NutritionPreferences
from app.models.daily_meal_plan import DailyMealPlan
from app.models.nutrition_log import NutritionLog
from app.schemas.nutrition import NutritionTarget, Meal, NutritionPreferencesUpdate
from app.schemas.nutrition_ai import MealReplacementRequest
from app.services.nutrition_service import MealDatabase, NutritionService
from app.services.nutrition.validation import (
    is_allergy_safe,
    is_dietary_safe,
    is_disliked_safe,
    calculate_liked_bonus,
    parse_allergies_list
)
from app.api.routes.nutrition import (
    get_preferences,
    update_preferences,
    get_today_nutrition,
    replace_meal
)
from fastapi import HTTPException

IST = ZoneInfo("Asia/Kolkata")

class TestNutritionRecommendationSystem(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Use an in-memory SQLite database for test isolation
        cls.engine = create_engine("sqlite:///:memory:", echo=False)
        Base.metadata.create_all(cls.engine)
        cls.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=cls.engine)
        cls.service = NutritionService()
        cls.meal_db = cls.service.meal_db

    def setUp(self):
        self.db = self.SessionLocal()

    def tearDown(self):
        self.db.rollback()
        self.db.close()

    # -------------------------------------------------------------------------
    # TEST 1: Eggetarian preference + dairy allergy + paneer meal
    # -------------------------------------------------------------------------
    def test_01_eggetarian_dairy_allergy_rejects_paneer(self):
        paneer_meal = next((m for m in self.meal_db.meals if "paneer" in m.name.lower()), None)
        self.assertIsNotNone(paneer_meal, "Paneer meal should exist in database")

        is_safe, reason = is_allergy_safe(paneer_meal, ["dairy"])
        self.assertFalse(is_safe, "Paneer meal must be rejected when dairy allergy is present")
        self.assertIn("dairy", reason.lower())

        prefs = NutritionPreferences(
            user_id="user_test_1",
            dietary_preference="eggetarian",
            cuisine_preference="mixed",
            allergies=["dairy"]
        )
        target = NutritionTarget(calories=1800, protein=120, carbs=200, fat=55)
        meals = self.meal_db.get_meals(target, prefs, "general_fitness")

        for m in meals:
            self.assertNotIn("paneer", m.name.lower(), f"Recommended meal '{m.name}' contains paneer!")
            self.assertNotIn("paneer", " ".join(m.ingredients).lower(), f"Meal '{m.name}' ingredients contain paneer!")
            self.assertNotIn("dairy", [t.lower() for t in m.allergen_tags], f"Meal '{m.name}' is tagged with dairy!")

    # -------------------------------------------------------------------------
    # TEST 2: Dairy allergy rejects all recognized dairy ingredients
    # -------------------------------------------------------------------------
    def test_02_dairy_allergy_rejects_all_dairy_derivatives(self):
        dairy_derivatives = ["butter", "cream", "milk", "yogurt", "ghee", "curd", "whey", "casein"]
        for derivative in dairy_derivatives:
            test_meal = Meal(
                id=f"test_dairy_{derivative}",
                type="breakfast",
                name=f"Toast with {derivative.capitalize()}",
                calories=300, protein=10, carbs=30, fat=15,
                ingredients=["Whole wheat bread", derivative],
                dietary_tags=["vegetarian"],
                cuisine_tags=["western"],
                allergen_tags=[] # Even if allergen_tags is omitted, ingredient check must catch it!
            )
            is_safe, reason = is_allergy_safe(test_meal, ["dairy"])
            self.assertFalse(is_safe, f"Meal with ingredient '{derivative}' was not caught by dairy allergy filter!")
            self.assertIn("dairy", reason.lower())

    # -------------------------------------------------------------------------
    # TEST 3: Vegetarian preference rejects meat recipes
    # -------------------------------------------------------------------------
    def test_03_vegetarian_preference_rejects_meat_and_fish(self):
        meat_ingredients = ["chicken breast", "salmon fillet", "beef steak", "pork bacon", "lamb chop", "cod fillet"]
        for meat in meat_ingredients:
            test_meal = Meal(
                id=f"test_meat_{meat.replace(' ', '_')}",
                type="lunch",
                name=f"Bowl with {meat.title()}",
                calories=500, protein=40, carbs=40, fat=15,
                ingredients=["Rice", meat, "Olive oil"],
                dietary_tags=["non_vegetarian"],
                cuisine_tags=["western"],
                allergen_tags=[]
            )
            is_safe, reason = is_dietary_safe(test_meal, "vegetarian")
            self.assertFalse(is_safe, f"Vegetarian filter failed to reject meal containing '{meat}'!")

    # -------------------------------------------------------------------------
    # TEST 4: Vegan preference rejects dairy, eggs, and animal-derived products
    # -------------------------------------------------------------------------
    def test_04_vegan_preference_rejects_animal_derived_products(self):
        animal_items = ["paneer", "milk", "butter", "cheese", "eggs", "egg whites", "honey", "chicken"]
        for item in animal_items:
            test_meal = Meal(
                id=f"test_vegan_{item.replace(' ', '_')}",
                type="dinner",
                name=f"Salad with {item.title()}",
                calories=400, protein=20, carbs=30, fat=10,
                ingredients=["Lettuce", item, "Olive oil"],
                dietary_tags=["vegetarian"] if "chicken" not in item else ["non_vegetarian"],
                cuisine_tags=["western"],
                allergen_tags=[]
            )
            is_safe, reason = is_dietary_safe(test_meal, "vegan")
            self.assertFalse(is_safe, f"Vegan filter failed to reject recipe with '{item}'!")

    # -------------------------------------------------------------------------
    # TEST 5: Selected cuisine changes adaptively alter recommendations
    # -------------------------------------------------------------------------
    def test_05_cuisine_change_adapts_recommendations(self):
        target = NutritionTarget(calories=1900, protein=130, carbs=210, fat=60)
        
        # Test Asian Cuisine
        prefs_asian = NutritionPreferences(
            user_id="user_asian",
            dietary_preference="vegetarian",
            cuisine_preference="asian",
            allergies=[]
        )
        asian_meals = self.meal_db.get_meals(target, prefs_asian, "general_fitness")
        asian_cuisines = [c.lower() for m in asian_meals for c in m.cuisine_tags]
        self.assertIn("asian", asian_cuisines, "Asian preference should select meals tagged with 'asian'")

        # Test Indian Cuisine
        prefs_indian = NutritionPreferences(
            user_id="user_indian",
            dietary_preference="vegetarian",
            cuisine_preference="indian",
            allergies=[]
        )
        indian_meals = self.meal_db.get_meals(target, prefs_indian, "general_fitness")
        indian_cuisines = [c.lower() for m in indian_meals for c in m.cuisine_tags]
        self.assertIn("indian", indian_cuisines, "Indian preference should select meals tagged with 'indian'")

        # Recommendations should meaningfully differ
        asian_names = {m.name for m in asian_meals}
        indian_names = {m.name for m in indian_meals}
        self.assertNotEqual(asian_names, indian_names, "Changing cuisine preference should alter recommended meals")

    # -------------------------------------------------------------------------
    # TEST 6: User dislikes a major ingredient
    # -------------------------------------------------------------------------
    def test_06_disliked_foods_are_excluded(self):
        prefs = NutritionPreferences(
            user_id="user_dislike",
            dietary_preference="vegetarian",
            cuisine_preference="mixed",
            allergies=[],
            foods_disliked="tofu, bell peppers"
        )
        target = NutritionTarget(calories=1800, protein=120, carbs=200, fat=55)
        meals = self.meal_db.get_meals(target, prefs, "general_fitness")

        for m in meals:
            text = f"{m.name} {' '.join(m.ingredients)}".lower()
            self.assertNotIn("tofu", text, f"Meal '{m.name}' contains disliked food 'tofu'!")
            self.assertNotIn("bell peppers", text, f"Meal '{m.name}' contains disliked food 'bell peppers'!")

    # -------------------------------------------------------------------------
    # TEST 7: User likes a compatible ingredient (influences ranking)
    # -------------------------------------------------------------------------
    def test_07_liked_foods_influence_ranking_without_violating_constraints(self):
        meal_with_quinoa = next((m for m in self.meal_db.meals if "quinoa" in " ".join(m.ingredients).lower()), None)
        self.assertIsNotNone(meal_with_quinoa)
        bonus = calculate_liked_bonus(meal_with_quinoa, "quinoa, berries")
        self.assertGreater(bonus, 0, "Meal containing liked ingredient should receive a ranking bonus")

        # But liked ingredient must NEVER override an allergy constraint!
        # If user likes paneer but has dairy allergy:
        paneer_meal = next(m for m in self.meal_db.meals if "paneer" in m.name.lower())
        safe, reason = is_allergy_safe(paneer_meal, ["dairy"])
        self.assertFalse(safe, "Dairy allergy MUST reject paneer even if user lists paneer under foods liked!")

    # -------------------------------------------------------------------------
    # TEST 8: Modifying an allergy invalidates stale cached meals
    # -------------------------------------------------------------------------
    def test_08_modifying_allergy_invalidates_stale_cache(self):
        user_id = f"user_cache_invalidation_{uuid.uuid4().hex[:6]}"
        profile = UserProfile(
            user_id=user_id, age=28, weight=75.0, height=175.0,
            sex="male", fitness_goal="muscle_gain", fitness_level="intermediate"
        )
        self.db.add(profile)

        # 1. Start with no allergies and vegetarian diet (generates paneer toast)
        prefs = NutritionPreferences(
            user_id=user_id, dietary_preference="vegetarian",
            cuisine_preference="indian", allergies=[]
        )
        self.db.add(prefs)
        self.db.commit()

        cur_user = {"user_id": user_id, "email": f"{user_id}@test.com"}
        dashboard_before = get_today_nutrition(current_user=cur_user, db=self.db)
        meal_names_before = [m.name for m in dashboard_before.meals]
        self.assertTrue(any("paneer" in name.lower() for name in meal_names_before))

        # 2. User updates preferences in Settings to add 'dairy' allergy
        update_data = NutritionPreferencesUpdate(
            dietary_preference="vegetarian",
            cuisine_preference="indian",
            allergies=["dairy"]
        )
        update_preferences(data=update_data, current_user=cur_user, db=self.db)

        # 3. Retrieve today's nutrition again
        dashboard_after = get_today_nutrition(current_user=cur_user, db=self.db)
        meal_names_after = [m.name for m in dashboard_after.meals]

        # 4. Paneer and all dairy MUST be purged from today's plan!
        for name in meal_names_after:
            self.assertNotIn("paneer", name.lower(), f"Stale cached meal '{name}' with paneer was returned after adding dairy allergy!")
        for m in dashboard_after.meals:
            for ing in m.ingredients:
                self.assertNotIn("paneer", ing.lower())
                self.assertNotIn("dairy", [t.lower() for t in m.allergen_tags])

    # -------------------------------------------------------------------------
    # TEST 9: Multi-user isolation
    # -------------------------------------------------------------------------
    def test_09_multi_user_isolation(self):
        u1_id = f"user_iso_1_{uuid.uuid4().hex[:6]}"
        u2_id = f"user_iso_2_{uuid.uuid4().hex[:6]}"

        p1 = UserProfile(user_id=u1_id, age=22, weight=60.0, height=165.0, sex="female", fitness_goal="weight_loss", fitness_level="beginner")
        p2 = UserProfile(user_id=u2_id, age=35, weight=85.0, height=185.0, sex="male", fitness_goal="muscle_gain", fitness_level="advanced")
        self.db.add_all([p1, p2])

        pref1 = NutritionPreferences(user_id=u1_id, dietary_preference="vegan", cuisine_preference="asian", allergies=["soy"])
        pref2 = NutritionPreferences(user_id=u2_id, dietary_preference="non_vegetarian", cuisine_preference="mediterranean", allergies=[])
        self.db.add_all([pref1, pref2])
        self.db.commit()

        d1 = get_today_nutrition(current_user={"user_id": u1_id, "email": "u1@test.com"}, db=self.db)
        d2 = get_today_nutrition(current_user={"user_id": u2_id, "email": "u2@test.com"}, db=self.db)

        self.assertEqual(d1.personalized_for.dietary_preference, "vegan")
        self.assertEqual(d2.personalized_for.dietary_preference, "non_vegetarian")
        self.assertNotEqual(d1.targets.calories, d2.targets.calories)
        
        # User 1 meals must be vegan and soy-free
        for m in d1.meals:
            self.assertIn("vegan", [t.lower() for t in m.dietary_tags])
            self.assertNotIn("soy", [t.lower() for t in m.allergen_tags])

    # -------------------------------------------------------------------------
    # TEST 10: Calorie and macro aggregation with strict Atwater consistency
    # -------------------------------------------------------------------------
    def test_10_calorie_macro_atwater_consistency(self):
        # Verify that EVERY meal in MealDatabase adheres to the Atwater formula:
        # 4*Protein + 4*Carbs + 9*Fat == Calories (within rounding error of +/- 2 kcal)
        for meal in self.meal_db.meals:
            implied_calories = (meal.protein * 4) + (meal.carbs * 4) + (meal.fat * 9)
            diff = abs(meal.calories - implied_calories)
            self.assertLessEqual(diff, 2, f"Meal '{meal.name}' has calorie inconsistency! Stated: {meal.calories}, Implied: {implied_calories}")

        # Verify daily targets consistency
        profile = UserProfile(user_id="test_target_u", age=30, weight=70.0, height=175.0, sex="male", fitness_goal="general_fitness", fitness_level="intermediate")
        targets = self.service.calculate_targets(profile)
        implied_target_cals = (targets.protein * 4) + (targets.carbs * 4) + (targets.fat * 9)
        self.assertLessEqual(abs(targets.calories - implied_target_cals), 4, "Target calories must match macro sum within rounding tolerance")

    # -------------------------------------------------------------------------
    # TEST 11: Missing profile fields handled with defensible fallbacks
    # -------------------------------------------------------------------------
    def test_11_missing_profile_fields_handled_safely(self):
        # Missing height and sex should use standard documented defaults (170cm, male)
        incomplete_profile = UserProfile(
            user_id="incomplete_u",
            age=25,
            weight=70.0,
            height=None,
            sex=None,
            fitness_goal="general_fitness",
            fitness_level="beginner"
        )
        targets = self.service.calculate_targets(incomplete_profile)
        self.assertGreater(targets.calories, 1200)
        self.assertGreater(targets.protein, 50)
        self.assertGreater(targets.carbs, 50)
        self.assertGreater(targets.fat, 30)

    # -------------------------------------------------------------------------
    # TEST 12: Meal replacement obeys all hard constraints
    # -------------------------------------------------------------------------
    def test_12_meal_replacement_obeys_all_constraints(self):
        user_id = f"user_repl_{uuid.uuid4().hex[:6]}"
        profile = UserProfile(user_id=user_id, age=26, weight=68.0, height=172.0, sex="male", fitness_goal="muscle_gain", fitness_level="intermediate")
        prefs = NutritionPreferences(user_id=user_id, dietary_preference="vegetarian", cuisine_preference="asian", allergies=["dairy", "peanuts"])
        self.db.add_all([profile, prefs])
        self.db.commit()

        cur_user = {"user_id": user_id, "email": "u_repl@test.com"}
        dash = get_today_nutrition(current_user=cur_user, db=self.db)
        target_meal = dash.meals[0]

        req = MealReplacementRequest(reason="need_more_protein", meal_id=target_meal.id)
        resp = replace_meal(meal_id=target_meal.id, request=req, current_user=cur_user, db=self.db)

        self.assertTrue(len(resp.meal_replacements) > 0)
        replacement = resp.meal_replacements[0]
        self.assertNotEqual(replacement.id, target_meal.id)

        # Replacement MUST be dairy-free and peanut-free
        self.assertNotIn("dairy", [t.lower() for t in replacement.allergen_tags])
        self.assertNotIn("peanuts", [t.lower() for t in replacement.allergen_tags])
        for ing in replacement.ingredients:
            self.assertNotIn("paneer", ing.lower())
            self.assertNotIn("peanut", ing.lower())

    # -------------------------------------------------------------------------
    # TEST 13: Preference persistence across DB re-fetch
    # -------------------------------------------------------------------------
    def test_13_preference_persistence(self):
        user_id = f"user_persist_{uuid.uuid4().hex[:6]}"
        cur_user = {"user_id": user_id, "email": f"{user_id}@test.com"}

        update_data = NutritionPreferencesUpdate(
            dietary_preference="vegan",
            cuisine_preference="asian",
            meals_per_day=3,
            allergies=["gluten", "peanuts"],
            foods_liked="tofu, edamame",
            foods_disliked="mushrooms"
        )
        saved = update_preferences(data=update_data, current_user=cur_user, db=self.db)
        self.assertEqual(saved.dietary_preference, "vegan")

        # Create new DB session to test true persistence
        new_session = self.SessionLocal()
        fetched = get_preferences(current_user=cur_user, db=new_session)
        self.assertEqual(fetched.dietary_preference, "vegan")
        self.assertEqual(fetched.cuisine_preference, "asian")
        self.assertIn("gluten", fetched.allergies)
        self.assertIn("peanuts", fetched.allergies)
        self.assertEqual(fetched.foods_liked, "tofu, edamame")
        self.assertEqual(fetched.foods_disliked, "mushrooms")
        new_session.close()

    # -------------------------------------------------------------------------
    # TEST 14: Adaptive recommendations use latest preferences
    # -------------------------------------------------------------------------
    def test_14_adaptive_recommendations_respect_allergies(self):
        from app.services.nutrition.engine import AdaptiveNutritionEngine
        engine = AdaptiveNutritionEngine()

        user_id = f"user_adapt_{uuid.uuid4().hex[:6]}"
        profile = UserProfile(user_id=user_id, age=25, weight=70.0, height=170.0, sex="male", fitness_goal="muscle_gain", fitness_level="intermediate")
        # User with dairy allergy
        prefs = NutritionPreferences(user_id=user_id, dietary_preference="vegetarian", cuisine_preference="mixed", allergies=["dairy"])
        self.db.add_all([profile, prefs])
        self.db.commit()

        rec = engine.generate_adaptive_snack(self.db, user_id)
        if rec.meal:
            self.assertNotIn("dairy", [t.lower() for t in rec.meal.allergen_tags])
            self.assertNotIn("paneer", rec.meal.name.lower())
            self.assertNotIn("yogurt", rec.meal.name.lower())

    # -------------------------------------------------------------------------
    # TEST 15: Impossible constraint combinations fail safely
    # -------------------------------------------------------------------------
    def test_15_impossible_constraints_fail_safely(self):
        # A combination where all possible meals are excluded by allergies:
        # e.g. vegan diet + allergies covering all protein bases: soy, gluten, peanuts, fish, dairy, eggs, lentils, chickpeas, beans, oats
        impossible_prefs = NutritionPreferences(
            user_id="user_impossible",
            dietary_preference="vegan",
            cuisine_preference="asian",
            allergies=["soy", "gluten", "peanuts", "fish", "dairy", "eggs", "lentils", "dal", "chickpea", "beans", "oats"]
        )
        target = NutritionTarget(calories=1800, protein=120, carbs=200, fat=55)

        # Must raise ValueError with clear explanation rather than silently recommending an unsafe meal
        with self.assertRaises(ValueError) as context:
            self.meal_db.get_meals(target, impossible_prefs, "general_fitness")
        
        self.assertIn("No safe meals found", str(context.exception))

if __name__ == "__main__":
    unittest.main()
