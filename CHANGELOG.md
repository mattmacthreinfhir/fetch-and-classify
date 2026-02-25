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
- Content extraction module using Mozilla Readability with meta tag fallbacks (`src/lib/extractor.ts`)
- LLM classifier using Claude with structured JSON output, Zod validation, and exponential backoff retry (`src/lib/classifier.ts`)
- Vitest test suite with 20 tests covering extractor and classifier (`src/lib/__tests__/`)
