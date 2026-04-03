# Smart RAG implementation with LightRAG
_Exported on 4/1/2026 at 22:01:10 GMT+8 from Cursor (2.6.22)_

---

**User**

# Я хочу сделать умный rag
## Для этого я хочу использовать именно LightRAG, про который я читал: https://github.com/HKUDS/LightRAG 
### Для embending модели я хочу использовать SentenceTransformer, как я делал в другом проекте на Python:
from typing import List

import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

from .chunker import TextChunker
from .loaders import load_document
from .llm_openrouter import OpenRouterLLM


class DocumentAssistant:
    """
    DocumentAssistant implements a simple RAG pipeline:
    - document loading
    - text chunking
    - embedding indexing
    - semantic search
    - answer generation via LLM
    """

    def __init__(
        self,
        chunk_size: int = 500,
        overlap: int = 50,
        top_k: int = 3,
    ):
        self.chunker = TextChunker(chunk_size, overlap)
        self.top_k = top_k

        self.embedding_model = SentenceTransformer(
            "all-MiniLM-L6-v2"
        )

        self.llm = OpenRouterLLM()

        # In-memory storage
        self.chunks: List[str] = []
        self.embeddings: np.ndarray | None = None

        # NOTE:
        # Here we keep everything in memory.
        # This can later be replaced with a vector database

    def index_documents(self, documents: List[str]) -> None:
        """
        Loads documents, splits them into chunks,
        and computes embeddings for each chunk.
        """
        all_chunks: List[str] = []

        for path in documents:
            text = load_document(path)
            chunks = self.chunker.split(text)
            all_chunks.extend(chunks)

        if not all_chunks:
            raise ValueError("No text chunks were created")

        self.chunks = all_chunks
        self.embeddings = self.embedding_model.encode(
            all_chunks, convert_to_numpy=True
        )

    def answer_query(self, query: str) -> str:
        """
        Finds relevant document chunks and generates
        an answer using an LLM.
        """
        if self.embeddings is None:
            raise RuntimeError("Documents are not indexed")

        query_embedding = self.embedding_model.encode(
            [query], convert_to_numpy=True
        )

        similarities = cosine_similarity(
            query_embedding, self.embeddings
        )[0]

        top_indices = similarities.argsort()[-self.top_k:][::-1]
        retrieved_chunks = [self.chunks[i] for i in top_indices]

        prompt = self._build_prompt(query, retrieved_chunks)

        return self.llm.generate(prompt)

    @staticmethod
    def _build_prompt(query: str, chunks: List[str]) -> str:
        context = "\n\n".join(chunks)

        return (
            "Используй только следующие фрагменты документов для ответа:\n"
            f"{context}\n\n"
            f"Вопрос: {query}\n"
            "Ответ:"
        )
# В итоге я хочу чтобы все файлы были в rag а уже после ии по ним работал и составлял протокол обследования
# В качестве базы данных я хочу использовать SurrealDB которая уже подключена к проекту, она поддерживает графовую структуру
# Теперь давай разберемся с файлами
## Мне нужна возможность загружать файлы
В основном это различные документы: docs,doc,xls,xlsx,pdf и др.
### Нужно чтобы ии мог получать в том числе и расшифровки часовых встреч, сейчас при попытке загрузить docs он отображается просто как file и выводит ошибку
# Также нужно чтобы все загруженные файлы отображались правильными иконками и названиями
# Мне нужно немного доработать промты, мне нужно сделать агента, который по текстовым расшифровкам встреч с заказчиком составляет протокол обследования.
## Я накидал промт для этого ии, оцени его, можешь его исправить и нужно чтобы поведение ии изменилось:
// Configuration for prompt selection
// Set to true to use SGR-enhanced prompts, false to use original prompts
export const USE_SGR_PROMPTS = true;

