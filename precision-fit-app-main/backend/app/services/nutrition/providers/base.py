from abc import ABC, abstractmethod
from typing import Optional
from app.schemas.nutrition_ai import NutritionModelContext, NutritionAIResponse, MealReplacementRequest

class BaseNutritionAIProvider(ABC):
    """
    Abstract base class for nutrition AI providers.
    """
    
    @abstractmethod
    def generate_recommendations(self, context: NutritionModelContext) -> NutritionAIResponse:
        """
        Generate daily nutrition recommendations and insights based on the given context.
        """
        pass
        
    @abstractmethod
    def generate_meal_replacement(self, context: NutritionModelContext, request: MealReplacementRequest) -> NutritionAIResponse:
        """
        Generate a specific meal replacement based on the given context and user reason.
        """
        pass
