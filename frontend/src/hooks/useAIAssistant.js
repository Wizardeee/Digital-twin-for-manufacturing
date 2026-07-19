import { useState, useCallback } from "react";
import { aiAPI } from "../services/api";

export function useAIAssistant(factoryId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const ask = useCallback(
    async (question) => {
      if (!factoryId || !question.trim()) return;

      const userMessage = { role: "user", content: question, timestamp: new Date() };
      setMessages((prev) => [...prev, userMessage]);
      setLoading(true);
      setError(null);

      try {
        const response = await aiAPI.ask(factoryId, question);
        const aiMessage = {
          role: "assistant",
          content: response.text,
          timestamp: new Date(),
          data: response.data,
          provider: response.provider,
        };
        setMessages((prev) => [...prev, aiMessage]);
      } catch (err) {
        console.error("AI request failed:", err);
        setError(err.message);
        const errorMessage = {
          role: "assistant",
          content: `Error: ${err.message}`,
          timestamp: new Date(),
          isError: true,
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setLoading(false);
      }
    },
    [factoryId]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, loading, error, ask, clearMessages };
}
