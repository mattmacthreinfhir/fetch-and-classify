import Anthropic from "@anthropic-ai/sdk";
import { ClassificationSchema, CATEGORIES } from "@/types";
import { logger } from "./logger";
import type { Classification, ExtractedContent } from "@/types";

const MODEL = "claude-sonnet-4-20250514";
const MAX_BODY_TOKENS = 3000; // rough char limit to control cost (~3k tokens ≈ 12k chars)
const MAX_BODY_CHARS = MAX_BODY_TOKENS * 4;

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000; // exponential backoff: 1s, 2s, 4s

const SYSTEM_PROMPT = `You are a content classification engine for a health and wellness platform.

Your job is to classify articles that are relevant to health, wellness, beauty, and lifestyle topics. The platform's content pillars are:
${CATEGORIES.join(", ")}

Given an article wrapped in <article> tags (with <title>, <author>, and <body> sub-tags):
1. Determine whether the article is relevant to health/wellness topics
2. If relevant, classify it into 1-3 categories from the list above
3. Write a 2-3 sentence summary
4. Rate your classification confidence from 0.0 to 1.0

IMPORTANT — Confidence scoring guidelines:
- 0.9-1.0: Article clearly and primarily about one or more of the listed categories
- 0.7-0.89: Article touches on health/wellness topics but isn't primarily about them
- 0.3-0.69: Article is only tangentially related (e.g. a sports match report, business news, politics) — pick the closest category but use LOW confidence
- 0.0-0.29: Article has no meaningful connection to health/wellness topics

Do NOT force-fit content into categories. A football match report is NOT "fitness" or "lifestyle". A tech product review is NOT "lifestyle". Only assign high confidence when the article genuinely discusses health, wellness, beauty, or related topics as its primary subject.

You MUST always return at least 1 category — even for off-topic content, pick the closest match and use a very low confidence score (0.1 or below). Never return an empty categories array.

Respond ONLY with valid JSON in this exact format:
{
  "categories": ["category1"],
  "summary": "A concise 2-3 sentence summary.",
  "confidence_score": 0.85
}`;

const anthropic = new Anthropic();

export async function classifyContent(
  content: ExtractedContent
): Promise<Classification & { model: string }> {
  const bodyText = truncateText(content.body_text, MAX_BODY_CHARS);

  const userMessage = [
    "<article>",
    content.title ? `<title>${content.title}</title>` : null,
    content.author ? `<author>${content.author}</author>` : null,
    `<body>${bodyText}</body>`,
    "</article>",
    "",
    "Classify the article above according to your instructions.",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await retryWithBackoff(() => callClaude(userMessage));
  return { ...result, model: MODEL };
}

async function callClaude(userMessage: string): Promise<Classification> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Strip markdown fences if the LLM wraps the JSON
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned);

  // If the LLM returns empty categories (off-topic content), provide a fallback
  // rather than letting Zod validation fail and leak raw error details
  if (Array.isArray(parsed.categories) && parsed.categories.length === 0) {
    return ClassificationSchema.parse({
      ...parsed,
      categories: ["lifestyle"],
      confidence_score: Math.min(parsed.confidence_score ?? 0.1, 0.15),
    });
  }

  return ClassificationSchema.parse(parsed);
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry on auth errors or invalid requests
      if (error instanceof Anthropic.APIError) {
        if (error.status === 401 || error.status === 400) throw error;
      }

      if (attempt < retries - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        logger.warn("LLM call failed, retrying", { attempt: attempt + 1, delayMs: delay, error: (error as Error).message });
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n[Content truncated for classification]";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
