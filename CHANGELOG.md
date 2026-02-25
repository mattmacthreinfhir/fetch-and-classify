# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-02-24

### Added
- Project scaffolding with Next.js 16 (App Router), TypeScript, and Tailwind CSS
- Core dependencies: `@mozilla/readability`, `jsdom`, `@anthropic-ai/sdk`, `@supabase/supabase-js`, `zod`
- Environment variable template (`.env.example`)
- Project README with architecture overview and setup instructions
- Zod schemas for content classification, API request/response validation (`src/types/index.ts`)
- Supabase client setup with service role key (`src/lib/supabase.ts`)
- Database migration SQL with content table, GIN indexes, and RLS policies (`supabase/migrations/001_create_content_table.sql`)
- Content extraction with Readability, JSON-LD parsing, meta tag fallbacks, URL normalization, and streaming size limits (`src/lib/extractor.ts`)
- LLM classifier using Claude with structured JSON output, Zod validation, and exponential backoff retry (`src/lib/classifier.ts`)
- Pipeline orchestration: extract → classify → store with status tracking, error isolation, and timing (`src/lib/pipeline.ts`)
- API routes: `POST /api/content` (submit URL), `GET /api/content` (list with filters/pagination), `GET /api/content/[id]` (single record)
- Vitest test suite with 33 tests covering extractor, classifier, pipeline, and URL normalization (`src/lib/__tests__/`)
