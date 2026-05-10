/**
 * Текстовое описание целевой структуры протокола для LLM (зеркало Hakaton ProtocolSchema).
 * Сама Zod-схема в runtime к модели не сериализуется автоматически — этот блок явно передаётся в system.
 */
export const PROTOCOL_DOCUMENT_STRUCTURE_PROMPT = `## ЦЕЛЕВАЯ СХЕМА ДОКУМЕНТА «ПРОТОКОЛ ОБСЛЕДОВАНИЯ» (все разделы обязательны к заполнению по мере сбора данных)

При финальном оформлении протокола (в чате или через артефакт-документ) соблюдай эту логическую структуру полей:

1) protocolNumber — номер протокола (формат вида «№…»)
2) meetingDate — дата встречи строго ДД.ММ.ГГГГ
3) agenda — объект: title (основная тема), items[] (пункты повестки)
4) participants — объект:
   - customer: organizationName, people[] { fullName, position }
   - executor: organizationName, people[] { fullName, position }
   Две стороны; для каждой — таблица ФИО и должность.
5) termsAndDefinitions — массив { term, definition }
6) abbreviations — массив { abbreviation, fullForm }
7) meetingContent — объект: introduction (опционально), topics[] { title, content, subtopics? }, migrationFeatures? (если уместно по расшифровке)
8) questionsAndAnswers — массив { question, answer }
9) decisions — массив { decision, responsible }
10) openQuestions — массив строк (нерешённые вопросы)
11) approval — executorSignature { organization, representative }, customerSignature { organization, representative }

Правила качества:
- Решения всегда с ответственным.
- Участники — полные ФИО и должности; организации заказчика и исполнителя явно.
- Пропуски помечай как «Информация не предоставлена в расшифровке», не выдумывай.
`;
