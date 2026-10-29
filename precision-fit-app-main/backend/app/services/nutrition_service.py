"""
FitAssist Nutrition Service & Meal Database.

Calculates personalized nutritional targets (calories, protein, carbs, fat)
using the Mifflin-St Jeor equation and provides a comprehensive meal database
with multi-stage constraint filtering:
- Allergen safety (HARD constraint)
- Dietary preference (HARD constraint)
- Disliked foods avoidance (HARD constraint)
- Cuisine preference ranking
- Liked foods prioritization
- Meal slot macro balancing
"""

import math
import random
import logging
from typing import List, Optional, Tuple, Dict
from app.models.user_profile import UserProfile
from app.models.nutrition_preferences import NutritionPreferences
from app.schemas.nutrition import NutritionTarget, Meal
from app.services.nutrition.validation import (
    is_allergy_safe,
    is_dietary_safe,
    is_disliked_safe,
    calculate_liked_bonus,
    parse_allergies_list
)

logger = logging.getLogger(__name__)

def verify_atwater(protein: int, carbs: int, fat: int) -> int:
    """Calculates exact Atwater calories: 4*P + 4*C + 9*F."""
    return (protein * 4) + (carbs * 4) + (fat * 9)

class MealDatabase:
    def __init__(self):
        # Comprehensive catalog of nutritionally verified meals with exact Atwater consistency
        self.meals: List[Meal] = [
            # -------------------------------------------------------------
            # BREAKFAST (Target: ~25% daily calories)
            # -------------------------------------------------------------
            # ASIAN BREAKFASTS
            Meal(
                id="b_asian_1", type="breakfast", name="Asian Tofu & Edamame Scramble",
                description="High protein scramble with firm tofu, edamame, baby spinach, turmeric, and sesame oil.",
                protein=28, carbs=18, fat=20, calories=verify_atwater(28, 18, 20), # 364 kcal
                ingredients=["Tofu", "Edamame", "Baby spinach", "Turmeric", "Sesame oil", "Green onion"],
                prep_time=12, dietary_tags=["vegetarian", "vegan", "eggetarian"],
                cuisine_tags=["asian"], allergen_tags=["soy"]
            ),
            Meal(
                id="b_asian_2", type="breakfast", name="Steamed Vegetable & Brown Rice Congee",
                description="Comforting savory rice porridge with shiitake mushrooms, ginger, bok choy, and tamari.",
                protein=14, carbs=62, fat=3, calories=verify_atwater(14, 62, 3), # 331 kcal
                ingredients=["Brown rice", "Shiitake mushrooms", "Bok choy", "Fresh ginger", "Tamari"],
                prep_time=20, dietary_tags=["vegetarian", "vegan", "eggetarian"],
                cuisine_tags=["asian"], allergen_tags=["soy"]
            ),
            Meal(
                id="b_asian_3", type="breakfast", name="Japanese Tamagoyaki with Jasmine Rice",
                description="Rolled Japanese egg omelette seasoned with dashi and mirin, served with steamed jasmine rice.",
                protein=24, carbs=42, fat=13, calories=verify_atwater(24, 42, 13), # 381 kcal
                ingredients=["Whole eggs", "Egg whites", "Jasmine rice", "Nori strips", "Mirin"],
                prep_time=15, dietary_tags=["eggetarian", "non_vegetarian"],
                cuisine_tags=["asian"], allergen_tags=["eggs"]
            ),
            Meal(
                id="b_asian_4", type="breakfast", name="Vietnamese Rice Paper Egg & Veggie Rolls",
                description="Fresh rice paper rolls packed with shredded eggs, cucumbers, mint, cilantro, and peanut-free dip.",
                protein=20, carbs=38, fat=12, calories=verify_atwater(20, 38, 12), # 340 kcal
                ingredients=["Rice paper", "Eggs", "Cucumber", "Fresh mint", "Cilantro", "Lime dressing"],
                prep_time=12, dietary_tags=["eggetarian", "non_vegetarian"],
                cuisine_tags=["asian"], allergen_tags=["eggs"]
            ),

            # INDIAN BREAKFASTS
            Meal(
                id="b_indian_1", type="breakfast", name="Moong Dal Chilla with Mint Chutney",
                description="Savory protein-packed yellow moong dal crepes served with refreshing mint-coriander chutney.",
                protein=24, carbs=45, fat=8, calories=verify_atwater(24, 45, 8), # 348 kcal
                ingredients=["Yellow moong dal", "Fresh ginger", "Green chilies", "Coriander", "Cumin"],
                prep_time=15, dietary_tags=["vegetarian", "vegan", "eggetarian"],
                cuisine_tags=["indian"], allergen_tags=[]
            ),
            Meal(
                id="b_indian_2", type="breakfast", name="Masala Poha with Roasted Peanuts",
                description="Light, flattened rice tempered with mustard seeds, curry leaves, onions, and crispy peanuts.",
                protein=12, carbs=64, fat=12, calories=verify_atwater(12, 64, 12), # 412 kcal
                ingredients=["Flattened rice (poha)", "Peanuts", "Onion", "Mustard seeds", "Turmeric", "Lemon juice"],
                prep_time=15, dietary_tags=["vegetarian", "vegan", "eggetarian"],
                cuisine_tags=["indian"], allergen_tags=["peanuts"]
            ),
            Meal(
                id="b_indian_3", type="breakfast", name="Paneer Vegetable Toast",
                description="Spiced crumbled paneer with bell peppers, onions, and herbs on toasted whole grain bread.",
                protein=28, carbs=42, fat=16, calories=verify_atwater(28, 42, 16), # 424 kcal
                ingredients=["Paneer", "Whole grain bread", "Bell peppers", "Indian spices", "Tomato"],
                prep_time=15, dietary_tags=["vegetarian"],
                cuisine_tags=["indian"], allergen_tags=["dairy", "gluten"]
            ),
            Meal(
                id="b_indian_4", type="breakfast", name="High Protein Soya Bhurji & Multigrain Toast",
                description="Minced soya granules sautéed with tomatoes, onions, cumin, and fresh cilantro on multigrain toast.",
                protein=32, carbs=40, fat=11, calories=verify_atwater(32, 40, 11), # 387 kcal
                ingredients=["Soya chunks (granules)", "Whole wheat bread", "Onion", "Tomato", "Coriander", "Spices"],
                prep_time=15, dietary_tags=["vegetarian", "vegan", "eggetarian"],
                cuisine_tags=["indian"], allergen_tags=["soy", "gluten"]
            ),
            Meal(
                id="b_indian_5", type="breakfast", name="Desi Egg Bhurji with Whole Wheat Roti",
                description="Scrambled farm-fresh eggs spiced with green chilies, onions, and tomatoes, with handmade roti.",
                protein=26, carbs=40, fat=18, calories=verify_atwater(26, 40, 18), # 426 kcal
                ingredients=["Eggs", "Whole wheat roti", "Onions", "Tomatoes", "Green chilies", "Olive oil"],
                prep_time=14, dietary_tags=["eggetarian", "non_vegetarian"],
                cuisine_tags=["indian"], allergen_tags=["eggs", "gluten"]
            ),

            # MEDITERRANEAN & WESTERN BREAKFASTS
            Meal(
                id="b_med_1", type="breakfast", name="Mediterranean Shakshuka with Whole Wheat Pita",
                description="Eggs poached in a spiced, simmered tomato, bell pepper, and garlic sauce with warm pita.",
                protein=22, carbs=42, fat=14, calories=verify_atwater(22, 42, 14), # 382 kcal
                ingredients=["Eggs", "Tomatoes", "Bell peppers", "Garlic", "Whole wheat pita", "Olive oil"],
                prep_time=18, dietary_tags=["eggetarian", "non_vegetarian"],
                cuisine_tags=["mediterranean"], allergen_tags=["eggs", "gluten"]
            ),
            Meal(
                id="b_med_2", type="breakfast", name="Chickpea & Spinach Mediterranean Hash",
                description="Pan-seared seasoned chickpeas with baby spinach, cherry tomatoes, and cold-pressed olive oil.",
                protein=18, carbs=48, fat=11, calories=verify_atwater(18, 48, 11), # 363 kcal
                ingredients=["Chickpeas", "Baby spinach", "Cherry tomatoes", "Olive oil", "Oregano", "Lemon"],
                prep_time=12, dietary_tags=["vegetarian", "vegan", "eggetarian"],
                cuisine_tags=["mediterranean"], allergen_tags=[]
            ),
            Meal(
                id="b_west_1", type="breakfast", name="Egg White & Spinach Scramble",
                description="Lean egg white scramble cooked in extra virgin olive oil with spinach and cherry tomatoes.",
                protein=32, carbs=10, fat=18, calories=verify_atwater(32, 10, 18), # 330 kcal
                ingredients=["Egg whites", "Spinach", "Olive oil", "Tomato", "Black pepper"],
                prep_time=10, dietary_tags=["eggetarian", "non_vegetarian"],
                cuisine_tags=["western", "mixed"], allergen_tags=["eggs"]
            ),
            Meal(
                id="b_west_2", type="breakfast", name="Oatmeal with Berries, Chia Seeds & Almonds",
                description="Nutrient-dense rolled oats simmered in water, topped with mixed berries, chia seeds, and sliced almonds.",
                protein=14, carbs=56, fat=12, calories=verify_atwater(14, 56, 12), # 388 kcal
                ingredients=["Rolled oats", "Mixed berries", "Almonds", "Chia seeds", "Cinnamon"],
                prep_time=10, dietary_tags=["vegetarian", "vegan", "eggetarian"],
                cuisine_tags=["western", "mixed"], allergen_tags=[]
            ),
            Meal(
                id="b_west_3", type="breakfast", name="Protein Greek Yogurt Bowl with Walnuts",
                description="Thick strained Greek yogurt topped with raw walnuts, chia seeds, and a drizzle of honey.",
                protein=35, carbs=25, fat=12, calories=verify_atwater(35, 25, 12), # 348 kcal
                ingredients=["Greek yogurt", "Chia seeds", "Walnuts", "Honey"],
                prep_time=5, dietary_tags=["vegetarian", "eggetarian"],
                cuisine_tags=["western", "mixed"], allergen_tags=["dairy"]
            ),

            # -------------------------------------------------------------
            # LUNCH (Target: ~40% daily calories)
            # -------------------------------------------------------------
            # ASIAN LUNCHES
            Meal(
                id="l_asian_1", type="lunch", name="Thai Basil Tofu with Jasmine Rice",
                description="Fragrant stir-fried firm tofu with Thai holy basil, bell peppers, garlic, and steamed jasmine rice.",
                protein=28, carbs=65, fat=15, calories=verify_atwater(28, 65, 15), # 507 kcal
                ingredients=["Tofu", "Jasmine rice", "Thai basil", "Bell peppers", "Soy sauce", "Garlic"],
                prep_time=18, dietary_tags=["vegetarian", "vegan", "eggetarian"],
                cuisine_tags=["asian"], allergen_tags=["soy", "gluten"]
            ),
            Meal(
                id="l_asian_2", type="lunch", name="Teriyaki Chicken Breast with Brown Rice",
                description="Lean grilled chicken breast glazed with ginger teriyaki sauce, served with steamed brown rice and broccoli.",
                protein=48, carbs=58, fat=15, calories=verify_atwater(48, 58, 15), # 559 kcal
                ingredients=["Chicken breast", "Brown rice", "Broccoli", "Soy sauce", "Fresh ginger"],
                prep_time=22, dietary_tags=["non_vegetarian"],
                cuisine_tags=["asian"], allergen_tags=["soy", "gluten"]
            ),
            Meal(
                id="l_asian_3", type="lunch", name="Edamame Soba Noodle & Sesame Salad",
                description="Chilled Japanese buckwheat soba noodles tossed with shelled edamame, cucumbers, carrots, and sesame oil.",
                protein=24, carbs=68, fat=12, calories=verify_atwater(24, 68, 12), # 476 kcal
                ingredients=["Buckwheat soba noodles", "Edamame", "Cucumbers", "Carrots", "Sesame seeds", "Sesame oil"],
                prep_time=15, dietary_tags=["vegetarian", "vegan", "eggetarian"],
                cuisine_tags=["asian"], allergen_tags=["soy", "gluten"]
            ),
            Meal(
                id="l_asian_4", type="lunch", name="Asian Chicken & Egg Fried Cauliflower Rice",
                description="High protein, lower carb wok-tossed chicken breast, scrambled eggs, scallions, and riced cauliflower.",
                protein=44, carbs=24, fat=18, calories=verify_atwater(44, 24, 18), # 434 kcal
                ingredients=["Chicken breast", "Eggs", "Cauliflower rice", "Scallions", "Soy sauce", "Sesame oil"],
                prep_time=16, dietary_tags=["non_vegetarian"],
                cuisine_tags=["asian"], allergen_tags=["eggs", "soy"]
            ),

            # INDIAN LUNCHES
            Meal(
                id="l_indian_1", type="lunch", name="Dal and Brown Rice Bowl (Olive Oil)",
                description="Classic yellow lentil curry tempered with cumin and garlic in heart-healthy olive oil, served with brown rice.",
                protein=24, carbs=85, fat=13, calories=verify_atwater(24, 85, 13), # 553 kcal
                ingredients=["Lentils", "Brown rice", "Onions", "Tomatoes", "Olive oil", "Cumin", "Turmeric"],
                prep_time=25, dietary_tags=["vegetarian", "vegan", "eggetarian"],
                cuisine_tags=["indian"], allergen_tags=[]
            ),
            Meal(
                id="l_indian_2", type="lunch", name="Dal Tadka & Basmati Rice (Desi Ghee)",
                description="Traditional aromatic yellow lentils tempered with ghee, dried chilies, and cumin, with fragrant basmati.",
                protein=22, carbs=82, fat=16, calories=verify_atwater(22, 82, 16), # 560 kcal
                ingredients=["Lentils", "Basmati rice", "Ghee", "Onions", "Tomatoes", "Garlic"],
                prep_time=25, dietary_tags=["vegetarian"],
                cuisine_tags=["indian"], allergen_tags=["dairy"]
            ),
            Meal(
                id="l_indian_3", type="lunch", name="Soya Chunk Curry with Jeera Rice",
                description="High-protein textured soya chunks simmered in a spiced tomato-onion reduction, with cumin-infused rice.",
                protein=40, carbs=62, fat=11, calories=verify_atwater(40, 62, 11), # 507 kcal
                ingredients=["Soya chunks", "Basmati rice", "Tomato gravy", "Cumin seeds", "Spices", "Olive oil"],
                prep_time=22, dietary_tags=["vegetarian", "vegan", "eggetarian"],
                cuisine_tags=["indian"], allergen_tags=["soy"]
            ),
            Meal(
                id="l_indian_4", type="lunch", name="Paneer & Quinoa Power Bowl",
                description="Grilled paneer cubes seasoned with chat spices over warm tri-color quinoa and roasted zucchini.",
                protein=36, carbs=40, fat=23, calories=verify_atwater(36, 40, 23), # 511 kcal
                ingredients=["Paneer", "Quinoa", "Zucchini", "Bell peppers", "Olive oil", "Spices"],
                prep_time=18, dietary_tags=["vegetarian"],
                cuisine_tags=["indian", "mixed"], allergen_tags=["dairy"]
            ),
            Meal(
                id="l_indian_5", type="lunch", name="Sprouts & Veggie Power Salad",
                description="Sprouted green moong beans tossed with diced cucumbers, tomatoes, chaat masala, and cold-pressed oil.",
                protein=20, carbs=52, fat=8, calories=verify_atwater(20, 52, 8), # 360 kcal
                ingredients=["Sprouted moong", "Cucumber", "Tomato", "Lemon juice", "Coriander", "Chaat masala"],
                prep_time=12, dietary_tags=["vegetarian", "vegan", "eggetarian"],
                cuisine_tags=["indian", "mixed"], allergen_tags=[]
            ),
            Meal(
                id="l_indian_6", type="lunch", name="Tandoori Chicken Breast with Steamed Brown Rice",
                description="Tandoori-spiced marinated grilled chicken breast served alongside steamed brown rice and mint salad.",
                protein=48, carbs=55, fat=15, calories=verify_atwater(48, 55, 15), # 547 kcal
                ingredients=["Chicken breast", "Brown rice", "Lemon juice", "Ginger-garlic paste", "Tandoori spices"],
                prep_time=25, dietary_tags=["non_vegetarian"],
                cuisine_tags=["indian"], allergen_tags=[]
            ),

            # MEDITERRANEAN & WESTERN LUNCHES
            Meal(
                id="l_med_1", type="lunch", name="Chickpea Mediterranean Wrap",
                description="Whole wheat wrap stuffed with spiced chickpeas, creamy tahini hummus, cucumbers, and kalamata olives.",
                protein=20, carbs=72, fat=22, calories=verify_atwater(20, 72, 22), # 566 kcal
                ingredients=["Chickpeas", "Whole wheat wrap", "Hummus", "Cucumber", "Kalamata olives", "Tahini"],
                prep_time=15, dietary_tags=["vegetarian", "vegan", "eggetarian"],
                cuisine_tags=["mediterranean", "mixed"], allergen_tags=["gluten"]
            ),
            Meal(
                id="l_med_2", type="lunch", name="Grilled Chicken & Quinoa Mediterranean Salad",
                description="Herb-marinated chicken breast served over fluffy quinoa, baby greens, cucumbers, and lemon vinaigrette.",
                protein=48, carbs=44, fat=21, calories=verify_atwater(48, 44, 21), # 557 kcal
                ingredients=["Chicken breast", "Quinoa", "Baby greens", "Cucumber", "Olive oil", "Lemon juice"],
                prep_time=20, dietary_tags=["non_vegetarian"],
                cuisine_tags=["mediterranean", "western"], allergen_tags=[]
            ),
            Meal(
                id="l_med_3", type="lunch", name="Lentil & Spinach Hearty Soup with Sourdough",
                description="Rich brown lentil and baby spinach stew simmered with mirepoix herbs, served with toasted sourdough.",
                protein=24, carbs=64, fat=10, calories=verify_atwater(24, 64, 10), # 442 kcal
                ingredients=["Brown lentils", "Spinach", "Garlic", "Carrots", "Sourdough bread", "Olive oil"],
                prep_time=20, dietary_tags=["vegetarian", "vegan", "eggetarian"],
                cuisine_tags=["mediterranean", "mixed"], allergen_tags=["gluten"]
            ),

            # -------------------------------------------------------------
            # DINNER (Target: ~35% daily calories)
            # -------------------------------------------------------------
            # ASIAN DINNERS
            Meal(
                id="d_asian_1", type="dinner", name="Tofu Vegetable Stir Fry with Brown Rice",
                description="Pan-seared firm tofu and crunchy vegetables in savory tamari-ginger sauce over brown rice.",
                protein=26, carbs=58, fat=19, calories=verify_atwater(26, 58, 19), # 507 kcal
                ingredients=["Tofu", "Broccoli", "Carrots", "Tamari (soy sauce)", "Brown rice", "Ginger"],
                prep_time=20, dietary_tags=["vegetarian", "vegan", "eggetarian"],
                cuisine_tags=["asian", "mixed"], allergen_tags=["soy", "gluten"]
            ),
            Meal(
                id="d_asian_2", type="dinner", name="Thai Green Curry Tofu with Coconut Jasmine Rice",
                description="Aromatic Thai green coconut curry with bamboo shoots, bell peppers, firm tofu, and jasmine rice.",
                protein=22, carbs=52, fat=20, calories=verify_atwater(22, 52, 20), # 476 kcal
                ingredients=["Tofu", "Coconut milk", "Thai green curry paste", "Bell peppers", "Jasmine rice"],
                prep_time=22, dietary_tags=["vegetarian", "vegan", "eggetarian"],
                cuisine_tags=["asian"], allergen_tags=["soy"]
            ),
            Meal(
                id="d_asian_3", type="dinner", name="Asian Grilled Chicken with Snap Peas & Jasmine Rice",
                description="Tender chicken breast seared with garlic, sesame, and scallions alongside crisp sugar snap peas.",
                protein=46, carbs=38, fat=18, calories=verify_atwater(46, 38, 18), # 498 kcal
                ingredients=["Chicken breast", "Snap peas", "Jasmine rice", "Garlic", "Sesame oil", "Soy sauce"],
                prep_time=20, dietary_tags=["non_vegetarian"],
                cuisine_tags=["asian"], allergen_tags=["soy"]
            ),
            Meal(
                id="d_asian_4", type="dinner", name="Miso Glazed Salmon with Steamed Bok Choy",
                description="Omega-3 rich wild salmon fillet glazed with fermented miso and mirin, with tender steamed bok choy.",
                protein=44, carbs=24, fat=28, calories=verify_atwater(44, 24, 28), # 524 kcal
                ingredients=["Salmon fillet", "Miso paste", "Bok choy", "Brown rice", "Mirin", "Sesame seeds"],
                prep_time=25, dietary_tags=["non_vegetarian"],
                cuisine_tags=["asian"], allergen_tags=["fish", "soy"]
            ),

            # INDIAN DINNERS
            Meal(
                id="d_indian_1", type="dinner", name="Rajma Rice Bowl (Light & Hearty)",
                description="Classic North Indian red kidney bean curry simmered with whole spices, served with brown rice.",
                protein=26, carbs=74, fat=11, calories=verify_atwater(26, 74, 11), # 499 kcal
                ingredients=["Kidney beans (rajma)", "Brown rice", "Onions", "Tomatoes", "Ginger", "Garam masala"],
                prep_time=25, dietary_tags=["vegetarian", "vegan", "eggetarian"],
                cuisine_tags=["indian"], allergen_tags=[]
            ),
            Meal(
                id="d_indian_2", type="dinner", name="Paneer Tikka Masala with Whole Wheat Roti",
                description="Charred paneer cubes in spiced tomato-yogurt gravy, served with handmade whole wheat rotis.",
                protein=30, carbs=44, fat=32, calories=verify_atwater(30, 44, 32), # 584 kcal
                ingredients=["Paneer", "Tomato puree", "Yogurt", "Indian spices", "Whole wheat roti"],
                prep_time=30, dietary_tags=["vegetarian"],
                cuisine_tags=["indian"], allergen_tags=["dairy", "gluten"]
            ),
            Meal(
                id="d_indian_3", type="dinner", name="Steamed Paneer & Veggie Platter",
                description="Lightly seasoned fresh cottage cheese cubes with steamed broccoli, carrots, black pepper, and lemon.",
                protein=32, carbs=18, fat=23, calories=verify_atwater(32, 18, 23), # 407 kcal
                ingredients=["Paneer", "Broccoli", "Carrots", "Black pepper", "Lemon juice", "Olive oil"],
                prep_time=15, dietary_tags=["vegetarian"],
                cuisine_tags=["indian", "mixed"], allergen_tags=["dairy"]
            ),
            Meal(
                id="d_indian_4", type="dinner", name="Light Chickpea & Coconut Veggie Curry",
                description="Creamy, mild coconut milk curry with tender chickpeas, baby spinach, and cauliflower rice.",
                protein=20, carbs=52, fat=14, calories=verify_atwater(20, 52, 14), # 414 kcal
                ingredients=["Chickpeas", "Cauliflower rice", "Coconut milk", "Spinach", "Curry spices"],
                prep_time=18, dietary_tags=["vegetarian", "vegan", "eggetarian"],
                cuisine_tags=["indian", "asian"], allergen_tags=[]
            ),
            Meal(
                id="d_indian_5", type="dinner", name="Homestyle Egg Curry with Whole Wheat Chapati",
                description="Hard-boiled eggs simmered in a spiced onion-tomato reduction, served with whole wheat chapatis.",
                protein=28, carbs=46, fat=20, calories=verify_atwater(28, 46, 20), # 476 kcal
                ingredients=["Hard-boiled eggs", "Whole wheat chapati", "Onion-tomato gravy", "Coriander", "Spices"],
                prep_time=20, dietary_tags=["eggetarian", "non_vegetarian"],
                cuisine_tags=["indian"], allergen_tags=["eggs", "gluten"]
            ),

            # MEDITERRANEAN & WESTERN DINNERS
            Meal(
                id="d_med_1", type="dinner", name="Baked Salmon with Sweet Potato & Asparagus",
                description="Wild Atlantic salmon baked with herbs, extra virgin olive oil, sweet potato wedges, and roasted asparagus.",
                protein=42, carbs=36, fat=28, calories=verify_atwater(42, 36, 28), # 564 kcal
                ingredients=["Salmon fillet", "Sweet potato", "Asparagus", "Olive oil", "Rosemary", "Lemon"],
                prep_time=28, dietary_tags=["non_vegetarian"],
                cuisine_tags=["mediterranean", "western"], allergen_tags=["fish"]
            ),
            Meal(
                id="d_med_2", type="dinner", name="Mediterranean White Bean & Kale Skillet",
                description="Cannellini white beans simmered with crushed tomatoes, garlic, and lacinato kale, finished with olive oil.",
                protein=22, carbs=58, fat=12, calories=verify_atwater(22, 58, 12), # 428 kcal
                ingredients=["Cannellini beans", "Kale", "Crushed tomatoes", "Garlic", "Olive oil", "Oregano"],
                prep_time=18, dietary_tags=["vegetarian", "vegan", "eggetarian"],
                cuisine_tags=["mediterranean"], allergen_tags=[]
            ),
            Meal(
                id="d_med_3", type="dinner", name="Grilled Cod with Lemon, Herbs & Quinoa",
                description="Flaky white cod fillet seared with Mediterranean herbs, served alongside fluffy quinoa and broccoli.",
                protein=44, carbs=30, fat=16, calories=verify_atwater(44, 30, 16), # 440 kcal
                ingredients=["Cod fillet", "Quinoa", "Broccoli", "Fresh herbs", "Lemon juice", "Olive oil"],
                prep_time=22, dietary_tags=["non_vegetarian"],
                cuisine_tags=["mediterranean"], allergen_tags=["fish"]
            )
        ]

    def get_meals(self, target: NutritionTarget, prefs: NutritionPreferences, goal: str) -> List[Meal]:
        """
        Generates a complete, personalized, 3-meal plan strictly adhering to:
        1. Hard allergen exclusions (allergen tags + ingredients).
        2. Hard dietary restrictions (vegetarian/vegan/eggetarian/etc.).
        3. Disliked food exclusions.
        4. Cuisine ranking & liked food prioritization.
        5. Calorie distribution across Breakfast (25%), Lunch (40%), and Dinner (35%).
        """
        clean_allergies = parse_allergies_list(prefs.allergies)
        diet = prefs.dietary_preference
        disliked = prefs.foods_disliked
        liked = prefs.foods_liked
        cuisine = prefs.cuisine_preference or "mixed"

        # Step 1: Filter candidate meals by HARD CONSTRAINTS
        safe_meals: List[Meal] = []
        for m in self.meals:
            # 1a. Allergen constraint (NEVER relaxed)
            safe_a, _ = is_allergy_safe(m, clean_allergies)
            if not safe_a:
                continue

            # 1b. Dietary constraint (NEVER relaxed)
            safe_d, _ = is_dietary_safe(m, diet)
            if not safe_d:
                continue

            # 1c. Disliked foods (excluded)
            safe_dis, _ = is_disliked_safe(m, disliked)
            if not safe_dis:
                continue

            safe_meals.append(m)

        # Step 2: Separate into meal slots
        breakfasts = [m for m in safe_meals if m.type == "breakfast"]
        lunches = [m for m in safe_meals if m.type == "lunch"]
        dinners = [m for m in safe_meals if m.type == "dinner"]

        # Step 3: If disliked food constraint caused an empty slot, relax ONLY disliked filter,
        # BUT STRICTLY PRESERVE ALLERGIES AND DIETARY RESTRICTIONS!
        if not breakfasts or not lunches or not dinners:
            relaxed_safe_meals = []
            for m in self.meals:
                safe_a, _ = is_allergy_safe(m, clean_allergies)
                if not safe_a:
                    continue
                safe_d, _ = is_dietary_safe(m, diet)
                if not safe_d:
                    continue
                relaxed_safe_meals.append(m)

            if not breakfasts:
                breakfasts = [m for m in relaxed_safe_meals if m.type == "breakfast"]
            if not lunches:
                lunches = [m for m in relaxed_safe_meals if m.type == "lunch"]
            if not dinners:
                dinners = [m for m in relaxed_safe_meals if m.type == "dinner"]

        # Step 4: If STILL empty after checking all catalog meals, fail safely!
        # NEVER return an unsafe meal violating allergies or diet!
        if not breakfasts or not lunches or not dinners:
            missing_slots = []
            if not breakfasts: missing_slots.append("breakfast")
            if not lunches: missing_slots.append("lunch")
            if not dinners: missing_slots.append("dinner")
            err_msg = (
                f"No safe meals found for {', '.join(missing_slots)} under dietary preference '{diet}' "
                f"and allergies: {clean_allergies}. Please update your preferences in Settings."
            )
            logger.error(err_msg)
            raise ValueError(err_msg)

        # Step 5: Meal slot calorie targets
        b_target = target.calories * 0.25
        l_target = target.calories * 0.40
        d_target = target.calories * 0.35

        # Step 6: Scoring function prioritizing cuisine, liked foods, calorie proximity, and goal
        def score_candidate(meal: Meal, slot_target: float, already_chosen_ids: List[str]) -> float:
            score = 1000.0

            # 6a. Proximity to slot calorie target
            cal_diff = abs(meal.calories - slot_target)
            score -= (cal_diff * 0.6)

            # 6b. Cuisine preference match
            meal_cuisines = [c.lower() for c in meal.cuisine_tags]
            if cuisine and cuisine != "mixed":
                if cuisine.lower() in meal_cuisines:
                    score += 180.0  # Strong boost for matching selected cuisine
                elif "mixed" in meal_cuisines:
                    score += 40.0
            else:
                score += 50.0

            # 6c. Liked ingredients bonus
            liked_bonus = calculate_liked_bonus(meal, liked)
            score += liked_bonus

            # 6d. Fitness goal alignment
            if goal in ("muscle_gain", "weight_loss"):
                score += (meal.protein * 2.5)  # Favor higher protein density

            # 6e. Penalize repeating identical dominant proteins (variety check)
            for cid in already_chosen_ids:
                prev_meal = next((x for x in self.meals if x.id == cid), None)
                if prev_meal:
                    overlap = set(meal.ingredients).intersection(set(prev_meal.ingredients))
                    score -= (len(overlap) * 50.0)

            return score

        # Rank and pick Breakfast
        breakfasts.sort(key=lambda m: score_candidate(m, b_target, []), reverse=True)
        best_b = breakfasts[0]

        # Rank and pick Lunch (avoiding repetition of dominant ingredients from breakfast)
        lunches.sort(key=lambda m: score_candidate(m, l_target, [best_b.id]), reverse=True)
        best_l = lunches[0]

        # Rank and pick Dinner (avoiding repetition from breakfast & lunch)
        dinners.sort(key=lambda m: score_candidate(m, d_target, [best_b.id, best_l.id]), reverse=True)
        best_d = dinners[0]

        # Verify that the entire 3-meal plan strictly satisfies all constraints
        final_plan = [best_b, best_l, best_d]
        for m in final_plan:
            safe_a, r_a = is_allergy_safe(m, clean_allergies)
            if not safe_a:
                raise ValueError(f"Safety violation: {m.name} failed allergy check ({r_a})")
            safe_d, r_d = is_dietary_safe(m, diet)
            if not safe_d:
                raise ValueError(f"Safety violation: {m.name} failed dietary check ({r_d})")

        return final_plan


