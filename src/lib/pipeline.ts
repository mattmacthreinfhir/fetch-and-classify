import { supabase } from "./supabase";
import { extractContent, normalizeUrl } from "./extractor";
import { classifyContent } from "./classifier";
import { logger } from "./logger";
import type { ContentRecord } from "@/types";

const CONFIDENCE_THRESHOLD = 0.7;

/**
 * Creates a pending record for a URL and runs the pipeline.
 * Returns the existing record if the URL was already ingested.
 */
export async function processUrl(rawUrl: string): Promise<ContentRecord> {
  const url = normalizeUrl(rawUrl);

  // Check if URL already exists
  const { data: existing } = await supabase
    .from("content")
    .select("*")
    .eq("url", url)
    .single();

  if (existing) {
    return existing as ContentRecord;
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

  return runPipeline(record.id, url);
}

/**
 * Runs the extract → classify → store pipeline on an existing record.
 * Updates status through granular stages: extracting → classifying → completed.
 * On failure, sets status to 'failed' with error details.
 */
export async function runPipeline(id: string, url: string): Promise<ContentRecord> {
  const startTime = Date.now();

  try {
    // Stage 1: Extract
    await supabase.from("content").update({ status: "extracting" }).eq("id", id);
    logger.info("Pipeline: extracting", { id, url });
    const extracted = await extractContent(url);

    // Stage 2: Classify
    await supabase.from("content").update({ status: "classifying" }).eq("id", id);
    logger.info("Pipeline: classifying", { id, url });
    const classification = await classifyContent(extracted);

    // Stage 3: Store results
    const processingTimeMs = Date.now() - startTime;
    const needsReview = classification.confidence_score < CONFIDENCE_THRESHOLD;

    const { data: completed, error: updateError } = await supabase
      .from("content")
      .update({
        title: extracted.title,
        body_text: extracted.body_text,
        author: extracted.author,
        publish_date: extracted.publish_date,
        categories: classification.categories,
        summary: classification.summary,
        confidence_score: classification.confidence_score,
        needs_review: needsReview,
        llm_model: classification.model,
        processing_time_ms: processingTimeMs,
        status: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError || !completed) {
      throw new Error(`Failed to update record: ${updateError?.message}`);
    }

    logger.info("Pipeline: completed", { id, url, processingTimeMs, confidence: classification.confidence_score });
    return completed as ContentRecord;
  } catch (error) {
    const processingTimeMs = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    logger.error("Pipeline: failed", { id, url, processingTimeMs, error: errorMessage });

    await supabase
      .from("content")
      .update({
        status: "failed",
        error_message: errorMessage,
        processing_time_ms: processingTimeMs,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    throw error;
  }
}

/**
 * Re-runs the pipeline on an existing record.
 * Clears previous errors and re-fetches + re-classifies from scratch.
 */
export async function reanalyzeRecord(id: string): Promise<ContentRecord> {
  // Fetch existing record
  const { data: record, error: fetchError } = await supabase
    .from("content")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !record) {
    throw new Error("Record not found");
  }

  // Clear previous errors
  await supabase
    .from("content")
    .update({ error_message: null })
    .eq("id", id);

  return runPipeline(id, record.url);
}
