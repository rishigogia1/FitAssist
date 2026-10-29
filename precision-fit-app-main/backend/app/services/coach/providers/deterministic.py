import re
from typing import List, Dict, Any, Optional
from app.services.coach.providers.base import BaseCoachAIProvider
from app.services.coach.context_builder import CoachContext
from app.schemas.coach import CoachResponse, SuggestedAction
from app.services.coach.intent import CoachIntent

# Common food database (values per 100g or standard unit)
FOOD_DATABASE = {
    "paneer": {"name": "Paneer (Cottage Cheese)", "unit": "g", "protein": 18.0, "calories": 265, "fat": 20.0, "carbs": 3.0, "default_serving": 100, "tip": "Rich in slow-digesting casein protein, ideal for overnight recovery. Low-fat paneer offers ~45g protein per 200g with much less fat."},
    "panner": {"name": "Paneer (Cottage Cheese)", "unit": "g", "protein": 18.0, "calories": 265, "fat": 20.0, "carbs": 3.0, "default_serving": 100, "tip": "Rich in slow-digesting casein protein, ideal for overnight recovery. Low-fat paneer offers ~45g protein per 200g with much less fat."},
    "chicken": {"name": "Chicken Breast", "unit": "g", "protein": 31.0, "calories": 165, "fat": 3.6, "carbs": 0.0, "default_serving": 150, "tip": "A gold-standard lean protein with very high bioavailability and virtually zero carbs."},
    "egg": {"name": "Whole Egg", "unit": "egg", "protein": 6.0, "calories": 72, "fat": 5.0, "carbs": 0.6, "default_serving": 2, "tip": "Whole eggs contain all 9 essential amino acids plus choline for cognitive and metabolic health."},
    "eggs": {"name": "Whole Eggs", "unit": "egg", "protein": 6.0, "calories": 72, "fat": 5.0, "carbs": 0.6, "default_serving": 2, "tip": "Whole eggs contain all 9 essential amino acids plus choline for cognitive and metabolic health."},
    "egg white": {"name": "Egg Whites", "unit": "egg", "protein": 3.6, "calories": 17, "fat": 0.1, "carbs": 0.2, "default_serving": 3, "tip": "Pure lean protein with almost zero fat and calories, great for cutting or hitting protein without calorie surplus."},
    "tofu": {"name": "Tofu (Firm)", "unit": "g", "protein": 8.0, "calories": 76, "fat": 4.8, "carbs": 1.9, "default_serving": 150, "tip": "Plant-based complete protein packed with calcium and iron."},
    "greek yogurt": {"name": "Greek Yogurt", "unit": "g", "protein": 10.0, "calories": 59, "fat": 0.4, "carbs": 3.6, "default_serving": 200, "tip": "High in protein and gut-friendly probiotics. Pair with berries and a dash of honey."},
    "curd": {"name": "Curd / Dahi", "unit": "g", "protein": 3.5, "calories": 60, "fat": 3.1, "carbs": 4.7, "default_serving": 200, "tip": "Good source of calcium and digestion-supporting bacteria."},
    "whey": {"name": "Whey Protein", "unit": "scoop", "protein": 24.0, "calories": 120, "fat": 1.5, "carbs": 2.0, "default_serving": 1, "tip": "Rapidly absorbed, making it optimal within 30-60 minutes after resistance training."},
    "oats": {"name": "Oatmeal", "unit": "g", "protein": 13.0, "calories": 389, "fat": 6.9, "carbs": 66.0, "default_serving": 60, "tip": "Complex carbohydrates with beta-glucan fiber providing steady workout energy."},
    "lentil": {"name": "Cooked Lentils / Dal", "unit": "g", "protein": 9.0, "calories": 116, "fat": 0.4, "carbs": 20.0, "default_serving": 150, "tip": "Great vegetarian protein combined with dietary fiber. Pair with rice to form a complete amino acid profile."},
    "dal": {"name": "Cooked Dal", "unit": "g", "protein": 9.0, "calories": 116, "fat": 0.4, "carbs": 20.0, "default_serving": 150, "tip": "Great vegetarian protein combined with dietary fiber. Pair with rice to form a complete amino acid profile."},
    "chana": {"name": "Cooked Chickpeas (Chana)", "unit": "g", "protein": 8.9, "calories": 164, "fat": 2.6, "carbs": 27.0, "default_serving": 150, "tip": "Nutrient-dense legume providing sustained energy, fiber, and plant protein."},
    "rajma": {"name": "Kidney Beans (Rajma)", "unit": "g", "protein": 8.7, "calories": 127, "fat": 0.5, "carbs": 22.8, "default_serving": 150, "tip": "High-fiber complex carb and protein staple."},
    "fish": {"name": "Fish (White / Tilapia)", "unit": "g", "protein": 22.0, "calories": 110, "fat": 2.0, "carbs": 0.0, "default_serving": 150, "tip": "Lean protein with minimal fat, fast-digesting and easy on the stomach."},
    "salmon": {"name": "Salmon", "unit": "g", "protein": 20.0, "calories": 208, "fat": 13.0, "carbs": 0.0, "default_serving": 150, "tip": "Excellent source of omega-3 fatty acids to reduce joint inflammation and support cardiovascular health."},
    "peanut butter": {"name": "Peanut Butter", "unit": "g", "protein": 25.0, "calories": 588, "fat": 50.0, "carbs": 20.0, "default_serving": 32, "tip": "Calorie-dense healthy fat and protein source; ideal for lean bulking."},
    "milk": {"name": "Cow Milk", "unit": "ml", "protein": 3.4, "calories": 60, "fat": 3.2, "carbs": 4.8, "default_serving": 250, "tip": "Naturally balanced electrolyte and hydration beverage with whey and casein."},
    "almond": {"name": "Almonds", "unit": "g", "protein": 21.0, "calories": 579, "fat": 49.0, "carbs": 22.0, "default_serving": 30, "tip": "Rich in vitamin E and magnesium to aid muscle relaxation and cellular recovery."}
}

