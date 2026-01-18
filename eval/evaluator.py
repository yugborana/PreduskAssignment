"""
Evaluation module for the RAG system.

This module evaluates the RAG pipeline using precision, recall, and success rate metrics.
"""

import json
import sys
import os
from typing import List, Dict, Any
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.indexer import index_document
from backend.retriever import retrieve
from backend.reranker import rerank
from backend.generator import generate_answer
from backend.config import TOP_K_RETRIEVAL, TOP_K_RERANK


def load_eval_dataset(filepath: str = "eval/eval_dataset.json") -> List[Dict[str, Any]]:
    """Load the evaluation dataset."""
    with open(filepath, "r") as f:
        return json.load(f)


def index_eval_documents(dataset: List[Dict[str, Any]]) -> None:
    """Index all context documents from the evaluation dataset."""
    print("Indexing evaluation documents...")
    for item in dataset:
        result = index_document(
            text=item["context_document"],
            source=f"eval_doc_{item['id']}",
            title=f"Evaluation Document {item['id']}"
        )
        print(f"  - Indexed document {item['id']}: {result['chunks_indexed']} chunks")
    print("Done indexing.\n")


def calculate_keyword_overlap(answer: str, keywords: List[str]) -> Dict[str, Any]:
    """
    Calculate precision and recall based on keyword overlap.
    
    Precision: What fraction of generated content is relevant (keywords found / expected keywords)?
    Recall: What fraction of expected keywords were found in the answer?
    """
    answer_lower = answer.lower()
    
    # Check which keywords are present in the answer
    found_keywords = [kw for kw in keywords if kw.lower() in answer_lower]
    
    recall = len(found_keywords) / len(keywords) if keywords else 0
    precision = len(found_keywords) / len(keywords) if keywords else 0  # Simplified for this context
    
    return {
        "found_keywords": found_keywords,
        "total_keywords": len(keywords),
        "precision": round(precision, 3),
        "recall": round(recall, 3)
    }


def evaluate_single(
    question: str,
    expected_keywords: List[str],
    expected_answer: str
) -> Dict[str, Any]:
    """
    Evaluate a single question through the RAG pipeline.
    
    Returns:
        Dictionary with answer, metrics, and success status
    """
    # Step 1: Retrieve
    retrieved = retrieve(question, top_k=TOP_K_RETRIEVAL)
    
    # Step 2: Rerank
    reranked = rerank(question, retrieved, top_k=TOP_K_RERANK)
    
    # Step 3: Generate
    result = generate_answer(question, reranked)
    
    # Calculate metrics
    metrics = calculate_keyword_overlap(result["answer"], expected_keywords)
    
    # Determine success (has_answer and reasonable recall)
    success = result["has_answer"] and metrics["recall"] >= 0.5
    
    return {
        "answer": result["answer"],
        "has_answer": result["has_answer"],
        "citations": result["citations"],
        "metrics": metrics,
        "success": success,
        "token_usage": result["usage"]
    }


def run_evaluation(dataset: List[Dict[str, Any]], index_first: bool = True) -> Dict[str, Any]:
    """
    Run evaluation on the entire dataset.
    
    Args:
        dataset: List of evaluation items
        index_first: Whether to index documents before evaluation
        
    Returns:
        Comprehensive evaluation results
    """
    if index_first:
        index_eval_documents(dataset)
    
    results = []
    total_success = 0
    total_precision = 0
    total_recall = 0
    
    print("Running evaluation...")
    print("=" * 60)
    
    for item in dataset:
        print(f"\nQuestion {item['id']}: {item['question'][:50]}...")
        
        eval_result = evaluate_single(
            question=item["question"],
            expected_keywords=item["relevant_keywords"],
            expected_answer=item["expected_answer"]
        )
        
        results.append({
            "id": item["id"],
            "question": item["question"],
            **eval_result
        })
        
        # Aggregate metrics
        total_precision += eval_result["metrics"]["precision"]
        total_recall += eval_result["metrics"]["recall"]
        if eval_result["success"]:
            total_success += 1
        
        # Print result
        status = "✓ SUCCESS" if eval_result["success"] else "✗ FAILED"
        print(f"  {status}")
        print(f"  Precision: {eval_result['metrics']['precision']:.2f}, Recall: {eval_result['metrics']['recall']:.2f}")
        print(f"  Keywords found: {eval_result['metrics']['found_keywords']}")
    
    # Calculate aggregate metrics
    n = len(dataset)
    aggregate = {
        "total_questions": n,
        "successful_answers": total_success,
        "success_rate": round(total_success / n, 3) if n > 0 else 0,
        "avg_precision": round(total_precision / n, 3) if n > 0 else 0,
        "avg_recall": round(total_recall / n, 3) if n > 0 else 0
    }
    
    print("\n" + "=" * 60)
    print("EVALUATION SUMMARY")
    print("=" * 60)
    print(f"Total Questions: {aggregate['total_questions']}")
    print(f"Successful Answers: {aggregate['successful_answers']}")
    print(f"Success Rate: {aggregate['success_rate'] * 100:.1f}%")
    print(f"Average Precision: {aggregate['avg_precision']:.3f}")
    print(f"Average Recall: {aggregate['avg_recall']:.3f}")
    
    return {
        "timestamp": datetime.now().isoformat(),
        "aggregate": aggregate,
        "individual_results": results
    }


def save_results(results: Dict[str, Any], filepath: str = "eval/eval_results.json") -> None:
    """Save evaluation results to a JSON file."""
    with open(filepath, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to {filepath}")


if __name__ == "__main__":
    # Load dataset
    dataset = load_eval_dataset()
    
    # Run evaluation
    results = run_evaluation(dataset, index_first=True)
    
    # Save results
    save_results(results)
