from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.models.user_profile import UserProfile
from app.models.nutrition_preferences import NutritionPreferences
from app.models.nutrition_log import NutritionLog
from datetime import datetime, date
from app.models.daily_meal_plan import DailyMealPlan
from sqlalchemy.orm.attributes import flag_modified
from app.schemas.nutrition import (
    Meal,
    NutritionPreferencesCreate,
    NutritionPreferencesUpdate,
    NutritionPreferencesResponse,
    DailyNutritionDashboard,
    NutritionDashboardConsumed,
    NutritionDashboardScore,
    PersonalizedContext,
    NutritionLogCreate,
    NutritionLogResponse,
    SimpleInsight,
    NutritionProgress,
    PlannedMealsStatus,
    NutritionTarget
)
from app.schemas.nutrition_ai import (
    MealReplacementRequest,
    NutritionAIResponse,
    WeeklyNutritionAnalysis,
    WeeklyAdherence,
    MealFeedbackCreate,
    normalize_replacement_reason,
    AdaptiveRecommendationsRequest
)
from app.models.nutrition_feedback import NutritionFeedback
from app.models.nutrition_insight import NutritionInsight
from datetime import timedelta
from app.auth.dependencies import get_current_user
from app.services.nutrition_service import NutritionService
from zoneinfo import ZoneInfo
from typing import Optional

router = APIRouter()
nutrition_service = NutritionService()
from app.services.nutrition.engine import AdaptiveNutritionEngine
adaptive_engine = AdaptiveNutritionEngine()

