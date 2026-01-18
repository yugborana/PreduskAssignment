"""Configuration settings for the RAG system."""

import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# API Keys
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

# Pinecone Configuration
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME", "rag-documents")
PINECONE_CLOUD = "aws"
PINECONE_REGION = "us-east-1"

# Embedding Configuration (Google GenAI)
EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMENSION = 3072  # gemini-embedding-001 dimension

# Chunking Configuration
CHUNK_SIZE = 1000  # characters (~800-1200 tokens)
CHUNK_OVERLAP = 150  # 10-15% overlap

# Retrieval Configuration
TOP_K_RETRIEVAL = 10  # Initial retrieval count
TOP_K_RERANK = 5  # After reranking

# Reranker Configuration
RERANKER_MODEL = "bge-reranker-v2-m3"

# LLM Configuration
GROQ_MODEL = "llama-3.3-70b-versatile" 
MAX_TOKENS = 2048
TEMPERATURE = 0.1

# Supabase Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
