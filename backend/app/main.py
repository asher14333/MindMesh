import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as routes_router
from app.api.signaling import router as signaling_router
from app.api.websocket import router as websocket_router
from app.config import get_settings
from app.core.session_manager import SessionManager
from app.services.pipeline import SessionPipeline

LOG_FORMAT = "%(asctime)s  %(levelname)-8s  %(name)s  %(message)s"
LOG_DATE_FORMAT = "%H:%M:%S"


def configure_app_logging() -> None:
    formatter = logging.Formatter(LOG_FORMAT, datefmt=LOG_DATE_FORMAT)
    uvicorn_logger = logging.getLogger("uvicorn.error")
    app_logger = logging.getLogger("app")

    handlers = [handler for handler in uvicorn_logger.handlers if isinstance(handler, logging.Handler)]
    if not handlers:
        stream_handler = logging.StreamHandler()
        stream_handler.setFormatter(formatter)
        handlers = [stream_handler]

    app_logger.handlers = handlers
    app_logger.setLevel(logging.INFO)
    app_logger.propagate = False

    root_logger = logging.getLogger()
    if root_logger.level > logging.INFO:
        root_logger.setLevel(logging.INFO)


configure_app_logging()

logger = logging.getLogger(__name__)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.session_manager = SessionManager()
    app.state.pipeline = SessionPipeline(settings=settings)
    logger.info(
        "MindMesh startup | origins=%s pause_threshold=%.2fs cooldown=%.2fs model=%s",
        ",".join(settings.allowed_origins),
        settings.pause_threshold_seconds,
        settings.generation_cooldown_seconds,
        settings.llm_model,
    )
    yield
    logger.info("MindMesh shutdown")


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
