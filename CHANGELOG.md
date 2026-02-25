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
