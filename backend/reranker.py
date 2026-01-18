"""Reranker module using Pinecone Inference API."""

from typing import List, Dict, Any
from pinecone import Pinecone
from backend.config import PINECONE_API_KEY, RERANKER_MODEL, TOP_K_RERANK

# Global Pinecone client for inference
_pc = None


def get_pinecone_client() -> Pinecone:
    """Get or initialize the Pinecone client."""
    global _pc
    if _pc is None:
        _pc = Pinecone(api_key=PINECONE_API_KEY)
    return _pc


def rerank(
    query: str,
    documents: List[Dict[str, Any]],
    top_k: int = TOP_K_RERANK
) -> List[Dict[str, Any]]:
    """
    Rerank documents using Pinecone's BGE reranker.
    
    Args:
        query: The search query
        documents: List of retrieved documents
        top_k: Number of top results to return after reranking
        
    Returns:
        Reranked documents with updated scores
    """
    if not documents:
        return []
    
    pc = get_pinecone_client()
    
    # Extract texts for reranking
    texts = [doc["text"] for doc in documents]
    
    # Call Pinecone Inference API for reranking
    rerank_results = pc.inference.rerank(
        model=RERANKER_MODEL,
        query=query,
        documents=texts,
        top_n=min(top_k, len(documents)),
        return_documents=True
    )
    
    # Map reranked results back to original documents
    reranked_docs = []
    for result in rerank_results.data:
        original_idx = result.index
        original_doc = documents[original_idx].copy()
        original_doc["rerank_score"] = result.score
        original_doc["original_score"] = original_doc.get("score", 0)
        reranked_docs.append(original_doc)
    
    return reranked_docs
