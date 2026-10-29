import re

class CoachIntent:
    WORKOUT_PLAN = "WORKOUT_PLAN"
    WORKOUT_EXERCISE = "WORKOUT_EXERCISE"
    EXERCISE_FORM = "EXERCISE_FORM"
    POST_WORKOUT_MEAL = "POST_WORKOUT_MEAL"
    PRE_WORKOUT_MEAL = "PRE_WORKOUT_MEAL"
    NUTRITION = "NUTRITION"
    MEAL_PLAN = "MEAL_PLAN"
    CALORIES = "CALORIES"
    MACROS = "MACROS"
    PROTEIN = "PROTEIN"
    PROGRESS_ANALYSIS = "PROGRESS_ANALYSIS"
    WEIGHT_GOAL = "WEIGHT_GOAL"
    MUSCLE_GAIN = "MUSCLE_GAIN"
    FAT_LOSS = "FAT_LOSS"
    RECOVERY = "RECOVERY"
    REST = "REST"
    GENERAL_FITNESS = "GENERAL_FITNESS"
    GENERAL_NUTRITION = "GENERAL_NUTRITION"
    GREETING = "GREETING"
    UNKNOWN = "UNKNOWN"

def detect_intent(message: str) -> str:
    msg = message.lower().strip()
    words = set(re.findall(r'\b\w+\b', msg))
    
    def has_any(keywords):
        return any(k in msg for k in keywords)
        
    def has_word(keywords):
        return any(k in words for k in keywords)
    
    # Greetings
    if has_word(["hello", "hi", "hey", "sup", "greetings", "howdy"]) or has_any(["good morning", "good evening"]):
        if len(words) <= 4 or msg.startswith(("hello coach", "hey coach", "hi coach")):
            if not has_word(["workout", "food", "eat", "progress", "calories", "macros"]):
                return CoachIntent.GREETING

    # Progress Analysis
    if has_word(["progress", "progressing", "improving", "better", "results"]) or has_any(["fitness score", "weight change", "how am i doing", "going this week"]):
        return CoachIntent.PROGRESS_ANALYSIS

    # Pre/Post Workout Meal
    is_workout = has_word(["workout", "gym", "training"])
    is_food = has_word(["eat", "meal", "food", "snack"])
    
    if is_workout and is_food:
        if has_word(["post", "after"]):
            return CoachIntent.POST_WORKOUT_MEAL
        if has_word(["pre", "before"]):
            return CoachIntent.PRE_WORKOUT_MEAL

    # Meal Plan
    if has_any(["meal plan", "plan my meals", "plan my food", "daily meals"]):
        return CoachIntent.MEAL_PLAN

    # Protein
    if has_word(["protein"]):
        return CoachIntent.PROTEIN

    # Calories & Macros
    if has_word(["calories", "calorie"]):
        return CoachIntent.CALORIES
    if has_word(["macro", "macros", "carbs", "fats"]):
        return CoachIntent.MACROS

    # General Nutrition
    if has_word(["eat", "food", "meal", "recipe", "snack", "dinner", "lunch", "breakfast", "diet", "nutrition"]):
        return CoachIntent.NUTRITION

    # Specific Exercise / Form
    if has_any(["form", "how to perform", "how do i do", "how should i do"]) and has_word(["squat", "bench", "deadlift", "pushup", "pullup", "exercise"]):
        return CoachIntent.EXERCISE_FORM

    if has_any(["how many sets", "how many reps", "what weight"]):
        return CoachIntent.WORKOUT_EXERCISE

    # Workout Plan / Recommendation
    if has_any(["workout plan", "plan my workout", "routine", "split", "weekly plan"]):
        return CoachIntent.WORKOUT_PLAN
    if has_word(["workout", "train", "exercise", "lift", "cardio", "run"]):
        return CoachIntent.WORKOUT_PLAN

    # Goals
    if has_word(["weight"]) and has_word(["lose", "gain", "goal", "target"]):
        return CoachIntent.WEIGHT_GOAL
    if has_word(["muscle"]) and has_word(["gain", "build"]):
        return CoachIntent.MUSCLE_GAIN
    if has_word(["fat"]) and has_word(["lose", "loss", "burn"]):
        return CoachIntent.FAT_LOSS

    # Recovery / Rest
    if has_word(["recovery", "sleep", "sore", "tired", "rest"]):
        return CoachIntent.RECOVERY

    # Unknown fallback
    if len(words) < 4 or has_any(["can you help me", "help me"]):
        return CoachIntent.UNKNOWN

    return CoachIntent.GENERAL_FITNESS
