import { z } from "zod";

// --- Valid content categories (health & wellness content pillars) ---

export const CATEGORIES = [
  "aging",
  "beauty",
  "skincare",
  "cosmetic-procedures",
  "hormones",
  "menopause",
  "sexual-health",
  "mental-wellness",
  "nutrition",
  "fitness",
  "longevity",
  "medical-treatments",
  "preventive-care",
  "lifestyle",
  "relationships",
] as const;

export type Category = (typeof CATEGORIES)[number];

// --- LLM classification response ---

export const ClassificationSchema = z.object({
  categories: z.array(z.enum(CATEGORIES)).min(1).max(3),
  summary: z.string().min(10),
  confidence_score: z.number().min(0).max(1),
});

export type Classification = z.infer<typeof ClassificationSchema>;

// --- Extracted content from a URL ---

export interface ExtractedContent {
  title: string | null;
  body_text: string;
  author: string | null;
  publish_date: string | null;
}

// --- Content record (matches Supabase `content` table) ---

export type ContentStatus = "pending" | "extracting" | "classifying" | "completed" | "failed";

export type ReviewStatus = "approved" | "rejected";

export interface ContentRecord {
  id: string;
  url: string;
  title: string | null;
  body_text: string | null;
  author: string | null;
  publish_date: string | null;
  categories: Category[];
  summary: string | null;
  confidence_score: number | null;
  needs_review: boolean;
  status: ContentStatus;
  error_message: string | null;
  llm_model: string | null;
  processing_time_ms: number | null;
  review_status: ReviewStatus | null;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

// --- API request/response schemas ---

export const SubmitUrlSchema = z.object({
  url: z.url(),
});

export type SubmitUrlRequest = z.infer<typeof SubmitUrlSchema>;

export const ContentQuerySchema = z.object({
  category: z.enum(CATEGORIES).optional(),
  needs_review: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  status: z.enum(["pending", "extracting", "classifying", "completed", "failed"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ContentQuery = z.infer<typeof ContentQuerySchema>;

// --- Manual review schema ---

export const ReviewSchema = z.object({
  review_status: z.enum(["approved", "rejected"]),
  review_notes: z.string().max(500).optional(),
});

export type ReviewRequest = z.infer<typeof ReviewSchema>;

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}
