import type { BillMetric, ThemeVariant } from "../components/types";

/**
 * Live / structured legislative bill shape accepted by Article 1.
 * Compatible with `/api/bills-feed` items and processed_votes overlays.
 */
export type LegislativeBill = {
  id?: string;
  billId?: string;
  bill_id?: string;
  billNumber?: string;
  bill_number?: string;
  legislationNumber?: string;
  legislation_number?: string;
  title?: string;
  short_title?: string;
  shortTitle?: string;
  shortPitch?: string;
  short_pitch?: string;
  summary?: string;
  level?: string;
  jurisdiction?: string;
  category?: string;
  primaryCategory?: string;
  primary_category?: string;
  subjectCategory?: string;
  subject?: string | string[];
  subjects?: string[];
  policyArea?: string;
  policy_area?: string;
  type?: string;
  billType?: string;
  bill_type?: string;
  tags?: string[];
  keyImpacts?: string[];
  key_impacts?: string[];
  key_points?: string[];
  keyPoints?: string[];
  humanHook?: string;
  human_hook?: string;
  promptQuestion?: string;
  prompt_question?: string;
  financialSummary?: string;
  financial_summary?: string;
  imageSrc?: string;
  image_src?: string;
  imageAlt?: string;
  image_alt?: string;
  netCost?: string | number;
  net_cost?: string | number;
  fiscalYear?: string | number;
  fiscal_year?: string | number;
  daysLeft?: string | number;
  days_left?: string | number;
  voteProjection?: string;
  vote_projection?: string;
  metrics?: BillMetric[];
  themeVariant?: ThemeVariant;
  theme_variant?: ThemeVariant;
  lastUpdated?: string;
  officialUrl?: string;
  official_url?: string;
  /** Plain-English "what it does" / procedural summary fields. */
  whatItDoes?: string;
  what_it_does?: string;
  plainSummary?: string;
  plain_summary?: string;
  statusLabel?: string;
  status_label?: string;
  voteKind?: string;
  vote_kind?: string;
  voteQuestion?: string;
  vote_question?: string;
  status?: {
    stepNumber?: number;
    totalSteps?: number;
    stepName?: string;
    isCompleted?: boolean;
    isCurrent?: boolean;
    date?: string;
  } | null;
  allSteps?: Array<{
    stepNumber?: number;
    totalSteps?: number;
    stepName?: string;
    isCompleted?: boolean;
    isCurrent?: boolean;
    date?: string;
  }>;
  pipelineSteps?: Array<{
    id?: string;
    label?: string;
    description?: string;
    status?: "complete" | "current" | "upcoming";
    icon?: "gavel" | "mic" | "ballot" | "default";
  }>;
};

export type ArticleBillViewModel = {
  billId: string;
  title: string;
  category: string;
  keyImpacts: string[];
  humanHook?: string;
  promptQuestion?: string;
  imageSrc?: string;
  imageAlt?: string;
  financialSummary?: string;
  whatItDoes?: string;
  metrics: BillMetric[];
  themeVariant?: ThemeVariant;
  themeSignals: string;
  pipelineSteps: PipelineStepView[];
  isProcedural: boolean;
  isLiveLegislative: boolean;
};

export type PipelineStepView = {
  id: string;
  label: string;
  description?: string;
  status: "complete" | "current" | "upcoming";
  icon?: "gavel" | "mic" | "ballot" | "default";
};

