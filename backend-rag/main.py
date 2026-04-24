from fastapi import FastAPI
import asyncio

from raganything import RAGAnything, RAGAnythingConfig
from lightrag.llm.openai import openai_complete_if_cache, openai_embed
from lightrag.utils import EmbeddingFunc

app = FastAPI()

# LM Studio config
BASE_URL = "http://127.0.0.1:1234/v1"
API_KEY = "lm-studio"

# RAG config
config = RAGAnythingConfig(
    working_dir="./rag_storage",
    parser="mineru",
)

def llm_model_func(prompt, system_prompt=None, history_messages=[], **kwargs):
    return openai_complete_if_cache(
        "qwen",  # имя модели в LM Studio
        prompt,
        system_prompt=system_prompt,
        history_messages=history_messages,
        api_key=API_KEY,
        base_url=BASE_URL,
        **kwargs,
    )

embedding_func = EmbeddingFunc(
    embedding_dim=768,  # ⚠️ важно под nomic
    max_token_size=8192,
    func=lambda texts: openai_embed.func(
        texts,
        model="text-embedding-nomic",
        api_key=API_KEY,
        base_url=BASE_URL,
    ),
)

rag = RAGAnything(
    config=config,
    llm_model_func=llm_model_func,
    embedding_func=embedding_func,
)

@app.post("/query")
async def query(data: dict):
    q = data.get("query")
    result = await rag.aquery(q, mode="hybrid")
    return {"answer": result}