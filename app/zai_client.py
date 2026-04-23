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
        if role == "vendor":
            return (
                "Fallback mode: I could not reach Groq, Gemini, or Z.AI. Based on available metrics, "
                "prioritize reducing negative review themes first, preserve strengths in positive "
                "themes, and monitor weekly sentiment changes to validate improvement impact."
            )
        return (
            "Fallback mode: I could not reach Groq, Gemini, or Z.AI. Based on available ratings and sentiment, "
            "pick options with higher average rating and lower negative_ratio, then compare trade-offs "
            "using location and budget preference."
        )