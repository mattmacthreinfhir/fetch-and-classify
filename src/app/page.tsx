"use client";

import { useState, useEffect, useCallback } from "react";
import type { ContentRecord, Category } from "@/types";
import { CATEGORIES } from "@/types";

type ContentStatus = ContentRecord["status"];

const STATUS_CONFIG: Record<ContentStatus, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "#92400e", bg: "#fef3c7" },
  extracting: { label: "Extracting", color: "#1e40af", bg: "#dbeafe" },
  classifying: { label: "Classifying", color: "#6b21a8", bg: "#f3e8ff" },
  completed: { label: "Completed", color: "#166534", bg: "#dcfce7" },
  failed: { label: "Failed", color: "#991b1b", bg: "#fee2e2" },
};

const STAGE_LABELS: Record<string, string> = {
  pending: "Queued...",
  extracting: "Extracting content from URL...",
  classifying: "Classifying with AI...",
  completed: "Done!",
  failed: "Failed",
};

export default function Home() {
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pipelineStage, setPipelineStage] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  const [records, setRecords] = useState<ContentRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [categoryFilter, setCategoryFilter] = useState<Category | "">("");
  const [statusFilter, setStatusFilter] = useState<ContentStatus | "">("");
  const [reanalyzingId, setReanalyzingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (categoryFilter) params.set("category", categoryFilter);
      if (statusFilter) params.set("status", statusFilter);
      params.set("limit", "20");

      const res = await fetch(`/api/content?${params}`);
      const json = await res.json();
      setRecords(json.data ?? []);
      setTotal(json.total ?? 0);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, statusFilter]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  async function pollForCompletion(id: string): Promise<void> {
    const POLL_INTERVAL = 2000;
    const MAX_POLLS = 30;

    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      const res = await fetch(`/api/content/${id}`);
      if (!res.ok) continue;

      const record = await res.json();
      setPipelineStage(STAGE_LABELS[record.status] ?? "Processing...");

      if (record.status === "completed") return;
      if (record.status === "failed") {
        throw new Error(record.error_message ?? "Pipeline failed");
      }
    }
    throw new Error("Timed out waiting for processing");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setSubmitting(true);
    setSubmitMessage(null);
    setPipelineStage("Submitting...");

    try {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const json = await res.json();

      if (!res.ok) {
        setSubmitMessage({
          text: json.error || "Failed to submit URL",
          type: "error",
        });
        return;
      }

      if (res.status === 200) {
        setSubmitMessage({
          text: json.message || "Content already ingested",
          type: "success",
        });
        setUrl("");
        fetchRecords();
        return;
      }

      setPipelineStage("Extracting content from URL...");
      await pollForCompletion(json.id);

      setSubmitMessage({ text: "Content ingested successfully", type: "success" });
      setUrl("");
      fetchRecords();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setSubmitMessage({ text: msg, type: "error" });
    } finally {
      setSubmitting(false);
      setPipelineStage(null);
    }
  }

  async function handleReview(id: string, reviewStatus: "approved" | "rejected", notes?: string) {
    setReviewingId(id);
    try {
      const res = await fetch(`/api/content/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review_status: reviewStatus, review_notes: notes }),
      });
      if (!res.ok) {
        const json = await res.json();
        setSubmitMessage({ text: json.error || "Review failed", type: "error" });
        return;
      }
      setRejectingId(null);
      setRejectNotes("");
      fetchRecords();
    } catch {
      setSubmitMessage({ text: "Network error", type: "error" });
    } finally {
      setReviewingId(null);
    }
  }

  async function handleReanalyze(id: string) {
    setReanalyzingId(id);
    try {
      const res = await fetch(`/api/content/${id}/reanalyze`, {
        method: "POST",
      });
      if (!res.ok) {
        const json = await res.json();
        setSubmitMessage({
          text: json.error || "Reanalysis failed",
          type: "error",
        });
        return;
      }
      fetchRecords();
    } catch {
      setSubmitMessage({ text: "Network error", type: "error" });
    } finally {
      setReanalyzingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/content/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        setSubmitMessage({ text: json.error || "Delete failed", type: "error" });
        return;
      }
      fetchRecords();
    } catch {
      setSubmitMessage({ text: "Network error", type: "error" });
    } finally {
      setDeletingId(null);
    }
  }

  function formatCategory(cat: string) {
    return cat.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return (
    <div className="min-h-screen" style={{ background: "#fafaf8" }}>
      {/* Navigation */}
      <nav className="border-b" style={{ borderColor: "#e8e5e0" }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <span className="text-lg font-semibold tracking-tight" style={{ color: "#282828" }}>
            Content Ingestion
          </span>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-6">
        {/* Hero Section */}
        <section className="pb-12 pt-16">
          <h2
            className="mb-3 text-sm font-medium uppercase tracking-widest"
            style={{ color: "#282828" }}
          >
            Submit Content
          </h2>
          <h1
            className="mb-4 max-w-2xl text-4xl leading-tight"
            style={{ fontWeight: 200, color: "#282828" }}
          >
            Extract and classify <strong className="font-bold">health &amp; wellness</strong> content.
          </h1>
          <p className="max-w-xl text-base" style={{ fontWeight: 200, color: "#666" }}>
            Submit a URL to automatically extract article content and classify it
            into health &amp; wellness categories using AI.
          </p>
        </section>

        {/* Submit Form */}
        <section className="pb-16">
          <form onSubmit={handleSubmit}>
            <div className="flex gap-3">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste article URL here..."
                required
                className="flex-1 rounded-full px-6 py-3 text-sm outline-none"
                style={{
                  border: "1px solid #e8e5e0",
                  background: "#fff",
                  color: "#282828",
                  fontWeight: 300,
                }}
              />
              <button
                type="submit"
                disabled={submitting}
                className="btn-pill btn-pill-dark"
              >
                {submitting ? (
                  <>
                    <span
                      className="animate-spin inline-block h-3.5 w-3.5 rounded-full"
                      style={{ border: "2px solid #ebe6de", borderTopColor: "transparent" }}
                    />
                    Processing
                  </>
                ) : (
                  <>
                    Submit
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </>
                )}
              </button>
            </div>

            {pipelineStage && (
              <div className="mt-4 flex items-center gap-3 pl-2">
                <span
                  className="animate-spin inline-block h-3 w-3 rounded-full"
                  style={{ border: "2px solid #282828", borderTopColor: "transparent" }}
                />
                <span className="text-sm" style={{ fontWeight: 300, color: "#282828" }}>
                  {pipelineStage}
                </span>
              </div>
            )}
            {!pipelineStage && submitMessage && (
              <p
                className="mt-4 pl-2 text-sm"
                style={{
                  fontWeight: 300,
                  color: submitMessage.type === "error" ? "#991b1b" : "#166534",
                }}
              >
                {submitMessage.text}
              </p>
            )}
          </form>
        </section>

        {/* Divider */}
        <div className="mb-10" style={{ borderTop: "1px solid #e8e5e0" }} />

        {/* Filters */}
        <section className="mb-8 flex flex-wrap items-center gap-4">
          <p className="label-caps mr-2">Filter</p>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as Category | "")}
            className="rounded-full px-4 py-2 text-sm outline-none"
            style={{
              border: "1px solid #e8e5e0",
              background: "#fff",
              color: "#282828",
              fontWeight: 300,
            }}
          >
            <option value="">All categories</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {formatCategory(cat)}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ContentStatus | "")}
            className="rounded-full px-4 py-2 text-sm outline-none"
            style={{
              border: "1px solid #e8e5e0",
              background: "#fff",
              color: "#282828",
              fontWeight: 300,
            }}
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="extracting">Extracting</option>
            <option value="classifying">Classifying</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>

          <span className="ml-auto text-sm" style={{ fontWeight: 300, color: "#999" }}>
            {total} record{total !== 1 ? "s" : ""}
          </span>
        </section>

        {/* Content List */}
        <section className="pb-20">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <span
                className="animate-spin inline-block h-5 w-5 rounded-full"
                style={{ border: "2px solid #282828", borderTopColor: "transparent" }}
              />
            </div>
          ) : records.length === 0 ? (
            <div className="py-20 text-center">
              <p className="mb-2 text-lg" style={{ fontWeight: 200, color: "#282828" }}>
                No content yet
              </p>
              <p className="text-sm" style={{ fontWeight: 300, color: "#999" }}>
                Submit a URL above to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {records.map((record) => {
                const statusCfg = STATUS_CONFIG[record.status];

                return (
                  <article
                    key={record.id}
                    className="rounded-2xl p-6"
                    style={{
                      background: "#fff",
                      border: "1px solid #e8e5e0",
                    }}
                  >
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <h3
                          className="truncate text-base"
                          style={{ fontWeight: 400, color: "#282828" }}
                        >
                          {record.title || "Untitled"}
                        </h3>
                        <a
                          href={record.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 block truncate text-xs transition-colors"
                          style={{ color: "#999", fontWeight: 300 }}
                        >
                          {record.url}
                        </a>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          onClick={() => handleDelete(record.id)}
                          disabled={deletingId === record.id}
                          title="Delete"
                          className="rounded-full p-1.5 transition-colors hover:bg-red-50"
                          style={{ color: "#999" }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleReanalyze(record.id)}
                          disabled={reanalyzingId === record.id}
                          className="btn-pill btn-pill-outline"
                          style={{ padding: "4px 14px", fontSize: "12px" }}
                        >
                          {reanalyzingId === record.id ? "Reanalyzing..." : "Reanalyze"}
                        </button>
                        <span
                          className="inline-block rounded-full px-3 py-1 text-xs"
                          style={{
                            background: statusCfg.bg,
                            color: statusCfg.color,
                            fontWeight: 500,
                          }}
                        >
                          {statusCfg.label}
                        </span>
                      </div>
                    </div>

                    {/* Summary */}
                    {record.summary && (
                      <p
                        className="mt-4 leading-relaxed"
                        style={{ fontSize: "14px", fontWeight: 300, color: "#555" }}
                      >
                        {record.summary}
                      </p>
                    )}

                    {/* Meta row */}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {record.categories.map((cat) => (
                        <span
                          key={cat}
                          className="rounded-full px-3 py-1 text-xs"
                          style={{
                            background: "#f5f4f1",
                            color: "#555",
                            fontWeight: 400,
                          }}
                        >
                          {formatCategory(cat)}
                        </span>
                      ))}

                      {record.needs_review && !record.review_status && (
                        <span
                          className="rounded-full px-3 py-1 text-xs"
                          style={{
                            background: "#fef3c7",
                            color: "#92400e",
                            fontWeight: 500,
                          }}
                        >
                          Needs Review
                        </span>
                      )}

                      {record.review_status && (
                        <span
                          className="rounded-full px-3 py-1 text-xs"
                          style={{
                            background: record.review_status === "approved" ? "#dcfce7" : "#fee2e2",
                            color: record.review_status === "approved" ? "#166534" : "#991b1b",
                            fontWeight: 500,
                          }}
                        >
                          {record.review_status === "approved" ? "Approved" : "Rejected"}
                        </span>
                      )}

                      {record.confidence_score !== null && (
                        <span className="ml-auto text-xs" style={{ color: "#999", fontWeight: 300 }}>
                          {Math.round(record.confidence_score * 100)}% confidence
                        </span>
                      )}
                    </div>

                    {/* Review actions */}
                    {record.needs_review && !record.review_status && (
                      <div className="mt-5 border-t pt-4" style={{ borderColor: "#f0eeeb" }}>
                        {rejectingId === record.id ? (
                          <div className="flex items-end gap-3">
                            <textarea
                              value={rejectNotes}
                              onChange={(e) => setRejectNotes(e.target.value)}
                              placeholder="Rejection notes (optional)..."
                              maxLength={500}
                              rows={2}
                              className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none"
                              style={{
                                border: "1px solid #e8e5e0",
                                fontWeight: 300,
                                color: "#282828",
                                resize: "none",
                              }}
                            />
                            <button
                              onClick={() => handleReview(record.id, "rejected", rejectNotes || undefined)}
                              disabled={reviewingId === record.id}
                              className="btn-pill text-xs"
                              style={{
                                padding: "8px 18px",
                                background: "#991b1b",
                                color: "#fff",
                                border: "1px solid #991b1b",
                              }}
                            >
                              Confirm Reject
                            </button>
                            <button
                              onClick={() => { setRejectingId(null); setRejectNotes(""); }}
                              className="btn-pill btn-pill-outline text-xs"
                              style={{ padding: "8px 18px" }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleReview(record.id, "approved")}
                              disabled={reviewingId === record.id}
                              className="btn-pill text-xs"
                              style={{
                                padding: "6px 20px",
                                background: "#166534",
                                color: "#fff",
                                border: "1px solid #166534",
                              }}
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => setRejectingId(record.id)}
                              disabled={reviewingId === record.id}
                              className="btn-pill btn-pill-outline text-xs"
                              style={{ padding: "6px 20px", color: "#991b1b", borderColor: "#fca5a5" }}
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Review notes */}
                    {record.review_notes && (
                      <p className="mt-3 text-xs italic" style={{ color: "#999", fontWeight: 300 }}>
                        Review notes: {record.review_notes}
                      </p>
                    )}

                    {/* Error */}
                    {record.error_message && (
                      <p className="mt-3 text-xs" style={{ color: "#991b1b", fontWeight: 300 }}>
                        {record.error_message}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="py-8" style={{ background: "#282828" }}>
        <div className="mx-auto max-w-5xl px-6 text-center">
          <p className="text-xs" style={{ color: "#ebe6de", fontWeight: 300 }}>
            Content Ingestion Service
          </p>
        </div>
      </footer>
    </div>
  );
}