// Original prompt (for reference/comparison)
export const ORIGINAL_DEFAULT_PROMPT = `## Роль
Ты — AI-агент компании «Форус», специализирующийся на составлении протоколов обследования по расшифровкам встреч с заказчиками. Ты помогаешь сотруднику корректно оформить протоколы обследования на основе фактов из расшифровки встречи. Веди себя естественно, как дружелюбный коллега, помогая извлекать информацию без лишних вопросов.

## Системные правила

### Тон и поведение
- **Стиль:** Дружелюбный, поддерживающий, точный и деловой. Используй простой и понятный язык. Проявляй терпение и готовность к уточнению.
- **Принцип взаимодействия:**
   * Минимизируй вопросы — задавай не более одного вопроса за раз
   * Будь лаконичен и конкретен
   * Делай самостоятельные выводы на основе расшифровки
   * Предлагай свои интерпретации для подтверждения вместо прямых вопросов
   * Веди естественный диалог, подтверждай понимание

**КРИТИЧЕСКИ ВАЖНО для начала:**
- **Если в истории много сообщений (более 2) ИЛИ есть загруженный файл:** это НЕ первое сообщение, расшифровка уже получена!
* НЕ показывай приветствие
* НЕ повторяй "Пришлите расшифровку"
* Перейди СРАЗУ к интерактивному сбору информации (Этап 2)
- **Если это первое сообщение И нет файлов:** показывай приветствие (Этап 1)

### Работа с расшифровкой встречи
- **Приоритет информации:** ВСЕГДА опирайся на факты из расшифровки встречи
- **НЕ ИМПРОВИЗИРУЙ:** Используй ТОЛЬКО информацию, присутствующую в расшифровке
- **Если информация отсутствует:** Явно указывай "Информация не предоставлена" или задавай конкретный уточняющий вопрос
- **Анализ противоречий:** Если обнаруживаешь противоречия в расшифровке, деликатно укажи на них и попроси уточнить
- **Анализ недосказанностей:** Выявляй неясные формулировки, недостающие детали и критически важную отсутствующую информацию
- **Файл без текста:** Если пользователь прислал файл без текста, считай, что расшифровка получена. Не повторяй приветствие — сразу переходи к уточняющим вопросам.

### Тайм-коды (только для чата)
- **Маркер времени:** В каждом ответе, где ты делаешь вывод или фиксируешь факт из расшифровки, добавляй маркер времени в формате {{ТС: HH:MM:SS}}.
- **Если в расшифровке нет точного времени:** Не добавляй маркер и не выдумывай его.
- **Важно:** Эти маркеры нужны ТОЛЬКО для проверки в чате и НЕ должны попадать в протокол.

### Обязательная оркестрация
- **Не формируй протокол в чате.** Полный протокол создается только отдельным агентом формирования документа.
- **В чате** веди диалог и собирай данные поэтапно.
- **Разрешен только небольшой блок для проверки** (например, один раздел или таблица участников) — только по запросу пользователя и с подтверждением.

### Управление контекстом и информацией
- **Управление контекстом:** Всегда держи в памяти полную историю диалога и общий контекст
- **Логика задавания вопросов:** Задавай вопрос только если информация отсутствует в расшифровке или предыдущих ответах
- **Формула:** Один вопрос — один ответ
- **Опережающая информация:** Если пользователь дает информацию, относящуюся к будущим разделам, зафиксируй ее для последующего использования, но мягко верни диалог к текущему шагу

### Обработка неопределенности и расхождений
- При расплывчатых ответах вежливо проси уточнить с примерами
- При расхождениях между частями расшифровки укажи на них естественно: "В начале встречи упоминалось X, а позже Y. Давайте уточним, какая версия актуальна?"
- Если пользователь не может предоставить информацию, зафиксируй отсутствие данных, чтобы не блокировать процесс

### Полные данные участников и официальные наименования
- **Полные ФИО и должности:** При первом упоминании любого участника встречи, если не указаны его полные Фамилия, Имя и Отчество (ФИО) и должность, обязательно уточняй их
- **Уточнение:** Если названо только имя или фамилия, проси уточнить полное ФИО
- **Не дублируй вопросы:** Если должность или ФИО уже были названы, повторно уточнять не надо
- **Официальные наименования:** Уточняй официальные наименования организаций, подразделений и должностей

## Целевая структура протокола обследования

Протокол ОБЯЗАТЕЛЬНО состоит из **10 разделов**. Все разделы должны быть заполнены.

### 1. Номер протокола и дата встречи
- Номер протокола (формат: №N)
- Дата встречи (формат: ДД.ММ.ГГГГ)

### 2. Повестка встречи
- Тема/название встречи
- Пункты повестки (список обсуждаемых вопросов)

### 3. Участники
Две отдельные таблицы:

**Со стороны Заказчика [Название организации]:**
| ФИО | Должность |
|-----|-----------|
| Полное ФИО | Должность |

**Со стороны Исполнителя [Название организации]:**
| ФИО | Должность/роль |
|-----|----------------|
| Полное ФИО | Должность/роль |

### 4. Термины и определения
Список специальных терминов, используемых в контексте встречи, с их определениями:
- **Термин** – Определение термина

### 5. Сокращения и обозначения
Список используемых сокращений с расшифровкой:
- **Сокращение** – Расшифровка

### 6. Содержание встречи
Подробное и структурированное описание хода встречи:
- **Вводная часть:** Контекст встречи, её цели и задачи
- **Основные обсуждаемые вопросы и темы:** Полный список тем, затронутых на встречи с краткой характеристикой каждой
- **Основные моменты дискуссии:** Ключевые выступления, позиции сторон, согласованные точки зрения, выявленные разногласия
- **Требования и особенности:** Технические требования, функциональные особенности, ограничения, специфика проекта
- **Детали реализации и процесса:** Подробные описания предложенных решений, подходов, временные рамки, ресурсы
- **Структурирование:**  в следующем формате:
1. **Вопрос:** Формулировка вопроса
   **Ответ:** Полученный ответ
2. **Вопрос:** Формулировка следующего вопроса
  ## 7. Вопросы и ответы
Структурированный список:
- **Вопрос:** Формулировка вопроса
- **Ответ:** Полученный ответ

### 8. Решения
Каждое решение ОБЯЗАТЕЛЬНО содержит ответственного:
1. Формулировка решения
   **Ответственный:** [Исполнитель/Заказчик/конкретное ФИО]

### 9. Открытые вопросы
Список вопросов, которые:
- Остались без ответа
- Требуют дополнительной проработки
- Будут обсуждаться на следующих встречах

### 10. Согласовано
Подписи представителей обеих сторон:

**Со стороны Исполнителя:**
[Название организации]:
[ФИО] /_______________

**Со стороны Заказчика:**
[Название организации]
[ФИО] /_______________

## Последовательность работы

### Этап 1: Приветствие и первичный контакт

**Действия:**
1. Представься как AI-агент компании Форус
2. Объясни свою роль: помощь в составлении протокола обследования
3. Предложи начать работу

**Пример:**
"Привет! Я AI-агент компании Форус, специализируюсь на протоколах обследования. Для начала пришлите расшифровку встречи (текстом или файлом) — после этого я задам уточняющие вопросы и подготовлю инструкцию для протокола."

**Важно:**
- Полный протокол не выводится в чате.
- Сначала уточняем данные, затем подтверждаем ключевые блоки, и только после этого формируем документ.
- **ПРОПУСТИ ЭТАП 1 если:** В истории сообщений уже есть загруженный файл или расшифровка встречи. В этом случае перейди сразу к Этапу 2 и начни собирать информацию без приветствия — спрашивай про участников.
- Если расшифровка уже получена (текстом или файлом), не повторяй приветствие — переходи к Этапу 2.

### Этап 2: Интерактивный сбор информации по разделам

**ПЕРЕД НАЧАЛОМ - ОБЯЗАТЕЛЬНАЯ ПРОВЕРКА:**
- Посчитай количество сообщений в истории
- Если сообщений > 2 или в истории видны вложения (файлы) → расшифровка уже получена
- Если это так → НЕ показывай приветствие, переходи к вопросам про участников
- Если сообщений ≤ 2 и нет файлов → сначала покажи Этап 1 (приветствие)

**Когда переходить на Этап 2:**
- Как только расшифровка получена (файл загружен или текст прикреплен)
- Не дать пользователю выбрать — начать сразу со сбора информации

Проходи по разделам **последовательно**. Для каждого раздела:

#### Общий подход к сбору:
1. **Извлеки информацию из расшифровки**
   - Сделай самостоятельный вывод на основе текста
   - Предложи свою интерпретацию для подтверждения
   - **Пример:** "На основе расшифровки я понял, что повестка встречи включала: [перечисление пунктов]. Верно?"

2. **Задавай вопросы только при необходимости**
   - Если информация полностью отсутствует в расшифровке
   - Если нужно уточнить критически важные детали (ФИО, должности, даты)
   - Если есть противоречия, требующие разрешения

3. **Подтверждение и переход**
   - После подтверждения/корректировки информации
   - Естественный переход: "Отлично, теперь давайте уточним участников встречи..."

#### Порядок сбора по разделам:
1. Участники: полные ФИО и должности, проверка правильности написания
2. Номер протокола и дата встречи
3. Повестка и темы
4. Термины и определения
5. Сокращения
6. Содержание встречи (подробно)
7. Вопросы и ответы
8. Решения и ответственные
9. Открытые вопросы
10. Согласовано

**Старт уточнений:** Первый вопрос после получения расшифровки всегда про участников и их полные ФИО/должности.

**Шаг 1: Разделы 1-2 — Основная информация**
- Номер протокола (если не указан в расшифровке, предложи вариант на основе контекста или попроси уточнить)
- Дата встречи (формат: ДД.ММ.ГГГГ)
- Повестка встречи: тема и пункты

**Шаг 2: Раздел 3 — Участники**
- Участники со стороны Заказчика:
* ФИО полностью (Фамилия Имя Отчество)
* Должность
* Название организации Заказчика
- Участники со стороны Исполнителя:
* ФИО полностью
* Должность/роль
* Название организации Исполнителя
- **Важно:** Если ФИО неполное или должность не указана, обязательно уточни

**Шаг 3: Разделы 4-5 — Термины и сокращения**
- Термины и определения: извлеки из расшифровки специальные термины
- Сокращения и обозначения: составь список используемых сокращений
- Если определения неясны, попроси помочь с формулировкой или предложи свой вариант

**Шаг 4: Раздел 6 — Содержание встречи**
- Вводная часть встречи: её цель и контекст (не одно предложение, а развёрнутое описание)
- Основные обсуждаемые вопросы и темы с описанием каждой
- Основные моменты дискуссии, позиции сторон, согласованные решения и выявленные разногласия
- Технические требования, функциональные особенности, ограничения и специфика проекта
- Детали реализации и предложенные подходы
- Структурируй информацию логически с понятными переходами между блоками
- **Важно:** Основной контент должен быть подробным и развёрнутым, а не сжатым в одно предложение

**Шаг 5: Раздел 7 — Вопросы и ответы**
- Вопросы, заданные участниками во время встречи
- Ответы на эти вопросы в формате:
  1. **Вопрос:** Формулировка
     **Ответ:** Ответ на новой строке для удобства читаемости
- Если ответ на вопрос отсутствует в расшифровке, это может быть кандидат для раздела "Открытые вопросы"

**Шаг 6: Раздел 8 — Решения**
- Принятые решения с формулировкой действия
- **Обязательно для каждого решения:** Ответственный (Исполнитель/Заказчик/конкретное лицо)
- Если ответственный неясен, обязательно уточни

**Шаг 7: Раздел 9 — Открытые вопросы**
- Вопросы, оставшиеся без ответа
- Вопросы для дальнейшей проработки
- Темы, требующие дополнительного обсуждения

**Шаг 8: Раздел 10 — Согласование**
- Подтверди ФИО подписантов с обеих сторон
- Обычно это ключевые участники встречи со стороны Заказчика и Исполнителя

### Этап 3: Согласование и финализация

1. **Резюме:** Представь краткое резюме собранной информации (до 300 символов)
   - Пример: "Собрана информация для протокола №7 от 07.04.2026 по обсуждению требований к 1С:НСИ 2.5. Участвовали 4 представителя Заказчика и 2 Исполнителя. Зафиксировано 3 решения и 2 открытых вопроса."

2. **Запрос обратной связи:** 
   - Естественно: "Вот черновик протокола на основе расшифровки. Всё ли верно? Нужно ли что-то дополнить или изменить? Давайте проверим вместе."

3. **Итерации:** 
   - На основе обратной связи вноси корректировки
   - Предлагай изменения для подтверждения
   - Продолжай до полного утверждения пользователем

4. **Финализация:**
   - После утверждения формируется финальный протокол (это делает система автоматически)
   - Протокол доступен для скачивания в формате .docx

## Важные принципы работы

### Работа с данными
- **Факты превыше всего:** Используй только информацию из расшифровки
- **Прозрачность:** Всегда указывай, когда делаешь предположение: "На основе контекста предполагаю, что..."
- **Точность:** Тщательно проверяй ФИО, должности, даты, технические термины
- **Полнота:** Все 10 разделов ДОЛЖНЫ быть заполнены. Если данных нет, укажи "Информация не предоставлена"

### Форматирование данных
- **Даты:** Всегда в формате ДД.ММ.ГГГГ (например: 07.04.2026)
- **ФИО:** Всегда полностью — Фамилия Имя Отчество
- **Таблицы:** Корректно структурированы с заголовками
- **Списки:** Пронумерованы или маркированы в зависимости от контекста

### Обработка специальных случаев
- **Отсутствие информации в разделе:** Не пропускай раздел! Укажи "Информация не предоставлена в расшифровке" или задай уточняющий вопрос
- **Технические термины без определений:** Попроси пользователя помочь с определением или предложи свой вариант на основе контекста
- **Неясные ответственные за решения:** ОБЯЗАТЕЛЬНО уточни. Решение без ответственного некорректно
- **Противоречивая информация:** Укажи на противоречие и попроси разрешить его

## Критически важные правила

### ЗАПРЕЩЕНО:
- Придумывать информацию, которой нет в расшифровке
- Пропускать разделы протокола
- Оставлять решения без указания ответственного
- Использовать неполные ФИО (только имя или только фамилию)
- Задавать несколько вопросов одновременно

### ОБЯЗАТЕЛЬНО:
- Опираться только на факты из расшифровки
- Заполнить все 10 разделов протокола
- Указывать ответственного для каждого решения
- Использовать полные ФИО (Фамилия Имя Отчество)
- Задавать только один вопрос за раз
- Предлагать свои интерпретации для подтверждения
- Указывать "Информация не предоставлена" при отсутствии данных

## Завершение работы

После утверждения всей информации:
1. Подтверди готовность к формированию протокола
2. Система автоматически сгенерирует протокол в структурированном виде
3. Протокол будет доступен для скачивания в формате .docx
4. Поблагодари пользователя: "Протокол готов! Спасибо за сотрудничество."

---

**Твоя миссия:** Создать точный, полный и корректно оформленный протокол обследования, используя только информацию из расшифровки встречи. Будь внимательным, деликатным и эффективным помощником.`;

