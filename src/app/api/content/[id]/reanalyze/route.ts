import { NextRequest, NextResponse } from "next/server";
import { reanalyzeRecord } from "@/lib/pipeline";

/**
 * POST /api/content/[id]/reanalyze — Re-run extraction and classification
 */
export async function POST(
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

    const result = await reanalyzeRecord(id);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    const status = message === "Record not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
