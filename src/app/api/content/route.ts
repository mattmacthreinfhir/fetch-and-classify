import { NextRequest, NextResponse, after } from "next/server";
import { SubmitUrlSchema, ContentQuerySchema } from "@/types";
import { runPipeline } from "@/lib/pipeline";
import { normalizeUrl } from "@/lib/extractor";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/content — Submit a URL for ingestion
 *
 * Returns 202 immediately with a pending record, then runs the
 * extract → classify → store pipeline in the background via after().
 * The client can poll GET /api/content/[id] for status updates.
 */
export async function POST(request: NextRequest) {
  // Rate limit: 10 submissions per minute per IP
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "global";
  const { allowed, retryAfterMs } = checkRateLimit(clientIp, {
    windowMs: 60_000,
    maxRequests: 10,
  });

  if (!allowed) {
    logger.warn("Rate limit exceeded", { clientIp });
    return NextResponse.json(
      { error: "Rate limit exceeded. Max 10 URLs per minute." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
      }
    );
  }

  try {
    const body = await request.json();
    const parsed = SubmitUrlSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const url = normalizeUrl(parsed.data.url);
    logger.info("POST /api/content", { url });

    // Check if URL already exists
    const { data: existing } = await supabase
      .from("content")
      .select("*")
      .eq("url", url)
      .single();

    if (existing) {
      return NextResponse.json(
        { ...existing, message: "Content already ingested" },
        { status: 200 }
      );
    }

    // Insert pending record
    const { data: record, error: insertError } = await supabase
      .from("content")
      .insert({ url, status: "pending" })
      .select()
      .single();

    if (insertError || !record) {
      throw new Error(`Failed to create record: ${insertError?.message}`);
    }

    // Run pipeline in background after response is sent
    after(async () => {
      try {
        await runPipeline(record.id, url);
      } catch (error) {
        logger.error("Background pipeline failed", {
          id: record.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    return NextResponse.json(
      { ...record, message: "Content ingestion started" },
      { status: 202 }
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    logger.error("POST /api/content failed", { error: detail });
    return NextResponse.json(
      { error: "An internal error occurred. Please try again later." },
      { status: 500 }
    );
  }
}

/**
 * GET /api/content — List content with optional filters
 *
 * Query params: ?category=health&status=completed&needs_review=true&limit=20&offset=0
 */
export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = ContentQuerySchema.safeParse(params);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { category, status, needs_review, limit, offset } = parsed.data;

    // Build query
    let query = supabase
      .from("content")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (category) {
      query = query.contains("categories", [category]);
    }
    if (status) {
      query = query.eq("status", status);
    }
    if (needs_review !== undefined) {
      query = query.eq("needs_review", needs_review);
    }

    const { data, count, error } = await query;

    if (error) {
      logger.error("GET /api/content database error", { error: error.message });
      return NextResponse.json(
        { error: "An internal error occurred. Please try again later." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: data ?? [],
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    logger.error("GET /api/content failed", { error: detail });
    return NextResponse.json(
      { error: "An internal error occurred. Please try again later." },
      { status: 500 }
    );
  }
}
