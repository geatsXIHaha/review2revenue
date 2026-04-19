from typing import List, Literal, Optional

from pydantic import BaseModel, Field


Role = Literal["diner", "vendor"]


class AskRequest(BaseModel):
    role: Role
    prompt: str = Field(min_length=3, max_length=2000)
    restaurant_name: Optional[str] = None
    external_reviews: Optional[List[str]] = None


class AskResponse(BaseModel):
    answer: str
    source: Literal["database", "external_reviews", "mixed", "fallback"]
    confidence: float = Field(ge=0.0, le=1.0)
