from app.schemas.diagram import DiagramType
from app.schemas.intent import IntentAction, ScopeRelation
from app.services.intent_classifier import IntentClassifier
from app.state.session_state import SessionState


def test_strong_orgchart_signal_classifies_and_locks_immediately() -> None:
    classifier = IntentClassifier()
    state = SessionState(session_id="s-1")

    intent = classifier.classify(
        "Alice reports to Bob in the organization chart.",
        state,
    )

    assert intent.diagram_type == DiagramType.ORGCHART
    assert intent.scope_relation == ScopeRelation.IN_SCOPE
    assert intent.action == IntentAction.UPDATE
    assert intent.confidence >= 0.85

    classifier.update_scope_lock(state, intent)

    assert state.locked_diagram_type == DiagramType.ORGCHART
    assert state.switch_streak == 0


def test_medium_confidence_flowchart_locks_after_second_signal() -> None:
    classifier = IntentClassifier()
    state = SessionState(session_id="s-2")

    first_intent = classifier.classify(
        "First sales hands off the deal to solutions engineering.",
        state,
    )
    classifier.update_scope_lock(state, first_intent)

    assert first_intent.diagram_type == DiagramType.FLOWCHART
    assert 0.65 <= first_intent.confidence < 0.85
    assert state.locked_diagram_type is None
    assert state.switch_streak == 1

    second_intent = classifier.classify(
        "Then security reviews the integration requirements.",
        state,
    )
    classifier.update_scope_lock(state, second_intent)

    assert second_intent.diagram_type == DiagramType.FLOWCHART
    assert state.locked_diagram_type == DiagramType.FLOWCHART
    assert state.switch_streak == 0


def test_out_of_scope_text_is_filtered_after_lock() -> None:
    classifier = IntentClassifier()
    state = SessionState(
        session_id="s-3",
        locked_diagram_type=DiagramType.FLOWCHART,
    )

    intent = classifier.classify("Can someone send the Zoom link again?", state)

    assert intent.diagram_type == DiagramType.FLOWCHART
    assert intent.scope_relation == ScopeRelation.OUT_OF_SCOPE
    assert intent.action == IntentAction.NOOP
    assert classifier.choose_route(intent, state) == "noop"


def test_correction_prefers_repair_route() -> None:
    classifier = IntentClassifier()
    state = SessionState(
        session_id="s-4",
        locked_diagram_type=DiagramType.ORGCHART,
    )

    intent = classifier.classify(
        "Actually Alice reports to Carol instead.",
        state,
    )

    assert intent.diagram_type == DiagramType.ORGCHART
    assert intent.scope_relation == ScopeRelation.CORRECTION
    assert classifier.choose_route(intent, state) == "repair"


def test_connector_only_utterance_is_treated_as_filler() -> None:
    classifier = IntentClassifier()
    state = SessionState(
        session_id="s-5",
        locked_diagram_type=DiagramType.FLOWCHART,
    )

    intent = classifier.classify("Then", state)

    assert intent.diagram_type == DiagramType.FLOWCHART
    assert intent.scope_relation == ScopeRelation.OUT_OF_SCOPE
    assert intent.action == IntentAction.NOOP
    assert intent.reason == "empty_or_filler"


def test_meta_flowchart_chatter_is_treated_as_out_of_scope() -> None:
    classifier = IntentClassifier()
    state = SessionState(
        session_id="s-6",
        locked_diagram_type=DiagramType.FLOWCHART,
    )

    intent = classifier.classify(
        "Okay that kind of works. What's going to happen next is I'll send the recap.",
        state,
    )

    assert intent.diagram_type == DiagramType.FLOWCHART
    assert intent.scope_relation == ScopeRelation.OUT_OF_SCOPE
    assert intent.action == IntentAction.NOOP
    assert intent.reason == "meta_or_question"
