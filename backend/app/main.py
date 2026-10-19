from datetime import datetime, timezone
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from backend.app.core.config import settings
from backend.app.core.database import engine

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="SkillPulse Intelligence - AI-Enabled Labour Market Intelligence and Skill Demand-Supply Forecasting Engine",
)

# CORS Middleware setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["Health"])
def health_check():
    db_status = "unavailable"
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            db_status = "connected"
    except Exception as e:
        db_status = f"unreachable: {type(e).__name__}"

    return {
        "status": "healthy",
        "service": "SkillPulse Intelligence API",
        "version": settings.VERSION,
        "database": db_status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/", tags=["Root"])
def root():
    return {
        "message": "Welcome to SkillPulse Intelligence API",
        "docs_url": "/docs",
        "health_url": "/health",
    }
