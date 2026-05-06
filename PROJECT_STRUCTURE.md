# Project Structure Guide

This is a quick map of the project for daily navigation.

## 1) What renders the chat UI

- `app/(chat)/layout.tsx`
  - Main entry for chat area.
  - Mounts providers and renders `ChatShell`.
- `components/chat/shell.tsx`
  - Main chat screen composition:
  - header, messages, input, artifact panel.
- `app/(chat)/page.tsx` and `app/(chat)/chat/[id]/page.tsx`
  - Return `null` by design.
  - Real UI is rendered from layout + `ChatShell`.

## 2) Input area, buttons, and model selector

- `components/chat/multimodal-input.tsx`
  - Composer under messages.
  - Attach button (paperclip): `AttachmentsButton`.
  - Robot button: `RAGTestButton` (sends attached files to RAG backend).
  - Model dropdown: `ModelSelectorCompact`.

If you need to change the robot button behavior, start in:
- `components/chat/multimodal-input.tsx` (`PureRAGTestButton`)
- `lib/ai/rag-service.ts` (HTTP calls to Python RAG service)

## 3) AI behavior and prompting

- `lib/ai/prompts.ts`
  - Global system prompt and behavior rules.
  - Forus protocol workflow is defined here.
- `lib/ai/providers.ts`
  - LLM provider selection (LM Studio local vs gateway).
- `lib/ai/models.ts`
  - Allowed models and capabilities.

## 4) API routes (Next.js backend)

- `app/(chat)/api/chat/route.ts`
  - Main chat streaming endpoint.
  - Tool execution and title update logic.
- `app/(chat)/actions.ts`
  - Server actions, including chat title generation.
- `app/(chat)/api/models/route.ts`
  - Models/capabilities for UI selector.
- `app/(chat)/api/files/upload/route.ts`
  - Local file upload endpoint.

## 5) Artifact generation (document/code/sheet panel)

- `lib/artifacts/server.ts`
  - Artifact handler registry.
- `artifacts/text/server.ts`
- `artifacts/code/server.ts`
- `artifacts/sheet/server.ts`

## 6) Database/auth/runtime

- `lib/db/queries.ts` - DB operations.
- `lib/db/schema.ts` - DB schema.
- `lib/db/migrate.ts` - migrations runner.
- `app/(auth)/auth.ts` - auth config and providers.

## 7) Your local RAG backend

- Frontend client: `lib/ai/rag-service.ts`
- Python backend: `backend-rag/`
  - FastAPI endpoints and processing pipeline.

## 8) Quick debugging checklist

When something is "not clickable" or "not working":

1. Check button `disabled` conditions in `components/chat/multimodal-input.tsx`.
2. Check browser Network tab for route errors:
   - `/api/chat`
   - `/api/files/upload`
   - `NEXT_PUBLIC_RAG_API_URL` endpoints.
3. Check terminal logs from:
   - `app/(chat)/api/chat/route.ts`
   - `artifacts/*/server.ts`
4. Confirm env values in `.env.local`.

## 9) Important note about generated folders

- Ignore `.next/` while searching for source code changes.
- It contains build artifacts, not source of truth.

