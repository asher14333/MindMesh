import re
from typing import Optional

from app.schemas.diagram import DiagramType
from app.schemas.intent import (
    IntentAction,
    IntentResult,
    IntentSource,
    ScopeRelation,
)
from app.state.session_state import SessionState


class IntentClassifier:
    FLOW_WORDS = {
        "first", "then", "after", "before", "finally", "next", "step",
        "process", "flow", "sequence", "proceed", "followed by", "leads to",
        "starts with", "ends with", "begins", "continues", "results in",
        "workflow", "pipeline", "handoff", "hands off", "moves to",
    }
    FLOW_STRONG = {
        "process", "flow", "workflow", "pipeline", "sequence", "step by step",
    }

    TIMELINE_WORDS = {
        "january", "february", "march", "april", "may", "june",
        "july", "august", "september", "october", "november", "december",
        "today", "tomorrow", "yesterday", "quarter", "q1", "q2", "q3", "q4",
        "deadline", "milestone", "phase", "sprint", "week", "month", "year",
    }
    TIMELINE_STRONG = {
        "timeline", "schedule", "roadmap", "deadline", "milestone",
    }

    MINDMAP_WORDS = {
        "types", "categories", "themes", "ideas", "areas", "topics",
        "aspects", "factors", "brainstorm", "concepts", "dimensions",
        "pillars", "domains", "branches", "subtopics",
    }
    MINDMAP_STRONG = {
        "brainstorm", "mind map", "mindmap", "categorize", "themes",
    }

    ORG_WORDS = {
        "reports to", "manager", "lead", "team", "owner", "direct report",
        "supervisor", "department", "hierarchy", "organization", "manages",
        "head of", "director", "vp", "ceo", "cto",
    }
    ORG_STRONG = {
        "reports to", "hierarchy", "org chart", "orgchart",
        "organization chart", "reporting structure",
    }

    CORRECTION_PATTERNS = [
        r"\bactually\b", r"\bno[,.]?\s", r"\bwait\b", r"\binstead\b",
        r"\bcorrection\b", r"\bsorry\b", r"\bi meant\b", r"\bnot that\b",
        r"\bchange that\b", r"\bshould be\b", r"\brather\b",
    ]

    FILLER_PATTERNS = [
        r"^(um+|uh+|ah+|er+|hmm+|like|you know|so|okay|ok|right|"
        r"yeah|yes|no|mhm)[\s.,!?]*$",
    ]
    META_PATTERNS = [
        r"^(okay|ok|alright|right|so)\b.*\b(that kind of works|that works|got it|makes sense)\b",
        r"^(what('?s| is) going to happen next|what happens next)\b",
        r"^(can|could|would|should)\b",
        r"^(let('?s| us))\b",
        r"^(i('?m| am)|we('?re| are)) going to\b",
        r"\bcan someone\b",
    ]
    CONNECTOR_ONLY_TERMS = {
        "first",
        "then",
        "next",
        "finally",
        "after",
        "before",
        "once",
    }

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def classify(
        self, text: str, state: Optional[SessionState] = None
    ) -> IntentResult:
        normalized = re.sub(r"\s+", " ", text.lower()).strip()

        if not normalized or self._is_filler(normalized):
            return IntentResult(
                diagram_type=(
                    state.locked_diagram_type
                    if state and state.locked_diagram_type
                    else DiagramType.NONE
                ),
                confidence=0.0,
                action=IntentAction.NOOP,
                reason="empty_or_filler",
                scope_relation=ScopeRelation.OUT_OF_SCOPE,
            )

        if self._is_meta_or_question(normalized):
            return IntentResult(
                diagram_type=(
                    state.locked_diagram_type
                    if state and state.locked_diagram_type
                    else DiagramType.FLOWCHART
                ),
                confidence=0.35,
                action=IntentAction.NOOP,
                reason="meta_or_question",
                scope_relation=ScopeRelation.OUT_OF_SCOPE,
            )

        is_correction = any(
            re.search(p, normalized) for p in self.CORRECTION_PATTERNS
        )

        scores = {
            DiagramType.FLOWCHART: self._score(
                normalized, self.FLOW_WORDS, self.FLOW_STRONG
            ),
            DiagramType.ORGCHART: self._score(
                normalized, self.ORG_WORDS, self.ORG_STRONG
            ),
            DiagramType.TIMELINE: self._score(
                normalized, self.TIMELINE_WORDS, self.TIMELINE_STRONG
            ),
            DiagramType.MINDMAP: self._score(
                normalized, self.MINDMAP_WORDS, self.MINDMAP_STRONG
            ),
        }

        best_type = max(scores, key=lambda k: scores[k])
        best_score = scores[best_type]

        if best_score == 0:
            locked = (
                state.locked_diagram_type
                if state and state.locked_diagram_type
                else None
            )
            if is_correction and locked and locked != DiagramType.NONE:
                return IntentResult(
                    diagram_type=locked,
                    confidence=0.60,
                    action=IntentAction.UPDATE,
                    reason="correction_detected",
                    scope_relation=ScopeRelation.CORRECTION,
                )
            return IntentResult(
                diagram_type=locked or DiagramType.FLOWCHART,
                confidence=0.35,
                action=IntentAction.NOOP,
                reason="no_diagram_keywords",
                scope_relation=ScopeRelation.OUT_OF_SCOPE,
            )

        confidence = min(0.95, 0.55 + best_score * 0.12)

        scope_relation = ScopeRelation.IN_SCOPE
        if is_correction:
            scope_relation = ScopeRelation.CORRECTION
        elif (
            state
            and state.locked_diagram_type
            and state.locked_diagram_type != DiagramType.NONE
        ):
            if best_type != state.locked_diagram_type and best_score >= 2:
                scope_relation = ScopeRelation.SWITCH_CANDIDATE
            elif best_type != state.locked_diagram_type:
                scope_relation = ScopeRelation.OUT_OF_SCOPE
                best_type = state.locked_diagram_type

        action = IntentAction.UPDATE
        if is_correction:
            action = IntentAction.REPLACE if best_score >= 3 else IntentAction.UPDATE
        elif confidence < 0.65:
            action = IntentAction.NOOP

        return IntentResult(
            diagram_type=best_type,
            confidence=confidence,
            action=action,
            reason=(
                "correction_detected"
                if is_correction
                else f"{best_type.value}_keywords"
            ),
            scope_relation=scope_relation,
        )

    def choose_route(self, intent: IntentResult, state: SessionState) -> str:
        """Return one of 'fast', 'fallback', 'repair', 'noop'."""
        if intent.scope_relation == ScopeRelation.OUT_OF_SCOPE:
            return "noop"
        if intent.scope_relation == ScopeRelation.CORRECTION:
            return "repair"
        if intent.confidence >= 0.85:
            return "fast"
        if intent.confidence < 0.65:
            return "fallback"
        if intent.scope_relation == ScopeRelation.SWITCH_CANDIDATE:
            return "fallback"
        if not state.locked_diagram_type or state.locked_diagram_type == DiagramType.NONE:
            return "fallback"
        return "fast"

    def update_scope_lock(
        self, state: SessionState, intent: IntentResult
    ) -> None:
        if intent.action == IntentAction.NOOP:
            return

        if (
            not state.locked_diagram_type
            or state.locked_diagram_type == DiagramType.NONE
        ):
            if intent.confidence >= 0.85:
                state.locked_diagram_type = intent.diagram_type
                state.switch_streak = 0
            elif intent.confidence >= 0.65:
                if state.switch_streak >= 1:
                    state.locked_diagram_type = intent.diagram_type
                    state.switch_streak = 0
                else:
                    state.switch_streak += 1
            return

        if intent.scope_relation == ScopeRelation.SWITCH_CANDIDATE:
            if intent.diagram_type != state.locked_diagram_type:
                state.switch_streak += 1
                if state.switch_streak >= 2 and intent.confidence >= 0.74:
                    state.locked_diagram_type = intent.diagram_type
                    state.switch_streak = 0
        elif intent.scope_relation == ScopeRelation.IN_SCOPE:
            state.switch_streak = 0

    def classify_flowchart_fallback(
        self,
        text: str,
        *,
        has_candidate_steps: bool,
        trigger_reason: Optional[str] = None,
        latency_ms: Optional[int] = None,
    ) -> IntentResult:
        normalized = re.sub(r"\s+", " ", text.lower()).strip()
        is_correction = any(
            re.search(pattern, normalized) for pattern in self.CORRECTION_PATTERNS
        )

        if not normalized or self._is_filler(normalized):
            return IntentResult(
                diagram_type=DiagramType.NONE,
                confidence=0.0,
                action=IntentAction.NOOP,
                reason="empty_or_filler",
                scope_relation=ScopeRelation.OUT_OF_SCOPE,
                source=IntentSource.RULES_FALLBACK,
                trigger_reason=trigger_reason,
                latency_ms=latency_ms,
            )

        if self._is_meta_or_question(normalized):
            return IntentResult(
                diagram_type=DiagramType.NONE,
                confidence=0.2,
                action=IntentAction.NOOP,
                reason="meta_or_question",
                scope_relation=ScopeRelation.OUT_OF_SCOPE,
                source=IntentSource.RULES_FALLBACK,
                trigger_reason=trigger_reason,
                latency_ms=latency_ms,
            )

        generic = self.classify(text)
        if (
            generic.action != IntentAction.NOOP
            and generic.diagram_type not in {DiagramType.FLOWCHART, DiagramType.NONE}
        ):
            return IntentResult(
                diagram_type=DiagramType.NONE,
                confidence=generic.confidence,
                action=IntentAction.NOOP,
                reason="non_flowchart_content",
                scope_relation=ScopeRelation.OUT_OF_SCOPE,
                source=IntentSource.RULES_FALLBACK,
                trigger_reason=trigger_reason,
                latency_ms=latency_ms,
            )

        if not has_candidate_steps:
            return IntentResult(
                diagram_type=DiagramType.NONE,
                confidence=0.35,
                action=IntentAction.NOOP,
                reason="rules_no_relevant_flow_steps",
                scope_relation=ScopeRelation.OUT_OF_SCOPE,
                source=IntentSource.RULES_FALLBACK,
                trigger_reason=trigger_reason,
                latency_ms=latency_ms,
            )

        return IntentResult(
            diagram_type=DiagramType.FLOWCHART,
            confidence=0.58 if is_correction else 0.7,
            action=IntentAction.REPLACE if is_correction else IntentAction.UPDATE,
            reason="rules_flowchart_fallback",
            scope_relation=(
                ScopeRelation.CORRECTION
                if is_correction
                else ScopeRelation.IN_SCOPE
            ),
            source=IntentSource.RULES_FALLBACK,
            trigger_reason=trigger_reason,
            latency_ms=latency_ms,
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _score(self, text: str, words: set[str], strong: set[str]) -> int:
        score = 0
        for w in words:
            if w in text:
                score += 1
        for w in strong:
            if w in text:
                score += 2
        return score

    def _is_filler(self, text: str) -> bool:
        if any(re.match(p, text, re.IGNORECASE) for p in self.FILLER_PATTERNS):
            return True
        normalized = re.sub(r"[\s.,!?;:]+", " ", text.lower()).strip()
        return normalized in self.CONNECTOR_ONLY_TERMS

    def _is_meta_or_question(self, text: str) -> bool:
        if text.endswith("?"):
            return True
        return any(
            re.search(pattern, text, re.IGNORECASE)
            for pattern in self.META_PATTERNS
        )
