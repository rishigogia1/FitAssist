from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from app.auth.jwt import create_access_token
from datetime import timedelta
from app.config import settings

router = APIRouter()

class TokenRequest(BaseModel):
    email: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str

@router.post("/token", response_model=TokenResponse)
def login_for_access_token(request: TokenRequest):
    # In a real app we'd verify the password or OTP here.
    # But since OTP verification happens in the TanStack Start server function,
    # and we trust the frontend to only call this with a verified email,
    # we just issue the token.
    if not request.email:
        raise HTTPException(status_code=400, detail="Email is required")
        
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": request.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}
