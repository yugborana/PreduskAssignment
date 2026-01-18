"use client";

import { useState, useEffect } from "react";

interface Citation {
  number: number;
  text: string;
  source: string;
  title: string;
}

interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  timing_ms: number | null;
  token_usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  sources_used: number;
  created_at: string;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages?: Message[];
}

interface QueryResponse {
  answer: string;
  citations: Citation[];
  has_answer: boolean;
  timing_ms: number;
  token_usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  sources_used: number;
}

interface IndexResponse {
  success: boolean;
  doc_id?: string;
  chunks_indexed: number;
  message: string;
}

interface EvalResult {
  id: number;
  question: string;
  answer: string;
  precision: number;
  recall: number;
  success: boolean;
  found_keywords: string[];
}

interface EvalResponse {
  success: boolean;
  aggregate: {
    total_questions: number;
    successful_answers: number;
    success_rate: number;
    avg_precision: number;
    avg_recall: number;
  };
  results: EvalResult[];
}

interface HealthResponse {
  status: string;
  index_stats: object | null;
  supabase_configured: boolean;
}

const API_BASE = "http://localhost:8000";

export default function Home() {
  // Supabase status
  const [supabaseConfigured, setSupabaseConfigured] = useState(false);

  // Conversation state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);

  // Document upload state
  const [documentText, setDocumentText] = useState("");
  const [documentTitle, setDocumentTitle] = useState("");
  const [indexing, setIndexing] = useState(false);
  const [indexResult, setIndexResult] = useState<IndexResponse | null>(null);

  // Query state
  const [query, setQuery] = useState("");
  const [querying, setQuerying] = useState(false);
  const [response, setResponse] = useState<QueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Eval state
  const [runningEval, setRunningEval] = useState(false);
  const [evalResult, setEvalResult] = useState<EvalResponse | null>(null);
  const [showEvalPanel, setShowEvalPanel] = useState(false);

  // Expanded citation
  const [expandedCitation, setExpandedCitation] = useState<number | null>(null);

  // Check health and load conversations on mount
  useEffect(() => {
    checkHealth();
  }, []);

  useEffect(() => {
    if (supabaseConfigured) {
      loadConversations();
    }
  }, [supabaseConfigured]);

  const checkHealth = async () => {
    try {
      const res = await fetch(`${API_BASE}/health`);
      const data: HealthResponse = await res.json();
      setSupabaseConfigured(data.supabase_configured);
    } catch (err) {
      console.error("Health check failed:", err);
    }
  };

  const loadConversations = async () => {
    setLoadingConversations(true);
    try {
      const res = await fetch(`${API_BASE}/conversations`);
      const data = await res.json();
      if (data.success) {
        setConversations(data.conversations);
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
    } finally {
      setLoadingConversations(false);
    }
  };

  const createNewConversation = async () => {
    try {
      const res = await fetch(`${API_BASE}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Conversation" }),
      });
      const data = await res.json();
      if (data.success) {
        setConversations([data.conversation, ...conversations]);
        setActiveConversation({ ...data.conversation, messages: [] });
        setResponse(null);
        setError(null);
      }
    } catch (err) {
      setError(`Failed to create conversation: ${err}`);
    }
  };

  const loadConversation = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/conversations/${id}`);
      const data = await res.json();
      if (data.success) {
        setActiveConversation(data.conversation);
        setResponse(null);
        setError(null);
      }
    } catch (err) {
      setError(`Failed to load conversation: ${err}`);
    }
  };

  const deleteConversation = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/conversations/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setConversations(conversations.filter((c) => c.id !== id));
        if (activeConversation?.id === id) {
          setActiveConversation(null);
        }
      }
    } catch (err) {
      setError(`Failed to delete conversation: ${err}`);
    }
  };

  const handleIndexDocument = async () => {
    if (!documentText.trim()) return;

    setIndexing(true);
    setError(null);
    setIndexResult(null);

    try {
      const res = await fetch(`${API_BASE}/index`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: documentText,
          title: documentTitle || "Uploaded Document",
          source: "user_upload",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(`API Error: ${data.detail || JSON.stringify(data)}`);
        return;
      }

      setIndexResult(data as IndexResponse);
    } catch (err) {
      setError(`Failed to index document: ${err}`);
    } finally {
      setIndexing(false);
    }
  };

  const handleQuery = async () => {
    if (!query.trim()) return;

    // If we have an active conversation, send message there
    if (activeConversation && supabaseConfigured) {
      await handleConversationQuery();
      return;
    }

    // If Supabase is configured but no active conversation, auto-create one
    if (supabaseConfigured && !activeConversation) {
      setQuerying(true);
      setError(null);

      try {
        // Create a new conversation with the query as title
        const newTitle = query.slice(0, 50) + (query.length > 50 ? "..." : "");
        const convRes = await fetch(`${API_BASE}/conversations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle }),
        });
        const convData = await convRes.json();

        if (!convData.success) {
          throw new Error("Failed to create conversation");
        }

        // Send the message to the new conversation
        const msgRes = await fetch(
          `${API_BASE}/conversations/${convData.conversation.id}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query }),
          }
        );
        const msgData = await msgRes.json();

        if (!msgRes.ok) {
          setError(`API Error: ${msgData.detail || JSON.stringify(msgData)}`);
          return;
        }

        // Set the new conversation as active
        const newConversation = {
          ...convData.conversation,
          title: newTitle,
          messages: [msgData.user_message, msgData.assistant_message],
        };

        setActiveConversation(newConversation);
        setConversations([newConversation, ...conversations]);
        setQuery("");
        setResponse(null);

      } catch (err) {
        setError(`Failed to query: ${err}`);
      } finally {
        setQuerying(false);
      }
      return;
    }

    // Fallback: use the regular query endpoint (Supabase not configured)
    setQuerying(true);
    setError(null);
    setResponse(null);

    try {
      const res = await fetch(`${API_BASE}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(`API Error: ${data.detail || JSON.stringify(data)}`);
        return;
      }

      setResponse(data as QueryResponse);
    } catch (err) {
      setError(`Failed to query: ${err}`);
    } finally {
      setQuerying(false);
    }
  };

  const handleConversationQuery = async () => {
    if (!activeConversation || !query.trim()) return;

    setQuerying(true);
    setError(null);

    try {
      const res = await fetch(
        `${API_BASE}/conversations/${activeConversation.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(`API Error: ${data.detail || JSON.stringify(data)}`);
        return;
      }

      // Add both messages to the conversation
      const updatedMessages = [
        ...(activeConversation.messages || []),
        data.user_message,
        data.assistant_message,
      ];

      setActiveConversation({
        ...activeConversation,
        messages: updatedMessages,
      });

      // Update conversation title if it's the first message
      if (activeConversation.title === "New Conversation" && query.trim()) {
        const newTitle = query.slice(0, 50) + (query.length > 50 ? "..." : "");

        // Save title to Supabase
        try {
          await fetch(`${API_BASE}/conversations/${activeConversation.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: newTitle }),
          });
        } catch (e) {
          console.error("Failed to update conversation title:", e);
        }

        // Update in local list
        setConversations(
          conversations.map((c) =>
            c.id === activeConversation.id ? { ...c, title: newTitle } : c
          )
        );

        // Update active conversation
        setActiveConversation({
          ...activeConversation,
          title: newTitle,
          messages: updatedMessages,
        });
      }

      setQuery("");
    } catch (err) {
      setError(`Failed to send message: ${err}`);
    } finally {
      setQuerying(false);
    }
  };

  const handleRunEval = async () => {
    setRunningEval(true);
    setError(null);
    setEvalResult(null);
    setShowEvalPanel(true);

    try {
      const res = await fetch(`${API_BASE}/eval`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(`Eval Error: ${data.detail || JSON.stringify(data)}`);
        return;
      }

      setEvalResult(data as EvalResponse);
    } catch (err) {
      setError(`Failed to run evaluation: ${err}`);
    } finally {
      setRunningEval(false);
    }
  };

  const handleEvalDocument = async () => {
    if (!documentText.trim()) {
      setError("Please enter document text first");
      return;
    }

    setRunningEval(true);
    setError(null);
    setEvalResult(null);
    setShowEvalPanel(true);

    try {
      const res = await fetch(`${API_BASE}/eval-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: documentText,
          title: documentTitle || "Uploaded Document",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(`Eval Error: ${data.detail || JSON.stringify(data)}`);
        return;
      }

      setEvalResult(data as EvalResponse);
    } catch (err) {
      setError(`Failed to run evaluation: ${err}`);
    } finally {
      setRunningEval(false);
    }
  };

  const formatAnswer = (answer: string) => {
    // Highlight citation markers [1], [2], etc.
    if (!answer) return null;
    return answer.split(/(\[\d+\])/).map((part, i) => {
      if (/^\[\d+\]$/.test(part)) {
        const num = parseInt(part.replace(/[\[\]]/g, ""));
        // Find the full citation content if available
        // Note: For conversation messages, we might need to pass citations into this format function
        // For now using the active response or finding from current view context

        return (
          <span
            key={i}
            className="group relative inline-flex items-center justify-center min-w-[24px] h-5 px-1 mx-0.5 text-xs font-bold text-white bg-gradient-to-r from-violet-500 to-purple-600 rounded cursor-help transition-all transform hover:scale-110"
            onClick={() => {
              setExpandedCitation(expandedCitation === num ? null : num);
            }}
          >
            {part}

            {/* Tooltip */}
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-900 border border-white/20 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 text-left pointer-events-none">
              <span className="block text-[10px] font-bold text-purple-300 mb-1 uppercase tracking-wider">
                Source {num}
              </span>
              <span className="block text-xs text-white/90 line-clamp-4 leading-relaxed">
                {/* We try to find the citation text from response or open conversation */}
                {(response?.citations?.find(c => c.number === num) ||
                  activeConversation?.messages?.find(m => m.role === 'assistant' && m.citations?.some(c => c.number === num))?.citations?.find(c => c.number === num))?.text ||
                  "Click to view full source"}
              </span>
              <span className="absolute bottom-[-6px] left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-900 border-r border-b border-white/20 transform rotate-45"></span>
            </span>
          </span>
        );
      }
      return part;
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex">
      {/* Conversation Sidebar */}
      {supabaseConfigured && showSidebar && (
        <aside className="w-72 border-r border-white/10 backdrop-blur-xl bg-white/5 flex flex-col">
          <div className="p-4 border-b border-white/10">
            <button
              onClick={createNewConversation}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white font-semibold hover:from-violet-600 hover:to-purple-700 transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Chat
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {loadingConversations ? (
              <div className="flex items-center justify-center py-8">
                <svg className="animate-spin h-6 w-6 text-purple-400" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-8 text-white/40 text-sm">
                No conversations yet
              </div>
            ) : (
              <div className="space-y-1">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`group relative rounded-lg p-3 cursor-pointer transition-all ${activeConversation?.id === conv.id
                      ? "bg-purple-500/20 border border-purple-500/30"
                      : "hover:bg-white/5 border border-transparent"
                      }`}
                    onClick={() => loadConversation(conv.id)}
                  >
                    <div className="flex items-start gap-2">
                      <svg className="w-4 h-4 mt-0.5 text-purple-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{conv.title}</p>
                        <p className="text-xs text-white/40 mt-0.5">
                          {new Date(conv.updated_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteConversation(conv.id);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-red-500/20 text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-500/30 transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-white/10">
            <div className="flex items-center gap-2 text-xs text-white/40">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              Supabase Connected
            </div>
          </div>
        </aside>
      )}

      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="border-b border-white/10 backdrop-blur-xl bg-white/5">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {supabaseConfigured && (
                  <button
                    onClick={() => setShowSidebar(!showSidebar)}
                    className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>
                )}
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">RAG System</h1>
                  <p className="text-xs text-purple-300">
                    Powered by Pinecone, Groq & BGE Reranker
                  </p>
                </div>
              </div>
              {!supabaseConfigured && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-500/20 border border-yellow-500/30">
                  <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="text-xs text-yellow-300">Supabase not configured - conversations won&apos;t persist</span>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Eval Results Modal */}
        {showEvalPanel && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="backdrop-blur-xl bg-slate-900/95 rounded-2xl border border-white/20 p-6 shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  Evaluation Results (5 QA Pairs)
                </h2>
                <button
                  onClick={() => setShowEvalPanel(false)}
                  className="text-white/60 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {runningEval && (
                <div className="flex items-center justify-center py-12">
                  <div className="flex flex-col items-center gap-4">
                    <svg className="animate-spin h-12 w-12 text-amber-500" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <p className="text-white/60">Running evaluation on 5 QA pairs...</p>
                  </div>
                </div>
              )}

              {evalResult && (
                <>
                  {/* Aggregate Metrics */}
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-xl p-4 border border-green-500/30">
                      <p className="text-xs text-green-300 mb-1">Success Rate</p>
                      <p className="text-2xl font-bold text-white">{(evalResult.aggregate.success_rate * 100).toFixed(1)}%</p>
                      <p className="text-xs text-white/60">{evalResult.aggregate.successful_answers}/{evalResult.aggregate.total_questions} passed</p>
                    </div>
                    <div className="bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-xl p-4 border border-blue-500/30">
                      <p className="text-xs text-blue-300 mb-1">Avg Precision</p>
                      <p className="text-2xl font-bold text-white">{(evalResult.aggregate.avg_precision * 100).toFixed(1)}%</p>
                    </div>
                    <div className="bg-gradient-to-br from-purple-500/20 to-violet-500/20 rounded-xl p-4 border border-purple-500/30">
                      <p className="text-xs text-purple-300 mb-1">Avg Recall</p>
                      <p className="text-2xl font-bold text-white">{(evalResult.aggregate.avg_recall * 100).toFixed(1)}%</p>
                    </div>
                  </div>

                  {/* Individual Results */}
                  <div className="space-y-3">
                    {evalResult.results.map((result) => (
                      <div
                        key={result.id}
                        className={`rounded-xl p-4 border ${result.success
                          ? "bg-green-500/10 border-green-500/30"
                          : "bg-red-500/10 border-red-500/30"
                          }`}
                      >
                        <div className="flex items-start gap-3">
                          <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${result.success ? "bg-green-500 text-white" : "bg-red-500 text-white"
                            }`}>
                            {result.success ? "✓" : "✗"}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white mb-1">Q{result.id}: {result.question}</p>
                            <p className="text-xs text-white/70 mb-2 line-clamp-2">{result.answer}</p>
                            <div className="flex flex-wrap gap-2 text-xs">
                              <span className="px-2 py-0.5 rounded bg-white/10 text-white/80">
                                Precision: {(result.precision * 100).toFixed(0)}%
                              </span>
                              <span className="px-2 py-0.5 rounded bg-white/10 text-white/80">
                                Recall: {(result.recall * 100).toFixed(0)}%
                              </span>
                              <span className="px-2 py-0.5 rounded bg-white/10 text-white/60">
                                Keywords: {result.found_keywords.join(", ") || "none"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          {/* Conversation View */}
          {activeConversation ? (
            <div className="flex flex-col h-full">
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-3xl mx-auto space-y-6">
                  {activeConversation.messages?.length === 0 ? (
                    <div className="text-center py-16">
                      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-500/20 to-cyan-500/20 flex items-center justify-center">
                        <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-medium text-white mb-2">Start a Conversation</h3>
                      <p className="text-white/60 text-sm">Ask a question about your indexed documents</p>
                    </div>
                  ) : (
                    activeConversation.messages?.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl p-4 ${msg.role === "user"
                            ? "bg-gradient-to-r from-violet-500 to-purple-600 text-white"
                            : "backdrop-blur-xl bg-white/10 border border-white/20 text-white/90"
                            }`}
                        >
                          <p className="whitespace-pre-wrap">
                            {msg.role === "assistant" ? formatAnswer(msg.content) : msg.content}
                          </p>
                          {msg.role === "assistant" && msg.timing_ms && (
                            <div className="mt-3 pt-2 border-t border-white/10 flex gap-3 text-xs text-white/40">
                              <span>{msg.timing_ms}ms</span>
                              <span>{msg.token_usage?.total_tokens || 0} tokens</span>
                              <span>{msg.sources_used} sources</span>
                            </div>
                          )}
                          <p className="text-xs mt-2 opacity-50">
                            {formatTime(msg.created_at)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Input */}
              <div className="border-t border-white/10 p-4 backdrop-blur-xl bg-white/5">
                <div className="max-w-3xl mx-auto flex gap-3">
                  <textarea
                    placeholder="Ask a question..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    rows={1}
                    className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all resize-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleQuery();
                      }
                    }}
                  />
                  <button
                    onClick={handleQuery}
                    disabled={querying || !query.trim()}
                    className="px-6 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold hover:from-cyan-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {querying ? (
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Original View */
            <div className="max-w-7xl mx-auto px-6 py-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Panel - Document Upload */}
                <div className="space-y-6">
                  <div className="backdrop-blur-xl bg-white/10 rounded-2xl border border-white/20 p-6 shadow-2xl">
                    <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <svg
                        className="w-5 h-5 text-purple-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        />
                      </svg>
                      Upload Document
                    </h2>

                    <div className="space-y-4">
                      <input
                        type="text"
                        placeholder="Document Title (optional)"
                        value={documentTitle}
                        onChange={(e) => setDocumentTitle(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                      />

                      <textarea
                        placeholder="Paste your document text here..."
                        value={documentText}
                        onChange={(e) => setDocumentText(e.target.value)}
                        rows={10}
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all resize-none"
                      />

                      <div className="flex gap-3">
                        <button
                          onClick={handleIndexDocument}
                          disabled={indexing || !documentText.trim()}
                          className="flex-1 py-3 px-6 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white font-semibold hover:from-violet-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                        >
                          {indexing ? (
                            <span className="flex items-center justify-center gap-2">
                              <svg
                                className="animate-spin h-5 w-5"
                                viewBox="0 0 24 24"
                              >
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                  fill="none"
                                />
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                              </svg>
                              Indexing...
                            </span>
                          ) : (
                            "Index Document"
                          )}
                        </button>

                        <button
                          onClick={handleEvalDocument}
                          disabled={runningEval || !documentText.trim()}
                          className="flex-1 py-3 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold hover:from-amber-600 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                        >
                          {runningEval ? (
                            <span className="flex items-center justify-center gap-2">
                              <svg
                                className="animate-spin h-5 w-5"
                                viewBox="0 0 24 24"
                              >
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                  fill="none"
                                />
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                              </svg>
                              Evaluating...
                            </span>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                              </svg>
                              Eval on Doc
                            </>
                          )}
                        </button>
                      </div>

                      {indexResult && (
                        <div
                          className={`p-4 rounded-xl ${indexResult.success
                            ? "bg-green-500/20 border border-green-500/30"
                            : "bg-red-500/20 border border-red-500/30"
                            }`}
                        >
                          <p
                            className={`text-sm ${indexResult.success ? "text-green-300" : "text-red-300"
                              }`}
                          >
                            {indexResult.message}
                          </p>
                          {indexResult.success && (
                            <p className="text-xs text-white/60 mt-1">
                              Doc ID: {indexResult.doc_id} • {indexResult.chunks_indexed} chunks
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Query Box */}
                  <div className="backdrop-blur-xl bg-white/10 rounded-2xl border border-white/20 p-6 shadow-2xl">
                    <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <svg
                        className="w-5 h-5 text-purple-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      Ask a Question
                    </h2>

                    <div className="space-y-4">
                      <textarea
                        placeholder="Enter your question..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        rows={3}
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all resize-none"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleQuery();
                          }
                        }}
                      />

                      <button
                        onClick={handleQuery}
                        disabled={querying || !query.trim()}
                        className="w-full py-3 px-6 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold hover:from-cyan-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                      >
                        {querying ? (
                          <span className="flex items-center justify-center gap-2">
                            <svg
                              className="animate-spin h-5 w-5"
                              viewBox="0 0 24 24"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                                fill="none"
                              />
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              />
                            </svg>
                            Searching...
                          </span>
                        ) : (
                          "Search & Answer"
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Panel - Answer & Citations */}
                <div className="space-y-6">
                  {error && (
                    <div className="backdrop-blur-xl bg-red-500/20 rounded-2xl border border-red-500/30 p-6">
                      <p className="text-red-300">{error}</p>
                    </div>
                  )}

                  {response && (
                    <>
                      {/* Answer Panel */}
                      <div className="backdrop-blur-xl bg-white/10 rounded-2xl border border-white/20 p-6 shadow-2xl">
                        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                          <svg
                            className="w-5 h-5 text-green-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          Answer
                          {!response.has_answer && (
                            <span className="ml-2 px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-300 rounded-full">
                              Limited Info
                            </span>
                          )}
                        </h2>

                        <div className="prose prose-invert max-w-none">
                          <p className="text-white/90 leading-relaxed whitespace-pre-wrap">
                            {formatAnswer(response.answer)}
                          </p>
                        </div>

                        {/* Metrics */}
                        <div className="mt-6 pt-4 border-t border-white/10">
                          <div className="flex flex-wrap gap-4 text-xs text-white/60">
                            <div className="flex items-center gap-1">
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                              {response.timing_ms}ms
                            </div>
                            <div className="flex items-center gap-1">
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                                />
                              </svg>
                              {response.token_usage?.total_tokens || 0} tokens
                            </div>
                            <div className="flex items-center gap-1">
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                />
                              </svg>
                              {response.sources_used} sources
                            </div>
                            <div className="flex items-center gap-1">
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                              ~${(((response.token_usage?.total_tokens || 0) / 1000) * 0.0003).toFixed(5)}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Citations Panel */}
                      {response.citations.length > 0 && (
                        <div className="backdrop-blur-xl bg-white/10 rounded-2xl border border-white/20 p-6 shadow-2xl">
                          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <svg
                              className="w-5 h-5 text-purple-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                              />
                            </svg>
                            Sources ({response.citations.length})
                          </h2>

                          <div className="space-y-3">
                            {response.citations.map((citation) => (
                              <div
                                key={citation.number}
                                className={`rounded-xl border transition-all cursor-pointer ${expandedCitation === citation.number
                                  ? "bg-purple-500/20 border-purple-500/30"
                                  : "bg-white/5 border-white/10 hover:bg-white/10"
                                  }`}
                                onClick={() =>
                                  setExpandedCitation(
                                    expandedCitation === citation.number
                                      ? null
                                      : citation.number
                                  )
                                }
                              >
                                <div className="p-4 flex items-start gap-3">
                                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-r from-violet-500 to-purple-600 text-white text-xs font-bold flex items-center justify-center">
                                    {citation.number}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-white truncate">
                                      {citation.title}
                                    </p>
                                    <p className="text-xs text-white/60">
                                      {citation.source}
                                    </p>
                                    {expandedCitation === citation.number && (
                                      <p className="mt-3 text-sm text-white/80 leading-relaxed">
                                        {citation.text}
                                      </p>
                                    )}
                                  </div>
                                  <svg
                                    className={`w-5 h-5 text-white/40 transition-transform ${expandedCitation === citation.number
                                      ? "rotate-180"
                                      : ""
                                      }`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M19 9l-7 7-7-7"
                                    />
                                  </svg>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {!response && !error && (
                    <div className="backdrop-blur-xl bg-white/5 rounded-2xl border border-white/10 p-12 text-center">
                      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-500/20 to-cyan-500/20 flex items-center justify-center">
                        <svg
                          className="w-8 h-8 text-purple-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      </div>
                      <h3 className="text-lg font-medium text-white mb-2">
                        Ready to Answer
                      </h3>
                      <p className="text-white/60 text-sm">
                        Upload a document and ask a question to get started.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
