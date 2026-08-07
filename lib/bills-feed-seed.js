/**
 * Article 1 theme-showcase bills (federal + state).
 * Used as API fallback / coverage merge and for DB seeding into processed_votes.
 *
 * Theme routing targets:
 * 1. Finance      → Bento Grid
 * 2. Judiciary    → Editorial Collage
 * 3. Authorization→ Procedural Pipeline
 * 4. Regulation   → Editorial Collage (regulatory / human-impact path)
 */

function seedFederalAndStateBills() {
  const now = new Date().toISOString();

  return [
    // 1) Finance → Bento Grid
    {
      id: "federal-119-hr-5371",
      billNumber: "H.R. 5371",
      title: "Continuing Appropriations and Extensions Act, 2026",
      short_title: "Keeps federal agencies funded through midyear",
      level: "Federal",
      jurisdiction: "U.S. Congress",
      stateCode: "",
      cityName: "",
      primarySponsor: { name: "House Appropriations", title: "Committee" },
      lastUpdated: now,
      status: {
        stepNumber: 3,
        totalSteps: 5,
        stepName: "House / Senate action",
        isCompleted: false,
        isCurrent: true,
      },
      allSteps: [],
      shortPitch:
        "This spending package keeps most federal agencies open with temporary funding while Congress negotiates a longer-term budget deal.",
      statusLabel: "Pending appropriations action",
      deltaSummary: { added: [], changed: [], removed: [] },
      officialUrl: "https://www.congress.gov/bill/119th-congress/house-bill/5371",
      primaryCategory: "Economy & Taxes",
      primary_category: "Economy & Taxes",
      category: "Economy & Taxes",
      policyArea: "Economics and Public Finance",
      subjectCategory: "Federal Budget",
      subject: ["Federal Budget", "Appropriations"],
      type: "hr",
      billType: "hr",
      bill_type: "hr",
      legislation_number: "5371",
      congress: 119,
      tags: ["Finance", "Federal Budget", "Appropriations", "Economy"],
      key_impacts: [
        "Funds federal agencies through midyear",
        "Avoids an immediate government shutdown",
      ],
      keyImpacts: [
        "Funds federal agencies through midyear",
        "Avoids an immediate government shutdown",
      ],
      key_points: [
        "Funds federal agencies through midyear",
        "Avoids an immediate government shutdown",
      ],
      financialSummary:
        "Temporary FY2026 continuing resolution that maintains agency operations while full-year appropriations are negotiated.",
      netCost: "$1.2T CR",
      fiscalYear: "FY2026",
      daysLeft: "14",
      themeRoute: "bento-grid",
      source: "theme_seed",
    },

    // 2) Judiciary → Editorial Collage
    {
      id: "federal-119-s-214",
      billNumber: "S. 214",
      title:
        "A bill to expand judicial review protections and civil legal aid for tenants facing eviction",
      short_title: "Tenants get stronger courtroom protections in eviction cases",
      level: "Federal",
      jurisdiction: "U.S. Congress",
      stateCode: "",
      cityName: "",
      primarySponsor: { name: "U.S. Senate Judiciary", title: "Committee" },
      lastUpdated: now,
      status: {
        stepNumber: 2,
        totalSteps: 5,
        stepName: "In Committee",
        isCompleted: false,
        isCurrent: true,
      },
      allSteps: [],
      shortPitch:
        "This judiciary bill strengthens due-process notice rules and funds civil legal aid so renters can better defend themselves in eviction court.",
      statusLabel: "Judiciary Committee markup",
      deltaSummary: { added: [], changed: [], removed: [] },
      officialUrl: "https://www.congress.gov/bill/119th-congress/senate-bill/214",
      primaryCategory: "Civil Rights & Justice",
      primary_category: "Civil Rights & Justice",
      category: "Civil Rights & Justice",
      policyArea: "Law",
      subjectCategory: "Judiciary",
      subject: ["Judiciary", "Civil Rights", "Housing Courts"],
      type: "s",
      billType: "s",
      bill_type: "s",
      legislation_number: "214",
      congress: 119,
      tags: ["Judiciary", "Civil Rights", "Justice", "Social Policy"],
      key_impacts: [
        "Strengthens eviction court notice rules",
        "Funds civil legal aid for tenants",
      ],
      keyImpacts: [
        "Strengthens eviction court notice rules",
        "Funds civil legal aid for tenants",
      ],
      key_points: [
        "Strengthens eviction court notice rules",
        "Funds civil legal aid for tenants",
      ],
      humanHook: "TENANTS GET STRONGER COURTROOM PROTECTIONS IN EVICTION CASES",
      promptQuestion: "Should Congress expand legal aid for tenants facing eviction?",
      themeRoute: "editorial-collage",
      source: "theme_seed",
    },

    // 3) Authorization → Procedural Pipeline
    {
      id: "federal-119-hr-8070",
      billNumber: "H.R. 8070",
      title: "National Defense Authorization Act for Fiscal Year 2026",
      short_title: "Defense authorization heads to floor debate",
      level: "Federal",
      jurisdiction: "U.S. Congress",
      stateCode: "",
      cityName: "",
      primarySponsor: { name: "House Armed Services", title: "Committee" },
      lastUpdated: now,
      status: {
        stepNumber: 3,
        totalSteps: 4,
        stepName: "Chamber Vote",
        isCompleted: false,
        isCurrent: true,
      },
      allSteps: [
        {
          stepNumber: 1,
          totalSteps: 4,
          stepName: "Introduced",
          isCompleted: true,
          isCurrent: false,
        },
        {
          stepNumber: 2,
          totalSteps: 4,
          stepName: "In Committee",
          isCompleted: true,
          isCurrent: false,
        },
        {
          stepNumber: 3,
          totalSteps: 4,
          stepName: "Chamber Vote",
          isCompleted: false,
          isCurrent: true,
        },
        {
          stepNumber: 4,
          totalSteps: 4,
          stepName: "Signed",
          isCompleted: false,
          isCurrent: false,
        },
      ],
      shortPitch:
        "This annual defense authorization sets military policy, end-strength, and program authorities before final passage votes.",
      statusLabel: "Floor Debate scheduled",
      voteKind: "final_passage",
      vote_kind: "final_passage",
      deltaSummary: { added: [], changed: [], removed: [] },
      officialUrl: "https://www.congress.gov/bill/119th-congress/house-bill/8070",
      primaryCategory: "Foreign Policy & Defense",
      primary_category: "Foreign Policy & Defense",
      category: "Foreign Policy & Defense",
      policyArea: "Armed Forces and National Security",
      subjectCategory: "Authorization",
      subject: ["Authorization", "Defense", "Military"],
      type: "hr",
      billType: "hr",
      bill_type: "hr",
      legislation_number: "8070",
      congress: 119,
      tags: ["Authorization", "Tracking", "Floor Debate", "Defense"],
      key_impacts: [
        "Authorizes FY2026 defense programs",
        "Sets troop and procurement ceilings",
      ],
      keyImpacts: [
        "Authorizes FY2026 defense programs",
        "Sets troop and procurement ceilings",
      ],
      key_points: [
        "Authorizes FY2026 defense programs",
        "Sets troop and procurement ceilings",
      ],
      whatItDoes:
        "Authorizes next year’s defense programs and advances the bill to floor debate ahead of final passage.",
      themeRoute: "pipeline",
      source: "theme_seed",
    },

    // 4) Regulation → Editorial Collage (regulatory / public-health path)
    {
      id: "state-ny-a-4821",
      billNumber: "A. 4821",
      title:
        "New York clean-air regulation enforcement and community monitoring act",
      short_title: "Neighborhoods get stronger clean-air regulation enforcement",
      level: "State",
      jurisdiction: "New York Legislature",
      stateCode: "NY",
      cityName: "",
      primarySponsor: { name: "New York Assembly", title: "State legislator" },
      lastUpdated: now,
      status: {
        stepNumber: 2,
        totalSteps: 5,
        stepName: "Committee",
        isCompleted: false,
        isCurrent: true,
      },
      allSteps: [],
      shortPitch:
        "This state regulation bill tightens industrial emission rules and funds community air monitors in overburdened neighborhoods.",
      statusLabel: "Environmental regulation hearing",
      deltaSummary: { added: [], changed: [], removed: [] },
      officialUrl: "https://www.nysenate.gov/",
      primaryCategory: "Energy & Environment",
      primary_category: "Energy & Environment",
      category: "Energy & Environment",
      policyArea: "Environmental Protection",
      subjectCategory: "Regulation",
      subject: ["Regulation", "Clean Air", "Public Health"],
      type: "bill",
      tags: ["Regulation", "Environment", "Public Health", "Social Policy"],
      key_impacts: [
        "Tightens industrial emission limits",
        "Funds community air monitors",
      ],
      keyImpacts: [
        "Tightens industrial emission limits",
        "Funds community air monitors",
      ],
      key_points: [
        "Tightens industrial emission limits",
        "Funds community air monitors",
      ],
      humanHook: "NEIGHBORHOODS GET STRONGER CLEAN-AIR REGULATION ENFORCEMENT",
      promptQuestion:
        "Should New York tighten industrial emission rules and expand community monitors?",
      themeRoute: "editorial-collage",
      source: "theme_seed",
    },
  ];
}

