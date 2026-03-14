from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as routes_router
from app.api.signaling import router as signaling_router
from app.api.websocket import router as websocket_router
from app.config import get_settings
from app.core.session_manager import SessionManager
from app.services.pipeline import SessionPipeline

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.session_manager = SessionManager()
    app.state.pipeline = SessionPipeline(settings=settings)
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes_router, prefix=settings.api_prefix)
app.include_router(websocket_router)
app.include_router(signaling_router)
