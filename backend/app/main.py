from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.backtest import router as backtest_router
from app.api.demo import router as demo_router
from app.api.errors import register_error_handlers
from app.api.feedback import router as feedback_router
from app.api.health import router as health_router
from app.api.profiles import router as profiles_router
from app.api.recommendations import router as recommendations_router
from app.api.recommendations import snapshot_router as recommendation_snapshot_router
from app.api.savings import router as savings_router
from app.db.database import SessionLocal, init_db
from app.services import demo as demo_service

LOCAL_FRONTEND_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    init_db()
    with SessionLocal() as session:
        demo_service.ensure_demo_profile(session, today=datetime.now(UTC).date())
    yield


app = FastAPI(title="Lawn Irrigation Advisor API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=LOCAL_FRONTEND_ORIGINS,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["*"],
)

register_error_handlers(app)
app.include_router(health_router)
app.include_router(profiles_router)
app.include_router(recommendations_router)
app.include_router(recommendation_snapshot_router)
app.include_router(feedback_router)
app.include_router(savings_router)
app.include_router(backtest_router)
app.include_router(demo_router)