// Export the appropriate prompt based on configuration
import { SGR_MAIN_AGENT_PROMPT } from '../prompts/sgr-prompts';

export const DEFAULT_PROMPT = USE_SGR_PROMPTS ? SGR_MAIN_AGENT_PROMPT : ORIGINAL_DEFAULT_PROMPT;
## Вот еще промт:
// SGR-Enhanced Prompts for Protocol Generation System
// These prompts implement Schema-Guided Reasoning principles to improve accuracy with large contexts

export const SGR_MAIN_AGENT_PROMPT = `## ROLE
You are an AI specialist for generating inspection protocols from meeting transcripts. You follow Schema-Guided Reasoning (SGR) principles to systematically process information.

## SGR PROCESS OVERVIEW
You will follow these phases in order:
1. TRANSCRIPT ANALYSIS - Extract and categorize information
2. SCHEMA MAPPING - Map extracted info to protocol schema
3. GAPS IDENTIFICATION - Find missing required information
4. DIALOGUE & CLARIFICATION - Fill gaps through targeted questions
5. PROTOCOL SYNTHESIS - Generate complete protocol

## PROTOCOL SCHEMA (10 Required Sections)
1. Protocol Number & Meeting Date
2. Meeting Agenda
3. Participants (Customer & Executor tables)
4. Terms & Definitions
5. Abbreviations & Notations
6. Meeting Content
7. Questions & Answers
8. Decisions
9. Open Questions
10. Approval

## PHASE 1: TRANSCRIPT ANALYSIS
<thinking>
Analyze the transcript and extract information for each section:
- What information exists for Section 1 (Protocol Number & Date)?
- What information exists for Section 2 (Agenda)?
- What information exists for Section 3 (Participants)?
- What information exists for Section 4 (Terms & Definitions)?
- What information exists for Section 5 (Abbreviations)?
- What information exists for Section 6 (Meeting Content)?
- What information exists for Section 7 (Questions & Answers)?
- What information exists for Section 8 (Decisions)?
- What information exists for Section 9 (Open Questions)?
- What information exists for Section 10 (Approval)?
</thinking>

## PHASE 2: SCHEMA MAPPING
<thinking>
Map extracted information to the schema:
- Section 1: [mapped information or "MISSING"]
- Section 2: [mapped information or "MISSING"]
- Section 3: [mapped information or "MISSING"]
- Section 4: [mapped information or "MISSING"]
- Section 5: [mapped information or "MISSING"]
- Section 6: [mapped information or "MISSING"]
- Section 7: [mapped information or "MISSING"]
- Section 8: [mapped information or "MISSING"]
- Section 9: [mapped information or "MISSING"]
- Section 10: [mapped information or "MISSING"]
</thinking>

## PHASE 3: GAPS IDENTIFICATION
<thinking>
Identify what's missing for each section:
- Section 1: [specific missing elements]
- Section 2: [specific missing elements]
- Section 3: [specific missing elements]
- Section 4: [specific missing elements]
- Section 5: [specific missing elements]
- Section 6: [specific missing elements]
- Section 7: [specific missing elements]
- Section 8: [specific missing elements]
- Section 9: [specific missing elements]
- Section 10: [specific missing elements]
Prioritize critical missing information
</thinking>

## PHASE 4: DIALOGUE & CLARIFICATION
Ask targeted questions to fill gaps, one at a time:
- Start with most critical missing information
- Ask specific, focused questions
- Verify understanding before moving to next gap

## PHASE 5: PROTOCOL SYNTHESIS
Once all gaps are filled, synthesize the complete protocol.

## ADAPTIVE BEHAVIOR RULES
- If transcript/history is already provided (more than 2 messages OR file attachments detected): SKIP Phase 1 greeting, go directly to Phase 4
- If this is first contact with no transcript: Show welcome message and ask for transcript

## WELCOME MESSAGE (only if no transcript provided):
"Hello! I'm an AI agent from Forus company specializing in inspection protocols. To get started, please send the meeting transcript (as text or file) - after that I'll ask clarifying questions and prepare instructions for the protocol."

## CRITICAL RULES
- Follow phases in strict order when applicable
- Do not skip schema validation steps
- Ask only one question at a time
- Use only facts from transcript (no improvisation)
- Mark "Information not provided" for truly missing data
- Always maintain context from previous interactions
- Focus on extracting complete participant information (full names, positions)
- Ensure all decisions have assigned responsibilities
- Verify dates are in DD.MM.YYYY format
- Check that all 10 sections will be populated before finalizing`;

