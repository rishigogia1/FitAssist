"""
Comprehensive Nutritional Safety & Preference Validation Engine for FitAssist.

Enforces strict, multi-level constraint checking:
1. Allergen Hard Constraints: Excludes meals matching allergen tags OR containing allergen-derived ingredients.
2. Dietary Hard Constraints: Excludes meals violating Vegetarian, Vegan, Eggetarian, or Non-Vegetarian rules.
3. Food Dislikes: Excludes or penalizes meals with disliked ingredients.
4. Food Likes: Scores meals featuring preferred ingredients.
"""

from typing import List, Optional, Set, Tuple
import json
import logging
from app.schemas.nutrition import Meal

logger = logging.getLogger(__name__)

# Canonical Allergen Ingredient Dictionary
ALLERGEN_INGREDIENT_MAP = {
    "dairy": {
        "dairy", "milk", "paneer", "cheese", "butter", "cream", "ghee",
        "yogurt", "curd", "whey", "casein", "cottage cheese", "custard",
        "parmesan", "mozzarella", "cheddar", "ricotta", "mascarpone",
        "condensed milk", "evaporated milk", "buttermilk", "sour cream",
        "dahi", "malai", "makhana in butter", "khoya", "mawa"
    },
    "eggs": {
        "egg", "eggs", "egg white", "egg whites", "egg yolk", "egg yolks",
        "albumin", "mayonnaise", "meringue", "scrambled egg", "boiled egg"
    },
    "gluten": {
        "gluten", "wheat", "bread", "roti", "wrap", "flour", "barley",
        "rye", "pasta", "semolina", "maida", "sooji", "atta", "couscous",
        "tortilla", "pita", "chapati", "naan", "croutons", "seitan",
        "wheat noodles", "soy sauce (wheat)"
    },
    "soy": {
        "soy", "soya", "tofu", "edamame", "tempeh", "soy sauce", "soya chunks",
        "soy milk", "soy protein", "tamari", "miso", "natto", "textured vegetable protein"
    },
    "peanuts": {
        "peanut", "peanuts", "peanut butter", "groundnut", "groundnuts",
        "peanut oil", "peanut flour", "arachis oil"
    },
    "fish": {
        "fish", "salmon", "cod", "tuna", "tilapia", "trout", "anchovy",
        "halibut", "sardine", "mackerel", "bass", "snapper", "fish sauce"
    },
    "shellfish": {
        "shellfish", "prawn", "prawns", "shrimp", "crab", "lobster",
        "clam", "mussel", "oyster", "scallop", "squid", "calamari", "octopus"
    },
    "tree_nuts": {
        "almond", "almonds", "walnut", "walnuts", "cashew", "cashews",
        "pistachio", "pistachios", "pecan", "pecans", "hazelnut", "hazelnuts",
        "macadamia", "brazil nut"
    }
}

# Meat and animal products forbidden in Vegetarian and Vegan diets
MEAT_KEYWORDS = {
    "chicken", "poultry", "turkey", "duck", "beef", "pork", "bacon", "ham",
    "lamb", "mutton", "veal", "meat", "sausage", "pepperoni", "steak",
    "fish", "salmon", "cod", "tuna", "tilapia", "trout", "anchovy",
    "prawn", "shrimp", "crab", "lobster", "seafood"
}

# Non-vegan animal products (in addition to meat)
ANIMAL_DERIVED_KEYWORDS = {
    *MEAT_KEYWORDS,
    *ALLERGEN_INGREDIENT_MAP["dairy"],
    *ALLERGEN_INGREDIENT_MAP["eggs"],
    "honey", "gelatin", "lard", "tallow", "bone broth"
}

def parse_allergies_list(allergies: any) -> List[str]:
    """Safely normalizes allergies input from JSON, list, or comma-separated string."""
    if not allergies:
        return []
    if isinstance(allergies, str):
        try:
            parsed = json.loads(allergies)
            if isinstance(parsed, list):
                allergies = parsed
            else:
                allergies = [s.strip() for s in allergies.split(",") if s.strip()]
        except Exception:
            allergies = [s.strip() for s in allergies.split(",") if s.strip()]
    elif not isinstance(allergies, list):
        allergies = []
    return [str(a).strip().lower() for a in allergies if a and str(a).strip().lower() != "none"]

