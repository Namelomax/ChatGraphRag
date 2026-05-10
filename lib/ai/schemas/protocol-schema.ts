import { z } from "zod";

/** Участник (для таблиц) */
export const ParticipantSchema = z.object({
  fullName: z.string().describe("ФИО"),
  position: z.string().describe("Должность"),
});

/** Вопрос с ответом */
export const QuestionAnswerSchema = z.object({
  question: z.string().describe("Текст вопроса"),
  answer: z.string().describe("Текст ответа"),
});

/** Решение с ответственным */
export const DecisionSchema = z.object({
  decision: z.string().describe("Текст решения"),
  responsible: z.string().describe("Ответственный (Исполнитель/Заказчик)"),
});

/** Таблица особенностей миграции */
export const MigrationFeatureSchema = z.object({
  tab: z.string().describe("Название вкладки"),
  features: z.string().describe("Описание особенностей"),
});

/** Основная схема протокола обследования (соответствует Hakaton protocol-schema.ts) */
export const ProtocolSchema = z.object({
  protocolNumber: z.string().describe("Номер протокола (например: №7)"),
  meetingDate: z.string().describe("Дата встречи в формате ДД.ММ.ГГГГ"),

  agenda: z.object({
    title: z.string().describe("Основная тема встречи"),
    items: z.array(z.string()).describe("Пункты повестки"),
  }),

  participants: z.object({
    customer: z.object({
      organizationName: z.string().describe("Название организации заказчика"),
      people: z.array(ParticipantSchema),
    }),
    executor: z.object({
      organizationName: z.string().describe("Название организации исполнителя"),
      people: z.array(ParticipantSchema),
    }),
  }),

  termsAndDefinitions: z.array(
    z.object({
      term: z.string().describe("Термин"),
      definition: z.string().describe("Определение"),
    })
  ),

  abbreviations: z.array(
    z.object({
      abbreviation: z.string().describe("Сокращение"),
      fullForm: z.string().describe("Полная форма"),
    })
  ),

  meetingContent: z.object({
    introduction: z.string().optional().describe("Вводная часть"),
    topics: z.array(
      z.object({
        title: z.string().describe("Название темы"),
        content: z.string().describe("Содержание обсуждения"),
        subtopics: z
          .array(
            z.object({
              title: z.string().optional(),
              content: z.string(),
            })
          )
          .optional(),
      })
    ),
    migrationFeatures: z
      .array(MigrationFeatureSchema)
      .optional()
      .describe("Особенности миграции (если применимо)"),
  }),

  questionsAndAnswers: z.array(QuestionAnswerSchema),

  decisions: z.array(DecisionSchema),

  openQuestions: z.array(z.string()),

  approval: z.object({
    executorSignature: z.object({
      organization: z.string(),
      representative: z.string().describe("ФИО представителя"),
    }),
    customerSignature: z.object({
      organization: z.string(),
      representative: z.string().describe("ФИО представителя"),
    }),
  }),
});

export type Protocol = z.infer<typeof ProtocolSchema>;

export const TranscriptAnalysisSchema = z.object({
  hasContradictions: z.boolean().describe("Обнаружены ли противоречия"),
  contradictions: z
    .array(z.string())
    .describe("Список обнаружённых противоречий"),
  hasAmbiguities: z.boolean().describe("Есть ли недосказанности/неясности"),
  ambiguities: z.array(z.string()).describe("Список недосказанностей"),
  missingCriticalInfo: z
    .array(z.string())
    .describe("Список критически важной недостающей информации"),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe("Уровень уверенности в полноте данных"),
});

export type TranscriptAnalysis = z.infer<typeof TranscriptAnalysisSchema>;

export const ProtocolInstructionSchema = z.object({
  instruction: z
    .string()
    .describe("Подробная инструкция по созданию протокола"),
  openQuestions: z.array(z.string()).describe("Список вопросов для уточнения"),
});

export type ProtocolInstruction = z.infer<typeof ProtocolInstructionSchema>;
