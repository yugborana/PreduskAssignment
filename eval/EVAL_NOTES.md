# Evaluation Metrics Documentation

This document explains the evaluation metrics used in our RAG system assessment.

## Overview

We evaluate the RAG pipeline using 5 question-answer pairs focused on machine learning concepts. Each evaluation measures how well the system retrieves relevant information and generates accurate answers.

---

## Metrics Explained

### 1. Precision

**Definition**: The proportion of retrieved/generated content that is relevant.

```
Precision = Relevant Keywords Found / Total Expected Keywords
```

**Interpretation**:
- **High precision (≥0.8)**: The answer is focused and contains mostly relevant information
- **Low precision (<0.5)**: The answer may contain irrelevant or off-topic content

**Example**: If we expect keywords ["machine learning", "data", "patterns"] and the answer contains "machine learning" and "data", precision = 2/3 = 0.67

---

### 2. Recall

**Definition**: The proportion of expected information that was successfully retrieved and included in the answer.

```
Recall = Relevant Keywords Found / Total Expected Keywords
```

**Interpretation**:
- **High recall (≥0.8)**: Most of the expected information is present in the answer
- **Low recall (<0.5)**: The answer is missing significant expected information

**Example**: If we expect 5 keywords and only 3 appear in the answer, recall = 3/5 = 0.6

---

### 3. Success Rate

**Definition**: The percentage of questions that were answered successfully.

```
Success Rate = Successful Answers / Total Questions
```

**Success Criteria**:
1. The system generated an answer (not "I don't know")
2. Recall ≥ 0.5 (at least half of expected keywords are present)

**Interpretation**:
- **High success rate (≥80%)**: The RAG system reliably answers most questions
- **Moderate (50-80%)**: Room for improvement in retrieval or generation
- **Low (<50%)**: Significant issues with the pipeline

---

## Trade-offs

### Precision vs Recall Trade-off

There's often a tension between precision and recall:

| Strategy | Precision | Recall | Use Case |
|----------|-----------|--------|----------|
| Conservative | High | Low | When accuracy is critical |
| Aggressive | Low | High | When coverage is critical |
| Balanced | Medium | Medium | General use cases |

In RAG systems, this manifests in:
- **Top-k selection**: Lower k = higher precision, lower recall
- **Reranking threshold**: Stricter threshold = higher precision, lower recall

---

## Our Evaluation Approach

1. **Index Context Documents**: We index the ground-truth context for each QA pair
2. **Query the System**: Each question is processed through the full RAG pipeline
3. **Measure Keywords**: We check which expected keywords appear in the generated answer
4. **Calculate Metrics**: Aggregate precision, recall, and success rate across all questions

### Limitations

- Keyword-based evaluation is a simplified proxy for semantic correctness
- Does not capture answer quality, coherence, or citation accuracy
- Limited to 5 QA pairs (minimal evaluation set)

### Future Improvements

- Use LLM-as-judge for semantic evaluation
- Expand to 50+ diverse QA pairs
- Add context relevance scoring
- Measure citation accuracy separately

---

## Running the Evaluation

```bash
cd PreduskAssignment
python -m eval.evaluator
```

Results are saved to `eval/eval_results.json` with detailed per-question metrics.
