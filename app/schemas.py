from typing import Any, List, Literal, Optional
from pydantic import BaseModel, Field

Role = Literal["diner", "vendor"]


class AskRequest(BaseModel):
    role: str
    prompt: str = Field(min_length=3, max_length=2000)
    conversation_id: Optional[str] = Field(default=None, max_length=128)
    user_id: Optional[str] = Field(default=None, max_length=128)
    restaurant_name: Optional[str] = None
    external_reviews: Optional[List[str]] = None
    user_lat: Optional[float] = None
    user_lng: Optional[float] = None
    city_name: Optional[str] = None
    persist: bool = True


class AskResponse(BaseModel):
    answer: str
    conversation_id: Optional[str] = None
    source: str
    confidence: float = Field(ge=0.0, le=1.0)
    restaurants: Optional[List[Any]] = None


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


class StartConversationRequest(BaseModel):
    conversation_id: Optional[str] = Field(default=None, max_length=128)
    user_id: str = Field(min_length=1, max_length=128)
    role: Role
    question: str = Field(min_length=1, max_length=2000)
    answer: str = Field(min_length=1, max_length=12000)


class StartConversationResponse(BaseModel):
    conversation_id: str