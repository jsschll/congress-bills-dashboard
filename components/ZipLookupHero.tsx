import React, { FormEvent, useId, useMemo, useState } from "react";
import type { RepresentativesLookupResult } from "../lib/services/scorecardService";
import { scorecardStore, useScorecard } from "./scorecardStore";

const US_ZIP_RE = /^\d{5}(?:-\d{4})?$/;
const HAS_LETTER_RE = /[A-Za-z]/;
const HAS_DIGIT_RE = /\d/;

export type ZipLookupHeroProps = {
  /** Override fetch target (defaults to /api/representatives/lookup). */
  endpoint?: string;
  /** Optional className merge for the outer shell. */
  className?: string;
  /** Called after a successful lookup (in addition to global store updates). */
  onSuccess?: (data: RepresentativesLookupResult) => void;
  /** Called after a failed lookup. */
  onError?: (message: string) => void;
  /** Initial input value. */
  defaultValue?: string;
  /** Show compact result chips under the form after success. */
  showResultSummary?: boolean;
};

export type QueryKind = "zip" | "address" | "invalid" | "empty";

export function classifyLookupQuery(raw: string): QueryKind {
  const value = String(raw || "").trim();
  if (!value) return "empty";
  const collapsed = value.replace(/\s+/g, "");
  if (US_ZIP_RE.test(collapsed)) return "zip";

  // Full address: enough substance, includes letters, and either a number
  // (street/ZIP) or a state-like ", ST" / " ST " pattern.
  if (value.length < 5 || !HAS_LETTER_RE.test(value)) return "invalid";
  const hasStateHint = /,\s*[A-Za-z]{2}\b|\b[A-Za-z]{2}\s+\d{5}\b/.test(value);
  if (HAS_DIGIT_RE.test(value) || hasStateHint) return "address";
  // City-only strings with 2+ words are accepted as address-like.
  if (value.split(/\s+/).filter(Boolean).length >= 2) return "address";
  return "invalid";
}

export function validateLookupQuery(raw: string): {
  ok: boolean;
  kind: QueryKind;
  message: string;
  zipCode?: string;
  address?: string;
} {
  const kind = classifyLookupQuery(raw);
  const value = String(raw || "").trim();
  if (kind === "empty") {
    return {
      ok: false,
      kind,
      message: "Enter a US ZIP code or street address.",
    };
  }
  if (kind === "invalid") {
    return {
      ok: false,
      kind,
      message:
        "Enter a valid 5-digit ZIP (or ZIP+4), or a full US address with city and state.",
    };
  }
  if (kind === "zip") {
    const zipCode = value.replace(/\s+/g, "").slice(0, 10);
    return { ok: true, kind, message: "", zipCode };
  }
  return { ok: true, kind, message: "", address: value };
}

