/**
 * Vanilla Representative Scorecard dashboard.
 * Mirrors components/RepresentativesScorecardView.tsx for the static host.
 */

(function (global) {
  const SESSION_KEY = "article1.scorecardSession";
  const ENDPOINT = "/api/representatives/lookup";

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatUsd(amount) {
    if (amount == null || Number.isNaN(Number(amount))) return "—";
    const n = Number(amount);
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: n >= 1000 ? 0 : 2,
      }).format(n);
    } catch {
      return `$${Math.round(n).toLocaleString("en-US")}`;
    }
  }

  function formatPct(value) {
    if (value == null || Number.isNaN(Number(value))) return "—";
    return `${Math.round(Number(value) * 10) / 10}%`;
  }

  function partyKind(party) {
    const value = String(party || "").toLowerCase();
    if (value.startsWith("dem")) return "democrat";
    if (value.startsWith("rep") || value.includes("gop")) return "republican";
    if (value.startsWith("ind")) return "independent";
    return "other";
  }

  function partyLabel(kind, raw) {
    if (kind === "democrat") return "Democrat";
    if (kind === "republican") return "Republican";
    if (kind === "independent") return "Independent";
    return String(raw || "Nonpartisan");
  }

  function readQuery() {
    const params = new URLSearchParams(global.location.search);
    return {
      id: (params.get("id") || "").trim() || null,
      zipCode:
        (params.get("zipCode") || params.get("zip") || "").trim() || null,
      address:
        (params.get("address") || params.get("q") || "").trim() || null,
    };
  }

  function readSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeSession(payload) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    } catch {
      /* ignore quota */
    }
  }

  function setStatus(message, type = "loading") {
    const el = $("scorecard-status");
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || "";
    el.dataset.type = type;
  }

  function districtLabel(profile) {
    const state = String(profile.state || "").toUpperCase();
    if (profile.chamber === "Senate") {
      return [state, "U.S. Senate"].filter(Boolean).join(" · ");
    }
    const district = String(profile.district || "").replace(/^0+/, "");
    if (!state) return profile.chamber || "Federal office";
    return district ? `${state}-${district}` : `${state} · At-Large`;
  }

  function tabLabel(rep, senateIndex) {
    if (rep.profile.chamber === "Senate") return `Senate ${senateIndex}`;
    if (rep.profile.chamber === "House") {
      const district = String(rep.profile.district || "").replace(/^0+/, "");
      const state = String(rep.profile.state || "").toUpperCase();
      return district ? `House · ${state}-${district}` : "House Representative";
    }
    return rep.profile.name;
  }

  function voteTone(position) {
    const raw = String(position || "").toUpperCase();
    if (raw === "YES" || raw === "YEA" || raw === "AYE") return "yes";
    if (raw === "NO" || raw === "NAY") return "no";
    return "neutral";
  }

  function renderHero(el, profile) {
    if (!el || !profile) return;
    const kind = partyKind(profile.party);
    const phone = String(profile.phone || "").replace(/[^\d+]/g, "");
    const site = String(profile.website || "").trim();
    const siteUrl = site
      ? /^https?:\/\//i.test(site)
        ? site
        : `https://${site}`
      : "";
    const photo = profile.photoUrl
      ? `<img class="scorecard-hero__photo" src="${escapeHtml(
          profile.photoUrl
        )}" alt="" />`
      : `<div class="scorecard-hero__photo scorecard-hero__photo--fallback" aria-hidden="true">${escapeHtml(
          String(profile.name || "")
            .split(/\s+/)
            .slice(0, 2)
            .map((p) => p[0] || "")
            .join("")
        )}</div>`;

    el.innerHTML = `
      <div class="scorecard-hero__main">
        ${photo}
        <div class="scorecard-hero__copy">
          <div class="scorecard-hero__badges">
            <span class="scorecard-party is-${kind}">${escapeHtml(
              partyLabel(kind, profile.party)
            )}</span>
            ${
              profile.chamber
                ? `<span class="scorecard-hero__chamber">${escapeHtml(
                    profile.chamber
                  )}</span>`
                : ""
            }
          </div>
          <h2 class="scorecard-hero__name">${escapeHtml(profile.name)}</h2>
          <p class="scorecard-hero__meta">
            ${escapeHtml(districtLabel(profile))}
            ${
              profile.nextElectionYear
                ? ` · Next election ${escapeHtml(profile.nextElectionYear)}`
                : ""
            }
          </p>
          <div class="scorecard-hero__actions">
            ${
              phone
                ? `<a class="scorecard-btn" href="tel:${escapeHtml(
                    phone
                  )}">Call</a>`
                : ""
            }
            ${
              siteUrl
                ? `<a class="scorecard-btn" href="${escapeHtml(
                    siteUrl
                  )}" target="_blank" rel="noopener noreferrer">Official site</a>`
                : ""
            }
          </div>
        </div>
      </div>
      <div class="scorecard-hero__match" aria-label="Action Match Score">
        <div class="scorecard-match-ring"><span>—</span></div>
        <p>Action Match</p>
      </div>
    `;
  }

  function renderDonor(el, finance) {
    if (!el) return;
    if (!finance) {
      el.innerHTML =
        '<p class="scorecard-empty">Campaign finance data is not available yet.</p>';
      return;
    }
    const slices = [
      {
        key: "small",
        label: "Small Donors (<$200)",
        pct: Number(finance.smallDonorPct) || 0,
      },
      {
        key: "large",
        label: "Large Donors",
        pct: Number(finance.largeDonorPct) || 0,
      },
      { key: "pac", label: "PACs", pct: Number(finance.pacPct) || 0 },
      {
        key: "self",
        label: "Self-Funding",
        pct: Number(finance.selfFundingPct) || 0,
      },
    ];
    const industries = Array.isArray(finance.topIndustries)
      ? finance.topIndustries.slice(0, 5)
      : [];
    const top = industries[0];

    el.innerHTML = `
      <p class="scorecard-card__eyebrow">Donor Alignment</p>
      <h3 class="scorecard-card__title">Where the money comes from</h3>
      <p class="scorecard-card__meta">
        ${
          finance.totalRaised != null
            ? `${escapeHtml(formatUsd(finance.totalRaised))}${
                finance.cycle ? ` · ${escapeHtml(finance.cycle)}` : ""
              }`
            : "Cycle totals unavailable"
        }
      </p>
      <div class="scorecard-bar" role="img" aria-label="Funding mix">
        ${slices
          .map((slice) =>
            slice.pct > 0
              ? `<span class="is-${slice.key}" style="width:${slice.pct}%"></span>`
              : ""
          )
          .join("")}
      </div>
      <ul class="scorecard-legend">
        ${slices
          .map(
            (slice) => `<li>
              <span class="swatch is-${slice.key}"></span>
              <span>${escapeHtml(slice.label)}</span>
              <strong>${escapeHtml(formatPct(slice.pct))}</strong>
            </li>`
          )
          .join("")}
      </ul>
      <h4 class="scorecard-subtitle">Top 5 industry contributors</h4>
      ${
        industries.length
          ? `<ol class="scorecard-industries">
              ${industries
                .map(
                  (item, index) => `<li>
                    <span>${index + 1}. ${escapeHtml(item.name)}</span>
                    <strong>${escapeHtml(formatUsd(item.amount))}</strong>
                  </li>`
                )
                .join("")}
            </ol>`
          : `<p class="scorecard-empty">No industry contributor rows yet.</p>`
      }
      ${
        top
          ? `<aside class="scorecard-callout">
              <span class="scorecard-callout__badge">Money vs. Vote</span>
              <p><strong>${escapeHtml(top.name)}</strong> · ${escapeHtml(
                formatUsd(top.amount)
              )}</p>
              <p>Compare this industry’s funding with related roll-call votes in the feed.</p>
            </aside>`
          : ""
      }
    `;
  }

  function renderAttendance(el, attendance) {
    if (!el) return;
    if (!attendance) {
      el.innerHTML =
        '<p class="scorecard-empty">Attendance stats are not available yet.</p>';
      return;
    }
    const missedPct =
      attendance.missedVotePct != null
        ? Number(attendance.missedVotePct)
        : attendance.totalVotes
          ? Math.round(
              (attendance.missedVotes / attendance.totalVotes) * 1000
            ) / 10
          : null;
    const attendancePct =
      missedPct == null ? null : Math.round((100 - missedPct) * 10) / 10;
    const avg = { missed: 2.8, attendance: 97.2, sponsored: 18, bipartisan: 24 };
    const rows = [
      {
        label: "Missed votes",
        member:
          attendance.missedVotes == null
            ? "—"
            : `${attendance.missedVotes}${
                missedPct == null ? "" : ` (${formatPct(missedPct)})`
              }`,
        average: formatPct(avg.missed),
      },
      {
        label: "Attendance rate",
        member: formatPct(attendancePct),
        average: formatPct(avg.attendance),
      },
      {
        label: "Bills sponsored",
        member:
          attendance.sponsoredBillsCount == null
            ? "—"
            : String(attendance.sponsoredBillsCount),
        average: String(avg.sponsored),
      },
      {
        label: "Bipartisan cosponsorship",
        member: formatPct(attendance.bipartisanCosponsorPct),
        average: formatPct(avg.bipartisan),
      },
    ];

    el.innerHTML = `
      <p class="scorecard-card__eyebrow">Attendance & Activity</p>
      <h3 class="scorecard-card__title">How often they show up</h3>
      <div class="scorecard-table">
        <div class="scorecard-table__head">
          <span>Metric</span><span>Member</span><span>Congress avg</span>
        </div>
        ${rows
          .map(
            (row) => `<div class="scorecard-table__row">
              <span>${escapeHtml(row.label)}</span>
              <strong>${escapeHtml(row.member)}</strong>
              <span>${escapeHtml(row.average)}</span>
            </div>`
          )
          .join("")}
      </div>
    `;
  }

  function renderVotes(el, votes, query) {
    if (!el) return;
    const q = String(query || "").trim().toLowerCase();
    const filtered = (votes || []).filter((vote) => {
      if (!q) return true;
      const haystack = [
        vote.billNumber,
        vote.title,
        vote.plainEnglishSummary,
        vote.category,
        vote.impacts?.wallet,
        vote.impacts?.community,
        vote.impacts?.rights,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    const topics = [
      ...new Set(
        (votes || [])
          .map((vote) => String(vote.category || "").trim())
          .filter(Boolean)
      ),
    ];

    el.innerHTML = `
      <div class="scorecard-votes__header">
        <div>
          <p class="scorecard-card__eyebrow">Truth in Voting</p>
          <h3 class="scorecard-card__title">Recent roll calls</h3>
        </div>
        <label class="scorecard-topic">
          <span>Topic</span>
          <select id="scorecard-topic-filter">
            <option value="all">All topics</option>
            ${topics
              .map(
                (topic) =>
                  `<option value="${escapeHtml(topic)}">${escapeHtml(
                    topic
                  )}</option>`
              )
              .join("")}
          </select>
        </label>
      </div>
      ${
        filtered.length
          ? `<ul class="scorecard-vote-list">
              ${filtered
                .map((vote) => {
                  const tone = voteTone(vote.votePosition);
                  const impacts = [
                    ["Wallet", vote.impacts?.wallet],
                    ["Community", vote.impacts?.community],
                    ["Rights", vote.impacts?.rights],
                  ].filter(([, text]) => text);
                  return `<li class="scorecard-vote">
                    <div class="scorecard-vote__top">
                      <div>
                        ${
                          vote.billNumber
                            ? `<span class="scorecard-bill">${escapeHtml(
                                vote.billNumber
                              )}</span>`
                            : ""
                        }
                        <h4>${escapeHtml(
                          vote.title || "Congressional roll call"
                        )}</h4>
                      </div>
                      <span class="scorecard-vote-pill is-${tone}">${escapeHtml(
                        vote.votePosition || "—"
                      )}</span>
                    </div>
                    ${
                      vote.plainEnglishSummary
                        ? `<p>${escapeHtml(vote.plainEnglishSummary)}</p>`
                        : ""
                    }
                    ${
                      impacts.length
                        ? `<div class="scorecard-impacts">
                            ${impacts
                              .map(
                                ([label, text]) =>
                                  `<span title="${escapeHtml(
                                    text
                                  )}"><strong>${escapeHtml(
                                    label
                                  )}</strong> ${escapeHtml(text)}</span>`
                              )
                              .join("")}
                          </div>`
                        : ""
                    }
                  </li>`;
                })
                .join("")}
            </ul>`
          : `<p class="scorecard-empty">No roll calls match this filter.</p>`
      }
    `;

    const topicSelect = $("scorecard-topic-filter");
    if (topicSelect) {
      topicSelect.addEventListener("change", () => {
        const topic = topicSelect.value;
        const next =
          topic === "all"
            ? votes
            : (votes || []).filter(
                (vote) =>
                  String(vote.category || "").toLowerCase() ===
                  topic.toLowerCase()
              );
        renderVotes(el, next, query);
      });
    }
  }

  function renderTabs(tabsEl, representatives, activeId, onSelect) {
    if (!tabsEl) return;
    let senateIndex = 0;
    tabsEl.hidden = representatives.length === 0;
    tabsEl.innerHTML = representatives
      .map((rep) => {
        if (rep.profile.chamber === "Senate") senateIndex += 1;
        const selected = rep.profile.id === activeId;
        return `<button type="button" class="scorecard-tab${
          selected ? " is-active" : ""
        }" role="tab" aria-selected="${selected}" data-id="${escapeHtml(
          rep.profile.id
        )}">
          <span class="scorecard-tab__label">${escapeHtml(
            tabLabel(rep, senateIndex)
          )}</span>
          <span class="scorecard-tab__name">${escapeHtml(
            rep.profile.name
          )}</span>
        </button>`;
      })
      .join("");

    tabsEl.querySelectorAll(".scorecard-tab").forEach((button) => {
      button.addEventListener("click", () => onSelect(button.dataset.id));
    });
  }

  async function fetchBundle({ id, zipCode, address }) {
    const params = new URLSearchParams();
    if (id) params.set("id", id);
    if (zipCode) params.set("zipCode", zipCode);
    if (address) params.set("address", address);
    const response = await fetch(`${ENDPOINT}?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.error || `Lookup failed (${response.status})`);
    }
    return payload;
  }

  function mountRepresentativesScorecard() {
    const query = readQuery();
    const session = readSession();
    const heading = $("scorecard-heading");
    const lede = $("scorecard-lede");
    const tabs = $("scorecard-tabs");
    const panel = $("scorecard-panel");
    const search = $("scorecard-vote-search");

    let state = {
      data: null,
      activeId: query.id || session?.activeId || null,
      voteQuery: "",
    };

    function paint() {
      const reps = state.data?.representatives || [];
      const active =
        reps.find((rep) => rep.profile.id === state.activeId) || reps[0] || null;
      if (!active) {
        panel.hidden = true;
        return;
      }
      panel.hidden = false;
      state.activeId = active.profile.id;
      renderTabs(tabs, reps, state.activeId, (id) => {
        state.activeId = id;
        const url = new URL(global.location.href);
        url.searchParams.set("id", id);
        global.history.replaceState({}, "", url.toString());
        writeSession({
          ...(state.data || {}),
          activeId: id,
          query: state.data?.query || query,
        });
        paint();
      });
      renderHero($("scorecard-hero"), active.profile);
      renderDonor($("scorecard-donor"), active.campaignFinance);
      renderAttendance($("scorecard-attendance"), active.attendance);
      renderVotes($("scorecard-votes"), active.recentVotes, state.voteQuery);
    }

    if (search) {
      search.addEventListener("input", () => {
        state.voteQuery = search.value;
        const reps = state.data?.representatives || [];
        const active =
          reps.find((rep) => rep.profile.id === state.activeId) || reps[0];
        if (active) {
          renderVotes($("scorecard-votes"), active.recentVotes, state.voteQuery);
        }
      });
    }

    (async () => {
      setStatus("Loading scorecards…", "loading");
      panel.hidden = true;
      tabs.hidden = true;

      try {
        let payload = null;
        const zipCode = query.zipCode || session?.query?.zipCode || null;
        const address = query.address || session?.query?.address || null;
        const id = query.id || session?.activeId || null;

        if (!id && !zipCode && !address && session?.representatives?.length) {
          payload = session;
        } else if (!id && !zipCode && !address) {
          setStatus(
            "Start from the home page ZIP lookup, or open with ?zipCode= or ?id=.",
            "error"
          );
          return;
        } else {
          payload = await fetchBundle({ id, zipCode, address });
        }

        state.data = payload;
        state.activeId =
          id ||
          payload.activeId ||
          payload.representatives?.[0]?.profile?.id ||
          null;

        writeSession({
          ...payload,
          activeId: state.activeId,
        });

        if (heading) {
          heading.textContent =
            payload.location?.formattedAddress ||
            payload.location?.state ||
            "Your federal representatives";
        }
        if (lede && payload.counts) {
          lede.textContent = `${payload.counts.total || 0} federal representative${
            payload.counts.total === 1 ? "" : "s"
          } — switch tabs to compare donor alignment, attendance, and votes.`;
        }

        setStatus("", "loading");
        paint();
      } catch (error) {
        setStatus(error?.message || "Could not load scorecards.", "error");
      }
    })();
  }

  global.mountRepresentativesScorecard = mountRepresentativesScorecard;
  global.ARTICLE1_SCORECARD_SESSION_KEY = SESSION_KEY;
})(typeof window !== "undefined" ? window : globalThis);
