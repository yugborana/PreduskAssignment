"""Supabase client for conversation storage."""

from typing import Optional
from supabase import create_client, Client
from backend.config import SUPABASE_URL, SUPABASE_ANON_KEY


def get_supabase_client() -> Optional[Client]:
    """Get Supabase client. Returns None if not configured."""
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return None
    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)


# Initialize client
supabase = get_supabase_client()


def is_supabase_configured() -> bool:
    """Check if Supabase is configured."""
    return supabase is not None


# ============= Conversation Operations =============

def create_conversation(title: str = "New Conversation") -> Optional[dict]:
    """Create a new conversation."""
    if not supabase:
        return None
    
    result = supabase.table("conversations").insert({
        "title": title
    }).execute()
    
    if result.data:
        return result.data[0]
    return None


def get_conversations(limit: int = 50) -> list:
    """Get all conversations, ordered by most recent."""
    if not supabase:
        return []
    
    result = supabase.table("conversations")\
        .select("*")\
        .order("updated_at", desc=True)\
        .limit(limit)\
        .execute()
    
    return result.data if result.data else []


def get_conversation(conversation_id: str) -> Optional[dict]:
    """Get a conversation by ID with its messages."""
    if not supabase:
        return None
    
    # Get conversation
    conv_result = supabase.table("conversations")\
        .select("*")\
        .eq("id", conversation_id)\
        .single()\
        .execute()
    
    if not conv_result.data:
        return None
    
    # Get messages for this conversation
    msg_result = supabase.table("messages")\
        .select("*")\
        .eq("conversation_id", conversation_id)\
        .order("created_at", desc=False)\
        .execute()
    
    conversation = conv_result.data
    conversation["messages"] = msg_result.data if msg_result.data else []
    
    return conversation


def update_conversation_title(conversation_id: str, title: str) -> Optional[dict]:
    """Update a conversation's title."""
    if not supabase:
        return None
    
    result = supabase.table("conversations")\
        .update({"title": title, "updated_at": "now()"})\
        .eq("id", conversation_id)\
        .execute()
    
    if result.data:
        return result.data[0]
    return None


def delete_conversation(conversation_id: str) -> bool:
    """Delete a conversation and its messages."""
    if not supabase:
        return False
    
    # Messages will be cascade deleted due to FK constraint
    result = supabase.table("conversations")\
        .delete()\
        .eq("id", conversation_id)\
        .execute()
    
    return bool(result.data)


# ============= Message Operations =============

def add_message(
    conversation_id: str,
    role: str,
    content: str,
    citations: list = None,
    timing_ms: float = None,
    token_usage: dict = None,
    sources_used: int = 0
) -> Optional[dict]:
    """Add a message to a conversation."""
    if not supabase:
        return None
    
    message_data = {
        "conversation_id": conversation_id,
        "role": role,
        "content": content,
        "citations": citations or [],
        "timing_ms": timing_ms,
        "token_usage": token_usage or {},
        "sources_used": sources_used
    }
    
    result = supabase.table("messages").insert(message_data).execute()
    
    if result.data:
        # Update conversation's updated_at timestamp
        supabase.table("conversations")\
            .update({"updated_at": "now()"})\
            .eq("id", conversation_id)\
            .execute()
        return result.data[0]
    return None


def get_messages(conversation_id: str) -> list:
    """Get all messages for a conversation."""
    if not supabase:
        return []
    
    result = supabase.table("messages")\
        .select("*")\
        .eq("conversation_id", conversation_id)\
        .order("created_at", desc=False)\
        .execute()
    
    return result.data if result.data else []


# ============= Query Logging (Analytics) =============

def log_query(
    query: str,
    answer: str = None,
    has_answer: bool = False,
    timing_ms: float = None,
    token_usage: dict = None,
    sources_used: int = 0
) -> Optional[dict]:
    """Log a query for analytics."""
    if not supabase:
        return None
    
    log_data = {
        "query": query,
        "answer": answer,
        "has_answer": has_answer,
        "timing_ms": timing_ms,
        "token_usage": token_usage or {},
        "sources_used": sources_used
    }
    
    result = supabase.table("query_logs").insert(log_data).execute()
    
    if result.data:
        return result.data[0]
    return None


def get_query_logs(limit: int = 100) -> list:
    """Get recent query logs."""
    if not supabase:
        return []
    
    result = supabase.table("query_logs")\
        .select("*")\
        .order("created_at", desc=True)\
        .limit(limit)\
        .execute()
    
    return result.data if result.data else []
