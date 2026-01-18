"""Document chunking module using LangChain text splitters."""

from typing import List, Dict, Any
from langchain_text_splitters import RecursiveCharacterTextSplitter
from backend.config import CHUNK_SIZE, CHUNK_OVERLAP


def create_chunks(
    text: str,
    source: str = "unknown",
    title: str = "Untitled",
    section: str = ""
) -> List[Dict[str, Any]]:
    """
    Split text into chunks with metadata.
    
    Args:
        text: The full text to chunk
        source: Source identifier (filename, URL, etc.)
        title: Document title
        section: Section name if applicable
        
    Returns:
        List of chunk dictionaries with text and metadata
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        length_function=len,
        separators=["\n\n", "\n", ". ", " ", ""]
    )
    
    # Split text into chunks
    chunks = splitter.split_text(text)
    
    # Create chunk objects with metadata
    chunk_objects = []
    for i, chunk_text in enumerate(chunks):
        chunk_obj = {
            "text": chunk_text,
            "metadata": {
                "source": source,
                "title": title,
                "section": section,
                "position": i,
                "total_chunks": len(chunks)
            }
        }
        chunk_objects.append(chunk_obj)
    
    return chunk_objects


def estimate_tokens(text: str) -> int:
    """
    Estimate token count (rough approximation: 1 token ≈ 4 characters).
    
    Args:
        text: Text to estimate tokens for
        
    Returns:
        Estimated token count
    """
    return len(text) // 4
