/**
 * KEY IMPACTS summarizer helpers.
 * Exactly 2 verb-led, plain-English bullets grounded in bill text.
 */

const ACTION_VERBS = [
  "Boosts",
  "Establishes",
  "Cuts",
  "Protects",
  "Updates",
  "Increases",
  "Expands",
  "Bans",
  "Creates",
  "Funds",
  "Requires",
  "Limits",
  "Strengthens",
  "Removes",
  "Blocks",
  "Authorizes",
  "Raises",
  "Lowers",
  "Restores",
  "Ends",
  "Changes",
  "Shifts",
  "Adjusts",
  "Directs",
  "Sets",
  "Recognizes",
  "Supports",
  "Encourages",
  "Promotes",
  "Addresses",
];

const KEY_IMPACTS_SYSTEM_PROMPT = `You are a plain-English legislative summarizer.
Given a bill's title, policy category, and full text, generate EXACTLY 2 high-impact, plain-English bullet points under a KEY IMPACTS section.

CRITICAL RULES:
1. START WITH VERBS: Every bullet point MUST begin with a strong, active verb (e.g., "Boosts...", "Establishes...", "Cuts...", "Protects...", "Updates...").
2. NO LEGALESE: Write for a general audience. Explain real-world outcomes and practical consequences in under 10 words per bullet.
3. NO REPETITION: Do NOT repeat the bill title or official name inside the bullets.
4. ACCURACY: Base the summary strictly on the actual bill text provided. Do NOT use generic placeholder text or invent details.

OUTPUT FORMAT (JSON):
{
  "key_impacts": [
    "Active verb phrase describing primary impact",
    "Active verb phrase describing secondary impact or rule change"
  ]
}`;

function collapseWs(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(text = "") {
  const protectedText = collapseWs(text).replace(
    /\b(No|Nos|Mr|Mrs|Ms|Dr|Sen|Rep|vs|etc|U\.S|Dept|Inc|Corp|Co)\./gi,
    "$1\u2024"
  );
  return protectedText
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.replace(/\u2024/g, ".").trim())
    .filter(Boolean);
}

function clampWords(text = "", maxWords = 10) {
  const words = collapseWs(text)
    .replace(/[.!?]+$/, "")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ").replace(/[,:;–—-]+$/, "");
}

function startsWithActionVerb(text = "") {
  const first = collapseWs(text)
    .split(/\s+/)[0]
    ?.replace(/[^a-z]/gi, "");
  if (!first) return false;
  return ACTION_VERBS.some(
    (verb) => verb.toLowerCase() === first.toLowerCase()
  );
}

function pickActionVerb(text = "") {
  const hay = String(text || "").toLowerCase();
  const rules = [
    [/boost|increas|rais|expand|fund|appropriat/, "Boosts"],
    [/cut|reduc|slash|eliminat|\bend\b|repeal/, "Cuts"],
    [/protect|safeguard|defend/, "Protects"],
    [/establish|creat|authoriz|enact/, "Establishes"],
    [/\bban\b|prohibit|block|bar\b/, "Bans"],
    [/require|mandat|compel/, "Requires"],
    [/limit|restrict|\bcap\b/, "Limits"],
    [/strengthen|toughen/, "Strengthens"],
    [/remov|strip/, "Removes"],
    [/restor|reinstat/, "Restores"],
    [/recogniz/, "Recognizes"],
    [/support|encourage|promote/, "Supports"],
    [/update|amend|revis/, "Updates"],
    [/direct|order/, "Directs"],
    [/change|shift|adjust/, "Changes"],
  ];
  for (const [re, verb] of rules) {
    if (re.test(hay)) return verb;
  }
  return "Updates";
}

function stripTitleEcho(text = "", title = "") {
  let out = collapseWs(text);
  const titleClean = collapseWs(title);
  if (!out) return "";
  if (titleClean) {
    const lowerOut = out.toLowerCase();
    const lowerTitle = titleClean.toLowerCase();
    if (lowerOut === lowerTitle) return "";
    if (lowerOut.startsWith(lowerTitle)) {
      out = out.slice(titleClean.length).replace(/^[\s.:;,—–-]+/, "").trim();
    }
    // Drop short title fragments that leak into the bullet.
    const titleWords = lowerTitle.split(/\s+/).filter((w) => w.length > 3);
    if (titleWords.length >= 4) {
      const overlap =
        titleWords.filter((w) => lowerOut.includes(w)).length /
        titleWords.length;
      if (overlap >= 0.85 && out.split(/\s+/).length <= titleWords.length + 2) {
        return "";
      }
    }
  }
  return out;
}

function leadWithActionVerb(text = "", title = "") {
  let out = stripTitleEcho(text, title);
  if (!out) return "";
  out = out
    .replace(
      /^(this (bill|resolution|amendment|measure)|the bill|a bill|an act)\s+/i,
      ""
    )
    .replace(/^(it|this|that)\s+(also\s+)?/i, "")
    .replace(/^would\s+/i, "")
    .replace(/^to\s+/i, "")
    .trim();
  if (!out) return "";

  if (startsWithActionVerb(out)) {
    return clampWords(out.charAt(0).toUpperCase() + out.slice(1), 10);
  }

  const stemMatch = out.match(
    /^(boost|establish|cut|protect|update|increase|expand|ban|create|fund|require|limit|strengthen|remove|block|authorize|raise|lower|restore|end|change|shift|adjust|direct|set|recognize|support|encourage|promote|address)s?\b/i
  );
  if (stemMatch) {
    const stem = stemMatch[1].toLowerCase();
    const special = {
      boost: "Boosts",
      establish: "Establishes",
      cut: "Cuts",
      protect: "Protects",
      update: "Updates",
      increase: "Increases",
      expand: "Expands",
      ban: "Bans",
      create: "Creates",
      fund: "Funds",
      require: "Requires",
      limit: "Limits",
      strengthen: "Strengthens",
      remove: "Removes",
      block: "Blocks",
      authorize: "Authorizes",
      raise: "Raises",
      lower: "Lowers",
      restore: "Restores",
      end: "Ends",
      change: "Changes",
      shift: "Shifts",
      adjust: "Adjusts",
      direct: "Directs",
      set: "Sets",
      recognize: "Recognizes",
      support: "Supports",
      encourage: "Encourages",
      promote: "Promotes",
      address: "Addresses",
    };
    const lead = special[stem] || pickActionVerb(out);
    return clampWords(`${lead}${out.slice(stemMatch[0].length)}`, 10);
  }

  const verb = pickActionVerb(out);
  const rest = out.charAt(0).toLowerCase() + out.slice(1);
  return clampWords(`${verb} ${rest}`, 10);
}

