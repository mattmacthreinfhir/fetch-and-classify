# Development Log

A transparent record of decisions, questions, and thinking throughout the build process. This shows how the project evolved from plan to implementation.

---

## Session 1 — 2026-02-24/25

### Project Kickoff

Started with a detailed implementation plan (`project-plan.md`) outlining a content ingestion and classification service built on a modern stack: Next.js, Supabase, Anthropic Claude, deployed on Vercel.

The plan was structured around a 4-hour execution blueprint with specific milestones to demonstrate clean, incremental delivery.

### Stage 1: Project Scaffolding

**Decision:** Used `create-next-app@latest` which pulled Next.js 16.1.6 (the plan referenced Next.js 14, but using the latest version is the right call for a new project).

**Question raised:** "Next 14 seems a bit behind" — Updated all references to reflect the actual installed version (Next.js 16).

**Decision:** Introduced a README and CHANGELOG from the very first commit. The thinking was that the project should be presentable at every commit point, not just at the end. Each commit should tell a story of incremental, professional delivery.

### Stage 2: Types, Supabase Client & Migration

**Question raised:** "Is the role key deprecated on Supabase, we need to be using their latest recommendations"

This was a good catch. Research showed that Supabase now recommends **publishable** (`sb_publishable_`) and **secret** (`sb_secret_`) keys over the legacy JWT-based `anon` and `service_role` keys. The new keys offer better rotation, and secret keys auto-reject browser usage.

**Decision:** Updated the Supabase client to use `SUPABASE_SECRET_KEY` instead of `SUPABASE_SERVICE_ROLE_KEY`. Both key formats work with `createClient()` — the API is identical. This shows awareness of the evolving Supabase ecosystem rather than blindly following older tutorials.

**Verification:** Ran `npm run lint` and `npm run build` to confirm TypeScript strict mode and ESLint pass clean. Also started the dev server to verify HTTP 200 response.

### Stage 3: Content Extraction

Built the extractor with `@mozilla/readability` + `jsdom`. Tested against real URLs:
- WebMD (200 OK, extracted successfully)
- BBC (404 — invalid URL, but showed error handling works)
- NYT (403 — paywall/bot protection)

**Question raised:** "Are we handling cases where the URL is blocking us, i.e. Cloudflare protection"

**Decision:** Added bot protection detection in two places:
1. On 403 responses — read the body to distinguish Cloudflare/DDoS-Guard/Akamai from genuine 403s
2. On 200 responses — some sites return 200 with a challenge page instead of a proper 403

The philosophy: we can't bypass these protections (nor should we), but we should detect them and give clear, actionable error messages so the pipeline can mark records as `failed` with a useful `error_message`.

### Stage 4: LLM Classification & Testing

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

### Stage 5: Pipeline Orchestration & Extractor Hardening

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

### Stage 6: API Routes

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

### Stage 7: Frontend UI & README Update

Built the frontend UI (`page.tsx`) with:
- URL submission form with validation and loading state
- Category filter dropdown (all 15 health categories) and status filter dropdown
- Content list with status badges, category badges, confidence scores, and "needs review" flags
- Dark mode support via Tailwind
- Updated `layout.tsx` metadata to "Health Content Ingestion"

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

---

## Session 2 — 2026-02-25

### Stage 8: Documentation & Polish

**Decision:** This stage focused on making the project presentable and complete rather than adding new features. The codebase was functionally complete after the UI and live testing bug fixes — this was about documentation, structure, and ensuring everything is discoverable.

**Changes made:**
- **README:** Added the reanalyze endpoint (`POST /api/content/[id]/reanalyze`) to the API endpoints table and curl examples section. Added a "Project Structure" tree showing the full `src/` layout so newcomers can orient themselves quickly. Added "Reanalyze" to the UI feature list. Updated architecture diagram to show all four endpoints.
- **CHANGELOG:** Added a `[0.2.0]` section covering all the UI, reanalyze, prompt tuning, date normalization, and body size changes. Fixed a stale "service role key" reference in the `[0.1.0]` section.
- **.env.example:** Verified complete — already has all three required keys (`ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`) with clear comments.

**Verification:** Lint clean, build passes, 33 tests passing.

**Takeaway:** A project is only as good as its documentation. The code could be flawless, but if a new developer can't set it up or understand the structure, the quality is invisible. Final polish stages like this are not busywork — they're the difference between "code that works" and "a project someone else can pick up and run with."