class DeterministicCoachProvider(BaseCoachAIProvider):
    def generate_response(
        self,
        user_message: str,
        context: CoachContext,
        intent: str,
        history: List[Dict[str, Any]]
    ) -> CoachResponse:
        reasoning = []
        metrics = {}
        suggested_actions = []
        lower_msg = user_message.lower()

        # Check for specific food inquiries first
        food_match = None
        for key in FOOD_DATABASE:
            if key in lower_msg:
                food_match = FOOD_DATABASE[key]
                break

        if food_match:
            # Extract quantity if specified (e.g., "200 gms", "150g", "2 eggs")
            qty = food_match["default_serving"]
            qty_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:g|gm|gms|gram|grams|scoop|scoops|egg|eggs|ml)?", lower_msg)
            if qty_match:
                try:
                    parsed_qty = float(qty_match.group(1))
                    if 1 <= parsed_qty <= 2000:
                        qty = parsed_qty
                except (ValueError, TypeError):
                    pass

            # Calculate nutritional values
            if food_match["unit"] in ["egg", "scoop"]:
                factor = qty
                display_serving = f"{int(qty)} {food_match['unit'] if qty == 1 else food_match['unit'] + 's'}"
            else:
                factor = qty / 100.0
                display_serving = f"{int(qty) if qty.is_integer() else qty}g"

            pro_val = round(food_match["protein"] * factor, 1)
            cal_val = round(food_match["calories"] * factor)
            fat_val = round(food_match["fat"] * factor, 1)
            carb_val = round(food_match["carbs"] * factor, 1)

            rem_pro = (context.nutrition_remaining or {}).get("protein", 30.0)
            t_pro = (context.nutrition_targets or {}).get("protein", 140)

            metrics = {
                "serving_size": display_serving,
                "protein_g": pro_val,
                "calories_kcal": cal_val,
                "fat_g": fat_val,
                "carbs_g": carb_val,
                "remaining_protein_target": round(rem_pro)
            }

            cover_text = ""
            if rem_pro > 0:
                pct = min(100, round((pro_val / max(rem_pro, 1)) * 100))
                cover_text = f"• **Daily Target Impact:** You currently need **{round(rem_pro)}g more protein** today. This portion covers **{pct}%** of your remaining target!\n"
            else:
                cover_text = "• **Daily Target Impact:** You have already reached your baseline protein target for today. Enjoy this serving for extra recovery!\n"

            msg = (
                f"**Nutrition Breakdown:**\n"
                f"**{display_serving} of {food_match['name']}** contains approximately **{pro_val}g of protein** (~{cal_val} kcal, {fat_val}g fat, {carb_val}g carbs).\n\n"
                f"{cover_text}"
                f"• **Coach's Tip:** {food_match['tip']}"
            )

            reasoning.append(f"{display_serving} {food_match['name']} = {pro_val}g protein and {cal_val} kcal.")
            reasoning.append(f"User remaining daily protein: {round(rem_pro)}g.")

            suggested_actions.append(SuggestedAction(
                type="NUTRITION_RECOMMENDATION",
                label="Log in Nutrition",
                payload={"focus": "high_protein"}
            ))

            return CoachResponse(
                message=msg,
                recommendation_type="nutrition",
                reasoning=reasoning,
                supporting_metrics=metrics,
                suggested_actions=suggested_actions
            )

        # Check for Exercise Form inquiries
        exercise_cues = {
            "squat": (
                "**Squat Technique Cues:**\n"
                "1. **Setup:** Feet shoulder-width apart, toes turned outward 15–30°. Brace your core like you're about to take a punch.\n"
                "2. **Descent:** Initiate by hinging your hips back and knees out simultaneously. Descend until hips are at or below knee level while keeping chest proud.\n"
                "3. **Ascent:** Drive through your mid-foot and heels while exhaling. Keep knees tracking over toes without caving inward."
            ),
            "bench": (
                "**Bench Press Technique Cues:**\n"
                "1. **Setup:** Retract your shoulder blades and pin them firmly against the bench. Keep feet flat on the floor for leg drive.\n"
                "2. **Descent:** Lower the bar with control to your mid-chest, keeping elbows tucked at a ~45–60° angle to protect shoulder joints.\n"
                "3. **Drive:** Press straight up and slightly back toward your eye-line without losing your upper back tightness."
            ),
            "deadlift": (
                "**Deadlift Technique Cues:**\n"
                "1. **Setup:** Stand with bar over mid-foot, shins 1 inch away. Grip outside knees and bring shins forward to touch bar.\n"
                "2. **Brace:** Pull your chest up and lock your lats tight ('squeeze oranges in armpits') to create a neutral, rigid spine.\n"
                "3. **Execution:** Drive through the floor with your legs, keeping the bar close to your body until hips and knees lock out simultaneously."
            ),
            "pushup": (
                "**Push-up Form Cues:**\n"
                "1. **Plank Alignment:** Maintain a straight line from heels to head with glutes and core squeezed.\n"
                "2. **Elbow Position:** Lower your body until chest is an inch off the floor, elbows tracking at a 45° arrow angle.\n"
                "3. **Full Lockout:** Push through your entire palm to reach full extension at the top."
            )
        }

        for ex_key, cues in exercise_cues.items():
            if ex_key in lower_msg:
                reasoning.append(f"Biomechanical alignment cues for {ex_key.title()}.")
                suggested_actions.append(SuggestedAction(
                    type="START_WORKOUT",
                    label=f"Practice {ex_key.title()}",
                    payload={}
                ))
                return CoachResponse(
                    message=cues,
                    recommendation_type="workout",
                    reasoning=reasoning,
                    supporting_metrics={},
                    suggested_actions=suggested_actions
                )

        # Nutrition intents (general, post-workout, pre-workout, remaining macros)
        nutrition_intents = [
            CoachIntent.NUTRITION,
            CoachIntent.MACROS,
            CoachIntent.CALORIES,
            CoachIntent.PROTEIN,
            CoachIntent.POST_WORKOUT_MEAL,
            CoachIntent.PRE_WORKOUT_MEAL,
            CoachIntent.MEAL_PLAN,
            CoachIntent.GENERAL_NUTRITION
        ]
        
        workout_intents = [
            CoachIntent.WORKOUT_PLAN,
            CoachIntent.WORKOUT_EXERCISE,
            CoachIntent.EXERCISE_FORM,
            CoachIntent.RECOVERY,
            CoachIntent.REST,
            CoachIntent.MUSCLE_GAIN,
            CoachIntent.FAT_LOSS
        ]

        if intent in nutrition_intents:
            rem_pro = (context.nutrition_remaining or {}).get("protein", 30.0)
            rem_cal = (context.nutrition_remaining or {}).get("calories", 500)
            rem_fat = (context.nutrition_remaining or {}).get("fat", 15.0)
            
            c_pro = (context.nutrition_consumed or {}).get("protein", 0)
            t_pro = (context.nutrition_targets or {}).get("protein", 140)
            c_cal = (context.nutrition_consumed or {}).get("calories", 0)
            t_cal = (context.nutrition_targets or {}).get("calories", 2000)
            c_fat = (context.nutrition_consumed or {}).get("fat", 0)
            t_fat = (context.nutrition_targets or {}).get("fat", 60)

            metrics = {
                "protein_consumed": c_pro,
                "protein_target": t_pro,
                "calories_consumed": c_cal,
                "calories_target": t_cal,
                "fat_consumed": c_fat,
                "fat_target": t_fat
            }
            
            if intent == CoachIntent.POST_WORKOUT_MEAL:
                msg = (
                    "**Post-Workout Solution:**\n"
                    "Consume a fast-digesting protein paired with carbohydrates within 45–60 minutes post-training.\n\n"
                    "• **Option 1 (Quick):** Whey protein shake (25–30g protein) + 1 banana.\n"
                    "• **Option 2 (Whole Food):** 150g grilled chicken breast or 200g paneer/tofu + 1 cup rice + veggies.\n"
                    f"• **Remaining Target:** You currently need {round(rem_pro)}g more protein today."
                )
                reasoning.append("High protein + carbs accelerate muscle protein synthesis and glycogen replenishment.")
                suggested_actions.append(SuggestedAction(
                    type="NUTRITION_RECOMMENDATION",
                    label="Log Meal in Nutrition",
                    payload={"focus": "high_protein"}
                ))
            elif intent == CoachIntent.PRE_WORKOUT_MEAL:
                msg = (
                    "**Pre-Workout Solution:**\n"
                    "Eat an easily digestible meal 1–2 hours before training to maximize workout energy and stamina.\n\n"
                    "• **Ideal Choice:** Oatmeal with 1 scoop protein powder, or 2 slices of whole grain toast with peanut butter & sliced banana.\n"
                    "• **Hydration:** Drink 400–500ml water beforehand."
                )
                reasoning.append("Complex carbs provide sustained glucose without gastrointestinal distress.")
                suggested_actions.append(SuggestedAction(
                    type="NUTRITION_RECOMMENDATION",
                    label="View Meal Options",
                    payload={"focus": "balanced"}
                ))
            elif rem_pro > 15:
                # Provide tailored recommendations based on dietary preference
                diet = (context.dietary_preference or "non_vegetarian").lower()
                if "veg" in diet and "non" not in diet:
                    options_str = (
                        "• **Paneer or Tofu:** 200g provides ~36g protein and healthy fats.\n"
                        "• **Greek Yogurt:** 200g with seeds or honey gives ~20g protein.\n"
                        "• **Sprouts / Dal:** 1 cup cooked lentils or chickpeas provides ~15-18g protein."
                    )
                else:
                    options_str = (
                        "• **Lean Poultry:** 150g grilled chicken breast provides ~45g pure protein.\n"
                        "• **Eggs / Egg Whites:** 3 whole eggs or 4-5 egg whites deliver ~18-20g protein.\n"
                        "• **Paneer or Greek Yogurt:** 200g portion provides ~20-36g protein."
                    )

                msg = (
                    f"**Protein Goal Guidance:**\n"
                    f"You have consumed {round(c_pro)}g of protein and need **{round(rem_pro)}g more** to hit your daily goal of {round(t_pro)}g.\n\n"
                    f"**Top High-Protein Options for Your Diet ({context.dietary_preference.title()}):**\n"
                    f"{options_str}"
                )
                reasoning.append(f"Protein is {round(rem_pro)}g behind target.")
                reasoning.append(f"Dietary preference: {context.dietary_preference}")
                suggested_actions.append(SuggestedAction(
                    type="NUTRITION_RECOMMENDATION",
                    label="Find High-Protein Meal",
                    payload={"focus": "high_protein"}
                ))
            else:
                progress_cal = (context.nutrition_progress or {}).get("calories", 0)
                msg = (
                    f"**Macro Status:**\n"
                    f"You have reached {round(progress_cal)}% of your daily calorie target with solid protein intake ({round(c_pro)}g).\n\n"
                    "Keep up this consistency! Stay hydrated with at least 2.5–3 liters of water throughout the remainder of the day."
                )
                reasoning.append("Macronutrient distribution is on target for your goal.")
                suggested_actions.append(SuggestedAction(
                    type="NUTRITION_RECOMMENDATION",
                    label="Explore Daily Meals",
                    payload={"focus": "balanced"}
                ))
                
            return CoachResponse(
                message=msg,
                recommendation_type="nutrition",
                reasoning=reasoning,
                supporting_metrics=metrics,
                suggested_actions=suggested_actions
            )
            
        elif intent in workout_intents:
            today_prefix = datetime_today_prefix()
            completed_today = any(
                s.get("status") == "completed" and s.get("completed_at") and str(s["completed_at"]).startswith(today_prefix)
                for s in (context.recent_workout_sessions or [])
            )
            
            consistency_pct = int((context.weekly_workout_consistency or 0) * 100)
            completed_count = context.completed_sessions_count_last_7_days or 0
            
            metrics = {
                "workouts_completed_this_week": completed_count,
                "weekly_workout_consistency_percent": consistency_pct
            }
            
            goal_label = context.fitness_goal.replace("_", " ").title()
            level_label = context.fitness_level.title()
            
            if completed_today:
                msg = (
                    "**Workout Complete for Today!** 🎉\n"
                    "You have already completed a session today. Excellent dedication!\n\n"
                    "**Next Steps:**\n"
                    "1. Hydrate and consume a post-workout recovery meal within 1 hour.\n"
                    "2. Aim for 7–8 hours of quality sleep for muscle repair.\n"
                    "3. Perform 5–10 minutes of light mobility or foam rolling to minimize DOMS."
                )
                reasoning.append("Workout session already recorded for today.")
                suggested_actions.append(SuggestedAction(
                    type="VIEW_PROGRESS",
                    label="View My Progress"
                ))
            else:
                msg = (
                    f"**Workout Plan for Today ({goal_label} — {level_label}):**\n"
                    "Here is an efficient session to maintain your momentum:\n\n"
                    "• **Warm-up (5 min):** Arm circles, leg swings, and bodyweight squats.\n"
                    "• **Main Routine (25–30 min):** Targeted compound movements focusing on proper form and controlled tempo.\n"
                    "• **Cool-down (5 min):** Static stretching for hamstrings, quads, and shoulders.\n\n"
                    "Click below to launch today's scheduled interactive workout session with real-time pose tracking!"
                )
                reasoning.append("No workouts logged yet today.")
                reasoning.append(f"User Goal: {goal_label}, Level: {level_label}")
                suggested_actions.append(SuggestedAction(
                    type="START_WORKOUT",
                    label="Start Today's Workout",
                    payload={}
                ))
                
            return CoachResponse(
                message=msg,
                recommendation_type="workout",
                reasoning=reasoning,
                supporting_metrics=metrics,
                suggested_actions=suggested_actions
            )
            
        elif intent in [CoachIntent.PROGRESS_ANALYSIS, CoachIntent.WEIGHT_GOAL]:
            score = context.fitness_score or 50
            percentile = context.fitness_score_percentile or "Active"
            breakdown = context.fitness_score_breakdown or {"workout_consistency": 20, "nutrition_adherence": 15}
            
            metrics = {
                "fitness_score": score,
                "percentile": percentile,
                "workout_score": breakdown.get("workout_consistency", 0),
                "nutrition_score": breakdown.get("nutrition_adherence", 0)
            }
            
            msg = (
                f"**Progress Analysis & Solution:**\n"
                f"Your FitAssist Fitness Score is **{score}/100** ({percentile} group).\n\n"
                f"• **Workout Consistency Score:** {breakdown.get('workout_consistency', 0)}/40 pts\n"
                f"• **Nutrition Adherence Score:** {breakdown.get('nutrition_adherence', 0)}/20 pts\n\n"
                "**Efficient Strategy to Boost Results:**\n"
                "1. Complete at least 3–4 workout sessions per week.\n"
                "2. Hit your daily protein goal to accelerate muscle retention.\n"
                "3. Log your weight consistently every morning for accurate trendlines."
            )
            reasoning.append(f"Overall Fitness Score: {score}/100")
            reasoning.append(f"Percentile tier: {percentile}")
            
            suggested_actions.append(SuggestedAction(
                type="VIEW_PROGRESS",
                label="Explore Progress Charts"
            ))
            
            return CoachResponse(
                message=msg,
                recommendation_type="progress",
                reasoning=reasoning,
                supporting_metrics=metrics,
                suggested_actions=suggested_actions
            )
            
        else:
            goal_str = context.fitness_goal.replace('_', ' ').title()
            msg = (
                f"Hello! I am your **FitAssist AI Coach**, configured for your **{goal_str}** goal ({context.fitness_level.title()} level).\n\n"
                "How can I assist you with an efficient fitness solution right now?\n"
                "• **Workouts:** Ask for a personalized routine or exercise form guidance.\n"
                "• **Nutrition:** Ask what to eat next, pre/post workout meals, or daily macros.\n"
                "• **Progress:** Analyze your weekly consistency and fitness score."
            )
            reasoning.append(f"Goal: {context.fitness_goal}")
            reasoning.append(f"Level: {context.fitness_level}")
            
            suggested_actions.append(SuggestedAction(
                type="NUTRITION_RECOMMENDATION",
                label="What Should I Eat Next?"
            ))
            suggested_actions.append(SuggestedAction(
                type="START_WORKOUT",
                label="Start Today's Workout",
                payload={}
            ))
            
            return CoachResponse(
                message=msg,
                recommendation_type="general",
                reasoning=reasoning,
                supporting_metrics={},
                suggested_actions=suggested_actions
            )

def datetime_today_prefix() -> str:
    from zoneinfo import ZoneInfo
    from datetime import datetime
    return datetime.now(ZoneInfo("Asia/Kolkata")).date().isoformat()