class NutritionService:
    def __init__(self):
        self.meal_db = MealDatabase()

    def calculate_targets(self, profile: UserProfile) -> NutritionTarget:
        """
        Calculates daily energy and macronutrient targets using the validated
        Mifflin-St Jeor formula:
        - BMR (Men)   = 10*W + 6.25*H - 5*A + 5
        - BMR (Women) = 10*W + 6.25*H - 5*A - 161
        - TDEE = BMR * 1.55 (Moderate activity)
        - Adjustments for weight loss (-500 kcal), muscle gain (+300 kcal),
          endurance (higher carb), and maintenance.
        """
        weight = float(profile.weight) if profile.weight and profile.weight > 0 else 70.0
        height = float(profile.height) if profile.height and profile.height > 0 else 170.0
        age = int(profile.age) if profile.age and profile.age > 0 else 25
        sex = (profile.sex or "male").strip().lower()

        if sex == "female":
            bmr = (10.0 * weight) + (6.25 * height) - (5.0 * age) - 161.0
        else:
            bmr = (10.0 * weight) + (6.25 * height) - (5.0 * age) + 5.0

        # Activity factor: 1.55 for moderate training activity
        tdee = bmr * 1.55
        goal = (profile.fitness_goal or "general_fitness").strip().lower()

        if goal == "weight_loss":
            calories = max(1200.0, tdee - 500.0)
            protein = weight * 2.2 # 2.2g/kg for lean mass preservation during deficit
            fat = (calories * 0.25) / 9.0
            carbs = (calories - (protein * 4.0) - (fat * 9.0)) / 4.0
        elif goal == "muscle_gain":
            calories = tdee + 300.0 # Lean surplus
            protein = weight * 2.0 # 2.0g/kg optimal for hypertrophy
            fat = (calories * 0.25) / 9.0
            carbs = (calories - (protein * 4.0) - (fat * 9.0)) / 4.0
        elif goal == "endurance":
            calories = tdee + 150.0
            protein = weight * 1.6 # 1.6g/kg for endurance
            fat = (calories * 0.22) / 9.0
            carbs = (calories - (protein * 4.0) - (fat * 9.0)) / 4.0
        else: # general_fitness / maintenance
            calories = tdee
            protein = weight * 1.8 # Balanced 1.8g/kg
            fat = (calories * 0.25) / 9.0
            carbs = (calories - (protein * 4.0) - (fat * 9.0)) / 4.0

        # Safeguard minimums
        c_cal = max(1200, int(round(calories)))
        c_pro = max(50, int(round(protein)))
        c_fat = max(30, int(round(fat)))
        
        # Balance carbs so Atwater sum (4*P + 4*C + 9*F) equals c_cal exactly
        remaining_kcal = max(200, c_cal - (c_pro * 4) - (c_fat * 9))
        c_carb = max(50, int(round(remaining_kcal / 4.0)))

        # Final Atwater adjustment to ensure 0 discrepancy
        c_cal = (c_pro * 4) + (c_carb * 4) + (c_fat * 9)

        return NutritionTarget(
            calories=c_cal,
            protein=c_pro,
            carbs=c_carb,
            fat=c_fat
        )
