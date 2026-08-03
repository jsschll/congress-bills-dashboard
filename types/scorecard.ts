/**
 * Representative Scorecard domain types.
 *
 * SQL migration: supabase/migration-representative-scorecard.sql
 * These models power federal (House/Senate) oversight scorecards:
 * profile, donor alignment, attendance/voting activity, Truth-in-Voting
 * bill cards, and per-member roll-call positions.
 */

/** Legislative chamber for scorecard profiles. */
export type ScorecardChamber = "House" | "Senate";

/** Member vote position on a scorecard roll call. */
export type VotePosition = "YES" | "NO" | "ABSTAIN" | "NOT_VOTING";

/** Industry donor slice used in campaign finance breakdowns. */
export interface DonorIndustry {
  name: string;
  /** Amount in USD. */
  amount: number;
}

/**
 * Politician Profile — identity + contact for the scorecard header.
 * Maps to `representative_profiles`.
 */
export interface PoliticianProfile {
  id: string;
  bioguideId: string | null;
  fecId: string | null;
  name: string;
  party: string | null;
  district: string | null;
  state: string | null;
  chamber: ScorecardChamber | null;
  officeAddress: string | null;
  phone: string | null;
  website: string | null;
  photoUrl: string | null;
  nextElectionYear: number | null;
  /** Optional link to public.politicians.id for follow / notes. */
  rosterPoliticianId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Campaign Finance (Donor Alignment).
 * Maps to `campaign_finance` (1:1 with politician profile).
 */
export interface CampaignFinance {
  id: string;
  politicianId: string;
  /** Share of receipts from small-dollar donors (0–100). */
  smallDonorPct: number | null;
  /** Share from large individual donors (0–100). */
  largeDonorPct: number | null;
  /** Share from PACs (0–100). */
  pacPct: number | null;
  /** Share from candidate self-funding (0–100). */
  selfFundingPct: number | null;
  /** Total raised in USD for the cycle. */
  totalRaised: number | null;
  topIndustries: DonorIndustry[];
  cycle?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Attendance & Voting Activity.
 * Maps to `attendance_voting_activity` (1:1 with politician profile).
 */
export interface AttendanceVotingActivity {
  id: string;
  politicianId: string;
  totalVotes: number;
  missedVotes: number;
  sponsoredBillsCount: number;
  /** Percent of cosponsorships that are bipartisan (0–100). */
  bipartisanCosponsorPct: number | null;
  congress?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Bill Roll Call Vote ("Truth in Voting") card.
 * Maps to `scorecard_bills`.
 */
export interface BillRollCallVote {
  id: string;
  billNumber: string;
  title: string;
  plainEnglishSummary: string | null;
  category: string | null;
  voteDate: string | null;
  /** Plain-English household / wallet impact. */
  walletImpact: string | null;
  /** Plain-English community / local impact. */
  communityImpact: string | null;
  /** Plain-English civil liberties / rights impact. */
  rightsImpact: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Representative Vote Record — how one member voted on a scorecard bill.
 * Maps to `representative_vote_records`.
 */
export interface RepresentativeVoteRecord {
  id: string;
  politicianId: string;
  billId: string;
  votePosition: VotePosition;
  createdAt?: string;
  updatedAt?: string;
}

/** Assembled scorecard payload for a single representative. */
export interface RepresentativeScorecard {
  profile: PoliticianProfile;
  campaignFinance: CampaignFinance | null;
  attendance: AttendanceVotingActivity | null;
  votes: Array<
    RepresentativeVoteRecord & {
      bill: BillRollCallVote;
    }
  >;
}

/* —— Snake_case row shapes (match Postgres / Supabase selects) —— */

export interface PoliticianProfileRow {
  id: string;
  bioguide_id: string | null;
  fec_id: string | null;
  name: string;
  party: string | null;
  district: string | null;
  state: string | null;
  chamber: ScorecardChamber | null;
  office_address: string | null;
  phone: string | null;
  website: string | null;
  photo_url: string | null;
  next_election_year: number | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignFinanceRow {
  id: string;
  politician_id: string;
  small_donor_pct: number | null;
  large_donor_pct: number | null;
  pac_pct: number | null;
  self_funding_pct: number | null;
  total_raised: number | null;
  top_industries: DonorIndustry[];
  cycle: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceVotingActivityRow {
  id: string;
  politician_id: string;
  total_votes: number;
  missed_votes: number;
  sponsored_bills_count: number;
  bipartisan_cosponsor_pct: number | null;
  congress: number | null;
  created_at: string;
  updated_at: string;
}

export interface BillRollCallVoteRow {
  id: string;
  bill_number: string;
  title: string;
  plain_english_summary: string | null;
  category: string | null;
  vote_date: string | null;
  wallet_impact: string | null;
  community_impact: string | null;
  rights_impact: string | null;
  created_at: string;
  updated_at: string;
}

export interface RepresentativeVoteRecordRow {
  id: string;
  politician_id: string;
  bill_id: string;
  vote_position: VotePosition;
  created_at: string;
  updated_at: string;
}

export function mapPoliticianProfileRow(
  row: PoliticianProfileRow
): PoliticianProfile {
  return {
    id: row.id,
    bioguideId: row.bioguide_id,
    fecId: row.fec_id,
    name: row.name,
    party: row.party,
    district: row.district,
    state: row.state,
    chamber: row.chamber,
    officeAddress: row.office_address,
    phone: row.phone,
    website: row.website,
    photoUrl: row.photo_url,
    nextElectionYear: row.next_election_year,
    rosterPoliticianId: row.politician_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCampaignFinanceRow(row: CampaignFinanceRow): CampaignFinance {
  return {
    id: row.id,
    politicianId: row.politician_id,
    smallDonorPct: row.small_donor_pct == null ? null : Number(row.small_donor_pct),
    largeDonorPct: row.large_donor_pct == null ? null : Number(row.large_donor_pct),
    pacPct: row.pac_pct == null ? null : Number(row.pac_pct),
    selfFundingPct:
      row.self_funding_pct == null ? null : Number(row.self_funding_pct),
    totalRaised: row.total_raised == null ? null : Number(row.total_raised),
    topIndustries: Array.isArray(row.top_industries) ? row.top_industries : [],
    cycle: row.cycle,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAttendanceVotingActivityRow(
  row: AttendanceVotingActivityRow
): AttendanceVotingActivity {
  return {
    id: row.id,
    politicianId: row.politician_id,
    totalVotes: row.total_votes,
    missedVotes: row.missed_votes,
    sponsoredBillsCount: row.sponsored_bills_count,
    bipartisanCosponsorPct:
      row.bipartisan_cosponsor_pct == null
        ? null
        : Number(row.bipartisan_cosponsor_pct),
    congress: row.congress,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapBillRollCallVoteRow(
  row: BillRollCallVoteRow
): BillRollCallVote {
  return {
    id: row.id,
    billNumber: row.bill_number,
    title: row.title,
    plainEnglishSummary: row.plain_english_summary,
    category: row.category,
    voteDate: row.vote_date,
    walletImpact: row.wallet_impact,
    communityImpact: row.community_impact,
    rightsImpact: row.rights_impact,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapRepresentativeVoteRecordRow(
  row: RepresentativeVoteRecordRow
): RepresentativeVoteRecord {
  return {
    id: row.id,
    politicianId: row.politician_id,
    billId: row.bill_id,
    votePosition: row.vote_position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Prisma-style model reference (documentation only — this repo uses
 * Supabase SQL migrations, not Prisma).
 *
 * model PoliticianProfile {
 *   id                String   @id @default(uuid())
 *   bioguideId        String?  @unique @map("bioguide_id")
 *   fecId             String?  @map("fec_id")
 *   name              String
 *   party             String?
 *   district          String?
 *   state             String?
 *   chamber           ScorecardChamber?
 *   officeAddress     String?  @map("office_address")
 *   phone             String?
 *   website           String?
 *   photoUrl          String?  @map("photo_url")
 *   nextElectionYear  Int?     @map("next_election_year")
 *   campaignFinance   CampaignFinance?
 *   attendance        AttendanceVotingActivity?
 *   voteRecords       RepresentativeVoteRecord[]
 * }
 *
 * model CampaignFinance {
 *   id               String   @id @default(uuid())
 *   politicianId     String   @unique @map("politician_id")
 *   smallDonorPct    Decimal? @map("small_donor_pct")
 *   largeDonorPct    Decimal? @map("large_donor_pct")
 *   pacPct           Decimal? @map("pac_pct")
 *   selfFundingPct   Decimal? @map("self_funding_pct")
 *   totalRaised      Decimal? @map("total_raised")
 *   topIndustries    Json     @map("top_industries")
 *   politician       PoliticianProfile @relation(fields: [politicianId], references: [id])
 * }
 *
 * model AttendanceVotingActivity {
 *   id                      String   @id @default(uuid())
 *   politicianId            String   @unique @map("politician_id")
 *   totalVotes              Int      @map("total_votes")
 *   missedVotes             Int      @map("missed_votes")
 *   sponsoredBillsCount     Int      @map("sponsored_bills_count")
 *   bipartisanCosponsorPct  Decimal? @map("bipartisan_cosponsor_pct")
 *   politician              PoliticianProfile @relation(fields: [politicianId], references: [id])
 * }
 *
 * model BillRollCallVote {
 *   id                   String   @id @default(uuid())
 *   billNumber           String   @map("bill_number")
 *   title                String
 *   plainEnglishSummary  String?  @map("plain_english_summary")
 *   category             String?
 *   voteDate             DateTime? @map("vote_date")
 *   walletImpact         String?  @map("wallet_impact")
 *   communityImpact      String?  @map("community_impact")
 *   rightsImpact         String?  @map("rights_impact")
 *   voteRecords          RepresentativeVoteRecord[]
 * }
 *
 * model RepresentativeVoteRecord {
 *   id            String       @id @default(uuid())
 *   politicianId  String       @map("politician_id")
 *   billId        String       @map("bill_id")
 *   votePosition  VotePosition @map("vote_position")
 *   politician    PoliticianProfile @relation(fields: [politicianId], references: [id])
 *   bill          BillRollCallVote  @relation(fields: [billId], references: [id])
 *   @@unique([politicianId, billId])
 * }
 */
