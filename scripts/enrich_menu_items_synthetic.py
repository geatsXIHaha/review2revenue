import argparse
import hashlib
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from random import Random
from typing import Dict, List, Tuple

import pandas as pd


MENU_LIBRARY: Dict[str, List[Tuple[str, str, float]]] = {
    "malaysian": [
        ("Nasi Lemak Ayam", "Main", 10.5),
        ("Nasi Goreng Kampung", "Main", 11.0),
        ("Char Kuey Teow", "Main", 12.0),
        ("Mee Goreng Mamak", "Main", 10.0),
        ("Laksa", "Main", 11.5),
        ("Roti Canai Set", "Main", 7.5),
        ("Teh Tarik", "Drink", 3.5),
        ("Sirap Limau", "Drink", 4.0),
        ("Kuih Platter", "Dessert", 6.5),
        ("Cendol", "Dessert", 6.0),
    ],
    "korean": [
        ("Bibimbap", "Main", 18.0),
        ("Kimchi Fried Rice", "Main", 16.5),
        ("Bulgogi Beef Set", "Main", 24.0),
        ("Army Stew", "Main", 26.0),
        ("Korean Fried Chicken", "Main", 22.0),
        ("Tteokbokki", "Main", 15.0),
        ("Kimchi", "Side", 5.0),
        ("Seaweed Soup", "Side", 6.0),
        ("Citron Tea", "Drink", 5.5),
        ("Bingsu", "Dessert", 14.0),
    ],
    "japanese": [
        ("Chicken Katsu Don", "Main", 18.0),
        ("Salmon Don", "Main", 23.0),
        ("Chicken Teriyaki", "Main", 19.0),
        ("Ramen", "Main", 21.0),
        ("Udon Soup", "Main", 17.0),
        ("Sushi Platter", "Main", 28.0),
        ("Gyoza", "Side", 9.0),
        ("Agedashi Tofu", "Side", 8.0),
        ("Matcha Latte", "Drink", 8.0),
        ("Mochi Ice Cream", "Dessert", 9.5),
    ],
    "chinese": [
        ("Sweet and Sour Chicken", "Main", 16.0),
        ("Kung Pao Chicken", "Main", 16.5),
        ("Fried Rice", "Main", 12.0),
        ("Wantan Mee", "Main", 11.5),
        ("Steamed Fish Rice", "Main", 18.0),
        ("Mapo Tofu", "Main", 15.5),
        ("Spring Rolls", "Side", 7.5),
        ("Dumplings", "Side", 9.0),
        ("Chinese Tea", "Drink", 3.0),
        ("Mango Pudding", "Dessert", 8.5),
    ],
    "western": [
        ("Grilled Chicken Chop", "Main", 22.0),
        ("Fish and Chips", "Main", 24.0),
        ("Beef Burger", "Main", 21.0),
        ("Carbonara", "Main", 23.5),
        ("Aglio Olio", "Main", 18.5),
        ("Mushroom Soup", "Side", 8.0),
        ("Caesar Salad", "Side", 12.0),
        ("Iced Lemon Tea", "Drink", 5.0),
        ("Americano", "Drink", 6.5),
        ("Cheesecake", "Dessert", 12.0),
    ],
    "indian": [
        ("Chicken Briyani", "Main", 15.0),
        ("Mutton Briyani", "Main", 19.0),
        ("Butter Chicken", "Main", 17.0),
        ("Masala Thosai", "Main", 11.0),
        ("Tandoori Chicken", "Main", 18.0),
        ("Plain Naan", "Side", 4.0),
        ("Garlic Naan", "Side", 5.0),
        ("Mango Lassi", "Drink", 7.0),
        ("Teh Masala", "Drink", 4.0),
        ("Gulab Jamun", "Dessert", 7.5),
    ],
    "thai": [
        ("Tom Yum Seafood", "Main", 19.0),
        ("Pad Thai", "Main", 16.5),
        ("Green Curry Chicken", "Main", 17.5),
        ("Thai Basil Chicken Rice", "Main", 15.0),
        ("Pineapple Fried Rice", "Main", 17.0),
        ("Papaya Salad", "Side", 10.0),
        ("Thai Fish Cake", "Side", 11.0),
        ("Thai Milk Tea", "Drink", 7.0),
        ("Lemongrass Drink", "Drink", 6.0),
        ("Mango Sticky Rice", "Dessert", 13.0),
    ],
    "beverages": [
        ("Americano", "Drink", 7.0),
        ("Cafe Latte", "Drink", 10.0),
        ("Cappuccino", "Drink", 10.0),
        ("Mocha", "Drink", 11.0),
        ("Iced Chocolate", "Drink", 9.0),
        ("Lemon Tea", "Drink", 6.0),
        ("Mineral Water", "Drink", 2.5),
        ("Cheese Cake Slice", "Dessert", 11.0),
        ("Brownie", "Dessert", 9.0),
        ("Croissant", "Pastry", 8.5),
    ],
    "fast food": [
        ("Fried Chicken Combo", "Main", 16.0),
        ("Cheeseburger Combo", "Main", 17.0),
        ("Chicken Wrap", "Main", 13.0),
        ("Nuggets", "Side", 9.0),
        ("French Fries", "Side", 7.0),
        ("Onion Rings", "Side", 8.0),
        ("Cola", "Drink", 4.5),
        ("Milkshake", "Drink", 8.5),
        ("Sundae", "Dessert", 6.0),
        ("Apple Pie", "Dessert", 7.0),
    ],
    "default": [
        ("Signature Rice Bowl", "Main", 14.0),
        ("Chicken Chop", "Main", 17.0),
        ("Noodles", "Main", 13.0),
        ("Fried Rice", "Main", 12.0),
        ("Mixed Salad", "Side", 10.0),
        ("Soup of the Day", "Side", 8.0),
        ("Iced Lemon Tea", "Drink", 5.0),
        ("Hot Coffee", "Drink", 5.5),
        ("Chocolate Cake", "Dessert", 10.0),
        ("Seasonal Fruit", "Dessert", 7.5),
    ],
}

