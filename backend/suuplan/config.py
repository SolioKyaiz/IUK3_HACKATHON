import os
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./suuplan.db")
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me-in-production-please")
JWT_DAYS = 30
DEMO_OTP_CODE = "1234"

CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ASSISTANT_MODEL = os.getenv("ASSISTANT_MODEL", "claude-opus-5-5")
ASSISTANT_DAILY_LIMIT = 30
ASSISTANT_MAX_CHARS = 500

NOMINATIM_URL = os.getenv("NOMINATIM_URL", "https://nominatim.openstreetmap.org/search")
NOMINATIM_USER_AGENT = os.getenv("NOMINATIM_USER_AGENT", "SuuPlan/0.1 (NASA Space Apps 2026 demo)")

# External data lookups can be switched off for tests or offline demos.
EXTERNAL_DATA = os.getenv("SUUPLAN_EXTERNAL_DATA", "1") == "1"
POWER_CACHE_DAYS = 30
