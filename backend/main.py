"""FastAPI application for RAG system."""

import time
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.indexer import index_document, get_index_stats
from backend.retriever import retrieve
from backend.reranker import rerank
from backend.generator import generate_answer, generate_qa_pairs
from backend.config import TOP_K_RETRIEVAL, TOP_K_RERANK
from backend.supabase_client import (
    is_supabase_configured,
    create_conversation,
    get_conversations,
    get_conversation,
    update_conversation_title,
    delete_conversation,
    add_message,
    log_query
)

# Initialize FastAPI app
app = FastAPI(
    title="RAG System API",
    description="Retrieval-Augmented Generation system with Pinecone, Groq, and BGE reranker",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request/Response models
class IndexRequest(BaseModel):
    text: str
    source: Optional[str] = "user_upload"
    title: Optional[str] = "Uploaded Document"
    section: Optional[str] = ""


class IndexResponse(BaseModel):
    success: bool
    doc_id: Optional[str] = None
    chunks_indexed: int = 0
    message: str = ""


class QueryRequest(BaseModel):
    query: str
    top_k_retrieval: Optional[int] = TOP_K_RETRIEVAL
    top_k_rerank: Optional[int] = TOP_K_RERANK


class Citation(BaseModel):
    number: int
    text: str
    source: str
    title: str


class QueryResponse(BaseModel):
    answer: str
    citations: list[Citation]
    has_answer: bool
    timing_ms: float
    token_usage: dict
    sources_used: int


class HealthResponse(BaseModel):
    status: str
    index_stats: Optional[dict] = None
    supabase_configured: bool = False


# Conversation models
class ConversationCreate(BaseModel):
    title: Optional[str] = "New Conversation"


class ConversationUpdate(BaseModel):
    title: str


class MessageCreate(BaseModel):
    query: str
    top_k_retrieval: Optional[int] = TOP_K_RETRIEVAL
    top_k_rerank: Optional[int] = TOP_K_RERANK


class Message(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    citations: list = []
    timing_ms: Optional[float] = None
    token_usage: dict = {}
    sources_used: int = 0
    created_at: str


class Conversation(BaseModel):
    id: str
    title: str
    created_at: str
    updated_at: str
    messages: list[Message] = []


# API Routes
@app.get("/")
async def root():
    return {"message": "RAG System API is running. Visit /docs for documentation."}

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint with index stats."""
    try:
        stats = get_index_stats()
        return HealthResponse(
            status="healthy",
            index_stats=stats,
            supabase_configured=is_supabase_configured()
        )
    except Exception as e:
        return HealthResponse(
            status=f"unhealthy: {str(e)}",
            supabase_configured=is_supabase_configured()
        )


@app.post("/index", response_model=IndexResponse)
async def index_doc(request: IndexRequest):
    """
    Index a document for later retrieval.
    
    - Chunks the document with 10-15% overlap
    - Generates embeddings using sentence-transformers
    - Stores in Pinecone with metadata
    """
    try:
        if not request.text.strip():
            raise HTTPException(status_code=400, detail="Text cannot be empty")
        
        result = index_document(
            text=request.text,
            source=request.source,
            title=request.title,
            section=request.section
        )
        
        if result["success"]:
            return IndexResponse(
                success=True,
                doc_id=result["doc_id"],
                chunks_indexed=result["chunks_indexed"],
                message=f"Successfully indexed {result['chunks_indexed']} chunks"
            )
        else:
            return IndexResponse(
                success=False,
                message=result.get("error", "Unknown error")
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/query", response_model=QueryResponse)
async def query_rag(request: QueryRequest):
    """
    Query the RAG system.
    
    Pipeline:
    1. Retrieve top-k documents from Pinecone
    2. Rerank using BGE reranker via Pinecone Inference
    3. Generate answer with Groq LLM
    4. Return answer with inline citations
    """
    try:
        start_time = time.time()
        
        if not request.query.strip():
            raise HTTPException(status_code=400, detail="Query cannot be empty")
        
        # Step 1: Retrieve
        retrieved_docs = retrieve(request.query, top_k=request.top_k_retrieval)
        
        if not retrieved_docs:
            return QueryResponse(
                answer="No relevant documents found. Please index some documents first.",
                citations=[],
                has_answer=False,
                timing_ms=round((time.time() - start_time) * 1000, 2),
                token_usage={"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
                sources_used=0
            )
        
        # Step 2: Rerank
        reranked_docs = rerank(request.query, retrieved_docs, top_k=request.top_k_rerank)
        
        # Step 3: Generate
        result = generate_answer(request.query, reranked_docs)
        
        end_time = time.time()
        timing_ms = round((end_time - start_time) * 1000, 2)
        
        # Log query to Supabase (if configured)
        log_query(
            query=request.query,
            answer=result["answer"],
            has_answer=result["has_answer"],
            timing_ms=timing_ms,
            token_usage=result["usage"],
            sources_used=len(reranked_docs)
        )
        
        return QueryResponse(
            answer=result["answer"],
            citations=[Citation(**c) for c in result["citations"]],
            has_answer=result["has_answer"],
            timing_ms=timing_ms,
            token_usage=result["usage"],
            sources_used=len(reranked_docs)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/stats")
async def get_stats():
    """Get index statistics."""
    try:
        stats = get_index_stats()
        return {"success": True, "stats": stats}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/eval")
async def run_evaluation():
    """
    Run evaluation on the 5 QA pairs.
    
    Returns precision, recall, success rate, and individual results.
    """
    import json
    from pathlib import Path
    
    try:
        # Load eval dataset
        eval_path = Path(__file__).parent.parent / "eval" / "eval_dataset.json"
        with open(eval_path, "r") as f:
            dataset = json.load(f)
        
        results = []
        total_success = 0
        total_precision = 0
        total_recall = 0
        
        for item in dataset:
            # Index the context document first
            index_document(
                text=item["context_document"],
                source=f"eval_doc_{item['id']}",
                title=f"Evaluation Document {item['id']}"
            )
            
            # Query the system
            retrieved_docs = retrieve(item["question"], top_k=TOP_K_RETRIEVAL)
            reranked_docs = rerank(item["question"], retrieved_docs, top_k=TOP_K_RERANK)
            answer_result = generate_answer(item["question"], reranked_docs)
            
            # Calculate metrics based on keyword overlap
            answer_lower = answer_result["answer"].lower()
            keywords = item["relevant_keywords"]
            found_keywords = [kw for kw in keywords if kw.lower() in answer_lower]
            
            recall = len(found_keywords) / len(keywords) if keywords else 0
            precision = len(found_keywords) / len(keywords) if keywords else 0
            success = answer_result["has_answer"] and recall >= 0.5
            
            total_precision += precision
            total_recall += recall
            if success:
                total_success += 1
            
            results.append({
                "id": item["id"],
                "question": item["question"],
                "answer": answer_result["answer"][:500] + "..." if len(answer_result["answer"]) > 500 else answer_result["answer"],
                "precision": round(precision, 3),
                "recall": round(recall, 3),
                "success": success,
                "found_keywords": found_keywords
            })
        
        n = len(dataset)
        return {
            "success": True,
            "aggregate": {
                "total_questions": n,
                "successful_answers": total_success,
                "success_rate": round(total_success / n, 3) if n > 0 else 0,
                "avg_precision": round(total_precision / n, 3) if n > 0 else 0,
                "avg_recall": round(total_recall / n, 3) if n > 0 else 0
            },
            "results": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class EvalDocumentRequest(BaseModel):
    text: str
    title: Optional[str] = "Uploaded Document"


@app.post("/eval-document")
async def eval_document(request: EvalDocumentRequest):
    """
    Generate 5 QA pairs from uploaded document and run evaluation.
    
    1. Index the document
    2. Generate 5 QA pairs using LLM
    3. Run each question through RAG pipeline
    4. Calculate precision, recall, success rate
    """
    try:
        if not request.text.strip():
            raise HTTPException(status_code=400, detail="Document text cannot be empty")
        
        # Step 1: Index the document
        index_result = index_document(
            text=request.text,
            source="eval_document",
            title=request.title
        )
        
        if not index_result["success"]:
            raise HTTPException(status_code=500, detail="Failed to index document")
        
        # Step 2: Generate QA pairs from the document
        qa_pairs = generate_qa_pairs(request.text, num_pairs=5)
        
        if not qa_pairs:
            raise HTTPException(status_code=500, detail="Failed to generate QA pairs")
        
        # Step 3: Run evaluation
        results = []
        total_success = 0
        total_precision = 0
        total_recall = 0
        
        for item in qa_pairs:
            # Query the system
            retrieved_docs = retrieve(item["question"], top_k=TOP_K_RETRIEVAL)
            reranked_docs = rerank(item["question"], retrieved_docs, top_k=TOP_K_RERANK)
            answer_result = generate_answer(item["question"], reranked_docs)
            
            # Calculate metrics based on keyword overlap
            answer_lower = answer_result["answer"].lower()
            keywords = item.get("relevant_keywords", [])
            found_keywords = [kw for kw in keywords if kw.lower() in answer_lower]
            
            recall = len(found_keywords) / len(keywords) if keywords else 0
            precision = len(found_keywords) / len(keywords) if keywords else 0
            success = answer_result["has_answer"] and recall >= 0.5
            
            total_precision += precision
            total_recall += recall
            if success:
                total_success += 1
            
            results.append({
                "id": item.get("id", 0),
                "question": item["question"],
                "expected_answer": item.get("expected_answer", ""),
                "actual_answer": answer_result["answer"][:500] + "..." if len(answer_result["answer"]) > 500 else answer_result["answer"],
                "precision": round(precision, 3),
                "recall": round(recall, 3),
                "success": success,
                "found_keywords": found_keywords,
                "expected_keywords": keywords
            })
        
        n = len(qa_pairs)
        return {
            "success": True,
            "document_indexed": {
                "doc_id": index_result["doc_id"],
                "chunks": index_result["chunks_indexed"]
            },
            "qa_pairs_generated": n,
            "aggregate": {
                "total_questions": n,
                "successful_answers": total_success,
                "success_rate": round(total_success / n, 3) if n > 0 else 0,
                "avg_precision": round(total_precision / n, 3) if n > 0 else 0,
                "avg_recall": round(total_recall / n, 3) if n > 0 else 0
            },
            "results": results
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)


# ============= Conversation Endpoints =============

@app.get("/conversations")
async def list_conversations():
    """List all conversations."""
    if not is_supabase_configured():
        raise HTTPException(
            status_code=503,
            detail="Supabase not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY to .env"
        )
    
    conversations = get_conversations()
    return {"success": True, "conversations": conversations}


@app.post("/conversations")
async def create_new_conversation(request: ConversationCreate = None):
    """Create a new conversation."""
    if not is_supabase_configured():
        raise HTTPException(
            status_code=503,
            detail="Supabase not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY to .env"
        )
    
    title = request.title if request else "New Conversation"
    conversation = create_conversation(title)
    
    if not conversation:
        raise HTTPException(status_code=500, detail="Failed to create conversation")
    
    return {"success": True, "conversation": conversation}


@app.get("/conversations/{conversation_id}")
async def get_single_conversation(conversation_id: str):
    """Get a conversation with all its messages."""
    if not is_supabase_configured():
        raise HTTPException(
            status_code=503,
            detail="Supabase not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY to .env"
        )
    
    conversation = get_conversation(conversation_id)
    
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    return {"success": True, "conversation": conversation}


@app.patch("/conversations/{conversation_id}")
async def update_conversation(conversation_id: str, request: ConversationUpdate):
    """Update a conversation's title."""
    if not is_supabase_configured():
        raise HTTPException(
            status_code=503,
            detail="Supabase not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY to .env"
        )
    
    conversation = update_conversation_title(conversation_id, request.title)
    
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    return {"success": True, "conversation": conversation}


@app.delete("/conversations/{conversation_id}")
async def remove_conversation(conversation_id: str):
    """Delete a conversation and all its messages."""
    if not is_supabase_configured():
        raise HTTPException(
            status_code=503,
            detail="Supabase not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY to .env"
        )
    
    success = delete_conversation(conversation_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    return {"success": True, "message": "Conversation deleted"}


@app.post("/conversations/{conversation_id}/messages")
async def send_message(conversation_id: str, request: MessageCreate):
    """
    Send a message to a conversation and get RAG response.
    
    1. Saves user message
    2. Runs RAG pipeline
    3. Saves assistant response with citations
    4. Returns the response
    """
    if not is_supabase_configured():
        raise HTTPException(
            status_code=503,
            detail="Supabase not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY to .env"
        )
    
    try:
        start_time = time.time()
        
        # Verify conversation exists
        conversation = get_conversation(conversation_id)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Save user message
        user_msg = add_message(
            conversation_id=conversation_id,
            role="user",
            content=request.query
        )
        
        if not user_msg:
            raise HTTPException(status_code=500, detail="Failed to save user message")
        
        # Run RAG pipeline
        retrieved_docs = retrieve(request.query, top_k=request.top_k_retrieval)
        
        if not retrieved_docs:
            # No documents found
            assistant_msg = add_message(
                conversation_id=conversation_id,
                role="assistant",
                content="No relevant documents found. Please index some documents first.",
                citations=[],
                timing_ms=round((time.time() - start_time) * 1000, 2),
                token_usage={"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
                sources_used=0
            )
            return {
                "success": True,
                "user_message": user_msg,
                "assistant_message": assistant_msg,
                "has_answer": False
            }
        
        # Rerank and generate
        reranked_docs = rerank(request.query, retrieved_docs, top_k=request.top_k_rerank)
        result = generate_answer(request.query, reranked_docs)
        
        timing_ms = round((time.time() - start_time) * 1000, 2)
        
        # Save assistant message
        assistant_msg = add_message(
            conversation_id=conversation_id,
            role="assistant",
            content=result["answer"],
            citations=result["citations"],
            timing_ms=timing_ms,
            token_usage=result["usage"],
            sources_used=len(reranked_docs)
        )
        
        # Optional: Log query for analytics
        log_query(
            query=request.query,
            answer=result["answer"],
            has_answer=result["has_answer"],
            timing_ms=timing_ms,
            token_usage=result["usage"],
            sources_used=len(reranked_docs)
        )
        
        return {
            "success": True,
            "user_message": user_msg,
            "assistant_message": assistant_msg,
            "has_answer": result["has_answer"]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
