"use client";

import { useState, useEffect, useCallback } from "react";
import type { ContentRecord, Category } from "@/types";
import { CATEGORIES } from "@/types";

type ContentStatus = ContentRecord["status"];

const STATUS_COLORS: Record<ContentStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  processing: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

export default function Home() {
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setSubmitting(true);
    setSubmitMessage(null);

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

      setSubmitMessage({
        text: json.message || "URL submitted successfully",
        type: "success",
      });
      setUrl("");
      fetchRecords();
    } catch {
      setSubmitMessage({ text: "Network error", type: "error" });
    } finally {
      setSubmitting(false);
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

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-4xl px-4 py-12">
        {/* Header */}
        <header className="mb-10">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Content Ingestion
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Submit a URL to extract and classify health &amp; wellness content
          </p>
        </header>

        {/* Submit Form */}
        <form onSubmit={handleSubmit} className="mb-10">
          <div className="flex gap-3">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/article"
              required
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {submitting ? "Submitting..." : "Submit"}
            </button>
          </div>
          {submitMessage && (
            <p
              className={`mt-2 text-sm ${
                submitMessage.type === "error"
                  ? "text-red-600"
                  : "text-green-600"
              }`}
            >
              {submitMessage.text}
            </p>
          )}
        </form>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as Category | "")}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          >
            <option value="">All categories</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat.replace(/-/g, " ")}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as ContentStatus | "")
            }
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>

          <span className="ml-auto text-sm text-zinc-500">
            {total} record{total !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Content List */}
        {loading ? (
          <p className="py-12 text-center text-sm text-zinc-400">Loading...</p>
        ) : records.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-400">
            No content yet. Submit a URL above to get started.
          </p>
        ) : (
          <div className="space-y-3">
            {records.map((record) => (
              <article
                key={record.id}
                className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {record.title || record.url}
                    </h3>
                    <a
                      href={record.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 block truncate text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                    >
                      {record.url}
                    </a>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => handleReanalyze(record.id)}
                      disabled={reanalyzingId === record.id}
                      title="Re-run extraction and classification"
                      className="rounded-md border border-zinc-200 px-2 py-0.5 text-xs text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-200"
                    >
                      {reanalyzingId === record.id ? "Reanalyzing..." : "Reanalyze"}
                    </button>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[record.status]}`}
                    >
                      {record.status}
                    </span>
                  </div>
                </div>

                {record.summary && (
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {record.summary}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {record.categories.map((cat) => (
                    <span
                      key={cat}
                      className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      {cat.replace(/-/g, " ")}
                    </span>
                  ))}

                  {record.needs_review && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                      needs review
                    </span>
                  )}

                  {record.confidence_score !== null && (
                    <span className="ml-auto text-xs text-zinc-400">
                      {Math.round(record.confidence_score * 100)}% confidence
                    </span>
                  )}
                </div>

                {record.error_message && (
                  <p className="mt-2 text-xs text-red-500">
                    {record.error_message}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
