import React from "react";
import { RepresentativesScorecardView } from "../../../components/RepresentativesScorecardView";

type PageParams = {
  id: string;
};

type PageSearchParams = {
  zipCode?: string | string[];
  zip?: string | string[];
  address?: string | string[];
  q?: string | string[];
};

function first(value?: string | string[]): string | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

/**
 * Dynamic Representative Scorecard page.
 *
 * Assembles ZipLookup session / route id into the shared dashboard:
 * tabs (Senate 1 / Senate 2 / House) → Hero → Donor + Attendance | Truth in Voting.
 *
 * Note: this repo’s production host is static + `/api/*` serverless. Pair this
 * page with `representatives.html` for the live vanilla dashboard, or mount it
 * in a Next.js runtime when enabled.
 */
export default function RepresentativeScorecardPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams?: PageSearchParams;
}) {
  const zipCode =
    first(searchParams?.zipCode) || first(searchParams?.zip) || null;
  const address =
    first(searchParams?.address) || first(searchParams?.q) || null;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <RepresentativesScorecardView
        activeId={params.id}
        zipCode={zipCode}
        address={address}
      />
    </main>
  );
}
