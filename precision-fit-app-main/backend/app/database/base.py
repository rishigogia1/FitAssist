from app.database.connection import Base
# Import all models here so Alembic can discover them
from app.models.user_profile import UserProfile
from app.models.workout_recommendation import WorkoutRecommendation
from app.models.nutrition_preferences import NutritionPreferences
from app.models.nutrition_log import NutritionLog
from app.models.nutrition_feedback import NutritionFeedback
from app.models.nutrition_insight import NutritionInsight
from app.models.daily_meal_plan import DailyMealPlan
from app.models.workout_session import WorkoutSession
from app.models.scheduled_workout import ScheduledWorkout
from app.models.coach_conversation import CoachConversation
from app.models.weight_log import WeightLog
from app.models.user_achievement import UserAchievement
from app.models.daily_step_log import DailyStepLog
