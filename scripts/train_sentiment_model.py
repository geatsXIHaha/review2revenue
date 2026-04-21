from pathlib import Path

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline


def main() -> None:
    project_root = Path(__file__).resolve().parents[1]
    data_path = project_root / "data" / "clean_reviews.csv"
    artifact_dir = project_root / "artifacts"
    artifact_dir.mkdir(parents=True, exist_ok=True)

    if not data_path.exists():
        raise FileNotFoundError(f"Dataset not found: {data_path}")

    df = pd.read_csv(data_path)
    df = df[["review_text", "sentiment"]].dropna()
    df["review_text"] = df["review_text"].astype(str).str.strip()
    df["sentiment"] = df["sentiment"].astype(str).str.lower().str.strip()
    df = df[df["review_text"] != ""]
    df = df[df["sentiment"].isin(["positive", "neutral", "negative"])]

    if len(df) < 200:
        raise ValueError("Not enough training samples after cleaning.")

    x_train, x_test, y_train, y_test = train_test_split(
        df["review_text"],
        df["sentiment"],
        test_size=0.2,
        random_state=42,
        stratify=df["sentiment"],
    )

    model = Pipeline(
        steps=[
            ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=2, max_features=40000)),
            ("clf", LogisticRegression(max_iter=300, class_weight="balanced")),
        ]
    )

    model.fit(x_train, y_train)
    preds = model.predict(x_test)

    print(f"Samples used: {len(df)}")
    print(f"Accuracy: {accuracy_score(y_test, preds):.4f}")
    print("Classification report:")
    print(classification_report(y_test, preds, digits=4))

    out_path = artifact_dir / "sentiment_model.joblib"
    joblib.dump(model, out_path)
    print(f"Saved model to: {out_path}")


if __name__ == "__main__":
    main()
