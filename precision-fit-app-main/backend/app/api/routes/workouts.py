from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.models.user_profile import UserProfile
from app.schemas.workout import WorkoutRecommendationResponse
from app.auth.dependencies import get_current_user
from app.services.workout_service import WorkoutService

router = APIRouter()

# Instantiate the service (which uses the profile-based provider by default)
workout_service = WorkoutService()

@router.get("", response_model=WorkoutRecommendationResponse)
def get_workouts(
    current_user: dict = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    user_id = current_user["user_id"]
    
    # 1. Retrieve the user's profile
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Profile not found. Please complete onboarding first."
        )
    
    # 2. Get personalized recommendations using the service
    response = workout_service.get_personalized_recommendations(profile)
    
    return response
