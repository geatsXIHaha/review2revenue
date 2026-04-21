from pathlib import Path
from typing import Dict, List, Optional

import joblib


_MODEL = None
_MODEL_READY = False


def _model_path() -> Path:
    project_root = Path(__file__).resolve().parents[1]
    return project_root / "artifacts" / "sentiment_model.joblib"


def _load_model_once() -> None:
    global _MODEL, _MODEL_READY
    if _MODEL_READY:
        return

    path = _model_path()
    if not path.exists():
        _MODEL_READY = True
        return

    try:
        _MODEL = joblib.load(path)
    except Exception:
        _MODEL = None
    finally:
        _MODEL_READY = True


def get_sentiment_engine_status() -> str:
    _load_model_once()
    return "trained_model" if _MODEL is not None else "keyword_fallback"


def predict_sentiment_summary(reviews: List[str]) -> Optional[Dict[str, float]]:
    _load_model_once()
    if _MODEL is None:
        return None

    clean_reviews = [r.strip() for r in reviews if isinstance(r, str) and r.strip()]
    if not clean_reviews:
        return {
            "positive_ratio": 0.0,
            "negative_ratio": 0.0,
            "neutral_ratio": 0.0,
            "model_confidence": 0.0,
        }

    try:
        preds = _MODEL.predict(clean_reviews)
    except Exception:
        return None

    model_confidence = 0.0
    if hasattr(_MODEL, "predict_proba"):
        try:
            proba_rows = _MODEL.predict_proba(clean_reviews)
            max_probs = [float(max(row)) for row in proba_rows]
            if max_probs:
                model_confidence = round(sum(max_probs) / len(max_probs), 3)
        except Exception:
            model_confidence = 0.0

    total = max(len(preds), 1)
    pos = sum(1 for p in preds if str(p).lower() == "positive")
    neg = sum(1 for p in preds if str(p).lower() == "negative")
    neu = sum(1 for p in preds if str(p).lower() == "neutral")

    return {
        "positive_ratio": round(pos / total, 3),
        "negative_ratio": round(neg / total, 3),
        "neutral_ratio": round(neu / total, 3),
        "model_confidence": model_confidence,
    }
