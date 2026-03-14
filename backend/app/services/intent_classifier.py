import re

from app.schemas.diagram import DiagramType
from app.schemas.intent import IntentAction, IntentResult


class IntentClassifier:
    FLOW_WORDS = {"first", "then", "after", "before", "finally", "next", "step"}
    TIMELINE_WORDS = {
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
        "today",
        "tomorrow",
        "quarter",
    }
    MINDMAP_WORDS = {"types", "categories", "themes", "ideas", "areas"}
    ORG_WORDS = {"reports to", "manager", "lead", "team", "owner"}

    def classify(self, text: str) -> IntentResult:
        normalized = re.sub(r"\s+", " ", text.lower()).strip()
        if not normalized:
            return IntentResult(
                diagram_type=DiagramType.NONE,
                confidence=0.0,
                action=IntentAction.NOOP,
                reason="empty_buffer",
            )

        if any(word in normalized for word in self.ORG_WORDS):
            return IntentResult(
                diagram_type=DiagramType.ORGCHART,
                confidence=0.74,
                action=IntentAction.UPDATE,
                reason="org_keywords",
            )

        if any(word in normalized for word in self.TIMELINE_WORDS):
            return IntentResult(
                diagram_type=DiagramType.TIMELINE,
                confidence=0.8,
                action=IntentAction.UPDATE,
                reason="timeline_keywords",
            )

        if any(word in normalized for word in self.MINDMAP_WORDS):
            return IntentResult(
                diagram_type=DiagramType.MINDMAP,
                confidence=0.72,
                action=IntentAction.UPDATE,
                reason="mindmap_keywords",
            )

        if any(word in normalized for word in self.FLOW_WORDS):
            return IntentResult(
                diagram_type=DiagramType.FLOWCHART,
                confidence=0.85,
                action=IntentAction.UPDATE,
                reason="flow_keywords",
            )

        return IntentResult(
            diagram_type=DiagramType.FLOWCHART,
            confidence=0.55,
            action=IntentAction.UPDATE,
            reason="flow_default",
        )
