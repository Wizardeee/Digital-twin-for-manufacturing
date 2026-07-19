from providers.base import AIProvider
from providers.ollama import OllamaProvider
from config import AI_PROVIDER


def get_provider() -> AIProvider:
    providers = {
        "ollama": OllamaProvider,
    }

    provider_class = providers.get(AI_PROVIDER)
    if not provider_class:
        raise ValueError(f"Unknown AI provider: {AI_PROVIDER}. Available: {list(providers.keys())}")

    return provider_class()
