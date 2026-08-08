import React, { useMemo } from "react";
import type { PoliticianProfile } from "../types/scorecard";

export type PartyKind = "democrat" | "republican" | "independent" | "other";

export function classifyParty(party?: string | null): PartyKind {
  const value = String(party || "").trim().toLowerCase();
  if (!value) return "other";
  if (value.startsWith("dem") || value === "d") return "democrat";
  if (value.startsWith("rep") || value === "r" || value.includes("gop")) {
    return "republican";
  }
  if (value.startsWith("ind") || value === "i" || value.includes("independent")) {
    return "independent";
  }
  return "other";
}

export function partyLabel(kind: PartyKind, raw?: string | null): string {
  if (kind === "democrat") return "Democrat";
  if (kind === "republican") return "Republican";
  if (kind === "independent") return "Independent";
  return String(raw || "Nonpartisan").trim() || "Nonpartisan";
}

const PARTY_BADGE: Record<PartyKind, string> = {
  democrat:
    "bg-blue-600/15 text-blue-700 ring-blue-600/30 dark:bg-blue-400/15 dark:text-blue-200 dark:ring-blue-300/30",
  republican:
    "bg-red-600/15 text-red-700 ring-red-600/30 dark:bg-red-400/15 dark:text-red-200 dark:ring-red-300/30",
  independent:
    "bg-violet-600/15 text-violet-700 ring-violet-600/30 dark:bg-violet-400/15 dark:text-violet-200 dark:ring-violet-300/30",
  other:
    "bg-slate-500/15 text-slate-700 ring-slate-500/25 dark:bg-slate-400/15 dark:text-slate-200 dark:ring-slate-300/25",
};

function officeBadgeLabel(profile: Pick<
  PoliticianProfile,
  "state" | "district" | "chamber"
>): string {
  if (profile.chamber === "Senate") return "U.S. Senator";
  if (profile.chamber === "House") {
    const state = String(profile.state || "").toUpperCase();
    const district = String(profile.district || "").replace(/^0+/, "");
    if (state && district) return `House - ${state}-${district}`;
    return "U.S. Representative";
  }
  return profile.chamber || "Official";
}

function formatDistrictLabel(profile: Pick<
  PoliticianProfile,
  "state" | "district" | "chamber"
>): string {
  const state = String(profile.state || "").toUpperCase();
  const chamber = profile.chamber;
  const district = String(profile.district || "").trim();
  if (chamber === "Senate") {
    return [state, "U.S. Senate"].filter(Boolean).join(" · ");
  }
  if (!state && !district) return chamber || "Federal office";
  if (!district || /statewide/i.test(district)) {
    return [state, "At-Large"].filter(Boolean).join(" · ");
  }
  const cleaned = district.replace(/^0+/, "") || district;
  return `${state}-${cleaned}`;
}

function telHref(phone?: string | null): string | null {
  const digits = String(phone || "").replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : null;
}

