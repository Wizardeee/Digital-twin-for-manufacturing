from abc import ABC, abstractmethod
from typing import Any


class AIProvider(ABC):
    @abstractmethod
    async def interpret(self, structured_data: dict, question: str) -> str:
        """Interpret pre-calculated structured data and answer a question.

        Args:
            structured_data: Machine readings, alerts, summaries (SRS §6)
            question: User's natural language question

        Returns:
            Natural language interpretation (never fabricated numbers)
        """
        pass

    @abstractmethod
    async def health_check(self) -> bool:
        """Check if the provider is available."""
        pass
