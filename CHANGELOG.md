# Changelog

All notable changes to this project will be documented in this file.

## [0.4.0] - 2026-02-25

### Added
- **Professional UI redesign** — complete rewrite of `page.tsx`, `globals.css`, `layout.tsx` with Inter font (weights 200–700), warm off-white (#fafaf8) background, pill-shaped inputs/buttons, rounded-2xl card layout, editorial typography, dark charcoal footer, and inline SVG icons
- **Delete endpoint** — `DELETE /api/content/[id]` with UUID validation and structured logging
- **Delete button** — trash icon on each content card for quick record removal
- **Auth-wall detection** — extractor now detects login/signup gated pages (e.g. "sign in to continue", "subscribe to read") and fails early with a clear error instead of classifying login page HTML as article content
- **Global cursor pointer** — all buttons and selects now show pointer cursor via CSS rule

### Changed
- **Branding removed** — all Tellory references removed from UI, classifier prompt, User-Agent string, package name, types comments, and CSS comments; project is now brand-neutral
- **README overhauled** — comprehensive rewrite with Vercel deployment section, security documentation, all 6 API endpoints with curl examples (PATCH, DELETE added), updated project structure (all 57 tests, logger, rate-limit, migration 002), numbered setup steps with env var sourcing table
- **"Submit Content" heading** upgraded from faint label-caps (11px, gray) to a visible `h2` with `font-medium` and charcoal color
- Classifier system prompt updated to generic "health and wellness platform" reference
- Extractor User-Agent changed from `TelloryBot/1.0` to `ContentBot/1.0`
- Package name changed from `tellory-content-ingestion` to `content-ingestion`
- `.gitignore` updated to exclude Playwright logs and screenshots

## [0.3.0] - 2026-02-25

### Added
- **Structured logging** — JSON-to-stdout logger (`src/lib/logger.ts`) wired into pipeline stages, classifier retries, and all API routes for platform-native log capture (Vercel, Docker)
- **SSRF protection** — blocks requests to private/internal networks (localhost, 127.x, 10.x, 172.16-31.x, 192.168.x, 169.254.x, IPv6 loopback/link-local, non-http(s) schemes) before any fetch (`src/lib/extractor.ts`)
- **Prompt injection defense** — LLM user messages now wrap content in XML delimiters (`<article><title>...</title><author>...</author><body>...</body></article>`) to separate user-supplied content from instructions (`src/lib/classifier.ts`)
- **Rate limiting** — in-memory sliding window rate limiter (10 URLs/min per IP) with `Retry-After` header on 429 responses (`src/lib/rate-limit.ts`)
- **Granular pipeline stages** — status progression: `pending` → `extracting` → `classifying` → `completed`/`failed`, visible in real-time via polling
- **Async pipeline with polling** — POST `/api/content` returns 202 immediately; UI polls `GET /api/content/[id]` every 2s with spinner and stage labels ("Extracting content...", "Classifying with AI...", "Done!")
- **Manual review workflow** — `PATCH /api/content/[id]` endpoint for approving/rejecting low-confidence classifications with optional notes; UI shows Approve/Reject buttons on `needs_review` records, inline textarea for rejection notes, and review status badges
- **Database migration** for new pipeline statuses and review columns (`supabase/migrations/002_add_review_columns_and_status.sql`)
- **Test coverage config** — v8 coverage provider in vitest.config.ts, `npm run test:coverage` script
- **19 new tests** — logger (6), rate limiter (5), SSRF protection (6), text/plain handling (2); total: 57 tests

### Changed
- Pipeline refactored: extracted `runPipeline(id, url)` as shared function used by both `processUrl` and `reanalyzeRecord`
- POST `/api/content` now uses `after()` from `next/server` for background pipeline execution instead of blocking
- API error responses sanitized — real errors logged server-side, generic "An internal error occurred" returned to clients
- `ContentStatus` type expanded from 3 states to 5 (`extracting`, `classifying` added)
- `ContentRecord` type extended with `review_status`, `review_notes`, `reviewed_at` fields
- Status filter dropdown updated with new `extracting` and `classifying` options
- STATUS_COLORS updated: extracting (blue), classifying (purple)

## [0.2.0] - 2026-02-25

### Added
- UI page with URL submission form, category/status filter dropdowns, content list with status badges, category badges, confidence scores, and dark mode support (`src/app/page.tsx`)
- Reanalyze endpoint: `POST /api/content/[id]/reanalyze` — re-runs extraction and classification on existing records
- Reanalyze button on each content card in the UI
- `reanalyzeRecord()` in pipeline for re-processing existing records
- Project structure section in README
- DEVLOG.md with transparent development decision log
- CONVERSATION.md with raw build session dialogue

### Changed
- Bumped body size limit from 512KB to 1MB for real-world article pages
- Rewrote classifier prompt with explicit confidence scoring guidelines — off-topic content (e.g. sports, tech) now gets low confidence instead of being force-fitted into categories
- Added `text/plain` content type support — plain text pages are now returned directly without HTML parsing
- Added `normalizeDate()` to convert raw date strings to ISO 8601 for Postgres TIMESTAMPTZ compatibility
- Expanded README with local development instructions, curl examples, env key locations, reanalyze endpoint docs, and "Testing Without Supabase" section
- Updated Supabase client to use `SUPABASE_SECRET_KEY` (latest recommendation) instead of legacy `SUPABASE_SERVICE_ROLE_KEY`

### Fixed
- Date format incompatibility with Postgres — raw date strings like "Tue, 24/02/2026 - 16:45" are now normalized to ISO 8601
- Readability `publishedTime` path bypassed date normalization — both extraction paths now use `normalizeDate()`

## [0.1.0] - 2026-02-24

### Added
- Project scaffolding with Next.js 16 (App Router), TypeScript, and Tailwind CSS
- Core dependencies: `@mozilla/readability`, `jsdom`, `@anthropic-ai/sdk`, `@supabase/supabase-js`, `zod`
- Environment variable template (`.env.example`)
- Project README with architecture overview and setup instructions
- Zod schemas for content classification, API request/response validation (`src/types/index.ts`)
- Supabase client setup with secret key (`src/lib/supabase.ts`)
- Database migration SQL with content table, GIN indexes, and RLS policies (`supabase/migrations/001_create_content_table.sql`)
- Content extraction with Readability, JSON-LD parsing, meta tag fallbacks, URL normalization, and streaming size limits (`src/lib/extractor.ts`)
- LLM classifier using Claude with structured JSON output, Zod validation, and exponential backoff retry (`src/lib/classifier.ts`)
- Pipeline orchestration: extract → classify → store with status tracking, error isolation, and timing (`src/lib/pipeline.ts`)
- API routes: `POST /api/content` (submit URL), `GET /api/content` (list with filters/pagination), `GET /api/content/[id]` (single record)
- Vitest test suite with 33 tests covering extractor, classifier, pipeline, and URL normalization (`src/lib/__tests__/`)