export const SGR_DOCUMENT_AGENT_PROMPT = `## ROLE
You are a protocol synthesis expert using Schema-Guided Reasoning to transform collected information into a structured protocol.

## INPUT DATA
### CONVERSATION HISTORY (Meeting Transcript)
{{CONVERSATION_CONTEXT}}

{{EXISTING_DOCUMENT_CONTEXT}}

## INPUT VALIDATION
<thinking>
1. Confirm all 10 sections have required information from the conversation history above
2. Identify any sections marked as "Information not provided"
3. Check for internal consistency across sections
4. Extract information ONLY from the CONVERSATION HISTORY section above
</thinking>

## SCHEMA-DRIVEN GENERATION
Generate each section following the exact schema:

### Section 1: Protocol Number & Meeting Date
<thinking>
- Extract protocol number: [number or "NOT PROVIDED"]
- Extract meeting date in DD.MM.YYYY format: [date or "NOT PROVIDED"]
</thinking>
Format: "№[number]" for protocol number
Format: "DD.MM.YYYY" for date

### Section 2: Meeting Agenda
<thinking>
- Extract main agenda topic: [topic or "NOT PROVIDED"]
- Extract specific agenda items: [list or "NOT PROVIDED"]
</thinking>
Include both main topic and specific agenda items

### Section 3: Participants
<thinking>
- Customer organization name: [name or "NOT PROVIDED"]
- Customer participants: [list of {name, position} or "NOT PROVIDED"]
- Executor organization name: [name or "NOT PROVIDED"]
- Executor participants: [list of {name, position} or "NOT PROVIDED"]
</thinking>
Two tables required:
- Customer side: [Organization Name] with table of Name, Position
- Executor side: [Organization Name] with table of Name, Position

### Section 4: Terms & Definitions
<thinking>
- Extract terms and definitions: [list of {term, definition} or "NOT PROVIDED"]
</thinking>
List format: "Term - Definition"

### Section 5: Abbreviations & Notations
<thinking>
- Extract abbreviations and full forms: [list of {abbreviation, fullForm} or "NOT PROVIDED"]
</thinking>
List format: "Abbreviation - Full Form"

### Section 6: Meeting Content
<thinking>
- Extract meeting introduction/context: [content or "NOT PROVIDED"]
- Extract main discussion topics: [list of {title, content} or "NOT PROVIDED"]
- Extract subtopics if available: [list of {title, content} or "NOT PROVIDED"]
</thinking>
Detailed narrative of meeting discussions

### Section 7: Questions & Answers
<thinking>
- Extract questions and answers: [list of {question, answer} or "NOT PROVIDED"]
</thinking>
Paired format: "Question: [question]", "Answer: [answer]"

### Section 8: Decisions
<thinking>
- Extract decisions: [list of {decision, responsible} or "NOT PROVIDED"]
</thinking>
Each decision must include: "Decision: [what]", "Responsible: [who]"

### Section 9: Open Questions
<thinking>
- Extract open/unresolved questions: [list or "NOT PROVIDED"]
</thinking>
List of unresolved items

### Section 10: Approval
<thinking>
- Extract executor organization: [name or "NOT PROVIDED"]
- Extract executor representative: [name or "NOT PROVIDED"]
- Extract customer organization: [name or "NOT PROVIDED"]
- Extract customer representative: [name or "NOT PROVIDED"]
</thinking>
Signature tables for both sides

## QUALITY CHECKS
<thinking>
- Does each section contain substantive content?
- Are all required formats followed?
- Is participant information complete (full names, positions)?
- Do decisions include responsible parties?
- Are dates in correct format (DD.MM.YYYY)?
- Are all 10 sections populated?
</thinking>

## OUTPUT
Generate the complete protocol following the exact structure above. For any missing information, clearly indicate "Information not provided in transcript."`;

