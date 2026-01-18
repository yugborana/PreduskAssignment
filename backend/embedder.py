"""Embedding module using Google GenAI."""

from typing import List
from google import genai
from backend.config import GOOGLE_API_KEY, EMBEDDING_MODEL

# Initialize Google GenAI client
_client = None


def get_client() -> genai.Client:
    """Get or initialize the Google GenAI client."""
    global _client
    if _client is None:
        _client = genai.Client(api_key=GOOGLE_API_KEY)
    return _client


def embed_text(text: str) -> List[float]:
    """
    Embed a single text string using Google GenAI.
    
    Args:
        text: The text to embed
        
    Returns:
        List of floats representing the embedding vector
    """
    client = get_client()
    response = client.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=text
    )
    return response.embeddings[0].values


def embed_batch(texts: List[str]) -> List[List[float]]:
    """
    Embed a batch of texts using Google GenAI.
    
    Args:
        texts: List of texts to embed
        
    Returns:
        List of embedding vectors
    """
    client = get_client()
    
    # Google GenAI supports batch embedding
    response = client.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=texts
    )
    
    return [embedding.values for embedding in response.embeddings]