PRICE_MULTIPLIER = {
    "budget": 0.9,
    "mid": 1.05,
    "premium": 1.25,
}

REVIEW_ALIAS_CANDIDATES: Dict[str, List[str]] = {
    "Nasi Lemak Ayam": ["nasi lemak", "nasi lemak ayam"],
    "Nasi Goreng Kampung": ["nasi goreng", "nasi goreng kampung"],
    "Char Kuey Teow": ["char kuey teow", "char kway teow", "kuey teow"],
    "Mee Goreng Mamak": ["mee goreng", "mee goreng mamak", "maggi goreng"],
    "Laksa": ["laksa", "asam laksa", "curry laksa"],
    "Roti Canai Set": ["roti canai", "roti telur", "roti kosong"],
    "Teh Tarik": ["teh tarik", "teh ais"],
    "Cendol": ["cendol"],
    "Bibimbap": ["bibimbap"],
    "Kimchi Fried Rice": ["kimchi fried rice", "kimchi rice"],
    "Bulgogi Beef Set": ["bulgogi"],
    "Korean Fried Chicken": ["korean fried chicken", "fried chicken"],
    "Tteokbokki": ["tteokbokki", "topokki"],
    "Ramen": ["ramen"],
    "Udon Soup": ["udon"],
    "Sushi Platter": ["sushi", "sashimi"],
    "Gyoza": ["gyoza"],
    "Sweet and Sour Chicken": ["sweet and sour chicken"],
    "Fried Rice": ["fried rice"],
    "Wantan Mee": ["wantan mee", "wanton mee"],
    "Mapo Tofu": ["mapo tofu"],
    "Dumplings": ["dumpling", "dumplings"],
    "Grilled Chicken Chop": ["chicken chop"],
    "Fish and Chips": ["fish and chips"],
    "Beef Burger": ["burger", "beef burger", "cheeseburger"],
    "Carbonara": ["carbonara"],
    "Aglio Olio": ["aglio olio"],
    "Chicken Briyani": ["briyani", "biryani", "chicken briyani"],
    "Mutton Briyani": ["mutton briyani", "lamb briyani"],
    "Butter Chicken": ["butter chicken"],
    "Plain Naan": ["naan"],
    "Tom Yum Seafood": ["tom yum", "tomyam"],
    "Pad Thai": ["pad thai"],
    "Green Curry Chicken": ["green curry"],
    "Thai Milk Tea": ["thai milk tea", "thai tea"],
    "Mango Sticky Rice": ["mango sticky rice"],
    "Americano": ["americano"],
    "Cafe Latte": ["latte", "cafe latte"],
    "Cappuccino": ["cappuccino"],
    "Mocha": ["mocha"],
    "French Fries": ["french fries", "fries"],
    "Milkshake": ["milkshake"],
    "Sundae": ["sundae", "ice cream"],
    "Apple Pie": ["apple pie"],
}


