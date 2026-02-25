import { NextRequest, NextResponse } from "next/server";
import { SubmitUrlSchema, ContentQuerySchema } from "@/types";
import { processUrl } from "@/lib/pipeline";
import { supabase } from "@/lib/supabase";

/**
 * POST /api/content — Submit a URL for ingestion
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = SubmitUrlSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const result = await processUrl(parsed.data.url);

    // If the record already existed and was completed, return 200
    if (result.status === "completed" && result.categories.length > 0) {
      return NextResponse.json(
        { ...result, message: "Content already ingested" },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { ...result, message: "Content ingestion started" },
      { status: 202 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
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
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
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
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
