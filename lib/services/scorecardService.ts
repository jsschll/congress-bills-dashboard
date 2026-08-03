/**
 * Typed surface for the Representative Scorecard service.
 *
 * Runtime implementation: ./scorecardService.js (CommonJS, used by Vercel).
 * Domain models: ../../types/scorecard.ts
 */

import type {
  AttendanceVotingActivity,
  BillRollCallVote,
  CampaignFinance,
  DonorIndustry,
  PoliticianProfile,
  RepresentativeScorecard,
  RepresentativeVoteRecord,
  VotePosition,
} from "../../types/scorecard";

export type {
  AttendanceVotingActivity,
  BillRollCallVote,
  CampaignFinance,
  DonorIndustry,
  PoliticianProfile,
  RepresentativeScorecard,
  RepresentativeVoteRecord,
  VotePosition,
};

export interface ResolvedDistrict {
  state: string;
  district: string;
  formattedAddress: string;
  zipCode: string | null;
  source: string;
  lat: number | null;
  lng: number | null;
  bioguides: string[];
  warning?: string;
}

export interface ScorecardAttendance extends AttendanceVotingActivity {
  /** Computed missed / total * 100 (one decimal). */
  missedVotePct: number | null;
}

export interface ScorecardCampaignFinance {
  politicianId: string;
  smallDonorPct: number | null;
  largeDonorPct: number | null;
  pacPct: number | null;
  selfFundingPct: number | null;
  totalRaised: number | null;
  /** Top 5 industries by amount. */
  topIndustries: DonorIndustry[];
  cycle: string | null;
}

export interface ScorecardRecentVote {
  votePosition: VotePosition;
  billId: string;
  billNumber: string | null;
  title: string | null;
  plainEnglishSummary: string | null;
  category: string | null;
  voteDate: string | null;
  impacts: {
    wallet: string | null;
    community: string | null;
    rights: string | null;
  };
}

export interface RepresentativeScorecardPayload {
  profile: PoliticianProfile;
  campaignFinance: ScorecardCampaignFinance | null;
  attendance: ScorecardAttendance | null;
  recentVotes: ScorecardRecentVote[];
}

export interface RepresentativesLookupResult {
  ok: true;
  query: {
    zipCode: string | null;
    address: string | null;
  };
  location: {
    state: string;
    district: string;
    formattedAddress: string;
    source: string;
    lat: number | null;
    lng: number | null;
    warning?: string;
  };
  counts: {
    senators: number;
    house: number;
    total: number;
  };
  representatives: RepresentativeScorecardPayload[];
  scorecardErrors?: Array<{
    politicianId: string;
    name: string;
    error: string;
  }>;
}

export interface LookupRepresentativesOptions {
  zipCode?: string | null;
  address?: string | null;
  /** Optional injected Supabase client (tests). */
  supabase?: unknown;
}

declare const service: {
  lookupRepresentativesByLocation(
    options?: LookupRepresentativesOptions
  ): Promise<RepresentativesLookupResult>;
  getSupabaseAdmin(): unknown;
  fetchFederalRepresentatives(
    supabase: unknown,
    location: Pick<ResolvedDistrict, "state" | "district" | "bioguides">
  ): Promise<unknown[]>;
  buildScorecardPayload(
    supabase: unknown,
    profileRow: unknown
  ): Promise<RepresentativeScorecardPayload>;
  normalizeDistrict(value: string | number | null | undefined): string;
};

// Runtime bridge for TypeScript consumers in mixed CJS/TS environments.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const runtime = require("./scorecardService.js") as typeof service;

export const lookupRepresentativesByLocation =
  runtime.lookupRepresentativesByLocation;
export const getSupabaseAdmin = runtime.getSupabaseAdmin;
export const fetchFederalRepresentatives = runtime.fetchFederalRepresentatives;
export const buildScorecardPayload = runtime.buildScorecardPayload;
export const normalizeDistrict = runtime.normalizeDistrict;

export default runtime;