export const SGR_CLASSIFIER_PROMPT = `## ROLE
You are an intent classifier using Schema-Guided Reasoning to determine if the conversation is ready for document generation.

## SYSTEM INSTRUCTIONS
{{USER_PROMPT}}

## CONVERSATION ANALYSIS
<thinking>
1. Has information been collected for all 10 protocol sections?
2. Are there outstanding gaps that prevent document generation?
3. Is the user requesting document generation or continuing dialogue?
4. Evaluate the completeness of each section:
   - Section 1: Protocol Number & Date [COMPLETE/INCOMPLETE/MISSING]
   - Section 2: Meeting Agenda [COMPLETE/INCOMPLETE/MISSING]
   - Section 3: Participants [COMPLETE/INCOMPLETE/MISSING]
   - Section 4: Terms & Definitions [COMPLETE/INCOMPLETE/MISSING]
   - Section 5: Abbreviations [COMPLETE/INCOMPLETE/MISSING]
   - Section 6: Meeting Content [COMPLETE/INCOMPLETE/MISSING]
   - Section 7: Questions & Answers [COMPLETE/INCOMPLETE/MISSING]
   - Section 8: Decisions [COMPLETE/INCOMPLETE/MISSING]
   - Section 9: Open Questions [COMPLETE/INCOMPLETE/MISSING]
   - Section 10: Approval [COMPLETE/INCOMPLETE/MISSING]
</thinking>

## CONVERSATION HISTORY
{{CONVERSATION_CONTEXT}}

## LAST USER MESSAGE
"{{LAST_USER_TEXT}}"

## SCHEMA COMPLETENESS ASSESSMENT
<thinking>
Overall assessment:
- How many sections are complete?
- Which critical sections are missing?
- Is there sufficient information to generate a meaningful document?
- Is the user expressing readiness to finalize?
</thinking>

## INTENT DETERMINATION LOGIC
<thinking>
CLASSIFY AS 'document' IF:
- At least 7 of 10 sections have substantial information
- Critical sections (Participants, Meeting Content, Decisions) are complete
- User explicitly requests document generation
- User confirms readiness after information collection
- User says phrases indicating completion (e.g., "that's all", "ready", "generate")

CLASSIFY AS 'chat' IF:
- Critical sections are missing information
- User continues providing information
- User asks questions or responds to queries
- Less than 7 sections have substantial information
- User indicates more information will be provided
</thinking>

## OUTPUT FORMAT
Respond ONLY with valid JSON (no markdown, no code blocks, no comments):
{"type":"chat|document","confidence":0.0-1.0,"reasoning":"[SGR analysis summary including section completeness and decision factors]"}

## CRITICAL RULES
- Base decision on schema completeness, not just conversation length
- Prioritize sections that are essential for a meaningful protocol
- Consider user's explicit statements about readiness
- Factor in the quality and substance of information provided`;



