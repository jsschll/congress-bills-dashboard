/**
 * Human-readable roll-call motion / vote-type labels.
 * Distinguishes Final Passage vs Motion to Recommit vs Amendment, etc.
 */

function collapseWs(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseMotion(text = "") {
  const raw = collapseWs(text);
  if (!raw) return "";
  // Preserve common short prepositions/articles after the first word.
  const small = new Set([
    "a",
    "an",
    "and",
    "as",
    "at",
    "by",
    "for",
    "in",
    "of",
    "on",
    "or",
    "the",
    "to",
  ]);
  return raw
    .split(" ")
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && small.has(lower)) return lower;
      if (/^[A-Z0-9.]+$/.test(word) && word.length <= 6) return word;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function isProceduralQuestion(voteQuestion = "", voteKind = "") {
  const kind = String(voteKind || "").toLowerCase();
  if (kind === "procedural") return true;
  const q = collapseWs(voteQuestion).toLowerCase();
  if (!q) return false;
  return /motion to (adjourn|table|reconsider|recommit)|previous question|suspend the rules|approve the journal|quorum call|ordering a second|committee of the whole|election of speaker/.test(
    q
  );
}

/**
 * Prefer the official vote question when it names the motion; else vote_kind.
 * @param {{ voteQuestion?: string, vote_question?: string, voteKind?: string, vote_kind?: string, result?: string }} input
 * @returns {string}
 */
function formatVoteMotionLabel(input = {}) {
  const voteQuestion = collapseWs(
    input.voteQuestion || input.vote_question || input.question || ""
  );
  const voteKind = String(
    input.voteKind || input.vote_kind || ""
  ).toLowerCase();

  if (voteQuestion) {
    const lower = voteQuestion.toLowerCase();
    // Normalize a few common Clerk / Senate phrasings to short badges.
    if (/\bon passage\b|\bfinal passage\b/.test(lower)) return "Final Passage";
    if (/\bmotion to recommit\b/.test(lower)) return "On Motion to Recommit";
    if (/\bmotion to table\b/.test(lower)) return "On Motion to Table";
    if (/\bmotion to reconsider\b/.test(lower)) return "On Motion to Reconsider";
    if (/\bmotion to proceed\b/.test(lower)) return "On Motion to Proceed";
    if (/\bprevious question\b/.test(lower)) return "On Ordering the Previous Question";
    if (/\bsuspend(?:ing)? the rules\b/.test(lower)) return "On Motion to Suspend the Rules";
    if (/\bagreeing to the amendment\b|\bon agreeing to the amendment\b/.test(lower)) {
      return "On Agreeing to the Amendment";
    }
    if (/\bamendment\b|\bamdt\.?\b/.test(lower) && voteQuestion.length <= 90) {
      return titleCaseMotion(voteQuestion.replace(/^on\s+/i, "On "));
    }
    if (voteQuestion.length <= 72) {
      const withOn = /^on\s+/i.test(voteQuestion)
        ? voteQuestion
        : `On ${voteQuestion}`;
      return titleCaseMotion(withOn.replace(/^On On\s+/i, "On "));
    }
  }

  if (voteKind === "final_passage") return "Final Passage";
  if (voteKind === "amendment") return "On Agreeing to the Amendment";
  if (voteKind === "procedural") return "Procedural Vote";
  if (voteKind === "bill") return "Passage Vote";
  return "Floor Vote";
}

/**
 * @param {object} input
 * @returns {{ label: string, detail: string, isProcedural: boolean, voteQuestion: string, voteKind: string }}
 */
function describeVoteMotion(input = {}) {
  const voteQuestion = collapseWs(
    input.voteQuestion || input.vote_question || input.question || ""
  );
  const voteKind = String(
    input.voteKind || input.vote_kind || ""
  ).toLowerCase();
  const label = formatVoteMotionLabel(input);
  const isProcedural = isProceduralQuestion(voteQuestion, voteKind);
  const detail = isProcedural
    ? label.toLowerCase().startsWith("procedural")
      ? label
      : `Procedural Vote: ${label}`
    : label;
  return {
    label,
    detail,
    isProcedural,
    voteQuestion,
    voteKind: voteKind || "",
  };
}

module.exports = {
  collapseWs,
  describeVoteMotion,
  formatVoteMotionLabel,
  isProceduralQuestion,
  titleCaseMotion,
};