@router.get("/preferences", response_model=NutritionPreferencesResponse)
def get_preferences(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_id = current_user["user_id"]
    prefs = db.query(NutritionPreferences).filter(NutritionPreferences.user_id == user_id).first()
    if not prefs:
        prefs = NutritionPreferences(user_id=user_id)
        db.add(prefs)
        db.commit()
        db.refresh(prefs)
    return prefs

@router.put("/preferences", response_model=NutritionPreferencesResponse)
def update_preferences(
    data: NutritionPreferencesUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_id = current_user["user_id"]
    prefs = db.query(NutritionPreferences).filter(NutritionPreferences.user_id == user_id).first()
    
    if not prefs:
        prefs = NutritionPreferences(user_id=user_id, **data.model_dump())
        db.add(prefs)
    else:
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(prefs, key, value)
            
    db.commit()
    db.refresh(prefs)

    # Immediately regenerate or update today's plan so new preferences and allergies take effect
    IST = ZoneInfo("Asia/Kolkata")
    today_str = datetime.now(IST).date().isoformat()
    daily_plan = db.query(DailyMealPlan).filter(
        DailyMealPlan.user_id == user_id,
        DailyMealPlan.plan_date == today_str
    ).first()

    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if profile:
        targets = nutrition_service.calculate_targets(profile)
        try:
            new_meals = nutrition_service.meal_db.get_meals(targets, prefs, profile.fitness_goal)
            new_meals_dict = [m.model_dump() for m in new_meals]
            if daily_plan:
                daily_plan.meals_json = new_meals_dict
                flag_modified(daily_plan, "meals_json")
            else:
                daily_plan = DailyMealPlan(
                    user_id=user_id,
                    plan_date=today_str,
                    meals_json=new_meals_dict
                )
                db.add(daily_plan)
            db.commit()
        except Exception as e:
            # If preferences are incompatible with catalog, keep going without throwing during preference save
            pass

    return prefs

@router.get("/today", response_model=DailyNutritionDashboard)
def get_today_nutrition(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_id = current_user["user_id"]
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if not profile:
        profile = UserProfile(
            user_id=user_id,
            age=25,
            weight=70.0,
            height=170.0,
            sex="male",
            fitness_goal="general_fitness",
            fitness_level="intermediate"
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
        
    prefs = db.query(NutritionPreferences).filter(NutritionPreferences.user_id == user_id).first()
    if not prefs:
        prefs = NutritionPreferences(user_id=user_id)
        db.add(prefs)
        db.commit()
        db.refresh(prefs)
        
    targets = nutrition_service.calculate_targets(profile)
    
    # Use IST timezone consistently
    IST = ZoneInfo("Asia/Kolkata")
    local_now = datetime.now(IST)
    today_date = local_now.date()
    today_str = today_date.isoformat()

    # Load or create persistent daily meal plan from DB
    daily_plan = db.query(DailyMealPlan).filter(
        DailyMealPlan.user_id == user_id,
        DailyMealPlan.plan_date == today_str
    ).first()

    meals = []
    need_regenerate = False
    if daily_plan and daily_plan.meals_json:
        # Validate that EVERY cached meal is strictly compliant with current user's allergies and diet
        from app.services.nutrition.validation import is_allergy_safe, is_dietary_safe
        cached_meals = [Meal(**m) for m in daily_plan.meals_json]
        for m in cached_meals:
            safe_a, _ = is_allergy_safe(m, prefs.allergies)
            safe_d, _ = is_dietary_safe(m, prefs.dietary_preference)
            if not safe_a or not safe_d:
                need_regenerate = True
                break
        if not need_regenerate:
            meals = cached_meals

    if not meals or need_regenerate:
        try:
            calculated_meals = nutrition_service.meal_db.get_meals(targets, prefs, profile.fitness_goal)
            meals_dict = [m.model_dump() for m in calculated_meals]
            if not daily_plan:
                daily_plan = DailyMealPlan(
                    user_id=user_id,
                    plan_date=today_str,
                    meals_json=meals_dict
                )
                db.add(daily_plan)
            else:
                daily_plan.meals_json = meals_dict
                flag_modified(daily_plan, "meals_json")
            db.commit()
            db.refresh(daily_plan)
            meals = calculated_meals
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(e)
            )

    logs = db.query(NutritionLog).filter(
        NutritionLog.user_id == user_id,
        NutritionLog.log_date == today_date
    ).all()
    
    consumed_calories = sum(log.calories for log in logs)
    consumed_protein = sum(log.protein_g for log in logs)
    consumed_carbs = sum(log.carbs_g for log in logs)
    consumed_fat = sum(log.fat_g for log in logs)
    
    # Consumed values
    c_cal = consumed_calories
    c_pro = int(consumed_protein)
    c_carb = int(consumed_carbs)
    c_fat = int(consumed_fat)

    # Remaining values
    r_cal = max(0, targets.calories - c_cal)
    r_pro = max(0, targets.protein - c_pro)
    r_carb = max(0, targets.carbs - c_carb)
    r_fat = max(0, targets.fat - c_fat)

    # Progress percentages
    p_cal = min(100, int((c_cal / max(1, targets.calories)) * 100))
    p_pro = min(100, int((c_pro / max(1, targets.protein)) * 100))
    p_carb = min(100, int((c_carb / max(1, targets.carbs)) * 100))
    p_fat = min(100, int((c_fat / max(1, targets.fat)) * 100))

    # Planned meals count
    total_planned = len(meals)
    logged_planned_ids = {m.id for m in meals if any(log.meal_id == m.id for log in logs)}
    logged_count = len(logged_planned_ids)
    remaining_count = max(0, total_planned - logged_count)

    # Calculate advanced macro-adherence score and explanation
    if not logs:
        score_val = 0
        explanation = "No meals logged yet today."
        score_status = "pending"
    else:
        cal_ad = max(0.0, 1.0 - (abs(c_cal - targets.calories) / targets.calories))
        pro_ad = max(0.0, 1.0 - (abs(c_pro - targets.protein) / targets.protein))
        carb_ad = max(0.0, 1.0 - (abs(c_carb - targets.carbs) / targets.carbs))
        fat_ad = max(0.0, 1.0 - (abs(c_fat - targets.fat) / targets.fat))
        
        score_val = int(round((cal_ad * 0.3 + pro_ad * 0.3 + carb_ad * 0.2 + fat_ad * 0.2) * 100))
        score_val = max(0, min(100, score_val))
        score_status = "good" if score_val > 50 else "pending"
        
        gaps = {
            "protein": r_pro / max(1, targets.protein),
            "calories": r_cal / max(1, targets.calories),
            "carbs": r_carb / max(1, targets.carbs),
            "fat": r_fat / max(1, targets.fat),
        }
        under_targets = {k: v for k, v in gaps.items() if v > 0.15}
        if under_targets:
            biggest_gap = max(under_targets, key=under_targets.get)
            if biggest_gap == "protein":
                explanation = "Your planned meals are progressing, but protein is your biggest remaining nutrition gap."
            elif biggest_gap == "calories":
                explanation = "Your calories are currently your biggest remaining nutrition gap."
            elif biggest_gap == "carbs":
                explanation = "Carbohydrates are your biggest remaining nutrition gap."
            else:
                explanation = "Healthy fats are your biggest remaining nutrition gap."
        else:
            explanation = "Your nutrition intake is fully on track today!"
            
    return DailyNutritionDashboard(
        personalized_for=PersonalizedContext(
            goal=profile.fitness_goal,
            fitness_level=profile.fitness_level,
            dietary_preference=prefs.dietary_preference,
            cuisine=prefs.cuisine_preference
        ),
        targets=targets,
        consumed=NutritionDashboardConsumed(
            calories=c_cal,
            protein=c_pro,
            carbs=c_carb,
            fat=c_fat
        ),
        remaining=NutritionTarget(
            calories=r_cal,
            protein=r_pro,
            carbs=r_carb,
            fat=r_fat
        ),
        progress=NutritionProgress(
            calories=p_cal,
            protein=p_pro,
            carbs=p_carb,
            fat=p_fat
        ),
        planned_meals=PlannedMealsStatus(
            total=total_planned,
            logged=logged_count,
            remaining=remaining_count
        ),
        score=NutritionDashboardScore(
            value=score_val,
            status=score_status,
            explanation=explanation
        ),
        meals=meals,
        logged_meals=logs,
        ai_insight=SimpleInsight(
            content=explanation if logs else "Your macro intake is on track today.",
            insight_type="general"
        )
    )

@router.get("/analysis/weekly", response_model=WeeklyNutritionAnalysis)
def get_weekly_analysis(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_id = current_user["user_id"]
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if not profile:
        profile = UserProfile(
            user_id=user_id,
            age=25,
            weight=70.0,
            height=170.0,
            sex="male",
            fitness_goal="general_fitness",
            fitness_level="intermediate"
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
        
    targets = nutrition_service.calculate_targets(profile)
    
    IST = ZoneInfo("Asia/Kolkata")
    today_date = datetime.now(IST).date()
    start_date = today_date - timedelta(days=7)
    
    logs = db.query(NutritionLog).filter(
        NutritionLog.user_id == user_id,
        NutritionLog.log_date > start_date,
        NutritionLog.log_date <= today_date
    ).all()
    
    if not logs:
        return WeeklyNutritionAnalysis(
            average=NutritionDashboardConsumed(),
            targets=targets,
            adherence=WeeklyAdherence(calories=0, protein=0, carbs=0, fat=0),
            logged_meals=0,
            insights=["You haven't logged any meals this week."]
        )
        
    # Calculate averages
    days_logged = len(set(log.log_date for log in logs))
    if days_logged == 0: days_logged = 1
    
    avg_cal = sum(log.calories for log in logs) / days_logged
    avg_pro = sum(log.protein_g for log in logs) / days_logged
    avg_carbs = sum(log.carbs_g for log in logs) / days_logged
    avg_fat = sum(log.fat_g for log in logs) / days_logged
    
    adherence_cal = min(100, int((avg_cal / targets.calories) * 100)) if targets.calories else 0
    adherence_pro = min(100, int((avg_pro / targets.protein) * 100)) if targets.protein else 0
    
    return WeeklyNutritionAnalysis(
        average=NutritionDashboardConsumed(calories=int(avg_cal), protein=int(avg_pro), carbs=int(avg_carbs), fat=int(avg_fat)),
        targets=targets,
        adherence=WeeklyAdherence(calories=adherence_cal, protein=adherence_pro, carbs=adherence_cal, fat=adherence_cal),
        logged_meals=len(logs),
        insights=["Your protein intake is generally good." if adherence_pro > 80 else "Try to eat more protein."]
    )

@router.post("/recommendations", response_model=NutritionAIResponse)
def get_adaptive_recommendations(
    request: Optional[AdaptiveRecommendationsRequest] = None,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_id = current_user["user_id"]
    exclude_ids = request.exclude_ids if request else []
    return adaptive_engine.generate_daily_recommendations(db, user_id, exclude_ids=exclude_ids)

@router.post("/meals/{meal_id}/replace", response_model=NutritionAIResponse)
def replace_meal(
    meal_id: str,
    request: MealReplacementRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_id = current_user["user_id"]
    
    # Validate replacement reason
    normalized_reason = normalize_replacement_reason(request.reason)
    if not normalized_reason:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid replacement reason: '{request.reason}'."
        )
        
    IST = ZoneInfo("Asia/Kolkata")
    today_date = datetime.now(IST).date()
    today_str = today_date.isoformat()
    
    # Fetch user's current daily plan
    daily_plan = db.query(DailyMealPlan).filter(
        DailyMealPlan.user_id == user_id,
        DailyMealPlan.plan_date == today_str
    ).first()
    
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    prefs = db.query(NutritionPreferences).filter(NutritionPreferences.user_id == user_id).first()
    targets = nutrition_service.calculate_targets(profile)

    if not daily_plan or not daily_plan.meals_json:
        calculated_meals = nutrition_service.meal_db.get_meals(targets, prefs, profile.fitness_goal)
        meals_dict = [m.model_dump() for m in calculated_meals]
        if not daily_plan:
            daily_plan = DailyMealPlan(
                user_id=user_id,
                plan_date=today_str,
                meals_json=meals_dict
            )
            db.add(daily_plan)
        else:
            daily_plan.meals_json = meals_dict
        db.commit()
        db.refresh(daily_plan)
        
    # Find the target meal in user's current daily plan
    meals_list = list(daily_plan.meals_json)
    meal_idx = -1
    target_meal_dict = None
    for idx, m in enumerate(meals_list):
        if str(m.get("id")) == str(meal_id):
            meal_idx = idx
            target_meal_dict = m
            break
            
    if meal_idx == -1 or not target_meal_dict:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meal not found in current user's active plan"
        )
        
    request.meal_id = meal_id
    ai_response = adaptive_engine.replace_meal(db, user_id, request, target_meal=target_meal_dict)
    
    if not ai_response.meal_replacements:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No suitable replacement meal could be found satisfying your current dietary restrictions and allergies."
        )
        
    replacement = ai_response.meal_replacements[0]
    
    # Construct updated meal dict preserving original meal_type (breakfast/lunch/dinner)
    new_meal_dict = {
        "id": replacement.id,
        "type": target_meal_dict.get("type", replacement.type),
        "name": replacement.name,
        "description": replacement.description,
        "calories": replacement.calories,
        "protein": replacement.protein_g,
        "carbs": replacement.carbs_g,
        "fat": replacement.fat_g,
        "ingredients": replacement.ingredients,
        "instructions": replacement.instructions,
        "prep_time": replacement.prep_time,
        "dietary_tags": replacement.dietary_tags,
        "cuisine_tags": replacement.cuisine_tags,
        "allergen_tags": replacement.allergen_tags,
        "reason": replacement.reason
    }
    
    meals_list[meal_idx] = new_meal_dict
    daily_plan.meals_json = meals_list
    flag_modified(daily_plan, "meals_json")
    db.commit()
    
    # Record feedback/replacement history
    feedback = NutritionFeedback(
        user_id=user_id,
        meal_id=meal_id,
        feedback_type="replaced",
        reason=normalized_reason
    )
    db.add(feedback)
    db.commit()
    
    # CRITICAL RULE FOR LOGGED MEALS:
    # If original meal was logged, update existing NutritionLog rather than creating duplicate!
    existing_log = db.query(NutritionLog).filter(
        NutritionLog.user_id == user_id,
        NutritionLog.log_date == today_date,
        (NutritionLog.meal_id == meal_id) | (NutritionLog.meal_id == target_meal_dict.get("id"))
    ).first()
    
    if existing_log:
        existing_log.meal_id = replacement.id
        existing_log.meal_name = replacement.name
        existing_log.calories = replacement.calories
        existing_log.protein_g = float(replacement.protein_g)
        existing_log.carbs_g = float(replacement.carbs_g)
        existing_log.fat_g = float(replacement.fat_g)
        db.commit()
        
    return ai_response


@router.post("/feedback", status_code=status.HTTP_201_CREATED)
def submit_feedback(
    data: MealFeedbackCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_id = current_user["user_id"]
    feedback = NutritionFeedback(
        user_id=user_id,
        meal_id=data.meal_id,
        feedback_type=data.feedback_type,
        reason=data.reason
    )
    db.add(feedback)
    db.commit()
    return {"status": "success"}

@router.post("/log", response_model=NutritionLogResponse)
def log_nutrition_meal(
    data: NutritionLogCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_id = current_user["user_id"]
    IST = ZoneInfo("Asia/Kolkata")
    today_date = datetime.now(IST).date()
    
    # Check for duplicate
    existing = db.query(NutritionLog).filter(
        NutritionLog.user_id == user_id,
        NutritionLog.log_date == today_date,
        NutritionLog.meal_id == data.meal_id
    ).first()
    
    if existing:
        return existing
        
    new_log = NutritionLog(
        user_id=user_id,
        meal_id=data.meal_id,
        meal_type=data.meal_type,
        meal_name=data.meal_name,
        calories=data.calories,
        protein_g=data.protein_g,
        carbs_g=data.carbs_g,
        fat_g=data.fat_g,
        log_date=today_date
    )
    
    db.add(new_log)
    db.commit()
    db.refresh(new_log)
    return new_log

@router.delete("/log/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
def unlog_nutrition_meal(
    log_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_id = current_user["user_id"]
    log_entry = db.query(NutritionLog).filter(
        NutritionLog.id == log_id,
        NutritionLog.user_id == user_id
    ).first()
    
    if not log_entry:
        raise HTTPException(status_code=404, detail="Nutrition log not found")
        
    db.delete(log_entry)
    db.commit()
    return None
