from typing import List, Literal, Optional

from pydantic import BaseModel, Field


Role = Literal["diner", "vendor"]


class AskRequest(BaseModel):
    role: Role
    prompt: str = Field(min_length=3, max_length=2000)
    conversation_id: Optional[str] = Field(default=None, max_length=128)
    restaurant_name: Optional[str] = None
    external_reviews: Optional[List[str]] = None


class AskResponse(BaseModel):
    answer: str
    conversation_id: Optional[str] = None
    source: Literal["database", "external_reviews", "mixed", "fallback"]
    confidence: float = Field(ge=0.0, le=1.0)


class ChatHistoryResponse(BaseModel):
    conversation_id: str
    role: Role
    messages: List[dict]


class ConversationSummary(BaseModel):
    conversation_id: str
    role: Role
    last_message: str
    restaurant_name: Optional[str] = None
    updated_at: str
