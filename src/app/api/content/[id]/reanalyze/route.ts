import { NextRequest, NextResponse } from "next/server";
import { reanalyzeRecord } from "@/lib/pipeline";
import { logger } from "@/lib/logger";

/**
 * POST /api/content/[id]/reanalyze — Re-run extraction and classification
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  try {
    logger.info("POST /api/content/[id]/reanalyze", { id });
    const result = await reanalyzeRecord(id);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    const status = message === "Record not found" ? 404 : 500;
    if (status === 500) {
      logger.error("POST /api/content/[id]/reanalyze failed", { id, error: message });
    }
    return NextResponse.json({ error: message }, { status });
  }
}