---

## Session 3 — 2026-02-25

### Production Hardening Phase

**Prompt:** "As part of this final polish phase we need to consider: Security concerns (input validation, injection), Rate limiting (10 URLs per minute max), Progress bar for retrieving the stream data via URL (user feedback), Test coverage, Appropriate logging and reporting, Ability for us to improve the prompt/standard of classification based on manual intervention."

This was a significant scope expansion — six cross-cutting concerns that touch nearly every file. The approach was to plan everything up front, get approval on key design decisions, then implement incrementally with verification at each step.

**Two key decisions were made before implementation:**

1. **Progress feedback approach** — The developer chose polling over streaming (SSE/WebSockets). POST returns 202 immediately, UI polls `GET /api/content/[id]` every 2s. This is simpler, requires no infrastructure changes, and works behind proxies/CDNs. The tradeoff (2s latency between updates) is acceptable for a pipeline that takes 5-15 seconds.

2. **Manual intervention scope** — Simple approve/reject workflow instead of full inline editing of categories/summaries. This keeps the scope manageable while still enabling the core feedback loop: flag low-confidence → human reviews → informs prompt iteration.

### Step 1: Structured Logging

**Decision:** Zero-dependency JSON logger (`src/lib/logger.ts`) with three methods: `info`, `warn`, `error`. Outputs `{ timestamp, level, message, ...meta }` as JSON to stdout.

**Rationale:** Vercel, Docker, and most platforms capture stdout natively. A structured JSON format lets log aggregators (Datadog, Loki, CloudWatch) parse fields without regex. No dependencies means no version conflicts or bundle bloat for a simple concern.

**Wired into:** Pipeline stages (extracting, classifying, completed, failed with timing), classifier retries (attempt number, delay, error), API routes (POST requests, reanalyze, errors).

### Step 2: Security Hardening

Three concerns addressed:

