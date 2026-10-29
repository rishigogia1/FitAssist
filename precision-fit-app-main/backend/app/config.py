from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+psycopg2://postgres:FinSarthi%402026@localhost:5432/fitassist"
    SECRET_KEY: str = "supersecretkey12345"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7 # 1 week
    CORS_ALLOWED_ORIGINS: str = "http://localhost:8080"
    GEMINI_API_KEY: str | None = None

    class Config:
        env_file = (".env", "../.env")
        extra = "ignore"

settings = Settings()

