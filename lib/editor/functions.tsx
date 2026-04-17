"use client";

import { defaultMarkdownSerializer } from "prosemirror-markdown";
import { DOMParser, type Node } from "prosemirror-model";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import { renderToString } from "react-dom/server";

import { MessageResponse } from "@/components/ai-elements/message";

import { documentSchema } from "./config";
import type { UISuggestion } from "./suggestions";

/**
 * Конвертирует markdown таблицы в форматированный текст для редактора.
 * ProseMirror не поддерживает таблицы нативно, поэтому конвертируем их
 * в читаемый текстовый формат с выравниванием.
 */
function markdownTableToText(content: string): string {
  // Регулярка для markdown таблиц
  const tableRegex = /(\|[^\n]+\|\n\|[-| :]+\|\n(?:\|[^\n]+\|\n?)+)/g;
  
  return content.replace(tableRegex, (match) => {
    const rows = match.trim().split("\n").filter((row) => row.trim());
    if (rows.length < 2) return match;

    // Пропускаем разделительную строку (---|---|---)
    const dataRows = rows.filter((_, i) => i !== 1);
    
    // Находим максимальную ширину каждой колонки
    const parsedRows = dataRows.map((row) =>
      row.replace(/^\||\|$/g, "").split("|").map((c) => c.trim())
    );
    
    const colWidths: number[] = [];
    for (const row of parsedRows) {
      for (let i = 0; i < row.length; i++) {
        colWidths[i] = Math.max(colWidths[i] || 0, row[i].length);
      }
    }

    // Форматируем с отступами
    const formatted = parsedRows.map((row, rowIndex) => {
      const padded = row.map((cell, i) => cell.padEnd(colWidths[i] || 0));
      return padded.join("  ");
    }).join("\n");

    // Добавляем пустую строку до и после таблицы
    return `\n${formatted}\n`;
  });
}

export const buildDocumentFromContent = (content: string) => {
  const parser = DOMParser.fromSchema(documentSchema);
  
  // Конвертируем markdown таблицы в форматированный текст для редактора
  const contentWithTables = markdownTableToText(content);
  
  const stringFromMarkdown = renderToString(
    <MessageResponse>{contentWithTables}</MessageResponse>
  );
  const tempContainer = document.createElement("div");
  tempContainer.innerHTML = stringFromMarkdown;
  return parser.parse(tempContainer);
};

export const buildContentFromDocument = (document: Node) => {
  return defaultMarkdownSerializer.serialize(document);
};

export const createDecorations = (
  suggestions: UISuggestion[],
  _view: EditorView
) => {
  const decorations: Decoration[] = [];

  for (const suggestion of suggestions) {
    decorations.push(
      Decoration.inline(
        suggestion.selectionStart,
        suggestion.selectionEnd,
        {
          class: "suggestion-highlight",
          "data-suggestion-id": suggestion.id,
        },
        {
          suggestionId: suggestion.id,
          type: "highlight",
        }
      )
    );
  }

  return DecorationSet.create(_view.state.doc, decorations);
};
