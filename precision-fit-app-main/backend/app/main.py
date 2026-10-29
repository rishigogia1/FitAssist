from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from contextlib import asynccontextmanager

from app.api.routes import auth, profile, recommendations, workouts, workout_sessions, nutrition, dashboard, coach, progress

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(
    title="FitAssist API",
    description="Backend for FitAssist AI Fitness Coach",
    version="1.0.0",
    lifespan=lifespan
)

from app.config import settings

# Parse the comma-separated origins if provided
allowed_origins = [
    origin.strip() 
    for origin in settings.CORS_ALLOWED_ORIGINS.split(",") 
    if origin.strip()
] if settings.CORS_ALLOWED_ORIGINS else []

# Append default frontend local URLs to be safe
allowed_origins.extend([
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000"
])

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok"}

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(profile.router, prefix="/api/v1/profile", tags=["profile"])
app.include_router(recommendations.router, prefix="/api/v1/recommendations", tags=["recommendations"])
app.include_router(workouts.router, prefix="/api/v1/workouts", tags=["workouts"])
app.include_router(workout_sessions.router, prefix="/api/v1/workout-sessions", tags=["workout_sessions"])
app.include_router(nutrition.router, prefix="/api/v1/nutrition", tags=["nutrition"])
app.include_router(dashboard.router, prefix="/api/v1/dashboard", tags=["dashboard"])
app.include_router(coach.router, prefix="/api/v1/coach", tags=["coach"])
app.include_router(progress.router, prefix="/api/v1/progress", tags=["progress"])

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