def is_allergy_safe(meal: Meal, allergies: any) -> Tuple[bool, Optional[str]]:
    """
    Checks if a meal violates any user allergy.
    Returns (is_safe, violation_reason).
    Hard constraint: Checks allergen_tags AND ingredient-level tokens.
    """
    clean_allergies = parse_allergies_list(allergies)
    if not clean_allergies:
        return True, None

    # 1. Check explicit allergen tags on the meal
    meal_tags = {str(t).strip().lower() for t in (meal.allergen_tags or [])}
    for allergy in clean_allergies:
        if allergy in meal_tags:
            return False, f"Contains allergen tag: {allergy}"

    # 2. Check full ingredients list and meal title against allergen dictionary
    meal_text = f"{meal.name} {' '.join(meal.ingredients or [])}".lower()

    for allergy in clean_allergies:
        # Check against mapped forbidden keywords
        forbidden_keywords = ALLERGEN_INGREDIENT_MAP.get(allergy, {allergy})
        for kw in forbidden_keywords:
            # Word boundary / substring check
            if kw in meal_text:
                return False, f"Contains allergen ingredient '{kw}' (violates {allergy} allergy)"

    return True, None

def is_dietary_safe(meal: Meal, dietary_preference: Optional[str]) -> Tuple[bool, Optional[str]]:
    """
    Validates adherence to supported dietary preferences:
    - vegetarian: No meat, poultry, fish, seafood.
    - vegan: No animal-derived products (meat, poultry, fish, dairy, eggs, honey).
    - eggetarian: Vegetarian + eggs permitted.
    - non_vegetarian / no_preference: All foods permitted.
    """
    if not dietary_preference or dietary_preference in ("no_preference", "non_vegetarian"):
        return True, None

    diet = dietary_preference.strip().lower()
    meal_tags = {str(t).strip().lower() for t in (meal.dietary_tags or [])}
    meal_text = f"{meal.name} {' '.join(meal.ingredients or [])}".lower()

    if diet == "vegetarian":
        if "non_vegetarian" in meal_tags and "vegetarian" not in meal_tags:
            return False, "Tagged as non-vegetarian"
        for kw in MEAT_KEYWORDS:
            if kw in meal_text:
                return False, f"Contains meat ingredient: {kw}"

    elif diet == "vegan":
        if "vegan" not in meal_tags:
            # Strict check: if not tagged vegan, must be verified completely animal-free
            pass
        for kw in ANIMAL_DERIVED_KEYWORDS:
            if kw in meal_text:
                return False, f"Contains animal-derived ingredient: {kw}"

    elif diet == "eggetarian":
        if "non_vegetarian" in meal_tags and "eggetarian" not in meal_tags and "vegetarian" not in meal_tags:
            return False, "Tagged as non-vegetarian"
        for kw in MEAT_KEYWORDS:
            if kw in meal_text:
                return False, f"Contains meat/fish ingredient: {kw}"

    return True, None

def is_disliked_safe(meal: Meal, foods_disliked: Optional[str]) -> Tuple[bool, Optional[str]]:
    """
    Checks if a meal contains any ingredients explicitly disliked by the user.
    """
    if not foods_disliked or not isinstance(foods_disliked, str):
        return True, None

    disliked_items = [d.strip().lower() for d in foods_disliked.split(",") if d.strip()]
    if not disliked_items:
        return True, None

    meal_text = f"{meal.name} {' '.join(meal.ingredients or [])}".lower()
    for item in disliked_items:
        if item in meal_text:
            return False, f"Contains disliked food: '{item}'"

    return True, None

def calculate_liked_bonus(meal: Meal, foods_liked: Optional[str]) -> int:
    """
    Returns a score bonus based on the number of preferred ingredients matched.
    """
    if not foods_liked or not isinstance(foods_liked, str):
        return 0

    liked_items = [d.strip().lower() for d in foods_liked.split(",") if d.strip()]
    if not liked_items:
        return 0

    bonus = 0
    meal_text = f"{meal.name} {' '.join(meal.ingredients or [])}".lower()
    for item in liked_items:
        if item in meal_text:
            bonus += 35
    return bonus