function asString(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(asString).filter(Boolean);
  }
  const single = asString(value);
  if (!single) return [];
  if (single.includes("|") || single.includes(",")) {
    return single
      .split(/[|,]/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [single];
}

function parseKeyImpacts(bill: LegislativeBill): string[] {
  const raw =
    bill.keyImpacts ||
    bill.key_impacts ||
    bill.keyPoints ||
    bill.key_points ||
    [];
  return asStringList(raw).slice(0, 4);
}

function firstPresent(...values: unknown[]): string {
  for (const value of values) {
    const next = asString(value);
    if (next) return next;
  }
  return "";
}

/**
 * Concatenate real bill taxonomy fields for theme routing.
 */
export function collectBillThemeSignals(bill: LegislativeBill = {}): string {
  const subjectList = [
    ...asStringList(bill.subject),
    ...asStringList(bill.subjects),
    ...asStringList(bill.tags),
  ];
  const stepNames = Array.isArray(bill.allSteps)
    ? bill.allSteps.map((step) => asString(step?.stepName))
    : [];

  return [
    bill.category,
    bill.primaryCategory,
    bill.primary_category,
    bill.subjectCategory,
    bill.policyArea,
    bill.policy_area,
    bill.type,
    bill.billType,
    bill.bill_type,
    bill.statusLabel,
    bill.status_label,
    bill.voteKind,
    bill.vote_kind,
    bill.voteQuestion,
    bill.vote_question,
    bill.status?.stepName,
    ...stepNames,
    ...subjectList,
  ]
    .map(asString)
    .filter(Boolean)
    .join(" ");
}

/** Stronger cues — avoids treating every bill with an "In Committee" step as Pipeline. */
const STRONG_PROCEDURAL_SIGNAL_PATTERN =
  /\b(floor\s*debate|floor\s*action|chamber\s*vote|final\s*(action|passage)|cloture|procedural|pipeline|tracking|conference\s*report|veto\s*override|engrossed|enrolled|signed into law|markup hearing)\b/i;

/**
 * Signals used specifically for procedural / pipeline theme routing.
 * Excludes the static allSteps list (every feed item includes "In Committee").
 */
export function collectProceduralSignals(bill: LegislativeBill = {}): string {
  return [
    bill.category,
    bill.primaryCategory,
    bill.primary_category,
    bill.subjectCategory,
    ...asStringList(bill.tags),
    bill.statusLabel,
    bill.status_label,
    bill.voteKind,
    bill.vote_kind,
    bill.voteQuestion,
    bill.vote_question,
    bill.status?.stepName,
  ]
    .map(asString)
    .filter(Boolean)
    .join(" ");
}

/**
 * True when a bill carries procedural tracking signals or structured steps.
 */
export function isProceduralBill(bill: LegislativeBill = {}): boolean {
  if (bill.themeVariant === "pipeline" || bill.theme_variant === "pipeline") {
    return true;
  }
  if (Array.isArray(bill.pipelineSteps) && bill.pipelineSteps.length > 0) {
    return true;
  }

  const voteKind = asString(bill.voteKind || bill.vote_kind).toLowerCase();
  if (
    voteKind === "final_passage" ||
    voteKind === "procedural" ||
    voteKind === "cloture"
  ) {
    return true;
  }

  const signals = collectProceduralSignals(bill);
  return STRONG_PROCEDURAL_SIGNAL_PATTERN.test(signals);
}

function classifyPipelineStage(
  label = ""
): "committee" | "floor" | "final" | "other" {
  const value = label.toLowerCase();
  if (/final|passage|enact|law|veto|signed|became/.test(value)) return "final";
  if (/floor|debate|chamber|vote|cloture|consideration/.test(value)) {
    return "floor";
  }
  if (/committee|markup|hearing|subcommittee|introduced|referral/.test(value)) {
    return "committee";
  }
  return "other";
}

/**
 * Map live bill status / allSteps into the three-step procedural tracker.
 */
export function resolvePipelineStepsFromBill(
  bill: LegislativeBill = {}
): PipelineStepView[] {
  if (Array.isArray(bill.pipelineSteps) && bill.pipelineSteps.length) {
    return bill.pipelineSteps.map((step, index) => ({
      id: asString(step.id) || `step-${index + 1}`,
      label: asString(step.label) || `Step ${index + 1}`,
      description: asString(step.description) || undefined,
      status: step.status || "upcoming",
      icon: step.icon || "default",
    }));
  }

  const defaults: PipelineStepView[] = [
    {
      id: "committee",
      label: "Committee",
      description: "Markup & hearings",
      status: "upcoming",
      icon: "gavel",
    },
    {
      id: "floor",
      label: "Floor Debate",
      description: "Chamber consideration",
      status: "upcoming",
      icon: "mic",
    },
    {
      id: "final",
      label: "Final Action",
      description: "Passage or veto",
      status: "upcoming",
      icon: "ballot",
    },
  ];

  const rawSteps =
    Array.isArray(bill.allSteps) && bill.allSteps.length
      ? bill.allSteps
      : bill.status
        ? [bill.status]
        : [];

  if (!rawSteps.length) {
    const label = firstPresent(
      bill.statusLabel,
      bill.status_label,
      bill.voteKind,
      bill.vote_kind,
      bill.voteQuestion,
      bill.vote_question
    );
    const stage = classifyPipelineStage(label);
    if (stage === "final") {
      defaults[0].status = "complete";
      defaults[1].status = "complete";
      defaults[2].status = "current";
    } else if (stage === "floor") {
      defaults[0].status = "complete";
      defaults[1].status = "current";
    } else {
      defaults[0].status = "current";
    }
    return defaults;
  }

  let currentStage: "committee" | "floor" | "final" = "committee";
  for (const step of rawSteps) {
    if (step?.isCurrent) {
      const stage = classifyPipelineStage(asString(step.stepName));
      if (stage !== "other") currentStage = stage;
    }
    if (step?.isCompleted) {
      const stage = classifyPipelineStage(asString(step.stepName));
      if (stage === "final") currentStage = "final";
      else if (stage === "floor" && currentStage === "committee") {
        currentStage = "floor";
      }
    }
  }

  // Prefer the last explicit current/completed cue from statusLabel too.
  const statusCue = classifyPipelineStage(
    firstPresent(
      bill.status?.stepName,
      bill.statusLabel,
      bill.status_label,
      bill.voteKind,
      bill.vote_kind
    )
  );
  if (statusCue !== "other") currentStage = statusCue;

  if (currentStage === "final") {
    defaults[0].status = "complete";
    defaults[1].status = "complete";
    defaults[2].status = "current";
  } else if (currentStage === "floor") {
    defaults[0].status = "complete";
    defaults[1].status = "current";
  } else {
    defaults[0].status = "current";
  }

  return defaults;
}

export function resolveBillCategoryLabel(bill: LegislativeBill = {}): string {
  return (
    firstPresent(
      bill.primaryCategory,
      bill.primary_category,
      bill.category,
      bill.subjectCategory,
      bill.policyArea,
      bill.policy_area,
      asStringList(bill.subject)[0],
      asStringList(bill.subjects)[0],
      asStringList(bill.tags)[0]
    ) || "Legislation"
  );
}

export function resolveBillId(bill: LegislativeBill = {}): string {
  return (
    firstPresent(
      bill.billNumber,
      bill.bill_number,
      bill.legislationNumber,
      bill.legislation_number,
      bill.billId,
      bill.bill_id,
      bill.id
    ) || "Bill"
  );
}

export function resolveBillTitle(bill: LegislativeBill = {}): string {
  return (
    firstPresent(
      bill.short_title,
      bill.shortTitle,
      bill.title,
      bill.shortPitch,
      bill.short_pitch
    ) || "Untitled legislation"
  );
}

function buildMetricsFromBill(bill: LegislativeBill): BillMetric[] {
  if (Array.isArray(bill.metrics) && bill.metrics.length) {
    return bill.metrics;
  }

  const metrics: BillMetric[] = [];
  const netCost = firstPresent(bill.netCost, bill.net_cost);
  const fiscalYear = firstPresent(bill.fiscalYear, bill.fiscal_year);
  const daysLeft = firstPresent(bill.daysLeft, bill.days_left);
  const voteProjection = firstPresent(
    bill.voteProjection,
    bill.vote_projection
  );

  if (netCost) {
    metrics.push({
      id: "net-cost",
      label: "Net Cost",
      value: netCost,
      tone: /^-|cut|save|reduc/i.test(netCost) ? "positive" : "warning",
    });
  }
  if (fiscalYear) {
    metrics.push({
      id: "fiscal-year",
      label: "Fiscal Year",
      value: fiscalYear,
      tone: "info",
    });
  }
  if (voteProjection) {
    metrics.push({
      id: "vote-projection",
      label: "Vote Projection",
      value: voteProjection,
      tone: "neutral",
    });
  }
  if (daysLeft) {
    metrics.push({
      id: "days-left",
      label: "Days Left",
      value: daysLeft,
      tone: "warning",
    });
  }

  return metrics;
}

/**
 * True for live federal/state legislative rows (excludes curated local samples).
 */
export function isLiveLegislativeBill(bill: LegislativeBill = {}): boolean {
  const level = asString(bill.level).toLowerCase();
  if (level === "federal" || level === "state") return true;

  const id = asString(bill.id || bill.billId || bill.bill_id).toLowerCase();
  if (id.startsWith("federal-") || id.startsWith("state-")) return true;

  // Reject known curated sample id prefixes from bills-feed.
  if (
    id.startsWith("city-") ||
    id.startsWith("district-") ||
    id.startsWith("county-")
  ) {
    return false;
  }

  // Structured API props without curated ids still count as live input.
  return Boolean(
    bill.billNumber ||
      bill.bill_number ||
      bill.title ||
      bill.policyArea ||
      bill.policy_area
  );
}

/**
 * Map a live bill object into ArticleCard / ThemeWrapper view props.
 * Does not invent placeholder impacts or mock categories.
 */
export function mapLiveBillToArticleProps(
  bill: LegislativeBill = {}
): ArticleBillViewModel {
  const title = resolveBillTitle(bill);
  const category = resolveBillCategoryLabel(bill);
  const keyImpacts = parseKeyImpacts(bill);
  const shortPitch = firstPresent(bill.shortPitch, bill.short_pitch, bill.summary);
  const humanHook = firstPresent(
    bill.humanHook,
    bill.human_hook,
    shortPitch,
    title
  );
  const financialSummary = firstPresent(
    bill.financialSummary,
    bill.financial_summary,
    shortPitch,
    title
  );
  const whatItDoes = firstPresent(
    bill.whatItDoes,
    bill.what_it_does,
    bill.plainSummary,
    bill.plain_summary,
    shortPitch,
    title
  );

  return {
    billId: resolveBillId(bill),
    title,
    category,
    keyImpacts,
    humanHook: humanHook || undefined,
    promptQuestion: firstPresent(bill.promptQuestion, bill.prompt_question) || undefined,
    imageSrc: firstPresent(bill.imageSrc, bill.image_src) || undefined,
    imageAlt: firstPresent(bill.imageAlt, bill.image_alt) || undefined,
    financialSummary: financialSummary || undefined,
    whatItDoes: whatItDoes || undefined,
    metrics: buildMetricsFromBill(bill),
    themeVariant: bill.themeVariant || bill.theme_variant,
    themeSignals: collectBillThemeSignals(bill),
    pipelineSteps: resolvePipelineStepsFromBill(bill),
    isProcedural: isProceduralBill(bill),
    isLiveLegislative: isLiveLegislativeBill(bill),
  };
}

export type BillsFeedResponse = {
  ok?: boolean;
  generatedAt?: string;
  items?: LegislativeBill[];
  bills?: LegislativeBill[];
  error?: string;
  coverage?: Record<string, string>;
};

/**
 * Normalize a bills-feed (or similar) payload into live legislative bills only.
 */
export function extractLiveBillsFromFeed(
  payload: BillsFeedResponse | LegislativeBill[] | null | undefined
): LegislativeBill[] {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.bills)
        ? payload.bills
        : [];

  return list.filter(isLiveLegislativeBill);
}