function isPlaceholderImpact(text = "") {
  const lower = collapseWs(text).toLowerCase();
  if (!lower) return true;
  return (
    /updates a federal policy rule/.test(lower) ||
    /changes how a federal policy/.test(lower) ||
    /this vote changes how a federal policy/.test(lower) ||
    /affects ordinary people, workers, or communities/.test(lower) ||
    /supporters and opponents disagree/.test(lower) ||
    /people affected by this policy/.test(lower) ||
    /establishes new federal requirements for this policy/.test(lower) ||
    /updates rules tied to this measure/.test(lower) ||
    /changes how the measure works/.test(lower)
  );
}

function parseKeyImpactsList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => collapseWs(item)).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => collapseWs(item)).filter(Boolean);
      }
      if (parsed && Array.isArray(parsed.key_impacts)) {
        return parsed.key_impacts.map((item) => collapseWs(item)).filter(Boolean);
      }
      if (parsed && Array.isArray(parsed.key_points)) {
        return parsed.key_points.map((item) => collapseWs(item)).filter(Boolean);
      }
    } catch {
      return value
        .split(/\n|•|;/)
        .map((part) => collapseWs(part.replace(/^[-*]\s*/, "")))
        .filter(Boolean);
    }
  }
  if (value && typeof value === "object") {
    if (Array.isArray(value.key_impacts)) {
      return value.key_impacts.map((item) => collapseWs(item)).filter(Boolean);
    }
    if (Array.isArray(value.key_points)) {
      return value.key_points.map((item) => collapseWs(item)).filter(Boolean);
    }
  }
  return [];
}

/**
 * Normalize to exactly 2 verb-led, ≤10-word KEY IMPACT bullets.
 * Never invent placeholder policy boilerplate.
 */
function normalizeKeyImpacts(
  value,
  {
    title = "",
    category = "",
    sourceText = "",
    fallbacks = [],
  } = {}
) {
  const titleClean = collapseWs(title);
  let points = parseKeyImpactsList(value)
    .filter((point) => point && !isPlaceholderImpact(point))
    .map((point) => leadWithActionVerb(point, titleClean))
    .filter((point) => point && !isPlaceholderImpact(point));

  for (const fallback of fallbacks) {
    if (points.length >= 2) break;
    if (isPlaceholderImpact(fallback)) continue;
    const text = leadWithActionVerb(fallback, titleClean);
    if (text && !isPlaceholderImpact(text) && !points.includes(text)) {
      points.push(text);
    }
  }

  if (points.length < 2) {
    const grounded = splitSentences(sourceText)
      .concat(splitSentences(category))
      .map((sentence) => leadWithActionVerb(sentence, titleClean))
      .filter((point) => point && !isPlaceholderImpact(point));
    for (const point of grounded) {
      if (points.length >= 2) break;
      if (!points.includes(point)) points.push(point);
    }
  }

  // Prefer grounded source sentences; avoid canned boilerplate.
  while (points.length < 2) {
    const sentences = splitSentences(sourceText);
    const candidate = leadWithActionVerb(
      sentences[points.length] || sentences[0] || "",
      titleClean
    );
    if (candidate && !isPlaceholderImpact(candidate) && !points.includes(candidate)) {
      points.push(candidate);
      continue;
    }
    break;
  }

  return points.slice(0, 2).map((point) => clampWords(point, 10));
}

function buildKeyImpactsUserPrompt({
  title = "",
  category = "",
  fullText = "",
} = {}) {
  const billTitle = collapseWs(title) || "Untitled measure";
  const policyCategory = collapseWs(category) || "Congress";
  const text =
    collapseWs(fullText).slice(0, 8000) || "(No bill text available.)";
  return `Bill title: ${billTitle}
Policy category: ${policyCategory}

Full bill / CRS text (use for facts only — do not invent):
"""
${text}
"""

Return ONLY valid JSON:
{
  "key_impacts": [
    "Active verb phrase under 10 words",
    "Active verb phrase under 10 words"
  ]
}

Remember: exactly 2 bullets, each starts with an active verb, no title repetition, no placeholders.`;
}

function buildKeyImpactsPrompt(input = {}) {
  return {
    system: KEY_IMPACTS_SYSTEM_PROMPT,
    user: buildKeyImpactsUserPrompt(input),
  };
}

module.exports = {
  ACTION_VERBS,
  KEY_IMPACTS_SYSTEM_PROMPT,
  buildKeyImpactsPrompt,
  buildKeyImpactsUserPrompt,
  normalizeKeyImpacts,
  leadWithActionVerb,
  startsWithActionVerb,
  isPlaceholderImpact,
  parseKeyImpactsList,
  clampWords,
};
