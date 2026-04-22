from pathlib import Path
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.sentiment_model import get_sentiment_engine_status, predict_sentiment_summary


def main() -> None:
    model_path = PROJECT_ROOT / "artifacts" / "sentiment_model.joblib"

    print(f"Model path: {model_path}")
    print(f"Model exists: {model_path.exists()}")
    print(f"Engine status: {get_sentiment_engine_status()}")

    sample_reviews = [
        "Service was fast and the food was excellent.",
        "Taste was okay but the portion was too small for the price.",
        "Very rude staff and the place was dirty.",
        "Loved the ambience, will come again.",
    ]

    summary = predict_sentiment_summary(sample_reviews)
    print("Sentiment summary:")
    print(summary)


if __name__ == "__main__":
    main()