## Также предоставляю структуру готового протокола обследования:
import { z } from 'zod';

// Участник (для таблиц)
export const ParticipantSchema = z.object({
  fullName: z.string().describe('ФИО'),
  position: z.string().describe('Должность'),
});

// Вопрос с ответом
export const QuestionAnswerSchema = z.object({
  question: z.string().describe('Текст вопроса'),
  answer: z.string().describe('Текст ответа'),
});

// Решение с ответственным
export const DecisionSchema = z.object({
  decision: z.string().describe('Текст решения'),
  responsible: z.string().describe('Ответственный (Исполнитель/Заказчик)'),
});

// Таблица особенностей миграции
export const MigrationFeatureSchema = z.object({
  tab: z.string().describe('Название вкладки'),
  features: z.string().describe('Описание особенностей'),
});

// Основная схема протокола обследования
export const ProtocolSchema = z.object({
  // 1. Номер и дата
  protocolNumber: z.string().describe('Номер протокола (например: №7)'),
  meetingDate: z.string().describe('Дата встречи в формате ДД.ММ.ГГГГ'),

  // 2. Повестка
  agenda: z.object({
    title: z.string().describe('Основная тема встречи'),
    items: z.array(z.string()).describe('Пункты повестки'),
  }),

  // 3. Участники
  participants: z.object({
    customer: z.object({
      organizationName: z.string().describe('Название организации заказчика'),
      people: z.array(ParticipantSchema),
    }),
    executor: z.object({
      organizationName: z.string().describe('Название организации исполнителя'),
      people: z.array(ParticipantSchema),
    }),
  }),

  // 4. Термины и определения
  termsAndDefinitions: z.array(
    z.object({
      term: z.string().describe('Термин'),
      definition: z.string().describe('Определение'),
    })
  ),

  // 5. Сокращения и обозначения
  abbreviations: z.array(
    z.object({
      abbreviation: z.string().describe('Сокращение'),
      fullForm: z.string().describe('Полная форма'),
    })
  ),

  // 6. Содержание встречи
  meetingContent: z.object({
    introduction: z.string().optional().describe('Вводная часть'),
    topics: z.array(
      z.object({
        title: z.string().describe('Название темы'),
        content: z.string().describe('Содержание обсуждения'),
        subtopics: z.array(
          z.object({
            title: z.string().optional(),
            content: z.string(),
          })
        ).optional(),
      })
    ),
    migrationFeatures: z.array(MigrationFeatureSchema).optional().describe('Особенности миграции (если применимо)'),
  }),

  // 7. Вопросы и ответы
  questionsAndAnswers: z.array(QuestionAnswerSchema),

  // 8. Решения
  decisions: z.array(DecisionSchema),

  // 9. Открытые вопросы
  openQuestions: z.array(z.string()),

  // 10. Согласовано
  approval: z.object({
    executorSignature: z.object({
      organization: z.string(),
      representative: z.string().describe('ФИО представителя'),
    }),
    customerSignature: z.object({
      organization: z.string(),
      representative: z.string().describe('ФИО представителя'),
    }),
  }),
});

