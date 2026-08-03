"use client";

import React, { useEffect, useMemo, useState } from "react";
import type {
  RepresentativeScorecardPayload,
  RepresentativesLookupResult,
} from "../../lib/services/scorecardService";
import { AttendanceStatsCard } from "./AttendanceStatsCard";
import { DonorAlignmentCard } from "./DonorAlignmentCard";
import { RepresentativeHero } from "./RepresentativeHero";
import { TruthInVotingFeed } from "./TruthInVotingFeed";
import { scorecardStore } from "./scorecardStore";

export type RepresentativesScorecardViewProps = {
  /** Active representative id from the route. */
  activeId?: string | null;
  /** Optional ZIP from search session / query string. */
  zipCode?: string | null;
  /** Optional address from search session / query string. */
  address?: string | null;
  /** Prefetched lookup payload (e.g. from RSC or session). */
  initialData?: RepresentativesLookupResult | null;
  /** Match scores keyed by politician id. */
  actionMatchById?: Record<string, number | null | undefined>;
  endpoint?: string;
  className?: string;
  onActiveIdChange?: (id: string) => void;
};

type LoadState = "idle" | "loading" | "ready" | "error";

function tabLabel(
  rep: RepresentativeScorecardPayload,
  senators: RepresentativeScorecardPayload[],
  indexInChamber: number
): string {
  if (rep.profile.chamber === "Senate") {
    return `Senate ${indexInChamber + 1}`;
  }
  if (rep.profile.chamber === "House") {
    const district = String(rep.profile.district || "").replace(/^0+/, "");
    return district ? `House · ${rep.profile.state}-${district}` : "House Representative";
  }
  return rep.profile.name;
}

async function fetchScorecardBundle(options: {
  endpoint: string;
  id?: string | null;
  zipCode?: string | null;
  address?: string | null;
}): Promise<RepresentativesLookupResult & {
  activeId?: string | null;
  representative?: RepresentativeScorecardPayload | null;
}> {
  const params = new URLSearchParams();
  if (options.id) params.set("id", options.id);
  if (options.zipCode) params.set("zipCode", options.zipCode);
  if (options.address) params.set("address", options.address);
  const response = await fetch(`${options.endpoint}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Lookup failed (${response.status})`);
  }
  return payload;
}

/**
 * Assembled scorecard dashboard: rep tabs, hero, donor/attendance, Truth in Voting.
 */
