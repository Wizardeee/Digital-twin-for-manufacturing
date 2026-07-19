from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from providers import get_provider

app = FastAPI(title="FactView AI Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class InterpretRequest(BaseModel):
    structured_data: dict
    question: str


class InterpretResponse(BaseModel):
    text: str
    provider: str


@app.get("/health")
async def health():
    provider = get_provider()
    available = await provider.health_check()
    return {
        "status": "ok" if available else "degraded",
        "provider": type(provider).__name__,
        "provider_available": available,
    }


@app.post("/interpret", response_model=InterpretResponse)
async def interpret(req: InterpretRequest):
    provider = get_provider()

    try:
        text = await provider.interpret(req.structured_data, req.question)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI provider error: {str(e)}")

    return InterpretResponse(text=text, provider=type(provider).__name__)
