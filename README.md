# Content Ingestion & Classification Service

A content ingestion and classification pipeline built with Next.js, Supabase, and Anthropic Claude. Submit any URL and the service will fetch the article, extract its content, classify it into health & wellness categories using AI, and store the results.

## Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Framework** | Next.js 16 (App Router) | Server components, API routes, Vercel-native |
| **Database** | Supabase (Postgres) | PostgREST, RLS, GIN-indexed array columns |
| **LLM** | Anthropic Claude | Structured JSON output, high classification accuracy |
| **Deployment** | Vercel | Zero-config Next.js hosting |
| **Content Extraction** | `@mozilla/readability` + `jsdom` | Same engine as Firefox Reader View |
| **Validation** | Zod | Type-safe runtime validation at API boundaries |
| **Testing** | Vitest | Fast unit tests with v8 coverage |

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                     Next.js App                       │
│                                                       │
│  ┌──────────────┐  ┌─────────────────────────────┐   │
│  │     UI       │  │        API Routes            │   │
│  │              │  │                               │   │
│  │ - Submit URL │  │  POST   /api/content          │   │
│  │ - Browse     │  │  GET    /api/content          │   │
│  │ - Filter     │  │  GET    /api/content/[id]     │   │
│  │ - Approve    │  │  PATCH  /api/content/[id]     │   │
│  │ - Reject     │  │  DELETE /api/content/[id]     │   │
│  │ - Delete     │  │  POST   /api/content/[id]/    │   │
│  │ - Reanalyze  │  │         reanalyze             │   │
│  └──────┬───────┘  └──────┬──────────────────────┘   │
│         │                 │                            │
│         └─────────────────┤                            │
│                           ▼                            │
│               ┌───────────────────┐                    │
│               │  Content Pipeline │                    │
│               │                   │                    │
│               │  1. Fetch URL     │  ← SSRF protection │
│               │  2. Extract text  │  ← Readability     │
│               │  3. LLM classify  │  ← Claude API      │
│               │  4. Store result  │  ← Supabase        │
│               └─────────┬─────────┘                    │
│                         │                              │
└─────────────────────────┼──────────────────────────────┘
                          │
               ┌──────────┴──────────┐
               │     Supabase        │
               │  ┌───────────────┐  │
               │  │   content     │  │
               │  │   table       │  │
               │  └───────────────┘  │
               └─────────────────────┘
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works)
- An [Anthropic API key](https://console.anthropic.com)

### 1. Install

```bash
git clone <repo-url>
cd content-ingestion
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env.local
```

Fill in the three required keys:

| Variable | Where to find it |
|----------|-----------------|
| `ANTHROPIC_API_KEY` | [Anthropic Console](https://console.anthropic.com) > API Keys |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard > Settings > API > Project URL |
| `SUPABASE_SECRET_KEY` | Supabase Dashboard > Settings > API Keys (either `sb_secret_` format or legacy service_role JWT) |

### 3. Run Database Migrations

Open your Supabase dashboard > **SQL Editor** and run the migrations in order:

1. `supabase/migrations/001_create_content_table.sql` — creates the `content` table with GIN indexes and RLS policies
2. `supabase/migrations/002_add_review_columns_and_status.sql` — adds granular pipeline statuses and review columns

After running the migrations, go to **Settings > API > Reload schema cache** if the table doesn't appear immediately.

### 4. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the UI.

---

## Deployment (Vercel)

The project deploys to Vercel with zero configuration — Next.js 16 is auto-detected.

### Steps

1. Push the repository to GitHub
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo
3. Add the three environment variables in the Vercel dashboard:
   - `ANTHROPIC_API_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SECRET_KEY`
4. Deploy

Vercel will run `npm run build` automatically. No `vercel.json` is needed.

### Notes

- The in-memory rate limiter works per-instance. For multi-instance deployments at scale, swap to Redis/Upstash (the interface is designed for easy replacement).
- Structured logs are JSON-to-stdout — Vercel captures these natively in the Functions tab.
- Ensure the Supabase migrations have been run before the first request.

---

## Local Development

### Scripts

```bash
npm run dev            # Start dev server (http://localhost:3000)
npm run build          # Production build
npm run lint           # Run ESLint
npm test               # Run test suite (57 tests)
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Run tests with v8 coverage report
```

### UI Features

- **URL submission** with real-time progress polling (Extracting... → Classifying... → Done!)
- **Category and status filters** to browse ingested content
- **Status badges**: pending, extracting, classifying, completed, failed
- **Category badges** and confidence scores on each record
- **Needs review flag** when LLM confidence is below 70%
- **Approve/Reject workflow** for flagged records with optional rejection notes
- **Reanalyze button** to re-run extraction and classification
- **Delete button** (trash icon) for removing records

### Testing Without Supabase

The UI loads without Supabase configured (shows an empty state). The API endpoints require Supabase. The test suite uses mocked dependencies and runs without any external services.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/content` | Submit a URL for ingestion (rate limited: 10/min per IP) |
| `GET` | `/api/content` | List content with filters (`?category=`, `?status=`, `?needs_review=`, `?limit=`, `?offset=`) |
| `GET` | `/api/content/[id]` | Get a single content record by UUID |
| `PATCH` | `/api/content/[id]` | Approve or reject a record (`{ review_status, review_notes? }`) |
| `DELETE` | `/api/content/[id]` | Delete a content record |
| `POST` | `/api/content/[id]/reanalyze` | Re-run extraction and classification |

### Examples

**Submit a URL:**
```bash
curl -X POST http://localhost:3000/api/content \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/health-article"}'
# Returns 202 (new) or 200 (already exists)
```

**List content with filters:**
```bash
curl "http://localhost:3000/api/content?category=nutrition&status=completed&limit=10"
```

**Get a single record:**
```bash
curl http://localhost:3000/api/content/550e8400-e29b-41d4-a716-446655440000
```

**Approve a record:**
```bash
curl -X PATCH http://localhost:3000/api/content/550e8400-e29b-41d4-a716-446655440000 \
  -H "Content-Type: application/json" \
  -d '{"review_status": "approved"}'
```

**Reject with notes:**
```bash
curl -X PATCH http://localhost:3000/api/content/550e8400-e29b-41d4-a716-446655440000 \
  -H "Content-Type: application/json" \
  -d '{"review_status": "rejected", "review_notes": "Misclassified — this is a sports article"}'
```

**Delete a record:**
```bash
curl -X DELETE http://localhost:3000/api/content/550e8400-e29b-41d4-a716-446655440000
```

**Reanalyze:**
```bash
curl -X POST http://localhost:3000/api/content/550e8400-e29b-41d4-a716-446655440000/reanalyze
```

---

## Security

- **SSRF protection** — blocks requests to private/internal networks (localhost, 127.x, 10.x, 172.16-31.x, 192.168.x, 169.254.x, IPv6 loopback, non-http schemes)
- **Prompt injection defense** — user content wrapped in XML delimiters, Zod validates LLM output structure
- **Rate limiting** — 10 URL submissions per minute per IP (in-memory sliding window)
- **Error sanitization** — internal errors logged server-side, generic messages returned to clients
- **Bot protection detection** — identifies Cloudflare/DDoS-Guard challenge pages
- **Auth-wall detection** — identifies login/signup gated pages and fails early
- **Input validation** — Zod schemas at all API boundaries, UUID format validation

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                          # UI — submit, browse, filter, review
│   ├── layout.tsx                        # Root layout (Inter font, metadata)
│   ├── globals.css                       # Brand-neutral design system
│   └── api/
│       └── content/
│           ├── route.ts                  # POST (submit) + GET (list)
│           └── [id]/
│               ├── route.ts             # GET + PATCH (review) + DELETE
│               └── reanalyze/
│                   └── route.ts         # POST (re-run pipeline)
├── lib/
│   ├── extractor.ts                     # URL fetch, Readability, JSON-LD, SSRF check
│   ├── classifier.ts                    # Claude LLM classification with Zod validation
│   ├── pipeline.ts                      # Orchestration: extract → classify → store
│   ├── supabase.ts                      # Supabase client (server-side)
│   ├── logger.ts                        # Structured JSON logger (zero dependencies)
│   ├── rate-limit.ts                    # In-memory sliding window rate limiter
│   └── __tests__/
│       ├── extractor.test.ts            # 24 tests (extraction, SSRF, text/plain)
│       ├── classifier.test.ts           # 11 tests (classification, validation, retry)
│       ├── pipeline.test.ts             # 11 tests (stages, reanalyze, errors)
│       ├── logger.test.ts              # 6 tests (JSON output, levels, meta)
│       └── rate-limit.test.ts          # 5 tests (limits, expiry, independent keys)
├── types/
│   └── index.ts                         # Zod schemas, TypeScript types, 15 categories
supabase/
└── migrations/
    ├── 001_create_content_table.sql     # Content table, GIN indexes, RLS policies
    └── 002_add_review_columns_and_status.sql  # Pipeline statuses, review columns
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude classification |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SECRET_KEY` | Yes | Supabase secret key (server-side only) |

## License

MIT
