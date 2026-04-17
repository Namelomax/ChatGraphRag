Now I have a complete picture. Here is the comprehensive summary.

Comprehensive RAG Architecture Summary
1. OVERVIEW
This project implements a GraphRAG-inspired RAG pipeline for a meeting protocol chatbot. It uses SurrealDB as the vector store and local LM Studio for embeddings. The system is designed to ingest meeting transcripts and related documents, then retrieve relevant context during chat conversations to ground LLM responses.

2. VECTOR DATABASE: SurrealDB
Location: d:\Jacob\Programming\ChatBot2\chatbot\lib\rag\surreal.ts

The project uses SurrealDB (via HTTP API) as both the document store and vector database. Key details:

Connection: HTTP endpoint at SURREAL_HTTP_URL (default http://127.0.0.1:8000/sql)
Namespace: forus (env: SURREAL_NS)
Database: protocoler (env: SURREAL_DB)
Auth: Basic auth (SURREAL_USER / SURREAL_PASS, default root / secret)
Schema (dynamically created at index time):

Table rag_chunk – stores text chunks with embeddings, indexed by chatId and userId
Fields: chatId, userId, fileName, text, embedding (array of numbers), createdAt
There is also a second, more sophisticated schema defined in lib/rag/indexer.ts that uses:

rag_document – document-level metadata with content hashing for deduplication
rag_chunk – linked chunks with documentId, index, content, and embedding
A contains edge relation (RELATE rag_document->contains->rag_chunk) – this is the “graph” aspect of GraphRAG
However, the actively used path (via service.ts) uses the simpler flat rag_chunk table without the graph relations.

3. EMBEDDINGS
Location: d:\Jacob\Programming\ChatBot2\chatbot\lib\rag\embeddings.ts

Provider: Local LM Studio server (OpenAI-compatible API)
Base URL: LOCAL_LLM_BASE_URL (default http://127.0.0.1:1234/v1)
Model: LOCAL_EMBEDDING_MODEL (default text-embedding-nomic-embed-text-v1.5)
Similarity metric: Cosine similarity (hand-implemented, no external library)
Batch support: embedTexts() function for batch embedding (used by indexer.ts)
4. LLM INTEGRATION
Locations:

d:\Jacob\Programming\ChatBot2\chatbot\lib\ai\models.ts
d:\Jacob\Programming\ChatBot2\chatbot\lib\ai\providers.ts
Primary model: Local Qwen 3.5 35B A3B via LM Studio (local/qwen3.5-35b-a3b)
Secondary model: OpenRouter (openrouter/arcee-ai/trinity-large-preview:free)

LLM used for RAG query generation:

A dedicated generateRagQuery() function (d:\Jacob\Programming\ChatBot2\chatbot\lib\rag\query-generator.ts) uses an LLM call to convert the user message + chat history into a 3-5 word search query optimized for document retrieval.
Model: LOCAL_LLM_MODEL (default qwen/qwen3.5-35b-a3b)
Temperature: 0.3, maxTokens: 64
5. DOCUMENT PROCESSING PIPELINE
File: d:\Jacob\Programming\ChatBot2\chatbot\lib\rag\extract.ts

Supported formats:

PDF – via pdf-parse (v2.4.5)
DOCX – via mammoth (raw text extraction)
DOC – best-effort binary decode (TextDecoder, null removal)
XLSX/XLS – via xlsx, converts each sheet to pipe-delimited rows
Text files (.txt, .md, .csv, .json, .xml) – direct read
Chunking: d:\Jacob\Programming\ChatBot2\chatbot\lib\rag\chunker.ts

Two functions:

chunkText(text, chunkSize, overlap) – configurable chunker
splitText(text, chunkSize=500, overlap=80) – simpler chunker used by service.ts
Configuration (d:\Jacob\Programming\ChatBot2\chatbot\lib\rag\config.ts):

chunkSize: 1200 (env: RAG_CHUNK_SIZE)
overlap: 120 (env: RAG_CHUNK_OVERLAP)
retrievalTopK: 6 (env: RAG_TOP_K)
6. RAG RETRIEVAL FLOW
The complete flow, triggered in d:\Jacob\Programming\ChatBot2\chatbot\app\(chat)\api\chat\route.ts:

Extract user text from the incoming message parts
Build chat history context (last 5 messages)
Generate smart query via generateRagQuery() (LLM-based query reformulation)
Retrieve chunks via retrieveRagContext():
Embed the generated query
Fetch ALL chunks for the user from SurrealDB
Score each chunk via cosine similarity
Return top-K (default 10 in chat route, 6 in config) as formatted text
Combine RAG context with any attached file texts
Inject into system prompt as ## ЗАГРУЖЕННЫЕ ДОКУМЕНТЫ (GraphRAG) section
Stream LLM response with grounded context
7. API ROUTES
Route	File	Purpose
POST /api/chat	d:\Jacob\Programming\ChatBot2\chatbot\app\(chat)\api\chat\route.ts	Main chat endpoint; performs RAG retrieval before streaming
POST /api/files/upload	d:\Jacob\Programming\ChatBot2\chatbot\app\(chat)\api\files\upload\route.ts	Upload file; extracts text but does NOT auto-index to RAG
POST /api/files/index-rag	d:\Jacob\Programming\ChatBot2\chatbot\app\(chat)\api\files\index-rag\route.ts	Explicitly index document text into GraphRAG
GET /api/rag-documents	d:\Jacob\Programming\ChatBot2\chatbot\app\(chat)\api\rag-documents\route.ts	List indexed documents by chatId
DELETE /api/rag-documents	d:\Jacob\Programming\ChatBot2\chatbot\app\(chat)\api\rag-documents\route.ts	Delete indexed document by chatId + fileName
8. DATABASE SCHEMA (PostgreSQL via Drizzle)
Location: d:\Jacob\Programming\ChatBot2\chatbot\lib\db\schema.ts

The primary relational database is PostgreSQL managed via Drizzle ORM. Tables:

User – user accounts
Chat – chat sessions
Message_v2 – messages (JSON parts)
Vote_v2 – message votes
Document – AI-generated artifacts
Suggestion – document suggestions
Stream – streaming sessions
Important: RAG data (embeddings, chunks) is stored in SurrealDB, NOT PostgreSQL. The two databases operate independently.

9. KNOWLEDGE GRAPH / ENTITY EXTRACTION
No dedicated knowledge graph or entity extraction code exists. Despite the “GraphRAG” naming:

The indexer.ts file creates RELATE edges between rag_document and rag_chunk in SurrealDB, but this is a simple containment graph, not a knowledge graph with entities/relations.
There are no entity extraction, named entity recognition (NER), or triple extraction components.
The system prompt (lib/ai/prompts.ts) instructs the LLM to extract participants, agenda items, decisions, etc. from meeting transcripts, but this extraction happens at inference time within the LLM, not as a preprocessing step.
10. KEY LIBRARIES
Category	Library
AI SDK	ai (v6.0.116), @ai-sdk/openai (v3.0.49)
Vector DB	surrealdb.js (v1.0.0)
ORM	drizzle-orm (v0.34.0)
PDF parsing	pdf-parse (v2.4.5)
DOCX parsing	mammoth (v1.12.0)
Excel parsing	xlsx (v0.18.5)
Framework	Next.js 16.2.0
11. NOTABLE ARCHITECTURAL OBSERVATIONS
Dual-schema inconsistency: surreal.ts uses a flat rag_chunk table, while indexer.ts defines a richer document-chunk graph with RELATE edges. The active service (service.ts) uses the simpler approach, making the indexer.ts and retriever.ts files effectively unused/dead code.

No vector index in SurrealDB: Chunks are retrieved with SELECT ... WHERE userId = X and then scored in-memory with cosine similarity. There is no DEFINE VECTOR INDEX or approximate nearest neighbor (ANN) search. This will not scale beyond a few hundred chunks.

Manual variable interpolation: SurrealDB queries use manual string replacement ($var -> JSON.stringify(value)) rather than parameterized queries, which is a potential injection risk if user input (fileName) is not sanitized.

Embeddings served synchronously: Each chunk gets an individual fetch() call to LM Studio in service.ts. The indexer.ts has a batch embedTexts() function, but it is not used by the active indexing path.