async function fetchRepresentativesLookup(
  endpoint: string,
  parsed: { zipCode?: string; address?: string }
): Promise<RepresentativesLookupResult> {
  const params = new URLSearchParams();
  if (parsed.zipCode) params.set("zipCode", parsed.zipCode);
  if (parsed.address) params.set("address", parsed.address);
  const response = await fetch(`${endpoint}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(
      payload?.error || `Lookup failed (${response.status || "network"})`
    );
  }
  return payload as RepresentativesLookupResult;
}

/**
 * Hero ZIP / address lookup for Article 1.
 * Writes results into `scorecardStore` for downstream scorecard UI.
 *
 * Tailwind utility classes are used for layout; pair with the landing
 * `.zip-lookup-hero` CSS when Tailwind is not bundled.
 */
export function ZipLookupHero({
  endpoint = "/api/representatives/lookup",
  className = "",
  onSuccess,
  onError,
  defaultValue = "",
  showResultSummary = true,
}: ZipLookupHeroProps) {
  const inputId = useId();
  const statusId = useId();
  const scorecard = useScorecard();
  const [value, setValue] = useState(defaultValue);
  const [localError, setLocalError] = useState<string | null>(null);
  const loading = scorecard.status === "loading";

  const helperText = useMemo(() => {
    if (localError) return localError;
    if (scorecard.status === "error") return scorecard.error;
    if (scorecard.status === "success" && scorecard.data) {
      const { counts, location } = scorecard.data;
      const place = location?.formattedAddress || location?.state || "your area";
      return `Found ${counts.total} federal representative${
        counts.total === 1 ? "" : "s"
      } for ${place}.`;
    }
    return "Instant access to voting records, campaign funding, and direct constituent outreach.";
  }, [localError, scorecard]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = validateLookupQuery(value);
    if (!parsed.ok) {
      setLocalError(parsed.message);
      scorecard.setError(value.trim(), parsed.message);
      onError?.(parsed.message);
      return;
    }

    setLocalError(null);
    const query = parsed.zipCode || parsed.address || value.trim();
    scorecard.setLoading(query);

    try {
      const data = await fetchRepresentativesLookup(endpoint, parsed);
      scorecard.setSuccess(query, data);
      onSuccess?.(data);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not look up representatives.";
      scorecard.setError(query, message);
      setLocalError(message);
      onError?.(message);
    }
  }

  return (
    <div
      className={`zip-lookup-hero w-full max-w-2xl ${className}`.trim()}
      data-status={scorecard.status}
    >
      <form
        className="zip-lookup-hero__form flex flex-col gap-3 sm:flex-row sm:items-stretch"
        onSubmit={handleSubmit}
        aria-busy={loading}
        noValidate
      >
        <label className="sr-only" htmlFor={inputId}>
          ZIP code or street address
        </label>
        <div className="relative min-w-0 flex-1">
          <input
            id={inputId}
            name="lookup"
            type="search"
            inputMode="text"
            autoComplete="postal-code"
            placeholder="Enter your ZIP code to audit your representatives..."
            value={value}
            disabled={loading}
            aria-invalid={Boolean(localError) || scorecard.status === "error"}
            aria-describedby={statusId}
            onChange={(event) => {
              setValue(event.target.value);
              if (localError) setLocalError(null);
            }}
            className="zip-lookup-hero__input w-full rounded-xl border border-white/30 bg-white/95 px-4 py-3.5 text-base text-slate-900 shadow-lg outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/70 disabled:opacity-70"
          />
          {loading ? (
            <span
              className="zip-lookup-hero__spinner pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2"
              aria-hidden="true"
            />
          ) : null}
        </div>
        <button
          type="submit"
          disabled={loading}
          className="zip-lookup-hero__submit inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3.5 text-base font-bold text-white shadow-lg shadow-emerald-700/30 transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-80"
        >
          {loading ? (
            <>
              <span
                className="zip-lookup-hero__spinner zip-lookup-hero__spinner--on-dark"
                aria-hidden="true"
              />
              Auditing…
            </>
          ) : (
            "Track Your Reps"
          )}
        </button>
      </form>

      <p
        id={statusId}
        className={`zip-lookup-hero__hint mt-3 text-sm font-medium ${
          localError || scorecard.status === "error"
            ? "text-rose-200"
            : scorecard.status === "success"
              ? "text-emerald-100"
              : "text-white/80"
        }`}
        role={localError || scorecard.status === "error" ? "alert" : "status"}
        aria-live="polite"
      >
        {helperText}
      </p>

      {showResultSummary &&
      scorecard.status === "success" &&
      scorecard.representatives.length > 0 ? (
        <ul className="zip-lookup-hero__results mt-4 flex flex-wrap gap-2">
          {scorecard.representatives.map((rep) => (
            <li
              key={rep.profile.id}
              className="rounded-full border border-emerald-400/30 bg-slate-900/55 px-3 py-1.5 text-sm text-emerald-50 backdrop-blur"
            >
              <span className="font-semibold">{rep.profile.name}</span>
              <span className="text-white/60">
                {" "}
                · {rep.profile.chamber}
                {rep.profile.party ? ` · ${rep.profile.party}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Imperative helper for non-React callers (also updates the global store). */
export async function runZipLookup(
  rawQuery: string,
  endpoint = "/api/representatives/lookup"
): Promise<RepresentativesLookupResult> {
  const parsed = validateLookupQuery(rawQuery);
  if (!parsed.ok) {
    scorecardStore.setError(rawQuery.trim(), parsed.message);
    throw new Error(parsed.message);
  }
  const query = parsed.zipCode || parsed.address || rawQuery.trim();
  scorecardStore.setLoading(query);
  try {
    const data = await fetchRepresentativesLookup(endpoint, parsed);
    scorecardStore.setSuccess(query, data);
    return data;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not look up representatives.";
    scorecardStore.setError(query, message);
    throw error;
  }
}

export default ZipLookupHero;
