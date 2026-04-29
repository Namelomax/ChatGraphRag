import asyncio

from raganything import RAGAnything, RAGAnythingConfig
from lightrag.llm.openai import openai_complete_if_cache, openai_embed
from lightrag.utils import EmbeddingFunc
import os

os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
# LM Studio config
BASE_URL = "http://127.0.0.1:1234/v1"
API_KEY = "lm-studio"

async def main():
    # 1. конфиг
    config = RAGAnythingConfig(
        working_dir="./rag_storage",
        parser="mineru",
        parse_method="fast",
    )

    # 2. LLM (локальный!)
    def llm_model_func(prompt, system_prompt=None, history_messages=[], **kwargs):
        return openai_complete_if_cache(
            "qwen",
            prompt,
            system_prompt=system_prompt,
            history_messages=history_messages,
            api_key=API_KEY,
            base_url=BASE_URL,
            **kwargs,
        )

    # 3. embeddings
    embedding_func = EmbeddingFunc(
        embedding_dim=768,
        max_token_size=2000,
        func=lambda texts: openai_embed.func(
            texts,
            model="text-embedding-nomic",
            api_key=API_KEY,
            base_url=BASE_URL,
        ),
    )

    # 4. инициализация
    rag = RAGAnything(
        config=config,
        llm_model_func=llm_model_func,
        embedding_func=embedding_func,
        lightrag_kwargs={
        "llm_model_kwargs": {"timeout": 6000},
        "llm_model_max_async": 1,

        "chunk_token_size": 2000,
        "chunk_overlap_token_size": 150,
    }
    )

    print("📄 Обработка документа...")

    # 5. обработка документа
    await rag.process_document_complete(
        file_path="./documents/MeetTest.docx",
        output_dir="./output",
        backend="pipeline",
    )

    print("✅ Документ обработан")

        # 6. запросы
    questions = [
        "Сколько команд участвует в хакатоне, как они называются и кто их капитаны?",
        "Какие три типичные ошибки возникают при подготовке протокола младшим аналитиком? Перечисли их.",
        "Какова 'задача минимум' для ИИ-ассистента по формулировке заказчика?",
        "Какая точность модели указана в нефункциональных требованиях и как она вычисляется?",
        "Чем отличается аналитическая записка от отчёта об обследовании по объёму и когда что используется?",
        "Кто такой 'функциональный заказчик' (ФЗ) и как он соотносится со службой IT на крупных предприятиях?",
        "Почему Никита не рекомендует использовать готовые расшифровки из облачных сервисов, например Zoom?",
        "Что значит фраза 'ассистент должен быть в контексте продукта'? Приведи пример из выступления.",
        "Какую роль играют временные метки (тайм-коды) в итоговом протоколе и зачем их сохранять, если ассистент не уверен?",
        "Опиши полный цикл работы с протоколом от проведения встречи до формирования аналитической записки с участием ассистента.",
        "Как предполагается решать проблему противоречий в рамках одной встречи (когда решение меняется по ходу обсуждения)?",
        "Какие каналы коммуникации предложены для взаимодействия команд с заказчиком?",
        "Назови обязательные поля, которые должны присутствовать в шаблоне протокола встречи.",
        "Какое ограничение на использование языковых моделей озвучено заказчиком?",
        "Почему этап обследования считается настолько критичным (30-40% времени проекта) и как это связано с последующими этапами?",
    ]

    for i, question in enumerate(questions, 1):
        print(f"\n{'='*60}")
        print(f"❓ Вопрос {i}: {question}")
        result = await rag.aquery(question, mode="hybrid")
        print(f"🤖 Ответ:\n{result}")
        print(f"{'='*60}")


if __name__ == "__main__":
    asyncio.run(main())