def infer_cuisine(food_type: str, name: str) -> str:
    text = f"{food_type or ''} {name or ''}".lower()
    if any(k in text for k in ["korean", "kimchi", "tteok"]):
        return "korean"
    if any(k in text for k in ["japanese", "sushi", "ramen", "udon"]):
        return "japanese"
    if any(k in text for k in ["thai", "tom yum", "pad thai"]):
        return "thai"
    if any(k in text for k in ["indian", "briyani", "naan", "thosai", "mamak"]):
        return "indian"
    if any(k in text for k in ["chinese", "dim sum", "wantan", "szechuan"]):
        return "chinese"
    if any(k in text for k in ["western", "pasta", "steak", "grill"]):
        return "western"
    if any(k in text for k in ["coffee", "cafe", "beverage", "bubble tea", "tea", "cakes", "dessert", "bread"]):
        return "beverages"
    if any(k in text for k in ["burger", "fast food", "fried chicken", "pizza"]):
        return "fast food"
    if any(k in text for k in ["malaysian", "nasi", "laksa", "roti", "ayam penyet", "nyonya"]):
        return "malaysian"
    return "default"


def _seeded_random(store_id: str, name: str) -> Random:
    seed_text = f"{store_id}|{name}".encode("utf-8", "ignore")
    seed = int(hashlib.sha256(seed_text).hexdigest()[:16], 16)
    return Random(seed)


def build_item_catalog() -> Dict[str, Tuple[str, str, float]]:
    catalog: Dict[str, Tuple[str, str, float]] = {}
    for items in MENU_LIBRARY.values():
        for item_name, category, base_price in items:
            key = item_name.lower()
            if key not in catalog:
                catalog[key] = (item_name, category, base_price)
    return catalog


def build_alias_map(catalog: Dict[str, Tuple[str, str, float]]) -> Dict[str, str]:
    alias_map: Dict[str, str] = {}

    for item_name, _, _ in catalog.values():
        alias_map[item_name.lower()] = item_name

    for canonical, aliases in REVIEW_ALIAS_CANDIDATES.items():
        if canonical.lower() not in catalog:
            continue
        for alias in aliases:
            alias_map[alias.lower()] = canonical

    return alias_map


def extract_review_mentions(
    reviews_path: Path,
    alias_map: Dict[str, str],
    min_mentions: int,
    max_review_items: int,
) -> Dict[str, List[str]]:
    if not reviews_path.exists():
        return {}

    df_reviews = pd.read_csv(reviews_path)
    if "store_id" not in df_reviews.columns or "review_text" not in df_reviews.columns:
        return {}

    alias_patterns = [
        (re.compile(rf"\b{re.escape(alias)}\b", flags=re.IGNORECASE), canonical)
        for alias, canonical in alias_map.items()
    ]

    mentions_by_store: Dict[str, Counter] = defaultdict(Counter)
    for _, row in df_reviews.iterrows():
        store_id = str(row.get("store_id", "")).strip()
        text = str(row.get("review_text", "")).strip().lower()
        if not store_id or not text:
            continue

        matched_items = set()
        for pattern, canonical in alias_patterns:
            if pattern.search(text):
                matched_items.add(canonical)

        for item in matched_items:
            mentions_by_store[store_id][item] += 1

    output: Dict[str, List[str]] = {}
    for store_id, counter in mentions_by_store.items():
        ranked = [
            item
            for item, count in sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))
            if count >= min_mentions
        ]
        if ranked:
            output[store_id] = ranked[:max_review_items]

    return output


