import React, { useEffect, useState } from "react";
import { ArticleCard } from "../components/ArticleCard";
import {
  extractLiveBillsFromFeed,
  type BillsFeedResponse,
  type LegislativeBill,
} from "../lib/live-bill";

export type Article1PageProps = {
  /**
   * Optional server-provided bills (API / SSR).
   * When omitted, the page fetches live data from `billsFeedUrl`.
   * Never falls back to hardcoded mock bills.
   */
  bills?: LegislativeBill[];
  /** Override for the live bills feed endpoint. */
  billsFeedUrl?: string;
  /** Max live bills to render. */
  limit?: number;
};

type LoadState = "idle" | "loading" | "ready" | "error";

const DEFAULT_FEED_URL = "/api/bills-feed?seed=1";

/**
 * Article 1 home surface.
 * Renders live / structured legislative bills through ArticleCard + ThemeWrapper.
 * No mock-bill placeholders — empty and error states stay honest.
 */
export default function Article1HomePage({
  bills: initialBills,
  billsFeedUrl = DEFAULT_FEED_URL,
  limit = 12,
}: Article1PageProps = {}) {
  const hasServerBills = Array.isArray(initialBills);
  const [bills, setBills] = useState<LegislativeBill[]>(() =>
    hasServerBills ? extractLiveBillsFromFeed(initialBills).slice(0, limit) : []
  );
  const [status, setStatus] = useState<LoadState>(
    hasServerBills ? "ready" : "loading"
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  useEffect(() => {
    if (hasServerBills) {
      setBills(extractLiveBillsFromFeed(initialBills).slice(0, limit));
      setStatus("ready");
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function loadLiveBills() {
      setStatus("loading");
      setErrorMessage("");

      try {
        const separator = billsFeedUrl.includes("?") ? "&" : "?";
        const url = `${billsFeedUrl}${separator}limit=${encodeURIComponent(
          String(limit)
        )}`;
        const response = await fetch(url, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Bills feed returned ${response.status}`);
        }

        const payload = (await response.json()) as BillsFeedResponse;
        if (payload?.ok === false || payload?.error) {
          throw new Error(payload.error || "Bills feed unavailable");
        }

        const liveBills = extractLiveBillsFromFeed(payload).slice(0, limit);
        if (cancelled) return;

        setBills(liveBills);
        setGeneratedAt(payload.generatedAt || null);
        setStatus("ready");
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        setBills([]);
        setStatus("error");
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not load live legislative data"
        );
      }
    }

    loadLiveBills();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [billsFeedUrl, hasServerBills, initialBills, limit]);

  return (
    <main
      className="a1-home min-h-screen bg-[#F4F2EE] text-slate-900"
      data-a1-page="home"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex flex-col gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
            Article 1
          </p>
          <h1 className="font-['Fraunces',Georgia,serif] text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Live legislation
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-slate-600 sm:text-base">
            Bills stream in from the live legislative feed. Themes switch
            automatically from each bill&apos;s real category, subject, and
            type—no mock placeholders.
          </p>
          {generatedAt ? (
            <p className="text-xs text-slate-400">
              Feed updated {new Date(generatedAt).toLocaleString()}
            </p>
          ) : null}
        </header>

        {status === "loading" ? (
          <p
            className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600"
            role="status"
          >
            Loading live bills…
          </p>
        ) : null}

        {status === "error" ? (
          <p
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-800"
            role="alert"
          >
            {errorMessage ||
              "Live legislative data is temporarily unavailable. Try again shortly."}
          </p>
        ) : null}

        {status === "ready" && bills.length === 0 ? (
          <p
            className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600"
            role="status"
          >
            No live federal or state bills are available right now.
          </p>
        ) : null}

        <section
          className="flex flex-col gap-10"
          aria-label="Live bill cards"
        >
          {bills.map((bill, index) => {
            const key =
              bill.id ||
              bill.billId ||
              bill.bill_id ||
              bill.billNumber ||
              `live-bill-${index}`;

            return (
              <ArticleCard
                key={key}
                bill={bill}
              />
            );
          })}
        </section>
      </div>
    </main>
  );
}
