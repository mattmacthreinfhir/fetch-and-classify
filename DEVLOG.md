# Development Log

A transparent record of decisions, questions, and thinking throughout the build process. This shows how the project evolved from plan to implementation.

---

## Session 1 — 2026-02-24/25

### Project Kickoff

Started with a detailed implementation plan (`project-plan.md`) outlining a content ingestion and classification service built on Tellory's production stack: Next.js, Supabase, Anthropic Claude, deployed on Vercel.

The plan was structured around a 4-hour execution blueprint with specific commit milestones to demonstrate clean, incremental delivery.

### Commit 1: Scaffolding

**Decision:** Used `create-next-app@latest` which pulled Next.js 16.1.6 (the plan referenced Next.js 14, but using the latest version is the right call for a new project).

**Question raised:** "Next 14 seems a bit behind" — Updated all references to reflect the actual installed version (Next.js 16).

**Decision:** Introduced a README and CHANGELOG from the very first commit. The thinking was that the project should be presentable at every commit point, not just at the end. Each commit should tell a story of incremental, professional delivery.

### Commit 2: Types, Supabase Client & Migration

**Question raised:** "Is the role key deprecated on Supabase, we need to be using their latest recommendations"

This was a good catch. Research showed that Supabase now recommends **publishable** (`sb_publishable_`) and **secret** (`sb_secret_`) keys over the legacy JWT-based `anon` and `service_role` keys. The new keys offer better rotation, and secret keys auto-reject browser usage.

**Decision:** Updated the Supabase client to use `SUPABASE_SECRET_KEY` instead of `SUPABASE_SERVICE_ROLE_KEY`. Both key formats work with `createClient()` — the API is identical. This shows awareness of the evolving Supabase ecosystem rather than blindly following older tutorials.

**Verification:** Ran `npm run lint` and `npm run build` to confirm TypeScript strict mode and ESLint pass clean. Also started the dev server to verify HTTP 200 response.

### Commit 3: Content Extraction

Built the extractor with `@mozilla/readability` + `jsdom`. Tested against real URLs:
- WebMD (200 OK, extracted successfully)
- BBC (404 — invalid URL, but showed error handling works)
- NYT (403 — paywall/bot protection)

**Question raised:** "Are we handling cases where the URL is blocking us, i.e. Cloudflare protection"

**Decision:** Added bot protection detection in two places:
1. On 403 responses — read the body to distinguish Cloudflare/DDoS-Guard/Akamai from genuine 403s
2. On 200 responses — some sites return 200 with a challenge page instead of a proper 403

The philosophy: we can't bypass these protections (nor should we), but we should detect them and give clear, actionable error messages so the pipeline can mark records as `failed` with a useful `error_message`.

### Commit 4: LLM Classification + Tests

**Question raised:** "Can we run some tests on the classification logic before we proceed"

Ran the classifier against 3 real health articles using the Anthropic API:

| Article | Categories | Confidence |
|---------|-----------|------------|
| WebMD — What Is Cortisol? | hormones, medical-treatments, mental-wellness | 0.95 |
| Healthline — How to Start Exercising | fitness, lifestyle, preventive-care | 0.95 |
| Mayo Clinic — Chronic Stress | mental-wellness, preventive-care, lifestyle | 0.95 |

All classifications were accurate and Zod validation passed on every response.

**Question raised:** "No, we need to add proper tests for this, not just a throwaway script"

**Decision:** Set up Vitest with proper unit tests. This was the right call — throwaway scripts don't provide regression protection. Added 20 tests covering:
- Extractor: Readability parsing, meta fallbacks, content type rejection, Cloudflare detection, HTTP errors, oversized pages
- Classifier: successful classification, markdown fence stripping, Zod validation (invalid categories, empty arrays, out-of-range confidence), retry behavior, auth error short-circuit, message construction, body truncation

**Question raised:** "Should this not be in TS" (re: test scripts)

Correct — for a project enforcing TypeScript strict mode, test scripts should be `.ts` too. Deleted the throwaway `.js` script in favor of proper Vitest `.test.ts` files.

### Commit 5: Pipeline + Extractor Hardening

**Question raised:** "Can we ensure we have full robustness when extracting data, how can we make it more efficient/performant/accurate"

This led to a significant enhancement of the extractor:

**Accuracy improvements:**
- Added JSON-LD parsing for `Article`, `NewsArticle`, and `BlogPosting` schemas — extracts headline, author (including multi-author arrays), and datePublished
- Expanded metadata extraction chain: title checks `og:title → twitter:title → JSON-LD → document.title`; author checks `author → article:author → dc.creator → JSON-LD`; date checks `article:published_time → datePublished → date → dc.date → JSON-LD`

**Performance improvements:**
- Streaming body size enforcement — reads as a stream and aborts immediately when size limit is hit, instead of buffering the entire response first
- Content-Length header check before reading body

**Robustness improvements:**
- URL normalization for deduplication — strips fragments, UTM/tracking params, lowercases hostname, removes trailing slashes
- UTF-8 decoding with `TextDecoder` (handles encoding gracefully)
- Better network error messages for DNS/connection failures

Pipeline was updated to normalize URLs before the duplicate check.

Test suite grew to 33 tests (added JSON-LD extraction and 6 URL normalization tests).

### Commit 6: API Routes

Built three endpoints following the plan's API design:
- `POST /api/content` — Zod-validated URL submission, triggers pipeline, returns 202 (new) or 200 (already exists)
- `GET /api/content` — List with filters (`category`, `status`, `needs_review`) and pagination (`limit`, `offset`), uses GIN-indexed category filtering
- `GET /api/content/[id]` — Single record by UUID with format validation

