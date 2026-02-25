import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { ReviewSchema } from "@/types";
import { logger } from "@/lib/logger";

/**
 * GET /api/content/[id] — Get a single content record by ID
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: "Invalid ID format. Expected a UUID." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("content")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Content not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/content/[id] — Approve or reject a content record
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: "Invalid ID format. Expected a UUID." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = ReviewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid review data", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { review_status, review_notes } = parsed.data;

    const { data, error } = await supabase
      .from("content")
      .update({
        review_status,
        review_notes: review_notes ?? null,
        reviewed_at: new Date().toISOString(),
        needs_review: review_status === "rejected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Content not found" },
        { status: 404 }
      );
    }

    logger.info("Review submitted", { id, review_status, review_notes });
    return NextResponse.json(data);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    logger.error("PATCH /api/content/[id] failed", { id, error: detail });
    return NextResponse.json(
      { error: "An internal error occurred" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/content/[id] — Delete a content record
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: "Invalid ID format. Expected a UUID." },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("content")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { error: "Failed to delete record" },
        { status: 500 }
      );
    }

    logger.info("Record deleted", { id });
    return NextResponse.json({ success: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    logger.error("DELETE /api/content/[id] failed", { id, error: detail });
    return NextResponse.json(
      { error: "An internal error occurred" },
      { status: 500 }
    );
  }
}