function siteHref(website?: string | null): string | null {
  const raw = String(website || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function initials(name: string): string {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function clampScore(score: number | null | undefined): number | null {
  if (score == null || Number.isNaN(Number(score))) return null;
  return Math.max(0, Math.min(100, Math.round(Number(score))));
}

function matchTone(score: number): string {
  if (score >= 70) return "text-emerald-600 dark:text-emerald-300";
  if (score >= 40) return "text-amber-600 dark:text-amber-300";
  return "text-rose-600 dark:text-rose-300";
}

export type SocialLink = { label: string; url: string };

export type RepresentativeHeroProps = {
  profile: PoliticianProfile;
  /** Tenure line, e.g. "Elected 2002 · 24 Years Active". */
  tenureLabel?: string | null;
  /** Extra contact / social pills beyond phone + website. */
  socialLinks?: SocialLink[];
  /** Optional follow/note handlers (Page 2 actions). */
  onFollowClick?: () => void;
  onNoteClick?: () => void;
  following?: boolean;
  /** 0–100 Action Match alignment with the signed-in user. */
  actionMatchScore?: number | null;
  /** Optional compared-vote count under the ring. */
  actionMatchCompared?: number | null;
  /** When false, hide the compact Action Match ring (full scorecard lives below). */
  showMatchRing?: boolean;
  className?: string;
};

/**
 * Scorecard header: badges, tenure, follow/note actions, contact, optional match ring.
 */
export function RepresentativeHero({
  profile,
  tenureLabel = null,
  socialLinks = [],
  onFollowClick,
  onNoteClick,
  following = false,
  actionMatchScore = null,
  actionMatchCompared = null,
  showMatchRing = false,
  className = "",
}: RepresentativeHeroProps) {
  const partyKind = classifyParty(profile.party);
  const score = clampScore(actionMatchScore);
  const phoneUrl = telHref(profile.phone);
  const webUrl = siteHref(profile.website);
  const officeLabel = useMemo(() => officeBadgeLabel(profile), [profile]);
  const districtLabel = useMemo(
    () => formatDistrictLabel(profile),
    [profile]
  );
  const tenure =
    tenureLabel ||
    (profile.nextElectionYear
      ? `Next election ${profile.nextElectionYear}`
      : "");

  const ringStyle =
    score == null
      ? undefined
      : ({
          background: `conic-gradient(currentColor ${score * 3.6}deg, rgba(148,163,184,0.25) 0)`,
        } as React.CSSProperties);

  const contactPills: SocialLink[] = [];
  if (phoneUrl) contactPills.push({ label: "Phone", url: phoneUrl });
  if (webUrl) contactPills.push({ label: "Official Website", url: webUrl });
  for (const link of socialLinks) {
    if (!link?.label || !link?.url) continue;
    if (contactPills.some((item) => item.label === link.label)) continue;
    contactPills.push(link);
  }

  return (
    <section
      className={`representative-hero rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-700/80 dark:bg-slate-900 sm:p-5 ${className}`.trim()}
      aria-label={`${profile.name} scorecard header`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3.5 sm:gap-4">
          <div className="relative shrink-0">
            {profile.photoUrl ? (
              <img
                src={profile.photoUrl}
                alt=""
                className="h-20 w-20 rounded-2xl object-cover ring-2 ring-slate-200 dark:ring-slate-600 sm:h-24 sm:w-24"
              />
            ) : (
              <div
                className="flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-100 text-xl font-bold text-slate-600 ring-2 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600 sm:h-24 sm:w-24 sm:text-2xl"
                aria-hidden="true"
              >
                {initials(profile.name)}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold tracking-wide text-emerald-700 ring-1 ring-inset ring-emerald-500/30 dark:text-emerald-300 dark:ring-emerald-300/30">
                {officeLabel}
              </span>
              <span className="inline-flex items-center rounded-full bg-slate-500/15 px-2.5 py-0.5 text-xs font-bold tracking-wide text-slate-600 ring-1 ring-inset ring-slate-500/25 dark:text-slate-200 dark:ring-slate-300/25">
                Federal
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ring-1 ring-inset ${PARTY_BADGE[partyKind]}`}
              >
                {partyLabel(partyKind, profile.party)}
              </span>
            </div>

            <h2 className="truncate text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
              {profile.name}
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">
              {districtLabel}
            </p>
            {tenure ? (
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                {tenure}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              {onFollowClick ? (
                <button
                  type="button"
                  onClick={onFollowClick}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-extrabold transition ${
                    following
                      ? "border border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      : "bg-emerald-400 text-emerald-950 hover:bg-emerald-300"
                  }`}
                >
                  {following ? "Following" : "+ Follow"}
                </button>
              ) : null}
              {onNoteClick ? (
                <button
                  type="button"
                  onClick={onNoteClick}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-50 px-3.5 py-1.5 text-sm font-bold text-slate-800 transition hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                >
                  Journal
                </button>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {contactPills.map((pill) => (
                <a
                  key={pill.label}
                  href={pill.url}
                  target={pill.url.startsWith("tel:") ? undefined : "_blank"}
                  rel={
                    pill.url.startsWith("tel:")
                      ? undefined
                      : "noopener noreferrer"
                  }
                  className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 transition hover:border-emerald-400/50 hover:bg-emerald-50 dark:border-slate-600 dark:bg-slate-800 dark:text-emerald-300 dark:hover:border-emerald-400/40 dark:hover:bg-slate-700"
                >
                  {pill.label}
                </a>
              ))}
            </div>
          </div>
        </div>

        {showMatchRing ? (
          <div className="flex shrink-0 justify-start sm:justify-end">
            <div
              className={`representative-hero__match flex flex-col items-center ${
                score == null
                  ? "text-slate-400 dark:text-slate-500"
                  : matchTone(score)
              }`}
            >
              <div
                className="relative grid h-[5.5rem] w-[5.5rem] place-items-center rounded-full p-[0.35rem]"
                style={ringStyle}
                role="img"
                aria-label={
                  score == null
                    ? "Action Match Score unavailable"
                    : `Action Match Score ${score} percent`
                }
              >
                <div className="grid h-full w-full place-items-center rounded-full bg-white dark:bg-slate-900">
                  <div className="text-center leading-none">
                    <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                      {score == null ? "—" : `${score}%`}
                    </div>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-center text-[0.7rem] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                Action Match
              </p>
              {actionMatchCompared != null ? (
                <p className="mt-0.5 text-center text-xs text-slate-500 dark:text-slate-400">
                  {actionMatchCompared} compared vote
                  {actionMatchCompared === 1 ? "" : "s"}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default RepresentativeHero;
