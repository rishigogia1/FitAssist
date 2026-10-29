from app.services.slm.base import SLMAdapter

class RecommendationService:
    def __init__(self, slm_adapter: SLMAdapter):
        self.slm_adapter = slm_adapter

    def generate_workout_plan(self, user_profile: dict) -> dict:
        # We pass the profile dict to the SLM adapter to get a generated plan
        return self.slm_adapter.generate_workout_plan(user_profile)
