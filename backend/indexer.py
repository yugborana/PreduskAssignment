"""Pinecone indexing module for document storage."""

import uuid
from typing import List, Dict, Any, Optional
from pinecone import Pinecone, ServerlessSpec
from backend.config import (
    PINECONE_API_KEY,
    PINECONE_INDEX_NAME,
    PINECONE_CLOUD,
    PINECONE_REGION,
    EMBEDDING_DIMENSION
)
from backend.embedder import embed_batch
from backend.chunker import create_chunks

# Global Pinecone client
_pc = None
_index = None


def get_pinecone_client() -> Pinecone:
    """Get or initialize the Pinecone client."""
    global _pc
    if _pc is None:
        _pc = Pinecone(api_key=PINECONE_API_KEY)
    return _pc


def get_index():
    """Get or initialize the Pinecone index."""
    global _index
    if _index is None:
        pc = get_pinecone_client()
        
        # Check if index exists, create if not
        existing_indexes = [idx.name for idx in pc.list_indexes()]
        
        if PINECONE_INDEX_NAME not in existing_indexes:
            pc.create_index(
                name=PINECONE_INDEX_NAME,
                dimension=EMBEDDING_DIMENSION,
                metric="cosine",
                spec=ServerlessSpec(
                    cloud=PINECONE_CLOUD,
                    region=PINECONE_REGION
                )
            )
        
        _index = pc.Index(PINECONE_INDEX_NAME)
    
    return _index


def index_document(
    text: str,
    source: str = "unknown",
    title: str = "Untitled",
    section: str = "",
    doc_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Index a document by chunking, embedding, and upserting to Pinecone.
    
    Args:
        text: The document text to index
        source: Source identifier
        title: Document title
        section: Section name
        doc_id: Optional document ID prefix
        
    Returns:
        Dictionary with indexing results
    """
    # Generate document ID if not provided
    if doc_id is None:
        doc_id = str(uuid.uuid4())[:8]
    
    # Create chunks with metadata
    chunks = create_chunks(text, source, title, section)
    
    if not chunks:
        return {"success": False, "error": "No chunks created", "chunks_indexed": 0}
    
    # Extract texts for embedding
    texts = [chunk["text"] for chunk in chunks]
    
    # Generate embeddings
    embeddings = embed_batch(texts)
    
    # Prepare vectors for upsert
    vectors = []
    for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        vector_id = f"{doc_id}_{i}"
        vectors.append({
            "id": vector_id,
            "values": embedding,
            "metadata": {
                **chunk["metadata"],
                "text": chunk["text"]  # Store text in metadata for retrieval
            }
        })
    
    # Upsert to Pinecone
    index = get_index()
    index.upsert(vectors=vectors)
    
    return {
        "success": True,
        "doc_id": doc_id,
        "chunks_indexed": len(vectors),
        "source": source,
        "title": title
    }


def delete_document(doc_id: str) -> Dict[str, Any]:
    """
    Delete all vectors associated with a document ID.
    
    Args:
        doc_id: The document ID prefix
        
    Returns:
        Dictionary with deletion results
    """
    index = get_index()
    
    # Delete by ID prefix (Pinecone supports this via filter)
    index.delete(filter={"source": doc_id})
    
    return {"success": True, "doc_id": doc_id}


def get_index_stats() -> Dict[str, Any]:
    """Get statistics about the Pinecone index."""
    index = get_index()
    stats = index.describe_index_stats()
    return {
        "total_vectors": stats.total_vector_count,
        "dimension": stats.dimension,
        "index_fullness": stats.index_fullness
    }
