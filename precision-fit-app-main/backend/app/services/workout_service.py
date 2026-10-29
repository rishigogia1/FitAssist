from typing import List
from app.models.user_profile import UserProfile
from app.schemas.profile import FitnessGoal, FitnessLevel
from app.schemas.workout import Workout, Exercise, WorkoutRecommendationResponse, PersonalizedFor
import random

# --- Curated Static Workout Library ---
# We define a master list of workouts categorized by intended goal/level.
# This serves as our deterministic database for the ProfileBasedWorkoutProvider.

STATIC_WORKOUTS = [
    # --- WEIGHT LOSS ---
    # Beginner
    Workout(
        id="wl-beg-1", name="Beginner Fat Burn", category="Cardio", difficulty=FitnessLevel.beginner,
        focus="Full Body", duration_minutes=20, estimated_calories=180,
        description="A gentle introduction to cardio conditioning.",
        exercises=[Exercise(name="Walking in place", sets=1, reps="5 mins", rest_seconds=0), Exercise(name="Step Jacks", sets=3, reps="20", rest_seconds=45)]
    ),
    Workout(
        id="wl-beg-2", name="Low Impact Cardio", category="Cardio", difficulty=FitnessLevel.beginner,
        focus="Lower Body", duration_minutes=25, estimated_calories=200,
        description="Burn calories without stressing your joints.",
        exercises=[Exercise(name="Bodyweight Squats", sets=3, reps="12", rest_seconds=60), Exercise(name="Glute Bridges", sets=3, reps="15", rest_seconds=60)]
    ),
    Workout(
        id="wl-beg-3", name="Light Strength Circuit", category="Strength", difficulty=FitnessLevel.beginner,
        focus="Full Body", duration_minutes=30, estimated_calories=220,
        description="Build basic strength to boost metabolism.",
        exercises=[Exercise(name="Wall Pushups", sets=3, reps="10", rest_seconds=60), Exercise(name="Lunges", sets=3, reps="10 per leg", rest_seconds=60)]
    ),
    
    # Intermediate
    Workout(
        id="wl-int-1", name="HIIT Cardio Burn", category="HIIT", difficulty=FitnessLevel.intermediate,
        focus="Full Body", duration_minutes=25, estimated_calories=310,
        description="A moderate-to-high intensity conditioning session.",
        exercises=[Exercise(name="Jumping Jacks", sets=4, reps="30", rest_seconds=30), Exercise(name="Burpees", sets=4, reps="10", rest_seconds=45)]
    ),
    Workout(
        id="wl-int-2", name="Metabolic Circuit", category="Strength", difficulty=FitnessLevel.intermediate,
        focus="Full Body", duration_minutes=40, estimated_calories=400,
        description="High pace strength training for maximum fat loss.",
        exercises=[Exercise(name="Dumbbell Thrusters", sets=4, reps="12", rest_seconds=45), Exercise(name="Renegade Rows", sets=4, reps="10 per arm", rest_seconds=45)]
    ),
    Workout(
        id="wl-int-3", name="Core & Cardio", category="Cardio", difficulty=FitnessLevel.intermediate,
        focus="Core", duration_minutes=30, estimated_calories=280,
        description="Shred your core while keeping the heart rate up.",
        exercises=[Exercise(name="Mountain Climbers", sets=4, reps="40", rest_seconds=30), Exercise(name="Plank", sets=4, reps="60 sec", rest_seconds=30)]
    ),

    # Advanced
    Workout(
        id="wl-adv-1", name="Advanced HIIT", category="HIIT", difficulty=FitnessLevel.advanced,
        focus="Full Body", duration_minutes=35, estimated_calories=500,
        description="Push your limits with high-intensity intervals.",
        exercises=[Exercise(name="Box Jumps", sets=5, reps="15", rest_seconds=30), Exercise(name="Sprint Intervals", sets=8, reps="30 sec", rest_seconds=30)]
    ),
    Workout(
        id="wl-adv-2", name="Advanced Conditioning", category="Strength", difficulty=FitnessLevel.advanced,
        focus="Full Body", duration_minutes=45, estimated_calories=600,
        description="Grueling conditioning circuit.",
        exercises=[Exercise(name="Kettlebell Swings", sets=5, reps="20", rest_seconds=30), Exercise(name="Thrusters", sets=5, reps="15", rest_seconds=30)]
    ),

    # --- MUSCLE GAIN ---
    # Beginner
    Workout(
        id="mg-beg-1", name="Beginner Full Body Strength", category="Strength", difficulty=FitnessLevel.beginner,
        focus="Full Body", duration_minutes=40, estimated_calories=250,
        description="Learn the fundamental compound movements.",
        exercises=[Exercise(name="Goblet Squats", sets=3, reps="10", rest_seconds=90), Exercise(name="Dumbbell Bench Press", sets=3, reps="10", rest_seconds=90)]
    ),
    Workout(
        id="mg-beg-2", name="Beginner Upper Body", category="Strength", difficulty=FitnessLevel.beginner,
        focus="Upper Body", duration_minutes=35, estimated_calories=200,
        description="Build a foundation of upper body strength.",
        exercises=[Exercise(name="Pushups (Knees if needed)", sets=3, reps="8-12", rest_seconds=90), Exercise(name="Dumbbell Rows", sets=3, reps="10", rest_seconds=90)]
    ),

    # Intermediate
    Workout(
        id="mg-int-1", name="Upper Body Strength", category="Strength", difficulty=FitnessLevel.intermediate,
        focus="Chest · Back · Arms", duration_minutes=45, estimated_calories=350,
        description="Targeted upper body hypertrophy.",
        exercises=[Exercise(name="Barbell Bench Press", sets=4, reps="8", rest_seconds=90), Exercise(name="Pull-ups", sets=4, reps="AMRAP", rest_seconds=90)]
    ),
    Workout(
        id="mg-int-2", name="Lower Body Hypertrophy", category="Strength", difficulty=FitnessLevel.intermediate,
        focus="Legs · Glutes", duration_minutes=50, estimated_calories=400,
        description="Build leg size and strength.",
        exercises=[Exercise(name="Barbell Squat", sets=4, reps="8", rest_seconds=90), Exercise(name="Romanian Deadlift", sets=4, reps="10", rest_seconds=90)]
    ),
    Workout(
        id="mg-int-3", name="Push Day", category="Strength", difficulty=FitnessLevel.intermediate,
        focus="Chest · Shoulders · Triceps", duration_minutes=45, estimated_calories=360,
        description="Focus on pushing movements.",
        exercises=[Exercise(name="Overhead Press", sets=4, reps="8", rest_seconds=90), Exercise(name="Incline DB Press", sets=3, reps="10", rest_seconds=90)]
    ),

    # Advanced
    Workout(
        id="mg-adv-1", name="Push Day Volume", category="Strength", difficulty=FitnessLevel.advanced,
        focus="Chest · Shoulders", duration_minutes=55, estimated_calories=460,
        equipment="Barbell, Bench, Dip Station",
        description="High volume push day for maximum hypertrophy.",
        exercises=[
            Exercise(
                name="Barbell Bench Press",
                sets=5,
                reps="5",
                rest_seconds=120,
                target_muscles="Chest, Triceps, Anterior Deltoids",
                equipment="Barbell, Flat Bench",
                instructions="Lie flat on the bench with feet planted firmly. Grip the bar slightly wider than shoulder width. Lower the bar under control to your mid-chest, pause briefly, then press forcefully back to full extension.",
                form_tips="Keep your shoulder blades pinched together and avoid flaring elbows past 75 degrees."
            ),
            Exercise(
                name="Weighted Dips",
                sets=4,
                reps="8",
                rest_seconds=90,
                target_muscles="Lower Chest, Triceps, Anterior Deltoids",
                equipment="Dip Station, Dip Belt",
                instructions="Mount the dip bars and lean torso slightly forward (15-20 degrees). Lower until elbows reach a 90-degree bend, then press up powerfully to return to the starting position.",
                form_tips="Keep your core tight and shoulders depressed down away from your ears throughout the movement."
            )
        ]
    ),
    Workout(
        id="mg-adv-2", name="Advanced Compound Strength", category="Strength", difficulty=FitnessLevel.advanced,
        focus="Full Body", duration_minutes=60, estimated_calories=500,
        equipment="Barbell, Squat Rack",
        description="Heavy compound lifts.",
        exercises=[
            Exercise(
                name="Deadlift",
                sets=5,
                reps="5",
                rest_seconds=120,
                target_muscles="Hamstrings, Glutes, Lower Back, Lats",
                equipment="Barbell, Weight Plates",
                instructions="Stand with shins 1 inch from the bar. Hinge at hips and grip just outside your legs. Brace core, pull slack from the bar, and drive feet through the floor until standing tall.",
                form_tips="Keep the bar in contact with your legs and avoid hyperextending your lower back at lockout."
            ),
            Exercise(
                name="Front Squat",
                sets=4,
                reps="6",
                rest_seconds=120,
                target_muscles="Quadriceps, Core, Glutes, Upper Back",
                equipment="Barbell, Squat Rack",
                instructions="Rest the barbell across your clavicles and anterior deltoids with high elbows. Squat deep keeping your torso strictly upright, then push back up through midfoot.",
                form_tips="Keep elbows pointed high at all times to prevent the upper back from rounding."
            )
        ]
    ),

    # --- ENDURANCE ---
    # Beginner
    Workout(
        id="end-beg-1", name="Walking Endurance", category="Cardio", difficulty=FitnessLevel.beginner,
        focus="Cardio", duration_minutes=30, estimated_calories=150,
        equipment="Treadmill or Outdoor Track",
        description="Steady state walking to build aerobic base.",
        exercises=[
            Exercise(
                name="Brisk Walk",
                sets=1,
                reps="30 mins",
                rest_seconds=0,
                target_muscles="Calves, Hamstrings, Quadriceps",
                equipment="None / Bodyweight",
                instructions="Maintain a fast-paced walk with an upright posture and rhythmic arm swing.",
                form_tips="Keep shoulders relaxed and breathe steadily in sync with your footsteps."
            )
        ]
    ),
    Workout(
        id="end-beg-2", name="Light Cardio Circuit", category="Cardio", difficulty=FitnessLevel.beginner,
        focus="Full Body", duration_minutes=25, estimated_calories=200,
        equipment="Mat / Bodyweight",
        description="Light aerobic conditioning.",
        exercises=[Exercise(name="Jumping Jacks", sets=3, reps="20", rest_seconds=30), Exercise(name="High Knees", sets=3, reps="20", rest_seconds=30)]
    ),

    # Intermediate
    Workout(
        id="end-int-1", name="Endurance Run", category="Cardio", difficulty=FitnessLevel.intermediate,
        focus="Cardio", duration_minutes=45, estimated_calories=450,
        equipment="Running Shoes / Treadmill",
        description="Moderate intensity continuous run.",
        exercises=[
            Exercise(
                name="Jogging",
                sets=1,
                reps="45 mins",
                rest_seconds=0,
                target_muscles="Cardiovascular, Calves, Quadriceps",
                equipment="None / Bodyweight",
                instructions="Sustain a steady conversational running pace with light footstrikes.",
                form_tips="Land softly with midfoot strike underneath your center of gravity."
            )
        ]
    ),
    Workout(
        id="end-int-2", name="Cardio Intervals", category="Cardio", difficulty=FitnessLevel.intermediate,
        focus="Cardio", duration_minutes=35, estimated_calories=350,
        description="Interval training to boost VO2 max.",
        exercises=[Exercise(name="Run", sets=5, reps="3 mins", rest_seconds=60)]
    ),

    # Advanced
    Workout(
        id="end-adv-1", name="Advanced Tempo Run", category="Cardio", difficulty=FitnessLevel.advanced,
        focus="Cardio", duration_minutes=60, estimated_calories=650,
        description="High intensity tempo training.",
        exercises=[Exercise(name="Tempo Run", sets=1, reps="60 mins", rest_seconds=0)]
    ),

    # --- GENERAL MOBILITY / RECOVERY (Fits anywhere as filler) ---
    Workout(
        id="mob-beg-1", name="Mobility & Recovery", category="Mobility", difficulty=FitnessLevel.beginner,
        focus="Stretch · Core", duration_minutes=20, estimated_calories=90,
        equipment="Mat / Bodyweight",
        description="Active recovery and stretching.",
        exercises=[
            Exercise(
                name="Cat-Cow",
                sets=2,
                reps="10",
                rest_seconds=0,
                target_muscles="Spine, Core, Neck",
                equipment="Mat",
                instructions="Start on hands and knees with wrists under shoulders and knees under hips. Inhale as you drop belly toward the mat and lift chin (Cow). Exhale as you round spine upward toward ceiling and tuck chin (Cat).",
                form_tips="Flow smoothly between postures and synchronize every change with your breathing."
            ),
            Exercise(
                name="Child's Pose",
                sets=2,
                reps="60 sec",
                rest_seconds=0,
                target_muscles="Lower Back, Hips, Lats",
                equipment="Mat",
                instructions="From all fours, send hips back toward your heels and extend arms forward. Let chest relax down toward the mat and rest forehead on the floor.",
                form_tips="Focus on slow, deep diaphragmatic breaths to release tension in the lower back and hips."
            )
        ]
    ),
]


