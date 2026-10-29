from abc import ABC, abstractmethod

class SLMAdapter(ABC):
    @abstractmethod
    def generate_workout_plan(self, user_profile: dict) -> dict:
        pass
