import { supabase } from "./supabase";
import { extractContent, normalizeUrl } from "./extractor";
import { classifyContent } from "./classifier";
import type { ContentRecord } from "@/types";

const CONFIDENCE_THRESHOLD = 0.7;

/**
 * Runs the full content ingestion pipeline for a given URL:
 *   1. Insert a pending record
 *   2. Set status to 'processing'
 *   3. Extract content from URL
 *   4. Classify with LLM
 *   5. Store results with status 'completed'
 *
 * On failure at any step, the record is updated to 'failed' with error details.
 * Always records processing_time_ms for observability.
 */
export async function processUrl(rawUrl: string): Promise<ContentRecord> {
  const url = normalizeUrl(rawUrl);
  const startTime = Date.now();

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

  const id = record.id;

  // Set status to processing
  await supabase
    .from("content")
    .update({ status: "processing" })
    .eq("id", id);

  try {
    // Step 1: Extract content
    const extracted = await extractContent(url);

    // Step 2: Classify with LLM
    const classification = await classifyContent(extracted);

    // Step 3: Store results
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

    return completed as ContentRecord;
  } catch (error) {
    // Record failure with error details and timing
    const processingTimeMs = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

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
 * Re-runs the extract → classify pipeline on an existing record.
 * Resets the record to 'processing', re-fetches the URL, re-classifies,
 * and updates with fresh results.
 */
export async function reanalyzeRecord(id: string): Promise<ContentRecord> {
  const startTime = Date.now();

  // Fetch existing record
  const { data: record, error: fetchError } = await supabase
    .from("content")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !record) {
    throw new Error("Record not found");
  }

  // Set status to processing
  await supabase
    .from("content")
    .update({ status: "processing", error_message: null })
    .eq("id", id);

  try {
    const extracted = await extractContent(record.url);
    const classification = await classifyContent(extracted);

    const processingTimeMs = Date.now() - startTime;
    const needsReview = classification.confidence_score < CONFIDENCE_THRESHOLD;

    const { data: updated, error: updateError } = await supabase
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
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError || !updated) {
      throw new Error(`Failed to update record: ${updateError?.message}`);
    }

    return updated as ContentRecord;
  } catch (error) {
    const processingTimeMs = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

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