All endpoints use Zod for input validation at the boundary and return structured error responses.

### Detour: Swagger / API Documentation

**Question raised:** "We need to expose API documentation for our users, Swagger preferably"

Investigated multiple approaches for adding Swagger/OpenAPI docs:
- `@asteasolutions/zod-to-openapi` v8 — would generate OpenAPI 3.1 from existing Zod schemas via `.meta()` annotations
- `swagger-ui-react` — React wrapper for Swagger UI, served at `/api-docs`
- `next-swagger-doc` — rejected (Pages Router only, doesn't support App Router)
- `swagger-jsdoc` — rejected (JSDoc annotations drift from actual schemas)

The recommended plan involved: annotating existing Zod schemas with `.meta()`, creating an `OpenAPIRegistry` with path definitions, serving the spec at `GET /api/openapi`, and rendering Swagger UI at `/api-docs`.

**Decision:** "We are going down a rabbit hole here with Swagger, lets reset."

The developer correctly identified this as over-engineering. For 3 well-defined endpoints, a full Swagger pipeline (new dependencies, registry file, OpenAPI route, client component with dynamic import) was disproportionate to the value it delivered. The API is already documented in the README with request/response examples.

**Takeaway:** Know when to stop. Not every good idea is worth the complexity it introduces. The goal is a clean, functional deliverable — not a feature checklist.

### Commit 7: UI + README Update

Built the frontend UI (`page.tsx`) with:
- URL submission form with validation and loading state
- Category filter dropdown (all 15 Tellory categories) and status filter dropdown
- Content list with status badges, category badges, confidence scores, and "needs review" flags
- Dark mode support via Tailwind
- Updated `layout.tsx` metadata to "Tellory Content Ingestion"

**Question raised:** "Can we update the readme file to include setting up the local dev instance for the UI"

**Decision:** Expanded the README significantly — added where to find each env key, step-by-step database migration instructions, a Local Development section listing all npm scripts, UI feature descriptions, a "Testing Without Supabase" note, and `curl` examples for all 3 API endpoints. Also caught and fixed a stale env var reference (`SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SECRET_KEY`).

### Live Testing & Bug Fixes

Testing the app against real URLs revealed several issues that unit tests alone couldn't catch:

**Bug 1 — Body size limit too restrictive:**
"Page too large (>500KB). Download aborted."

Some real article pages exceed 500KB. Bumped `MAX_BODY_BYTES` from 512KB to 1MB. Also added proper `text/plain` content type handling — plain text was accepted by the content type check but then fed into the HTML parser, which makes no sense.

**Bug 2 — Misclassification of off-topic content:**
A Newcastle vs Qarabag Champions League match report was classified as "lifestyle" with 95% confidence.

This was a prompt engineering problem. The original prompt said "you must classify it into 1-3 categories" — giving the LLM no option to say "this doesn't belong". Rewrote the system prompt with:
- Explicit confidence scoring guidelines (0.9+ for clearly relevant, 0.3-0.69 for tangential, 0.0-0.29 for no connection)
- Direct instruction not to force-fit: "A football match report is NOT fitness or lifestyle"
- Guidance that only genuinely health/wellness content should get high confidence

Off-topic articles now get low confidence and trigger the `needs_review` flag (< 0.7 threshold).

**Feature — Reanalyze existing records:**
"Can we add the ability to refresh the URL analysis"

Added `reanalyzeRecord()` to pipeline.ts, `POST /api/content/[id]/reanalyze` route, and a "Reanalyze" button on each content card. This allows re-running extraction and classification after prompt changes without re-submitting the URL.

**Bug 3 — Date format incompatibility with Postgres:**
"Failed to update record: invalid input syntax for type timestamp with time zone: 'Tue, 24/02/2026 - 16:45'"

The `publish_date` column is `TIMESTAMPTZ` but the extractor was storing raw date strings from web pages (meta tags, JSON-LD, Readability). Added `normalizeDate()` that parses via `new Date()` and returns ISO 8601 or `null` for unparseable formats.

First fix only covered the meta tag fallback path in `extractDate()`. The Readability path (`article.publishedTime`) was a separate code branch that bypassed normalization entirely. Fixed both.

**Takeaway:** Live testing against real URLs is irreplaceable. Unit tests with mocked HTML catch logic errors, but real-world pages produce date formats, page sizes, and content types you'd never think to mock.

---

## Running Themes

**"Show your work" philosophy:** Every commit should be buildable, lintable, and testable. No commit should break the build.

**Stack awareness:** Using Supabase's latest key recommendations, Next.js latest version, and Zod 4 — not just following the plan blindly but adapting to what's current.

**Test-driven confidence:** Proper unit tests with mocked external dependencies, not throwaway scripts. Tests run fast (mocked) and cover both happy and error paths.

**Production mindset:** Bot protection detection, URL normalization, streaming size limits, confidence scoring with `needs_review` flags, `processing_time_ms` for observability — patterns from real-world systems.

**Pragmatism over perfection:** Rejected a full Swagger setup as over-engineering for 3 endpoints. The right amount of tooling is the minimum that delivers value.

**Prompt engineering as a first-class concern:** Off-topic content classified with high confidence showed that LLM prompts need explicit guidance on when NOT to classify, not just how to classify. Confidence scoring guidelines and negative examples ("a football match report is NOT fitness") made a material difference.

**Live testing reveals what mocks can't:** Date format incompatibilities, body size limits, missing code paths — all caught by testing with real URLs, not by unit tests. Both are necessary.
