import time
from typing import List
from app.services.nutrition.providers.base import BaseNutritionAIProvider
from app.schemas.nutrition_ai import NutritionModelContext, NutritionAIResponse, MealReplacementRequest, AIMealRecommendation, NutritionInsight
from app.services.nutrition.providers.deterministic import DeterministicNutritionProvider

class QuantizedSLMNutritionProvider(BaseNutritionAIProvider):
    """
    Adapter for the Quantized SLM.
    Currently mocked to simulate AI reasoning based on the context.
    """
    def __init__(self):
        # We use deterministic provider just to fetch valid meal data from the db for mocking purposes
        self.fallback = DeterministicNutritionProvider()

    def generate_recommendations(self, context: NutritionModelContext) -> NutritionAIResponse:
        time.sleep(1) # Simulate inference delay
        
        # Determine remaining macros
        remaining_cals = context.today_targets.calories - context.today_consumed.calories
        remaining_protein = context.today_targets.protein - context.today_consumed.protein
        
        insights = []
        
        # Adaptive logic simulation
        if remaining_protein > 0 and (context.today_consumed.protein / max(1, context.today_targets.protein)) < 0.4 and context.today_consumed.calories > 0:
            reason = "Your protein intake is currently below target while your calories are progressing. This meal prioritizes protein."
            insight_content = f"Your protein intake ({context.today_consumed.protein}g) is low relative to your target ({context.today_targets.protein}g). Consider high-protein meals."
            focus = "high_protein"
        else:
            reason = "This meal balances your remaining macros based on your daily targets."
            insight_content = "Your macro intake is on track. Keep it up!"
            focus = "balanced"
            
        insights.append(NutritionInsight(content=insight_content, insight_type="daily_adaptive"))
        
        # Fetch deterministic meals and tweak them to simulate SLM adaptation
        base_response = self.fallback.generate_recommendations(context)
        
        recs = []
        for rec in base_response.recommendations:
            if focus == "high_protein":
                rec.name = "High Protein " + rec.name
                rec.protein_g += 20
                rec.calories += 80
            rec.reason = reason
            recs.append(rec)
            
        return NutritionAIResponse(
            insights=insights,
            recommendations=recs,
            meal_replacements=[],
            provider="quantized_slm",
            fallback_used=False
        )

    def generate_meal_replacement(self, context: NutritionModelContext, request: MealReplacementRequest) -> NutritionAIResponse:
        time.sleep(0.3) # Simulate inference
        
        base_response = self.fallback.generate_meal_replacement(context, request)
        
        recs = []
        for rec in base_response.meal_replacements:
            # Add SLM reasoning enhancement
            norm_reason = request.reason.lower()
            if "protein" in norm_reason:
                rec.reason = f"AI selected a higher-protein alternative ({rec.protein_g}g protein) tailored to your goal."
            elif "calorie" in norm_reason:
                rec.reason = f"AI selected a lighter alternative ({rec.calories} kcal) to optimize your daily energy balance."
            elif "ingredient" in norm_reason:
                rec.reason = f"AI selected a fresh recipe avoiding your disliked ingredients."
            elif "prep" in norm_reason or "long" in norm_reason:
                rec.reason = f"AI selected a fast-prep meal ready in ~{rec.prep_time or 15} minutes."
            else:
                rec.reason = f"AI selected a diverse recipe matching your dietary profile."
            recs.append(rec)
            
        return NutritionAIResponse(
            insights=[],
            recommendations=[],
            meal_replacements=recs,
            provider="quantized_slm",
            fallback_used=False
        )