def generate_menu_items(
    df: pd.DataFrame,
    min_items: int,
    max_items: int,
    review_mentions: Dict[str, List[str]],
    catalog: Dict[str, Tuple[str, str, float]],
) -> pd.DataFrame:
    now_utc = datetime.now(timezone.utc).isoformat(timespec="seconds")
    rows: List[Dict] = []

    for _, row in df.iterrows():
        store_id = str(row.get("store_id", "")).strip()
        name = str(row.get("name", "")).strip()
        food_type = str(row.get("food_type", "")).strip()
        price_tier = str(row.get("google_price_tier", "")).strip().lower()

        if not store_id or not name:
            continue

        cuisine = infer_cuisine(food_type, name)
        library = MENU_LIBRARY.get(cuisine, MENU_LIBRARY["default"])
        multiplier = PRICE_MULTIPLIER.get(price_tier, 1.0)
        rng = _seeded_random(store_id, name)

        target_count = min(max_items, max(min_items, rng.randint(min_items, max_items)))
        picked = library.copy()
        rng.shuffle(picked)
        picked = picked[:target_count]

        combined: List[Tuple[str, str, float, str]] = []
        used_names = set()

        for mentioned_item in review_mentions.get(store_id, []):
            item_key = mentioned_item.lower()
            if item_key not in catalog or item_key in used_names:
                continue
            item_name, category, base_price = catalog[item_key]
            combined.append((item_name, category, base_price, "review_mention"))
            used_names.add(item_key)

        for item_name, category, base_price in picked:
            item_key = item_name.lower()
            if item_key in used_names:
                continue
            combined.append((item_name, category, base_price, "synthetic"))
            used_names.add(item_key)

        for index, (item_name, category, base_price, source) in enumerate(combined, start=1):
            noise = rng.uniform(-0.08, 0.08)
            price = round(max(2.0, base_price * multiplier * (1 + noise)), 2)
            rows.append(
                {
                    "menu_id": f"{store_id}-m{index:02d}",
                    "store_id": store_id,
                    "restaurant_name": name,
                    "item_name": item_name,
                    "category": category,
                    "price_rm": price,
                    "source": source,
                    "is_available": True,
                    "updated_at": now_utc,
                }
            )

    return pd.DataFrame(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic menu items for all restaurants.")
    parser.add_argument("--input", type=Path, default=Path("data/clean_restaurants_google_hours.csv"))
    parser.add_argument("--output", type=Path, default=Path("data/menu_items_synthetic.csv"))
    parser.add_argument("--reviews", type=Path, default=Path("data/clean_reviews.csv"))
    parser.add_argument("--min-items", type=int, default=8)
    parser.add_argument("--max-items", type=int, default=12)
    parser.add_argument("--max-review-items", type=int, default=4)
    parser.add_argument("--min-review-mentions", type=int, default=1)
    args = parser.parse_args()

    if args.min_items < 1 or args.max_items < args.min_items:
        raise ValueError("Invalid --min-items/--max-items values.")
    if not args.input.exists():
        raise FileNotFoundError(f"Missing input file: {args.input}")

    df_restaurants = pd.read_csv(args.input)
    required = ["store_id", "name"]
    for col in required:
        if col not in df_restaurants.columns:
            raise ValueError(f"Input CSV missing required column: {col}")

    catalog = build_item_catalog()
    alias_map = build_alias_map(catalog)
    review_mentions = extract_review_mentions(
        reviews_path=args.reviews,
        alias_map=alias_map,
        min_mentions=args.min_review_mentions,
        max_review_items=args.max_review_items,
    )

    menu_df = generate_menu_items(
        df_restaurants,
        args.min_items,
        args.max_items,
        review_mentions,
        catalog,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    menu_df.to_csv(args.output, index=False, encoding="utf-8-sig")

    total_restaurants = df_restaurants["store_id"].nunique()
    total_items = len(menu_df)
    avg_items = round(total_items / max(total_restaurants, 1), 2)
    review_count = int((menu_df["source"] == "review_mention").sum()) if not menu_df.empty else 0

    print(f"Generated synthetic menu for {total_restaurants} restaurants.")
    print(f"Total menu items: {total_items} (avg {avg_items} items/restaurant)")
    print(f"Items from review mentions: {review_count}")
    print(f"Saved to: {args.output}")


if __name__ == "__main__":
    main()
