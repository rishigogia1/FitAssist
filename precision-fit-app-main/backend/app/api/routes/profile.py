from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.models.user_profile import UserProfile
from app.schemas.profile import ProfileCreate, ProfileUpdate, ProfileResponse
from app.auth.dependencies import get_current_user

router = APIRouter()

@router.get("", response_model=ProfileResponse)
def get_profile(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    user_id = current_user["user_id"]
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if not profile:
        # In a real app we might return 404, but to match the frontend expectations,
        # we can either return 404 or a JSON saying profile_completed: False.
        # Let's return 404, and the frontend can catch it and know to redirect to onboarding.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    
    response_data = profile.__dict__.copy()
    
    # Calculate profile completion dynamically
    is_completed = bool(
        profile.age and profile.age > 0 and 
        profile.weight and profile.weight > 0 and
        profile.height and profile.height > 0 and
        profile.fitness_goal and profile.fitness_level
    )
    
    response_data["profile_completed"] = is_completed
    return ProfileResponse.model_validate(response_data)

@router.post("", response_model=ProfileResponse, status_code=status.HTTP_201_CREATED)
def create_profile(profile_in: ProfileCreate, current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    user_id = current_user["user_id"]
    
    existing = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Profile already exists. Use PUT to update.")
        
    new_profile = UserProfile(
        user_id=user_id,
        age=profile_in.age,
        weight=profile_in.weight,
        height=profile_in.height,
        fitness_goal=profile_in.fitness_goal.value,
        fitness_level=profile_in.fitness_level.value
    )
    db.add(new_profile)
    db.commit()
    db.refresh(new_profile)
    
    response_data = new_profile.__dict__.copy()
    
    # Calculate profile completion dynamically
    is_completed = bool(
        new_profile.age and new_profile.age > 0 and 
        new_profile.weight and new_profile.weight > 0 and
        new_profile.height and new_profile.height > 0 and
        new_profile.fitness_goal and new_profile.fitness_level
    )
    
    response_data["profile_completed"] = is_completed
    return ProfileResponse.model_validate(response_data)

@router.put("", response_model=ProfileResponse)
def update_profile(profile_in: ProfileUpdate, current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    user_id = current_user["user_id"]
    
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
        
    profile.age = profile_in.age
    profile.weight = profile_in.weight
    profile.height = profile_in.height
    profile.fitness_goal = profile_in.fitness_goal.value
    profile.fitness_level = profile_in.fitness_level.value
    
    db.commit()
    db.refresh(profile)
    
    response_data = profile.__dict__.copy()
    
    # Calculate profile completion dynamically
    is_completed = bool(
        profile.age and profile.age > 0 and 
        profile.weight and profile.weight > 0 and
        profile.height and profile.height > 0 and
        profile.fitness_goal and profile.fitness_level
    )
    
    response_data["profile_completed"] = is_completed
    return ProfileResponse.model_validate(response_data)