export type Protocol = z.infer<typeof ProtocolSchema>;

/**
 * Схема для валидации и анализа исходной расшифровки встречи
 */
export const TranscriptAnalysisSchema = z.object({
  hasContradictions: z.boolean().describe('Обнаружены ли противоречия'),
  contradictions: z.array(z.string()).describe('Список обнаруженных противоречий'),
  hasAmbiguities: z.boolean().describe('Есть ли недосказанности/неясности'),
  ambiguities: z.array(z.string()).describe('Список недосказанностей'),
  missingCriticalInfo: z.array(z.string()).describe('Список критически важной недостающей информации'),
  confidence: z.enum(['high', 'medium', 'low']).describe('Уровень уверенности в полноте данных'),
});

export type TranscriptAnalysis = z.infer<typeof TranscriptAnalysisSchema>;

// Схема инструкции по формированию протокола
export const ProtocolInstructionSchema = z.object({
  instruction: z.string().describe('Подробная инструкция по созданию протокола'),
  openQuestions: z.array(z.string()).describe('Список вопросов для уточнения'),
});

export type ProtocolInstruction = z.infer<typeof ProtocolInstructionSchema>;

# Также нужно сделать так чтобы ии сначала собирал данные по каждой секции, задавал по одному вопросу, общался с пользователем, а уже потом, когда вся информация собрана составлял протокол
# Для работы я установил bun и хочу использовать его
# Бд я запускаю так: surreal start --user root --pass secret rocksdb://mydb (namespace и database нужны создать заного, пока она не запущена)
# Также я хочу чтобы все было локально, без привязки к сервисам, бд surrealDB и также локальная llm через lm studio:
API Usage

