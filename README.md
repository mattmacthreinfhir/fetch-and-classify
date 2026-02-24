# Tellory Content Ingestion Service

A content ingestion and classification pipeline built with Next.js, Supabase, and Anthropic Claude. Submit any URL and the service will fetch the article, extract its content, classify it using AI, and store the results.

## Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Framework** | Next.js 16 (App Router) | Server components, API routes, Vercel-native |
| **Database** | Supabase (Postgres) | PostgREST, RLS, GIN-indexed array columns |
| **LLM** | Anthropic Claude | Structured JSON output, high classification accuracy |
| **Deployment** | Vercel | Zero-config Next.js hosting |
| **Content Extraction** | `@mozilla/readability` + `jsdom` | Same engine as Firefox Reader View |
| **Validation** | Zod | Type-safe runtime validation at API boundaries |

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Next.js App                    │
│                                                  │
│  ┌─────────────┐  ┌──────────────────────────┐  │
│  │  Simple UI   │  │     API Routes           │  │
│  │  - Submit URL│  │  POST /api/content       │  │
│  │  - Browse    │  │  GET  /api/content       │  │
│  │  - Filter    │  │  GET  /api/content/[id]  │  │
│  └──────┬──────┘  └──────┬───────────────────┘  │
│         │                │                       │
│         └────────────────┤                       │
│                          ▼                       │
│              ┌───────────────────┐               │
│              │  Content Pipeline │               │
│              │                   │               │
│              │  1. Fetch URL     │               │
│              │  2. Extract text  │               │
│              │  3. LLM classify  │               │
│              │  4. Store result  │               │
│              └─────────┬─────────┘               │
│                        │                         │
└────────────────────────┼─────────────────────────┘
                         │
              ┌──────────┴──────────┐
              │     Supabase        │
              │  ┌───────────────┐  │
              │  │   content     │  │
              │  │   table       │  │
              │  └───────────────┘  │
              └─────────────────────┘
```

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works)
- An [Anthropic API key](https://console.anthropic.com)

### Setup

1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd tellory-content-ingestion
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the environment template and fill in your keys:
   ```bash
   cp .env.example .env.local
   ```

4. Run the database migration in the Supabase SQL editor (see `supabase/migrations/001_create_content_table.sql`).

5. Start the dev server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000).

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/content` | Submit a URL for ingestion |
| `GET` | `/api/content` | List content with optional filters (`?category=`, `?status=`, `?needs_review=`, `?limit=`, `?offset=`) |
| `GET` | `/api/content/[id]` | Get a single content record by ID |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |

## License

MIT
