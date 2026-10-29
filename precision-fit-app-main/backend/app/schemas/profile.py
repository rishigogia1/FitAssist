from pydantic import BaseModel, ConfigDict, Field
from enum import Enum
from typing import Optional

class FitnessGoal(str, Enum):
    weight_loss = "weight_loss"
    muscle_gain = "muscle_gain"
    endurance = "endurance"
    general_fitness = "general_fitness"

class FitnessLevel(str, Enum):
    beginner = "beginner"
    intermediate = "intermediate"
    advanced = "advanced"

class ProfileBase(BaseModel):
    age: Optional[int] = Field(None, description="Age in years. 0 or None means incomplete.")
    weight: Optional[float] = Field(None, description="Weight in kg. 0 or None means incomplete.")
    height: Optional[float] = Field(None, gt=0, description="Height in cm")
    sex: Optional[str] = Field(None, description="male, female, or other")
    fitness_goal: Optional[FitnessGoal] = None
    fitness_level: Optional[FitnessLevel] = None

class ProfileCreate(ProfileBase):
    pass

class ProfileUpdate(ProfileBase):
    pass

class ProfileResponse(ProfileBase):
    id: int
    user_id: str
    profile_completed: bool = True

    model_config = ConfigDict(from_attributes=True)