export function RepresentativesScorecardView({
  activeId = null,
  zipCode = null,
  address = null,
  initialData = null,
  actionMatchById = {},
  endpoint = "/api/representatives/lookup",
  className = "",
  onActiveIdChange,
}: RepresentativesScorecardViewProps) {
  const [loadState, setLoadState] = useState<LoadState>(
    initialData ? "ready" : "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RepresentativesLookupResult | null>(
    initialData
  );
  const [selectedId, setSelectedId] = useState<string | null>(activeId);
  const [voteQuery, setVoteQuery] = useState("");

  useEffect(() => {
    setSelectedId(activeId);
  }, [activeId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!activeId && !zipCode && !address && !initialData) {
        setLoadState("error");
        setError("Provide a representative id or ZIP/address search session.");
        return;
      }
      if (initialData && !zipCode && !address && !activeId) {
        setData(initialData);
        setLoadState("ready");
        return;
      }

      setLoadState("loading");
      setError(null);
      try {
        const payload = await fetchScorecardBundle({
          endpoint,
          id: activeId,
          zipCode,
          address,
        });
        if (cancelled) return;
        setData(payload);
        scorecardStore.setSuccess(
          zipCode || address || activeId || "scorecard",
          payload
        );
        const nextId =
          activeId ||
          payload.activeId ||
          payload.representatives?.[0]?.profile?.id ||
          null;
        setSelectedId(nextId);
        setLoadState("ready");
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Could not load scorecard.";
        setError(message);
        setLoadState("error");
        scorecardStore.setError(activeId || zipCode || address || "", message);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [activeId, zipCode, address, endpoint]); // eslint-disable-line react-hooks/exhaustive-deps

  const representatives = data?.representatives || [];

  const senateTabs = useMemo(
    () => representatives.filter((rep) => rep.profile.chamber === "Senate"),
    [representatives]
  );

  const active =
    representatives.find((rep) => rep.profile.id === selectedId) ||
    representatives[0] ||
    null;

  const filteredVotes = useMemo(() => {
    const votes = active?.recentVotes || [];
    const q = voteQuery.trim().toLowerCase();
    if (!q) return votes;
    return votes.filter((vote) => {
      const haystack = [
        vote.billNumber,
        vote.title,
        vote.plainEnglishSummary,
        vote.category,
        vote.impacts?.wallet,
        vote.impacts?.community,
        vote.impacts?.rights,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [active, voteQuery]);

  function selectRep(id: string) {
    setSelectedId(id);
    onActiveIdChange?.(id);
  }

  return (
    <div
      className={`representatives-scorecard mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 ${className}`.trim()}
    >
      <header className="mb-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
          Representative Scorecard
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
          {data?.location?.formattedAddress ||
            data?.location?.state ||
            "Your federal representatives"}
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Switch between your senators and House member to audit money, attendance,
          and recent votes.
        </p>
      </header>

      {loadState === "loading" ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          <span className="mr-2 inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-500" />
          Loading scorecards…
        </div>
      ) : null}

      {loadState === "error" ? (
        <div
          className="rounded-2xl border border-rose-300/50 bg-rose-50 p-4 text-rose-800 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-100"
          role="alert"
        >
          {error || "Unable to load representative scorecards."}
        </div>
      ) : null}

      {loadState === "ready" && representatives.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-500 dark:border-slate-600 dark:text-slate-400">
          No federal scorecard profiles matched this search yet.
        </div>
      ) : null}

      {loadState === "ready" && representatives.length > 0 ? (
        <>
          <nav
            className="mb-4 flex flex-wrap gap-2"
            aria-label="Representatives"
            role="tablist"
          >
            {representatives.map((rep) => {
              const chamberPeers =
                rep.profile.chamber === "Senate" ? senateTabs : [rep];
              const indexInChamber = Math.max(
                0,
                chamberPeers.findIndex((peer) => peer.profile.id === rep.profile.id)
              );
              const selected = active?.profile.id === rep.profile.id;
              return (
                <button
                  key={rep.profile.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => selectRep(rep.profile.id)}
                  className={`rounded-full px-3.5 py-2 text-sm font-bold transition ${
                    selected
                      ? "bg-emerald-600 text-white shadow-md shadow-emerald-700/25"
                      : "border border-slate-200 bg-white text-slate-700 hover:border-emerald-400/50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                  }`}
                >
                  <span className="block leading-tight">
                    {tabLabel(rep, senateTabs, indexInChamber)}
                  </span>
                  <span
                    className={`block text-[0.7rem] font-semibold ${
                      selected ? "text-emerald-50/90" : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {rep.profile.name}
                  </span>
                </button>
              );
            })}
          </nav>

          {active ? (
            <div className="space-y-4">
              <RepresentativeHero
                profile={active.profile}
                actionMatchScore={actionMatchById[active.profile.id] ?? null}
              />

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
                <div className="space-y-4">
                  <DonorAlignmentCard finance={active.campaignFinance} />
                  <AttendanceStatsCard attendance={active.attendance} />
                </div>

                <div className="space-y-3">
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm dark:border-slate-700/80 dark:bg-slate-900 sm:p-4">
                    <label
                      htmlFor="truth-vote-search"
                      className="mb-1 block text-[0.7rem] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                    >
                      Search bills in feed
                    </label>
                    <input
                      id="truth-vote-search"
                      type="search"
                      value={voteQuery}
                      onChange={(event) => setVoteQuery(event.target.value)}
                      placeholder="Filter by bill number, title, or keyword…"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <TruthInVotingFeed votes={filteredVotes} />
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default RepresentativesScorecardView;
