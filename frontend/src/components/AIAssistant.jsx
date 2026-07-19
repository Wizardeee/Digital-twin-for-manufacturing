import { useState, useRef, useEffect } from "react";
import { useAIAssistant } from "../hooks/useAIAssistant";

export default function AIAssistant({ factoryId }) {
  const { messages, loading, ask } = useAIAssistant(factoryId);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    ask(input);
    setInput("");
  };

  const suggestedQuestions = [
    "How can productivity be improved?",
    "Which machine needs maintenance?",
    "Summarize today's production.",
  ];

  return (
    <div
      style={{
        background: "rgba(15, 15, 35, 0.95)",
        borderRadius: 12,
        border: "1px solid rgba(148, 163, 184, 0.15)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        maxHeight: "calc(100vh - 160px)",
      }}
    >
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 12,
        }}
      >
        {messages.length === 0 && (
          <div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>
              Ask me anything about your factory:
            </div>
            {suggestedQuestions.map((q, i) => (
              <button
                key={i}
                onClick={() => ask(q)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(148, 163, 184, 0.12)",
                  borderRadius: 6,
                  padding: "6px 10px",
                  marginBottom: 5,
                  color: "#cbd5e1",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              marginBottom: 8,
              padding: "8px 10px",
              borderRadius: 6,
              background:
                msg.role === "user"
                  ? "rgba(99, 102, 241, 0.15)"
                  : msg.isError
                  ? "rgba(239, 68, 68, 0.12)"
                  : "rgba(255,255,255,0.04)",
              borderLeft: `3px solid ${
                msg.role === "user" ? "#6366f1" : msg.isError ? "#ef4444" : "#22c55e"
              }`,
            }}
          >
            <div style={{ fontSize: 12, color: "#e2e8f0", lineHeight: 1.5 }}>{msg.content}</div>
          </div>
        ))}

        {loading && (
          <div style={{ padding: "8px 10px", color: "#94a3b8", fontSize: 12, fontStyle: "italic" }}>
            Thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 6, padding: "8px 12px 12px" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question..."
          style={{
            flex: 1,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(148, 163, 184, 0.15)",
            borderRadius: 6,
            padding: "7px 10px",
            color: "#e2e8f0",
            fontSize: 12,
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          style={{
            background: "#6366f1",
            border: "none",
            borderRadius: 6,
            padding: "7px 12px",
            color: "white",
            fontSize: 12,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading || !input.trim() ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