**SSRF Protection** — Added `isPrivateUrl()` check before `fetchWithTimeout()` in the extractor. Blocks: localhost, 0.0.0.0, private IP ranges (127.x, 10.x, 172.16-31.x, 192.168.x), cloud metadata endpoint (169.254.x), IPv6 loopback/link-local, and non-http(s) schemes (file://, ftp://, etc.). This prevents a submitted URL from hitting internal services or the cloud metadata API.

**Prompt Injection Defense** — Changed classifier user message from flat text (`Title: ... Body: ...`) to XML delimiters (`<article><title>...</title><body>...</body></article>`). System prompt updated to reference the tags. This provides a structural boundary between user-supplied content and LLM instructions. Combined with Zod output validation, the attack surface is minimal.

**Error Sanitization** — API catch blocks now log the real error via `logger.error` but return generic "An internal error occurred" to the client. Prevents leaking stack traces, file paths, or internal service names.

### Step 3: Rate Limiting

**Decision:** In-memory sliding window rate limiter — no Redis, no external dependencies. `checkRateLimit(key, { windowMs, maxRequests })` tracks timestamps per key, returns `{ allowed, retryAfterMs }`.

**Implementation detail:** Keyed by `x-forwarded-for` IP header (standard for Vercel/reverse proxy deployments). Periodic cleanup runs every 5 minutes via `setInterval().unref()` to prevent memory leaks without keeping the process alive.

**Tradeoff acknowledged:** In-memory means per-instance — won't work across multiple serverless instances. For a single-instance deployment or demo, this is fine. A production system at scale would swap to Redis or Upstash. The interface is designed for easy replacement.

### Step 4: Progress Feedback

This was the largest change, touching the pipeline architecture:

**Pipeline refactor** — Extracted `runPipeline(id, url)` from `processUrl()`. Both `processUrl` and `reanalyzeRecord` now call the shared `runPipeline` which updates status through granular stages: `extracting` → `classifying` → `completed`/`failed`. This eliminated code duplication and gave each stage a visible DB state.

**Async POST with `after()`** — The POST route now creates the pending record, returns 202 with the record ID, then uses `after()` from `next/server` to run the pipeline in the background after the response is sent. The client doesn't block on extraction + classification.

**UI polling** — After receiving 202, the UI polls `GET /api/content/{id}` every 2s (max 30 polls = 60s). Shows a spinner with stage labels: "Extracting content from URL..." → "Classifying with AI..." → "Done!". STATUS_COLORS updated for the two new intermediate states (blue for extracting, purple for classifying).

**Database migration** — `002_add_review_columns_and_status.sql` expands the status check constraint and adds review columns (used by Step 5).

**Pipeline tests rewritten** — The mock strategy changed from call-counting to data inspection. `makeUpdateMock` inspects `data.status` to determine the chain behavior (completed gets `select/single`, failed resolves directly, stage updates just resolve). This made tests resilient to changes in the number of DB calls.

**Verification:** 38 tests passing after this step.

### Step 5: Manual Intervention

**Types** — Added `ReviewStatus`, `ReviewSchema`, `ReviewRequest`, and three new fields on `ContentRecord` (`review_status`, `review_notes`, `reviewed_at`).

**PATCH endpoint** — `PATCH /api/content/[id]` validates UUID format + `ReviewSchema` (Zod), updates `review_status`, `review_notes`, `reviewed_at`, and toggles `needs_review` (cleared on approve, kept `true` on reject so it remains flagged for re-review after reanalysis). Logs the review action.

**UI** — Records with `needs_review` (and no existing review) show Approve and Reject buttons. Approve sends an immediate PATCH. Reject opens an inline textarea for optional notes, then a Confirm button sends the PATCH. Already-reviewed records show a colored badge (green for approved, red for rejected). Review notes are displayed below the record when present.

### Step 6: Test Coverage

**New test files:**
- `logger.test.ts` (6 tests) — JSON output validity, all three log levels, meta field inclusion, works without meta
- `rate-limit.test.ts` (5 tests) — within limit, exceeds limit, retry-after value, independent keys, window expiry with fake timers
- Added to `extractor.test.ts`: SSRF protection (6 tests: localhost, 127.x, 10.x, 192.168.x, 169.254.x, file://), text/plain handling (2 tests: extract + empty rejection)

**Coverage config** — Added v8 provider to vitest.config.ts covering `src/lib/**/*.ts` (excluding test files and supabase.ts). Added `npm run test:coverage` script.

**Final verification:** lint clean, TypeScript clean, build passes, **57/57 tests passing** (up from 33).

**Takeaway:** The progression from 33 → 38 → 57 tests mirrors the implementation phases. Each step was verified independently before moving on — no "write everything then test at the end" approach. The SSRF tests in particular are cheap insurance against a critical vulnerability class.

### Professional UI Redesign

**Prompt:** "Make the UI much more professional and usable — its actually horrific — check tellory.com for the light touch/font style we need"

The original UI was functional but generic. Used Playwright to fetch tellory.com, take screenshots, and extract computed CSS values to establish a concrete design system:

**Extracted brand tokens:**
- Font: Inter (weights 200, 300, 400, 700)
- Background: warm off-white (#fafaf8)
- Text: charcoal (#282828), body weight 200 (ultra-light)
- CTA buttons: charcoal bg, cream text (#ebe6de), border-radius 100px (pill)
- Section labels: 12px, weight 300, letter-spacing 3.6px, uppercase
- Headings: 40px, weight 200 with bold `<strong>` tags for emphasis

**Complete rewrite of three files:**
- `globals.css` — CSS custom properties for the design system, `.btn-pill` / `.btn-pill-dark` / `.btn-pill-outline` / `.label-caps` utility classes, spin animation keyframe
- `layout.tsx` — switched from default Geist font to Inter with weights 200–700
- `page.tsx` — full page rewrite: nav bar with wordmark, hero section with editorial typography, pill-shaped URL input + dark submit button with arrow icon, card-based content list (rounded-2xl, warm borders), inline review actions, dark charcoal footer

**Decision:** Extract real CSS values from the target site rather than approximating. Using `browser_evaluate` to pull computed styles ensures pixel-accurate reproduction of the design language.

**Takeaway:** A professional-looking UI dramatically changes the perception of the project. The same backend code with a polished frontend feels production-ready vs. prototype-quality.

---

## Session 4 — 2026-02-25

### UI Polish & Brand Neutrality

The UI had been restyled to match a professional brand aesthetic (Inter font, warm off-white, pill-shaped buttons, editorial typography), but several issues emerged during review:

**Issue 1 — Branding references throughout the codebase:**
"Remove references to Tellory"

The project should be brand-neutral — it's a code challenge deliverable, not a branded product. Swept all Tellory references:
- UI: nav wordmark, description copy, footer text, page title metadata
- Backend: classifier system prompt ("for a health and wellness platform called Tellory"), extractor User-Agent string (`TelloryBot/1.0`), types file comment, package.json name
- CSS: comment labels

**Decision:** This is a presentation concern. A code challenge should demonstrate capability without tying itself to a specific brand. The client can apply their own branding on top.

**Issue 2 — "Submit Content" heading and submit button not visible:**
The "Submit Content" label was using `label-caps` — 11px, #999 gray, which was too subtle against the #fafaf8 background. Upgraded to an `h2` with `font-medium` in #282828 charcoal. The submit button itself was rendering correctly (dark pill with cream text) but the heading above it needed to anchor the section visually.

**Issue 3 — Missing cursor pointer on buttons:**
Buttons and selects didn't show pointer cursor. Added a global `button, select { cursor: pointer; }` rule. The `.btn-pill` class already had `cursor: pointer` but standalone icon buttons and native selects were missed.

**Takeaway:** UI polish is iterative. What looks right in a design system doesn't always land on the first pass — real-screen testing catches contrast issues, cursor affordances, and visual hierarchy problems that code review alone misses.

### Auth-Wall Detection

**Problem:** A Tellory app URL (`app.tellory.com/article/...`) was classified with 10% confidence and a summary saying "This appears to be a placeholder or navigation page." The confidence was correct — but the user experience was wrong.

**Root cause:** The URL was behind authentication. The extractor fetched the login/signup page HTML, Readability parsed minimal text from it, and the classifier correctly assessed it as low-quality content. But the error should have been caught earlier — we were wasting an LLM call classifying a login page.

**Decision:** Added `isAuthGatedPage()` detection in the extractor, alongside the existing `isProtectedPage()` for bot detection. It checks for signals ("sign in to continue", "subscribe to read", "members only", "paywall", etc.) combined with a text content length check (<500 chars). The length check is important — legitimate articles may mention "sign in" in their header nav, but they'll have substantial body content too.

**Design choice:** Two-factor detection (signal present + low content) avoids false positives on pages that happen to mention login in their navigation. A page with 3000+ characters of article text and a "sign in" link in the header should NOT be blocked.

**Takeaway:** This follows the same pattern as the Cloudflare detection from Stage 3 — detect and fail fast with a clear message rather than proceeding with garbage input. The pipeline already handles failures gracefully (marks as `failed` with `error_message`), so early detection just gives better user feedback.

### Delete Functionality

**Prompt:** "We need a delete button (icon only)"

Added `DELETE /api/content/[id]` endpoint with UUID validation, Supabase delete, structured logging, and sanitized error responses. UI gets a small trash icon (SVG, 14px) positioned before the Reanalyze button on each card — muted gray (#999) with a red hover state. Consistent with the existing icon-only interaction pattern.

**Design note:** The delete button is intentionally minimal — a small icon rather than a labeled button. Destructive actions shouldn't be the most prominent element on a card. The hover colour change (→ red) provides a visual warning before the click.

### README Overhaul & Deployment Prep

**Prompt:** "Can we make sure README.md is clear on development and deployment instructions"

The README was significantly outdated — still referenced "Womens Health", old test counts (33 vs 57), missing the PATCH and DELETE endpoints, stale project structure, and had no deployment instructions.

**Complete rewrite:**
- Updated title to "Content Ingestion & Classification Service"
- Added **Vercel deployment section** with step-by-step instructions (import repo, add 3 env vars, deploy)
- Added **Security section** documenting all 7 protections (SSRF, prompt injection, rate limiting, error sanitization, bot detection, auth-wall detection, input validation)
- Updated API endpoints table to show all 6 routes (added PATCH, DELETE) with curl examples for approve, reject with notes, and delete
- Updated project structure showing all 5 test files with accurate counts, logger.ts, rate-limit.ts, globals.css, migration 002
- Numbered setup steps with a table showing where to find each env var
- Added `test:coverage` to scripts section
- Notes on rate limiter behaviour in multi-instance deployments and structured log capture on Vercel

**Also updated:** `.gitignore` to exclude Playwright MCP logs and screenshot PNGs from the repo.

**Takeaway:** Documentation should be updated as a final step before deployment, not incrementally during development. During active development, docs drift quickly — one comprehensive pass at the end catches all the stale references, missing features, and incorrect counts.