class BaseWorkoutProvider:
    """Abstract base class for workout recommendation providers."""
    def get_workouts(self, profile: UserProfile) -> List[Workout]:
        raise NotImplementedError()


class ProfileBasedWorkoutProvider(BaseWorkoutProvider):
    """
    Deterministic provider that maps fitness_goal and fitness_level 
    to a personalized list of workouts from the static catalog.
    """
    def get_workouts(self, profile: UserProfile) -> List[Workout]:
        goal = profile.fitness_goal
        level = profile.fitness_level
        
        selected_workouts = []
        
        # 1. Select workouts based on goal and level
        for w in STATIC_WORKOUTS:
            # General fitness gets a mix of everything appropriate for their level
            if goal == FitnessGoal.general_fitness:
                if w.difficulty == level:
                    selected_workouts.append(w)
            
            # Specific goals get workouts tailored to that goal AND their level
            elif w.difficulty == level:
                if goal == FitnessGoal.weight_loss and w.id.startswith("wl"):
                    selected_workouts.append(w)
                elif goal == FitnessGoal.muscle_gain and w.id.startswith("mg"):
                    selected_workouts.append(w)
                elif goal == FitnessGoal.endurance and w.id.startswith("end"):
                    selected_workouts.append(w)
                    
        # 2. Always include a mobility/recovery session appropriate for the level
        # Currently we just have one beginner mobility session, we'll append it for everyone
        # as active recovery is always good.
        mobility = next((w for w in STATIC_WORKOUTS if w.id == "mob-beg-1"), None)
        if mobility and mobility not in selected_workouts:
            selected_workouts.append(mobility)
            
        return selected_workouts


class SLMWorkoutProvider(BaseWorkoutProvider):
    """
    Future provider that will use a Quantized SLM to generate 
    highly adaptive workouts based on history, performance, etc.
    """
    def get_workouts(self, profile: UserProfile) -> List[Workout]:
        # TODO: Implement quantized model inference here later.
        # This will use profile.age, profile.weight, history, etc.
        raise NotImplementedError("SLM provider not yet integrated.")


class WorkoutService:
    """
    Service layer to decouple the API route from the recommendation mechanism.
    Takes a UserProfile and delegates to the configured provider.
    """
    def __init__(self, provider: BaseWorkoutProvider = None):
        # Default to the profile-based deterministic provider for now.
        self.provider = provider or ProfileBasedWorkoutProvider()
        
    def get_personalized_recommendations(self, profile: UserProfile) -> WorkoutRecommendationResponse:
        workouts = self.provider.get_workouts(profile)
        
        return WorkoutRecommendationResponse(
            personalized_for=PersonalizedFor(
                goal=profile.fitness_goal,
                fitness_level=profile.fitness_level
            ),
            workouts=workouts
        )
