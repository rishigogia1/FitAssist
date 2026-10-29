import json
import logging
import re
from typing import List, Dict, Any, Optional
import google.generativeai as genai

from app.config import settings
from app.services.coach.providers.base import BaseCoachAIProvider
from app.services.coach.providers.deterministic import DeterministicCoachProvider
from app.services.coach.context_builder import CoachContext
from app.schemas.coach import CoachResponse, SuggestedAction

logger = logging.getLogger(__name__)

# List of supported models in priority order
CANDIDATE_MODELS = [
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-flash-latest",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-pro-latest"
]

class GeminiCoachProvider(BaseCoachAIProvider):
    def __init__(self):
        self.fallback_provider = DeterministicCoachProvider()
        self.api_key = settings.GEMINI_API_KEY
        if self.api_key:
            genai.configure(api_key=self.api_key)
            logger.info("Gemini API configured successfully.")
        else:
            logger.warning("Gemini API key is not configured. Fallback deterministic provider will be used.")

    def generate_response(
        self,
        user_message: str,
        context: CoachContext,
        intent: str,
        history: List[Dict[str, Any]]
    ) -> CoachResponse:
        if not self.api_key:
            logger.info("Using fallback provider due to missing Gemini API key.")
            return self.fallback_provider.generate_response(user_message, context, intent, history)
            
        try:
            # Build history text
            history_lines = []
            for msg in history:
                role = "User" if msg["role"] == "user" else "Coach"
                history_lines.append(f"{role}: {msg['message']}")
            history_text = "\n".join(history_lines)

            # Build system prompt grounding
            system_instruction = (
                "You are FitAssist Coach, an elite personal AI fitness, nutrition, and recovery coach.\n"
                "Your goal is to provide a direct, highly personalized, and concrete answer to every user query.\n\n"
                "CRITICAL COACHING RULES:\n"
                "1. DIRECT & SPECIFIC ANSWER: Always answer the user's specific question directly in the very first sentence. "
                "For example, if they ask 'how many grams of protein does 200 gms of paneer contain', state clearly: "
                "'200g of paneer contains approximately 36 to 40 grams of protein (~530 kcal, 40g fat, 6g carbs).' "
                "Never ignore their specific food, quantity, or question, and never return a generic template that doesn't answer their question.\n"
                "2. GROUNDED IN THEIR PERSONAL LOGS: Explicitly connect your answer to the user's current progress. "
                "For example, tell them how many grams of protein they have left today, and how this food or workout moves them toward that target.\n"
                "3. PRACTICAL & ACTIONABLE: Provide actionable execution tips (e.g. preparation ideas, healthy pairings, exercise cues, or timing).\n"
                "4. SUGGESTED ACTIONS: Suggest 1-2 relevant actions (e.g. 'START_WORKOUT', 'NUTRITION_RECOMMENDATION', 'VIEW_PROGRESS').\n"
                "5. STRICT JSON OUTPUT: Return ONLY a valid JSON object matching this schema:\n"
                "{\n"
                "  \"message\": \"Direct answer to their question followed by clear bullet points on how it fits their day and practical tips.\",\n"
                "  \"recommendation_type\": \"nutrition\" or \"workout\" or \"progress\" or \"general\",\n"
                "  \"reasoning\": [\"Clear reason 1\", \"Clear reason 2\"],\n"
                "  \"supporting_metrics\": {\"key\": value},\n"
                "  \"suggested_actions\": [\n"
                "    {\"type\": \"NUTRITION_RECOMMENDATION\", \"label\": \"Log in Nutrition\", \"payload\": {\"focus\": \"high_protein\"}}\n"
                "  ]\n"
                "}\n\n"
                f"--- USER PROFILE & CONTEXT ---\n"
                f"- Fitness Goal: {context.fitness_goal.replace('_', ' ').title()}\n"
                f"- Fitness Level: {context.fitness_level.title()}\n"
                f"- Dietary Preference: {context.dietary_preference.title()}\n"
                f"- Allergies: {', '.join(context.allergies) if context.allergies else 'None'}\n"
            )
            
            if context.nutrition_targets is not None and context.nutrition_consumed is not None:
                rem_cals = (context.nutrition_remaining or {}).get("calories", 0)
                rem_pro = (context.nutrition_remaining or {}).get("protein", 0)
                system_instruction += (
                    f"\n--- TODAY'S NUTRITION LOGS ---\n"
                    f"- Protein: {context.nutrition_consumed.get('protein', 0)}g consumed / {context.nutrition_targets.get('protein', 140)}g target ({rem_pro}g remaining)\n"
                    f"- Calories: {context.nutrition_consumed.get('calories', 0)} consumed / {context.nutrition_targets.get('calories', 2000)} target ({rem_cals} remaining)\n"
                    f"- Carbs: {context.nutrition_consumed.get('carbs', 0)}g consumed / {context.nutrition_targets.get('carbs', 200)}g target\n"
                    f"- Fat: {context.nutrition_consumed.get('fat', 0)}g consumed / {context.nutrition_targets.get('fat', 60)}g target\n"
                    f"- Meals logged today: {context.logged_meals_count or 0}\n"
                )
            
            if context.fitness_score is not None:
                system_instruction += (
                    f"\n--- WORKOUT & CONSISTENCY STATUS ---\n"
                    f"- Workouts completed in last 7 days: {context.completed_sessions_count_last_7_days or 0}\n"
                    f"- Fitness Score: {context.fitness_score}/100 ({context.fitness_score_percentile or 'Active'})\n"
                    f"- Weekly Consistency: {int((context.weekly_workout_consistency or 0) * 100)}%\n"
                )

            prompt_content = ""
            if history_text:
                prompt_content += f"Conversation history:\n{history_text}\n\n"
            prompt_content += f"User: {user_message}\nCoach:"

            # Try candidate models in resilient priority order
            response = None
            last_err = None
            for model_name in CANDIDATE_MODELS:
                try:
                    model = genai.GenerativeModel(model_name, system_instruction=system_instruction)
                    res = model.generate_content(
                        prompt_content,
                        generation_config={
                            "response_mime_type": "application/json",
                            "temperature": 0.3
                        }
                    )
                    if res and res.text and res.text.strip():
                        response = res
                        logger.info(f"Successfully generated response using model '{model_name}'")
                        break
                except Exception as err:
                    last_err = err
                    logger.warning(f"Model '{model_name}' failed: {err}. Trying next candidate...")
                    continue

            if not response or not response.text:
                raise RuntimeError(f"All Gemini candidate models failed. Last error: {last_err}")

            raw_text = response.text.strip()
            # Clean possible markdown block wrappers
            if raw_text.startswith("```json"):
                raw_text = raw_text[7:]
            elif raw_text.startswith("```"):
                raw_text = raw_text[3:]
            if raw_text.endswith("```"):
                raw_text = raw_text[:-3]
            raw_text = raw_text.strip()

            data = json.loads(raw_text)

            # Robust normalizations
            raw_reasoning = data.get("reasoning", [])
            if isinstance(raw_reasoning, str):
                reasoning = [raw_reasoning]
            elif isinstance(raw_reasoning, list):
                reasoning = [str(r) for r in raw_reasoning]
            else:
                reasoning = []

            raw_metrics = data.get("supporting_metrics", {})
            metrics = raw_metrics if isinstance(raw_metrics, dict) else {}

            actions = []
            for act in data.get("suggested_actions", []):
                if isinstance(act, dict):
                    actions.append(SuggestedAction(
                        type=str(act.get("type", "general")),
                        label=str(act.get("label", "Click Here")),
                        payload=act.get("payload") if isinstance(act.get("payload"), dict) else {}
                    ))
                elif isinstance(act, str):
                    actions.append(SuggestedAction(
                        type="general",
                        label=act[:35],
                        payload={}
                    ))
                
            return CoachResponse(
                message=data.get("message", "Here is my advice based on your goals and fitness metrics."),
                recommendation_type=data.get("recommendation_type", "nutrition" if "nutrition" in intent.lower() else "general"),
                reasoning=reasoning,
                supporting_metrics=metrics,
                suggested_actions=actions
            )
            
        except Exception as e:
            logger.error(f"Error during Gemini generation: {str(e)}. Falling back to deterministic provider.")
            return self.fallback_provider.generate_response(user_message, context, intent, history)
