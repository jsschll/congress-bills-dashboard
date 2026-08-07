/**
 * Article 1 theme-showcase bills (federal + state).
 * Used as API fallback / coverage merge and for DB seeding into processed_votes.
 *
 * Theme routing targets:
 * 1. Finance           → Bento Grid
 * 2. Judiciary         → Editorial Collage
 * 3. Authorization     → Procedural Pipeline
 * 4. Regulation        → Influence Network
 * 5. Local / Infra     → Local Impact
 * 6. Comparison / Amd  → Versus Comparison
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
      themeVariant: "bento-grid",
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
      themeVariant: "editorial-collage",
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
      themeVariant: "pipeline",
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
      tags: ["Regulation", "Lobbying", "Stakeholder Map", "Environment"],
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
      stakeholders: [
        {
          id: "clean-air-now",
          name: "Clean Air Now",
          weight: 0.72,
          stance: "support",
          spendLabel: "$1.1M",
        },
        {
          id: "hospital-league",
          name: "Hospital League",
          weight: 0.48,
          stance: "support",
          spendLabel: "$640K",
        },
        {
          id: "manufacturers",
          name: "Manufacturers",
          weight: 0.88,
          stance: "oppose",
          spendLabel: "$3.4M",
        },
        {
          id: "energy-pac",
          name: "Energy PAC",
          weight: 0.61,
          stance: "oppose",
          spendLabel: "$1.5M",
        },
      ],
      themeRoute: "influence",
      themeVariant: "influence",
      source: "theme_seed",
    },

    // 5) Local / District-Specific / Infrastructure → Local Impact
    {
      id: "federal-119-hr-6122",
      billNumber: "H.R. 6122",
      title:
        "Gulf Coast district infrastructure resilience and Katy corridor flood-mitigation act",
      short_title: "TX-22 and nearby districts get targeted flood and transit funding",
      level: "Federal",
      jurisdiction: "U.S. Congress",
      stateCode: "TX",
      cityName: "Katy",
      primarySponsor: { name: "House Transportation", title: "Committee" },
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
        "This infrastructure package allocates district-specific flood-control and transit dollars with the heaviest local impact concentrated in TX-22 / the Katy area.",
      statusLabel: "Infrastructure subcommittee hearing",
      deltaSummary: { added: [], changed: [], removed: [] },
      officialUrl: "https://www.congress.gov/bill/119th-congress/house-bill/6122",
      primaryCategory: "Infrastructure",
      primary_category: "Infrastructure",
      category: "Infrastructure",
      policyArea: "Transportation and Public Works",
      subjectCategory: "District-Specific",
      subject: ["Infrastructure", "Local", "District-Specific"],
      type: "hr",
      billType: "hr",
      bill_type: "hr",
      legislation_number: "6122",
      congress: 119,
      tags: ["Local", "District-Specific", "Infrastructure", "TX-22"],
      key_impacts: [
        "Directs $184M to TX-22 flood and corridor projects",
        "Pairs district allocations with a regional impact score",
      ],
      keyImpacts: [
        "Directs $184M to TX-22 flood and corridor projects",
        "Pairs district allocations with a regional impact score",
      ],
      key_points: [
        "Directs $184M to TX-22 flood and corridor projects",
        "Pairs district allocations with a regional impact score",
      ],
      whatItDoes:
        "Targets infrastructure dollars by congressional district, highlighting TX-22 / Katy-area flood mitigation and corridor upgrades.",
      focusDistrict: "TX-22 · Katy area",
      regionalImpact: "High",
      fundingLabel: "$352M regional",
      districts: [
        {
          id: "tx-22",
          label: "TX-22",
          detail: "Katy / Fort Bend corridor",
          amount: "$184M",
          emphasis: true,
        },
        {
          id: "tx-07",
          label: "TX-07",
          detail: "West Houston suburbs",
          amount: "$96M",
        },
        {
          id: "tx-09",
          label: "TX-09",
          detail: "Southeast metro",
          amount: "$72M",
        },
      ],
      themeRoute: "local",
      themeVariant: "local",
      source: "theme_seed",
    },

    // 6) Comparison / Amendment / Versus → Versus Comparison
    {
      id: "federal-119-s-1840",
      billNumber: "S. 1840",
      title:
        "Federal contracting transparency amendment — original text versus manager’s amendment",
      short_title: "Original bill text versus the manager’s amendment, side by side",
      level: "Federal",
      jurisdiction: "U.S. Congress",
      stateCode: "",
      cityName: "",
      primarySponsor: { name: "U.S. Senate Homeland", title: "Committee" },
      lastUpdated: now,
      status: {
        stepNumber: 3,
        totalSteps: 5,
        stepName: "Floor Debate",
        isCompleted: false,
        isCurrent: true,
      },
      allSteps: [],
      shortPitch:
        "This amendment package rewrites key contracting clauses — compare the original text with the versus amendment before the floor vote.",
      statusLabel: "Amendment comparison pending",
      deltaSummary: { added: [], changed: [], removed: [] },
      officialUrl: "https://www.congress.gov/bill/119th-congress/senate-bill/1840",
      primaryCategory: "Comparison",
      primary_category: "Comparison",
      category: "Comparison",
      policyArea: "Government Operations and Politics",
      subjectCategory: "Amendment",
      subject: ["Comparison", "Amendment", "Versus"],
      type: "s",
      billType: "s",
      bill_type: "s",
      legislation_number: "1840",
      congress: 119,
      tags: ["Comparison", "Amendment", "Versus"],
      key_impacts: [
        "Lowers the contract threshold from $25M to $10M",
        "Adds semiannual inspector-general audits",
      ],
      keyImpacts: [
        "Lowers the contract threshold from $25M to $10M",
        "Adds semiannual inspector-general audits",
      ],
      key_points: [
        "Lowers the contract threshold from $25M to $10M",
        "Adds semiannual inspector-general audits",
      ],
      whatItDoes:
        "Places the original contracting bill beside the manager’s amendment so readers can see Agree and Oppose changes clause by clause.",
      versusLeftLabel: "Bill A · Original",
      versusRightLabel: "Bill B · Amendment",
      versusClauses: [
        {
          id: "scope",
          label: "Scope",
          left: "Applies to new federal contracts over $25M.",
          right: "Applies to new and renewed contracts over $10M.",
          tone: "oppose",
        },
        {
          id: "timeline",
          label: "Timeline",
          left: "Phase-in over three fiscal years.",
          right: "Phase-in over three fiscal years.",
          tone: "agree",
        },
        {
          id: "oversight",
          label: "Oversight",
          left: "Annual GAO report to Congress.",
          right: "Semiannual inspector-general audits plus GAO report.",
          tone: "oppose",
        },
        {
          id: "funding",
          label: "Funding",
          left: "No new discretionary outlays authorized.",
          right: "Authorizes $180M for implementation grants.",
          tone: "oppose",
        },
      ],
      themeRoute: "versus",
      themeVariant: "versus",
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