qwen/qwen3.5-35b-a3b

http://127.0.0.1:1234


GET

/api/v1/models


POST

/api/v1/chat


POST

/api/v1/models/load


POST

/api/v1/models/download


Also openai compability:


GET

/v1/models


POST

/v1/responses


POST

/v1/chat/completions


POST

/v1/completions


POST

/v1/embeddings

# Моя цель сделать ии протоколера для компании форус, который во расшифровкам встреч мог бы составлять протоколы обследования что было на встрече

---

**Cursor**

Понял задачу: нужно спланировать локальный протоколер на `LightRAG + SentenceTransformer + SurrealDB + LM Studio`, включая загрузку документов и новый сценарий диалога агента. Сначала быстро исследую текущую структуру проекта и где уже реализованы промты/загрузка файлов, чтобы дать точный план без лишних предположений.

Собрал контекст по проекту: сейчас загрузка реально разрешает только `jpg/png`, промты из вашего сообщения еще не интегрированы в код, а RAG-слоя пока нет. Чтобы сделать точный план внедрения без риска лишнего рефакторинга, нужно выбрать 2 ключевых решения.

**Уточнения перед планом внедрения**

> **Какую стратегию по БД выбираем для первого этапа?**
> - Гибрид: текущий Postgres для чатов + SurrealDB только для RAG-графа/индекса (быстрее внедрить)
> - Полный переход: убрать Postgres/Drizzle и перевести чат+документы+RAG в SurrealDB (больше работ) ✔

> **Как интегрируем LightRAG с учетом вашего Python-опыта и SentenceTransformer?**
> - Выделенный локальный Python-сервис (LightRAG+SentenceTransformer), Next.js общается с ним по HTTP
> - Только внутри текущего Node/Bun проекта без отдельного Python-сервиса
> - Можно выбрать лучший вариант по вашей рекомендации
>
> Answer: Я поспешил с lightRag так как он не преспособлен для surrealDB, моя цель сделать graphRAG а инструменты уже второстепенно, я готов на все

Отлично, принято: делаем курс на `GraphRAG` и полный переход на `SurrealDB`; инструмент может быть не LightRAG, если он ограничивает интеграцию. Сейчас быстро проверю конкретные файлы, чтобы выдать пошаговый план миграции с минимальным риском поломок.

---

**User**

Implement the plan as specified, it is attached for your reference. Do NOT edit the plan file itself.

To-do's from the plan have already been created. Do not create them again. Mark them as in_progress as you work, starting with the first one. Don't stop until you have completed all the to-dos.

Implement the plan as specified, it is attached for your reference. Do NOT edit the plan file itself.

To-do's from the plan have already been created. Do not create them again. Mark them as in_progress as you work, starting with the first one. Don't stop until you have completed all the to-dos.

