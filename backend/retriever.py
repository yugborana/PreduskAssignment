"""Retrieval module for vector similarity search from Pinecone."""

from typing import List, Dict, Any
from backend.config import TOP_K_RETRIEVAL
from backend.embedder import embed_text
from backend.indexer import get_index


def retrieve(query: str, top_k: int = TOP_K_RETRIEVAL) -> List[Dict[str, Any]]:
    """
    Retrieve top-k similar documents for a query.
    
    Args:
        query: The search query
        top_k: Number of results to retrieve
        
    Returns:
        List of retrieved documents with scores and metadata
    """
    # Embed the query
    query_embedding = embed_text(query)
    
    # Query Pinecone
    index = get_index()
    results = index.query(
        vector=query_embedding,
        top_k=top_k,
        include_metadata=True
    )
    
    # Format results
    documents = []
    for match in results.matches:
        doc = {
            "id": match.id,
            "score": match.score,
            "text": match.metadata.get("text", ""),
            "metadata": {
                "source": match.metadata.get("source", "unknown"),
                "title": match.metadata.get("title", "Untitled"),
                "section": match.metadata.get("section", ""),
                "position": match.metadata.get("position", 0)
            }
        }
        documents.append(doc)
    
    return documents
