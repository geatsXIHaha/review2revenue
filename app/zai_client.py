from typing import Any, Dict

import httpx

from .config import (
    GROQ_API_KEY,
    GROQ_BASE_URL,
    GROQ_MODEL,
    GEMINI_API_KEY,
    GEMINI_BASE_URL,
    GEMINI_MODEL,
    ZAI_API_KEY,
    ZAI_BASE_URL,
    ZAI_MODEL,
)


class ZAIClient:
    def __init__(self) -> None:
        self.use_groq = bool(GROQ_API_KEY)
        self.use_gemini = bool(GEMINI_API_KEY)
        self.use_zai = bool(ZAI_API_KEY)

    def generate(self, system_prompt: str, user_payload: Dict[str, Any]) -> str:
        if self.use_groq:
            result = self._generate_groq(system_prompt, user_payload)
            if result:
                return result

        if self.use_gemini:
            result = self._generate_gemini(system_prompt, user_payload)
            if result:
                return result

        if self.use_zai:
            result = self._generate_zai(system_prompt, user_payload)
            if result:
                return result

        return self._fallback_response(user_payload)

    @staticmethod
    def _generate_groq(system_prompt: str, user_payload: Dict[str, Any]) -> str:
        if not GROQ_API_KEY:
            return ""

        url = f"{GROQ_BASE_URL.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json",
        }
        body = {
            "model": GROQ_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": str(user_payload)},
            ],
            "temperature": 0.4,
        }

        try:
            response = httpx.post(url, headers=headers, json=body, timeout=30.0)
            response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            return content.strip()
        except Exception:
            return ""

    @staticmethod
    def _generate_gemini(system_prompt: str, user_payload: Dict[str, Any]) -> str:
        url = (
            f"{GEMINI_BASE_URL.rstrip('/')}/models/{GEMINI_MODEL}:generateContent"
            f"?key={GEMINI_API_KEY}"
        )
        prompt_text = f"System instruction:\n{system_prompt}\n\nUser payload:\n{user_payload}"
        body = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt_text},
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.4,
            },
        }

        try:
            response = httpx.post(url, json=body, timeout=30.0)
            response.raise_for_status()
            data = response.json()
            candidates = data.get("candidates", [])
            if not candidates:
                return ""
            parts = candidates[0].get("content", {}).get("parts", [])
            if not parts:
                return ""
            return (parts[0].get("text") or "").strip()
        except Exception:
            return ""

    @staticmethod
    def _generate_zai(system_prompt: str, user_payload: Dict[str, Any]) -> str:
        if not ZAI_API_KEY:
            return ""

        url = f"{ZAI_BASE_URL.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {ZAI_API_KEY}",
            "Content-Type": "application/json",
        }
        body = {
            "model": ZAI_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": str(user_payload)},
            ],
            "temperature": 0.4,
        }

        try:
            response = httpx.post(url, headers=headers, json=body, timeout=30.0)
            response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            return content.strip()
        except Exception:
            return ""

    @staticmethod
    def _fallback_response(user_payload: Dict[str, Any]) -> str:
        role = user_payload.get("role", "diner")
        candidates = user_payload.get("top_candidates") or []

        if not candidates:
            if role == "vendor":
                return (
                    "I couldn't generate a model-based answer, but the database still supports your analysis. "
                    "Try refining the question around ratings, review themes, menu items, or operating hours."
                )
            return (
                "I couldn't generate a model-based answer, but the database still supports restaurant matching. "
                "Try adjusting your request by cuisine, price, distance, or opening hours."
            )

        intro = (
            "Here are the strongest matches from the database based on your request:" 
            if role == "diner"
            else "Here are the strongest restaurants to focus on based on your request:"
        )
        lines = [intro]
        for index, restaurant in enumerate(candidates[:3], start=1):
            name = restaurant.get("name") or "Unnamed restaurant"
            food_type = restaurant.get("food_type") or restaurant.get("category")
            rating = restaurant.get("avg_rating")
            hours = restaurant.get("operating_hours_today")
            address = restaurant.get("address")
            distance = restaurant.get("distance_km")
            price = restaurant.get("price_description") or restaurant.get("price_tier")
            parts = [f"{index}. {name}"]
            details = []
            if food_type:
                details.append(str(food_type))
            if rating is not None:
                details.append(f"{rating} / 5")
            if price:
                details.append(str(price))
            if distance is not None:
                details.append(f"{distance} km away")
            if hours:
                details.append(str(hours))
            if address:
                details.append(str(address))
            if details:
                parts.append(" - ".join(details))
            lines.append("\n".join(parts))

        return "\n\n".join(lines)