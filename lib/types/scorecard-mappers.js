/**
 * CommonJS mappers for Representative Scorecard rows ↔ domain objects.
 * Mirrors helpers in types/scorecard.ts for runtime API use.
 */

function mapPoliticianProfileRow(row) {
  return {
    id: row.id,
    bioguideId: row.bioguide_id ?? null,
    fecId: row.fec_id ?? null,
    name: row.name,
    party: row.party ?? null,
    district: row.district ?? null,
    state: row.state ?? null,
    chamber: row.chamber ?? null,
    officeAddress: row.office_address ?? null,
    phone: row.phone ?? null,
    website: row.website ?? null,
    photoUrl: row.photo_url ?? null,
    nextElectionYear: row.next_election_year ?? null,
    /** Optional link to public.politicians.id for follow / notes. */
    rosterPoliticianId: row.politician_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCampaignFinanceRow(row) {
  return {
    id: row.id,
    politicianId: row.politician_id,
    smallDonorPct:
      row.small_donor_pct == null ? null : Number(row.small_donor_pct),
    largeDonorPct:
      row.large_donor_pct == null ? null : Number(row.large_donor_pct),
    pacPct: row.pac_pct == null ? null : Number(row.pac_pct),
    selfFundingPct:
      row.self_funding_pct == null ? null : Number(row.self_funding_pct),
    totalRaised: row.total_raised == null ? null : Number(row.total_raised),
    topIndustries: Array.isArray(row.top_industries) ? row.top_industries : [],
    cycle: row.cycle ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAttendanceVotingActivityRow(row) {
  return {
    id: row.id,
    politicianId: row.politician_id,
    totalVotes: Number(row.total_votes) || 0,
    missedVotes: Number(row.missed_votes) || 0,
    sponsoredBillsCount: Number(row.sponsored_bills_count) || 0,
    bipartisanCosponsorPct:
      row.bipartisan_cosponsor_pct == null
        ? null
        : Number(row.bipartisan_cosponsor_pct),
    congress: row.congress ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBillRollCallVoteRow(row) {
  return {
    id: row.id,
    billNumber: row.bill_number,
    title: row.title,
    plainEnglishSummary: row.plain_english_summary ?? null,
    category: row.category ?? null,
    industryTags: Array.isArray(row.industry_tags) ? row.industry_tags : [],
    voteDate: row.vote_date ?? null,
    walletImpact: row.wallet_impact ?? null,
    communityImpact: row.community_impact ?? null,
    rightsImpact: row.rights_impact ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRepresentativeVoteRecordRow(row) {
  return {
    id: row.id,
    politicianId: row.politician_id,
    billId: row.bill_id,
    votePosition: row.vote_position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  mapAttendanceVotingActivityRow,
  mapBillRollCallVoteRow,
  mapCampaignFinanceRow,
  mapPoliticianProfileRow,
  mapRepresentativeVoteRecordRow,
};
