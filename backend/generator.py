"""LLM generation module using Groq."""

from typing import List, Dict, Any, Optional
from groq import Groq
from backend.config import GROQ_API_KEY, GROQ_MODEL, MAX_TOKENS, TEMPERATURE

# Global Groq client
_client = None


def get_groq_client() -> Groq:
    """Get or initialize the Groq client."""
    global _client
    if _client is None:
        _client = Groq(api_key=GROQ_API_KEY)
    return _client


def generate_answer(
    query: str,
    contexts: List[Dict[str, Any]],
    max_tokens: int = MAX_TOKENS,
    temperature: float = TEMPERATURE
) -> Dict[str, Any]:
    """
    Generate a grounded answer with inline citations.
    
    Args:
        query: The user's question
        contexts: List of context documents with text and metadata
        max_tokens: Maximum tokens in response
        temperature: Sampling temperature
        
    Returns:
        Dictionary with answer, citations, and usage info
    """
    client = get_groq_client()
    
    # Handle no context case
    if not contexts:
        return {
            "answer": "I don't have enough information to answer this question. Please provide relevant documents first.",
            "citations": [],
            "has_answer": False,
            "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        }
    
    # Build context string with citation markers
    context_parts = []
    for i, ctx in enumerate(contexts):
        citation_num = i + 1
        text = ctx.get("text", "")
        source = ctx.get("metadata", {}).get("source", "Unknown")
        context_parts.append(f"[{citation_num}] Source: {source}\n{text}")
    
    context_str = "\n\n".join(context_parts)
    
    # Build the prompt
    system_prompt = """You are a helpful assistant that answers questions based on the provided context.

IMPORTANT RULES:
1. Only use information from the provided context to answer the question.
2. Include inline citations using [1], [2], etc. to reference the source of each piece of information.
3. If the context doesn't contain enough information to answer the question, say "I cannot find enough information in the provided documents to answer this question."
4. Be concise but comprehensive.
5. Always cite your sources using the citation numbers provided."""

    user_prompt = f"""Context:
{context_str}

Question: {query}

Please provide a well-structured answer with inline citations [1], [2], etc."""

    # Call Groq API
    response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        max_tokens=max_tokens,
        temperature=temperature
    )
    
    answer = response.choices[0].message.content
    
    # Extract citations used in the answer
    citations = []
    for i, ctx in enumerate(contexts):
        citation_num = i + 1
        if f"[{citation_num}]" in answer:
            citations.append({
                "number": citation_num,
                "text": ctx.get("text", "")[:500] + "..." if len(ctx.get("text", "")) > 500 else ctx.get("text", ""),
                "source": ctx.get("metadata", {}).get("source", "Unknown"),
                "title": ctx.get("metadata", {}).get("title", "Untitled")
            })
    
    # Check if answer indicates no information found
    no_answer_phrases = [
        "cannot find enough information",
        "don't have enough information",
        "no information available",
        "not mentioned in the provided"
    ]
    has_answer = not any(phrase in answer.lower() for phrase in no_answer_phrases)
    
    return {
        "answer": answer,
        "citations": citations,
        "has_answer": has_answer,
        "usage": {
            "prompt_tokens": response.usage.prompt_tokens,
            "completion_tokens": response.usage.completion_tokens,
            "total_tokens": response.usage.total_tokens
        }
    }


def generate_qa_pairs(
    document_text: str,
    num_pairs: int = 5,
    max_tokens: int = 2048,
    temperature: float = 0.3
) -> List[Dict[str, Any]]:
    """
    Generate QA pairs from a document for evaluation.
    
    Args:
        document_text: The source document text
        num_pairs: Number of QA pairs to generate
        max_tokens: Maximum tokens in response
        temperature: Sampling temperature
        
    Returns:
        List of QA pair dictionaries with question, expected_answer, and keywords
    """
    import json
    
    client = get_groq_client()
    
    system_prompt = f"""You are an expert at creating evaluation question-answer pairs from documents.
Your task is to generate exactly {num_pairs} diverse QA pairs that can be used to evaluate a RAG system.

RULES:
1. Create questions that require understanding of the document content
2. Questions should cover different topics/sections of the document
3. Include a mix of factual, conceptual, and analytical questions
4. Each answer should be answerable from the document
5. Extract 3-5 relevant keywords that MUST appear in a correct answer

You MUST respond with ONLY a valid JSON array, no other text."""

    user_prompt = f"""Document:
{document_text[:8000]}

Generate exactly {num_pairs} QA pairs as a JSON array with this exact format:
[
  {{
    "id": 1,
    "question": "Your question here?",
    "expected_answer": "The expected answer based on the document",
    "relevant_keywords": ["keyword1", "keyword2", "keyword3"]
  }}
]

Respond with ONLY the JSON array, no markdown or other formatting."""

    response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        max_tokens=max_tokens,
        temperature=temperature
    )
    
    result_text = response.choices[0].message.content.strip()
    
    # Clean up the response - remove markdown code blocks if present
    if result_text.startswith("```"):
        result_text = result_text.split("```")[1]
        if result_text.startswith("json"):
            result_text = result_text[4:]
    if result_text.endswith("```"):
        result_text = result_text[:-3]
    
    try:
        qa_pairs = json.loads(result_text.strip())
        return qa_pairs
    except json.JSONDecodeError:
        # Fallback: return empty list if parsing fails
        return []

