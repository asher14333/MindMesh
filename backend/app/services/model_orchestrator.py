from app.schemas.intent import IntentResult


class ModelOrchestrator:
    async def choose_path(self, intent: IntentResult) -> str:
        if intent.confidence >= 0.7:
            return "fast"
        return "fallback"
