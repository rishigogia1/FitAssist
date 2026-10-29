from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.models.user_profile import UserProfile
from app.models.workout_recommendation import WorkoutRecommendation
from app.schemas.recommendation import RecommendationResponse, WorkoutPlanData
from app.auth.dependencies import get_current_user
from app.services.recommendation_service import RecommendationService
from app.services.slm.mock_adapter import MockSLMAdapter

router = APIRouter()

# Instantiate the service with the mock adapter for now
# This can be swapped out via dependency injection later
slm_adapter = MockSLMAdapter()
recommendation_service = RecommendationService(slm_adapter)

@router.post("/generate", response_model=RecommendationResponse)
def generate_recommendation(
    current_user: dict = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    user_id = current_user["user_id"]
    
    # 1. Retrieve the user's profile
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found. Complete onboarding first.")
        
    # 2. Convert profile to dict
    profile_dict = {
        "age": profile.age,
        "weight": profile.weight,
        "fitness_goal": profile.fitness_goal,
        "fitness_level": profile.fitness_level
    }
    
    # 3. Generate recommendation via service
    plan_dict = recommendation_service.generate_workout_plan(profile_dict)
    
    # 4. Validate output
    try:
        validated_plan = WorkoutPlanData(**plan_dict)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to validate SLM output: {str(e)}")
        
    # 5. Store recommendation
    new_recommendation = WorkoutRecommendation(
        user_id=user_id,
        profile_id=profile.id,
        plan_data=validated_plan.model_dump(),
        model_name="mock_slm"
    )
    db.add(new_recommendation)
    db.commit()
    db.refresh(new_recommendation)
    
    return new_recommendation

@router.get("/", response_model=RecommendationResponse)
def get_recommendation(
    current_user: dict = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    user_id = current_user["user_id"]
    recommendation = db.query(WorkoutRecommendation).filter(
        WorkoutRecommendation.user_id == user_id
    ).order_by(WorkoutRecommendation.created_at.desc()).first()
    
    if not recommendation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No recommendation found")
        
    return recommendation