/**
 * Convert showcase bills into processed_votes-compatible upsert rows.
 */
function seedProcessedVoteRows(now = new Date().toISOString()) {
  return seedFederalAndStateBills().map((bill, index) => {
    const billType = String(bill.bill_type || bill.billType || "hr")
      .toLowerCase()
      .replace(/\./g, "");
    const legislationNumber = String(
      bill.legislation_number || String(bill.billNumber || "").replace(/\D/g, "")
    ).trim();
    const congress = Number(bill.congress || 119);
    const rollCallId = `article1-theme-seed-${index + 1}-${billType}-${legislationNumber || index}`;

    return {
      roll_call_id: rollCallId,
      bill_id: bill.id,
      congress,
      session_number: 1,
      roll_call_number: 9000 + index,
      chamber: String(bill.billNumber || "").startsWith("S") ? "senate" : "house",
      bill_type: billType,
      bill_number: bill.billNumber,
      legislation_number: legislationNumber || null,
      title: bill.title,
      vote_question: bill.shortPitch || bill.title,
      result: "Theme seed",
      vote_date: now.slice(0, 10),
      vote_kind: bill.voteKind || bill.vote_kind || "bill",
      official_url: bill.officialUrl || null,
      clerk_url: bill.officialUrl || null,
      summary: bill.shortPitch || bill.title,
      plain_summary: bill.whatItDoes || bill.shortPitch || bill.title,
      what_it_does: bill.whatItDoes || bill.shortPitch || bill.title,
      short_title: bill.short_title || bill.title,
      key_points: bill.key_points || bill.key_impacts || [],
      primary_category: bill.primary_category || bill.primaryCategory || null,
      summary_source: "article1_theme_seed",
      updated_at: now,
    };
  });
}

module.exports = {
  seedFederalAndStateBills,
  seedProcessedVoteRows,
};
