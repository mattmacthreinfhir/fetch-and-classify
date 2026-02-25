# Womens Health Content Ingestion Service

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
│  │  - Submit URL│  │  POST /api/content            │  │
│  │  - Browse    │  │  GET  /api/content            │  │
│  │  - Filter    │  │  GET  /api/content/[id]       │  │
│  │  - Reanalyze │  │  POST /api/content/[id]/reanalyze│
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

   You'll need:
   - **`ANTHROPIC_API_KEY`** — from the [Anthropic Console](https://console.anthropic.com)
   - **`NEXT_PUBLIC_SUPABASE_URL`** — your Supabase project URL (found in Settings > API)
   - **`SUPABASE_SECRET_KEY`** — your Supabase secret key (found in Settings > API Keys; either the `sb_secret_` format or legacy service_role JWT)

4. Run the database migration in the Supabase SQL editor:
   - Open your Supabase dashboard > SQL Editor
   - Paste the contents of `supabase/migrations/001_create_content_table.sql`
   - Run the query — this creates the `content` table with indexes and RLS policies

5. Start the dev server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) to access the UI.

### Local Development

```bash
npm run dev        # Start the dev server (http://localhost:3000)
npm run build      # Production build
npm run lint       # Run ESLint
npm test           # Run the test suite (33 tests)
npm run test:watch # Run tests in watch mode
```

The UI provides:
- A URL submission form — paste any article URL and hit Submit
- Category and status filters to browse ingested content
- Status badges (pending, processing, completed, failed)
- Category badges and confidence scores on each record
- A "needs review" flag when the LLM confidence is below 70%
- A "Reanalyze" button to re-run extraction and classification on any record

### Testing Without Supabase

The UI will load without Supabase configured — it shows an empty state. The API endpoints require Supabase to be configured. The test suite uses mocked dependencies and runs without any external services.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/content` | Submit a URL for ingestion |
| `GET` | `/api/content` | List content with optional filters (`?category=`, `?status=`, `?needs_review=`, `?limit=`, `?offset=`) |
| `GET` | `/api/content/[id]` | Get a single content record by ID |
| `POST` | `/api/content/[id]/reanalyze` | Re-run extraction and classification on an existing record |

### POST /api/content

```bash
curl -X POST http://localhost:3000/api/content \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/article"}'
```

Returns `202` for new submissions, `200` if the URL was already ingested.

### GET /api/content

```bash
# List all content
curl http://localhost:3000/api/content

# Filter by category and status
curl "http://localhost:3000/api/content?category=nutrition&status=completed&limit=10"
```

### GET /api/content/[id]

```bash
curl http://localhost:3000/api/content/550e8400-e29b-41d4-a716-446655440000
```

### POST /api/content/[id]/reanalyze

Re-fetches the URL and re-classifies the content. Useful after prompt changes or if the original extraction failed.

```bash
curl -X POST http://localhost:3000/api/content/550e8400-e29b-41d4-a716-446655440000/reanalyze
```

## Project Structure

```
src/
├── app/
│   ├── page.tsx                          # UI — submit URLs, browse/filter results
│   ├── layout.tsx                        # Root layout with metadata
│   └── api/
│       └── content/
│           ├── route.ts                  # POST (submit) + GET (list)
│           └── [id]/
│               ├── route.ts             # GET (single record)
│               └── reanalyze/
│                   └── route.ts         # POST (re-run pipeline)
├── lib/
│   ├── extractor.ts                     # URL fetch, Readability, JSON-LD, meta tags
│   ├── classifier.ts                    # Claude LLM classification with Zod validation
│   ├── pipeline.ts                      # Orchestration: extract → classify → store
│   ├── supabase.ts                      # Supabase client (server-side)
│   └── __tests__/
│       ├── extractor.test.ts            # 16 tests
│       ├── classifier.test.ts           # 11 tests
│       └── pipeline.test.ts             # 6 tests
├── types/
│   └── index.ts                         # Zod schemas, TypeScript types, categories
supabase/
└── migrations/
    └── 001_create_content_table.sql     # Postgres migration with GIN indexes
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SECRET_KEY` | Supabase secret key (server-side only) |

## License

MIT
