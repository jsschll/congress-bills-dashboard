const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS",
  "KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY",
  "NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV",
  "WI","WY","DC",
];

const LEVEL_ORDER = ["federal", "state", "county", "city", "school", "local"];

// User-facing buckets from highest to lowest authority.
const DISPLAY_LEVEL_ORDER = ["federal", "state", "county", "city", "school"];

const LEVEL_LABELS = {
  federal: "Federal",
  state: "State",
  county: "County",
  city: "City / Municipal",
  school: "School Board / District",
  local: "City / Municipal",
  municipal: "City / Municipal",
};

function toDisplayLevel(level) {
  if (level === "local" || level === "municipal") return "city";
  if (DISPLAY_LEVEL_ORDER.includes(level)) return level;
  return "city";
}

function escapePoliticianHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function levelLabel(level) {
  return LEVEL_LABELS[level] || LEVEL_LABELS[toDisplayLevel(level)] || "Other";
}

function readableOfficeTitle(value) {
  if (value == null || value === "") return "";
  if (typeof value === "object") {
    return readableOfficeTitle(
      value.name_formal || value.name || value.title || value.role || ""
    );
  }
  const text = String(value).trim();
  if (!text || text.startsWith("{") || text.startsWith("[")) return "";
  if (text === "[object Object]") return "";
  if (/^ocd-/i.test(text)) return "";
  return text;
}

function formatDistrictMeta(district, politician = {}) {
  const raw = String(district || "").trim();
  if (!raw) return "";
  if (/^ocd-/i.test(raw)) return "";
  if (/^united states$/i.test(raw)) return "";
  if (/^\d{5,}$/.test(raw)) return "";
  if (/^statewide$/i.test(raw)) return "Statewide";
  if (/^lea\s+/i.test(raw)) return raw;
  if (
    politician.chamber === "senate" &&
    politician.level === "federal" &&
    /^[A-Z]{2}$/.test(raw)
  ) {
    return "Statewide";
  }
  return `Dist. ${raw}`;
}

function chamberLabel(chamber, politician = {}) {
  const officeTitle = readableOfficeTitle(
    politician.office_title || politician.metadata?.office_title
  );
  if (officeTitle) return officeTitle;

  switch (chamber) {
    case "house":
      return "U.S. House";
    case "senate":
      return "U.S. Senate";
    case "executive":
      return "Executive";
    case "governor":
      return "Governor";
    case "lieutenant_governor":
      return "Lieutenant Governor";
    case "attorney_general":
      return "Attorney General";
    case "state_executive":
      return "State Executive";
    case "judicial":
      return "Judge";
    case "sheriff":
      return "Sheriff";
    case "trustee":
      return "Trustee";
    case "county_commissioner":
      return "County Commissioner";
    case "state_house":
      return "State House";
    case "state_senate":
      return "State Senate";
    case "mayor":
      return "Mayor";
    case "city_council":
      return "City Council";
    case "county":
      return "County office";
    case "school_board":
      return "School Board";
    case "school_district":
      return "School District";
    default:
      return chamber
        ? String(chamber).replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())
        : "Office";
  }
}

function partyClass(party) {
  const value = String(party || "").toLowerCase();
  if (value.startsWith("dem")) return "party--dem";
  if (value.startsWith("rep")) return "party--rep";
  return "party--other";
}

const LOOKUP_API_PATH = "/api/lookup-representatives";
const LOOKUP_API_FALLBACK =
  "https://congress-bills-dashboard.vercel.app/api/lookup-representatives";

async function fetchLookupRepresentatives(endpoint, query) {
  const response = await fetch(
    `${endpoint}?q=${encodeURIComponent(query)}`
  );
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function lookupRepresentatives(query) {
  const q = query.trim();
  if (!q) throw new Error("Enter an address or ZIP code.");

  let { response, data } = await fetchLookupRepresentatives(LOOKUP_API_PATH, q);

  // GitHub Pages / static hosts have no Vercel serverless routes — retry production API.
  if (!response.ok && !LOOKUP_API_PATH.startsWith("http")) {
    const absoluteOrigin =
      typeof location !== "undefined" &&
      location.origin &&
      !location.origin.includes("vercel.app")
        ? LOOKUP_API_FALLBACK
        : null;
    if (absoluteOrigin) {
      ({ response, data } = await fetchLookupRepresentatives(absoluteOrigin, q));
    }
  }

  if (!response.ok) {
    throw new Error(data.error || `Lookup failed (${response.status})`);
  }
  return data;
}

async function upsertPoliticianRecord(politician) {
  const client = getSupabase();
  if (!client) return null;

  const officeTitle =
    politician.office_title ||
    politician.metadata?.office_title ||
    politician.chamber ||
    null;

  const payload = {
    p_external_key: politician.external_key,
    p_bioguide_id: politician.bioguide_id || null,
    p_level: politician.level,
    p_chamber: politician.chamber || null,
    p_name: politician.name,
    p_party: politician.party || null,
    p_state: politician.state || null,
    p_district: politician.district || null,
    p_photo_url: politician.photo_url || null,
    p_website_url: politician.website_url || null,
    p_phone: politician.phone || null,
    p_source: politician.source || "app",
    p_metadata: {
      ...(politician.metadata || {}),
      office_title: officeTitle,
    },
    p_office_title: officeTitle,
  };

  let { data, error } = await client.rpc("upsert_politician", payload);
  if (error && /p_office_title|function.*upsert_politician/i.test(error.message || "")) {
    delete payload.p_office_title;
    ({ data, error } = await client.rpc("upsert_politician", payload));
  }

  if (error) {
    console.error(error);
    return null;
  }
  return data;
}

async function loadFollowedPoliticianIds(userId) {
  const client = getSupabase();
  if (!client || !userId) return new Set();
  const { data, error } = await client
    .from("followed_politicians")
    .select("politician_id")
    .eq("user_id", userId);
  if (error) {
    console.error(error);
    return new Set();
  }
  return new Set((data || []).map((row) => row.politician_id));
}

async function followPolitician(userId, politicianId) {
  const client = getSupabase();
  const { error } = await client.from("followed_politicians").insert({
    user_id: userId,
    politician_id: politicianId,
  });
  if (error) throw error;
}

async function unfollowPolitician(userId, politicianId) {
  const client = getSupabase();
  const { error } = await client
    .from("followed_politicians")
    .delete()
    .eq("user_id", userId)
    .eq("politician_id", politicianId);
  if (error) throw error;
}

function politicianLevels(politician) {
  const fromFields = [
    ...(politician.levels || []),
    ...(politician.metadata?.levels || []),
    politician.level,
  ].filter(Boolean);
  const unique = [
    ...new Set(fromFields.map((level) => toDisplayLevel(level))),
  ].filter((level) => DISPLAY_LEVEL_ORDER.includes(level));
  unique.sort(
    (a, b) => DISPLAY_LEVEL_ORDER.indexOf(a) - DISPLAY_LEVEL_ORDER.indexOf(b)
  );
  return unique.length ? unique : ["city"];
}

function politicianOffices(politician) {
  const offices = politician.offices || politician.metadata?.offices || [];
  if (offices.length) return offices;
  return [
    {
      level: politician.level || "local",
      chamber: politician.chamber || "",
      office_title:
        politician.office_title ||
        politician.metadata?.office_title ||
        politician.chamber ||
        "",
      district: politician.district || "",
      source: politician.source || "",
      external_key: politician.external_key,
    },
  ];
}

function officeForLevel(politician, sectionLevel) {
  const offices = politicianOffices(politician);
  const match = offices.find(
    (office) => toDisplayLevel(office.level) === sectionLevel
  );
  return match || offices[0] || null;
}

function renderPoliticianCard(
  politician,
  { followedIds, user, onFollowChange, sectionLevel = null }
) {
  const card = document.createElement("article");
  card.className = "politician-card";
  const levels = politicianLevels(politician);
  const activeLevel = sectionLevel || levels[0] || politician.level || "local";
  const activeOffice = officeForLevel(politician, activeLevel);
  card.dataset.level = activeLevel;

  const media = document.createElement("div");
  media.className = "politician-card__media";
  if (politician.photo_url) {
    const img = document.createElement("img");
    img.src = politician.photo_url;
    img.alt = politician.name;
    img.loading = "lazy";
    media.append(img);
  } else {
    media.innerHTML = `<div class="politician-card__avatar">${escapePoliticianHtml(
      (politician.name || "?").slice(0, 1)
    )}</div>`;
  }

  const body = document.createElement("div");
  body.className = "politician-card__body";

  const name = document.createElement("h3");
  name.className = "politician-card__name";
  name.textContent = politician.name;

  const levelRow = document.createElement("div");
  levelRow.className = "politician-card__levels";
  levelRow.setAttribute("aria-label", "Levels of influence");
  for (const level of levels) {
    const badge = document.createElement("span");
    badge.className = "politician-level-badge";
    if (level === activeLevel) badge.classList.add("is-active");
    badge.textContent = levelLabel(level);
    levelRow.append(badge);
  }

  const officeTitle = readableOfficeTitle(
    activeOffice?.office_title ||
      politician.office_title ||
      politician.metadata?.office_title
  );
  const viewForLabel = {
    ...politician,
    chamber: activeOffice?.chamber || politician.chamber,
    office_title: officeTitle,
    metadata: {
      ...(politician.metadata || {}),
      office_title: officeTitle,
    },
    district: activeOffice?.district || politician.district,
  };

  const meta = document.createElement("p");
  meta.className = "politician-card__meta";
  meta.textContent = [
    chamberLabel(viewForLabel.chamber, viewForLabel),
    politician.state,
    formatDistrictMeta(viewForLabel.district, viewForLabel),
  ]
    .filter(Boolean)
    .join(" · ");

  const otherOffices = politicianOffices(politician).filter(
    (office) => office.level !== activeLevel
  );
  let otherMeta = null;
  if (otherOffices.length) {
    otherMeta = document.createElement("p");
    otherMeta.className = "politician-card__also";
    otherMeta.textContent = `Also: ${otherOffices
      .map((office) => {
        const title =
          readableOfficeTitle(office.office_title) ||
          chamberLabel(office.chamber, { metadata: { office_title: office.office_title } });
        return `${levelLabel(office.level)} — ${title}`;
      })
      .join("; ")}`;
  }

  const party = document.createElement("span");
  party.className = `politician-card__party ${partyClass(politician.party)}`;
  party.textContent = politician.party || "Independent/Other";

  const actions = document.createElement("div");
  actions.className = "politician-card__actions";

  if (politician.website_url) {
    const link = document.createElement("a");
    link.className = "bill-card__link";
    link.href = politician.website_url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Official site";
    actions.append(link);
  }

  const followBtn = document.createElement("button");
  followBtn.type = "button";
  followBtn.className = "refresh-btn politician-card__follow";

  const isDistrictOnly = Boolean(politician.metadata?.district_only);
  const isFollowed = politician.id && followedIds?.has(politician.id);
  followBtn.textContent = isDistrictOnly
    ? "District only"
    : isFollowed
      ? "Following"
      : "Follow";
  if (isFollowed) followBtn.classList.add("is-following");
  if (isDistrictOnly) {
    followBtn.disabled = true;
    followBtn.title =
      politician.metadata?.note ||
      "This is a district match, not an individual officeholder.";
  }

  followBtn.addEventListener("click", async () => {
    if (isDistrictOnly) return;
    if (!user) {
      window.location.href = `auth.html?next=${encodeURIComponent(
        window.location.pathname.split("/").pop() || "politicians.html"
      )}`;
      return;
    }

    followBtn.disabled = true;
    try {
      let record = politician;
      if (!record.id) {
        record = await upsertPoliticianRecord(politician);
        if (!record?.id) throw new Error("Could not save politician");
        politician.id = record.id;
      }

      if (followedIds.has(politician.id)) {
        await unfollowPolitician(user.id, politician.id);
        followedIds.delete(politician.id);
        followBtn.textContent = "Follow";
        followBtn.classList.remove("is-following");
      } else {
        await followPolitician(user.id, politician.id);
        followedIds.add(politician.id);
        followBtn.textContent = "Following";
        followBtn.classList.add("is-following");
      }
      onFollowChange?.(politician);
    } catch (error) {
      console.error(error);
      alert(error.message || "Could not update follow.");
    } finally {
      followBtn.disabled = false;
    }
  });

  actions.append(followBtn);
  body.append(name, levelRow, meta);
  if (otherMeta) body.append(otherMeta);
  body.append(party, actions);
  card.append(media, body);
  return card;
}

function renderPoliticianGroups(container, politicians, cardOptions) {
  container.replaceChildren();

  const people = politicians.map((politician) => ({
    ...politician,
    levels: politicianLevels(politician),
    offices: politicianOffices(politician),
  }));

  const byLevel = new Map(DISPLAY_LEVEL_ORDER.map((level) => [level, []]));
  for (const politician of people) {
    const levels = politician.levels.length
      ? politician.levels
      : [toDisplayLevel(politician.level || "local")];
    // Show this person under every level they affect.
    for (const level of levels) {
      const displayLevel = toDisplayLevel(level);
      if (!byLevel.has(displayLevel)) byLevel.set(displayLevel, []);
      byLevel.get(displayLevel).push(politician);
    }
  }

  const jump = document.createElement("nav");
  jump.className = "politician-level-nav";
  jump.setAttribute("aria-label", "Jump to government level");

  let hasAny = false;
  for (const level of DISPLAY_LEVEL_ORDER) {
    const group = byLevel.get(level) || [];
    if (!group.length) continue;
    hasAny = true;

    // Stable unique people within a level (already deduped upstream, but guard).
    const unique = [];
    const seen = new Set();
    for (const politician of group) {
      const key = politician.external_key || politician.name;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(politician);
    }
    unique.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    byLevel.set(level, unique);

    const link = document.createElement("a");
    link.className = "politician-level-nav__link";
    link.href = `#level-${level}`;
    link.textContent = `${levelLabel(level)} (${unique.length})`;
    jump.append(link);
  }

  if (!hasAny) return;
  container.append(jump);

  for (const level of DISPLAY_LEVEL_ORDER) {
    const group = byLevel.get(level) || [];
    if (!group.length) continue;

    const section = document.createElement("section");
    section.className = "politician-level-group";
    section.id = `level-${level}`;
    section.setAttribute("aria-label", levelLabel(level));

    const heading = document.createElement("h3");
    heading.className = "politician-level-group__title";
    heading.textContent = `${levelLabel(level)} · ${group.length} ${
      group.length === 1 ? "official" : "officials"
    }`;

    const blurb = document.createElement("p");
    blurb.className = "politician-level-group__blurb";
    const blurbs = {
      federal: "U.S. Senators, Representative, and President for this address.",
      state: "Governor, statewide executives, legislators, and state officials.",
      county: "County supervisors/commissioners, sheriff, and county judges.",
      city: "Mayor, city council, and other municipal officials.",
      school: "School districts and school board members / trustees.",
    };
    blurb.textContent =
      blurbs[level] ||
      `Everyone who represents this address at the ${levelLabel(
        level
      ).toLowerCase()} level.`;

    const grid = document.createElement("div");
    grid.className = "politician-grid";
    grid.append(
      ...group.map((politician) =>
        renderPoliticianCard(politician, {
          ...cardOptions,
          sectionLevel: level,
        })
      )
    );

    section.append(heading, blurb, grid);
    container.append(section);
  }
}

function mountAddressLookup({ formId, inputId, statusId, resultsId }) {
  const form = document.getElementById(formId);
  const input = document.getElementById(inputId);
  const status = document.getElementById(statusId);
  const results = document.getElementById(resultsId);
  if (!form || !input || !status || !results) return;

  function setStatus(message, type = "loading") {
    status.hidden = !message;
    status.textContent = message;
    status.dataset.type = type;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    results.replaceChildren();
    setStatus("Looking up officials at every level of government…", "loading");

    try {
      await injectSupabaseScript().catch(() => {});
      const user = await getUser().catch(() => null);
      const followedIds = user
        ? await loadFollowedPoliticianIds(user.id)
        : new Set();

      const data = await lookupRepresentatives(input.value);
      const politicians = data.politicians || [];

      const uniquePeople = (() => {
        // Client-side guard if an older API build still returns source duplicates.
        const map = new Map();
        for (const politician of politicians) {
          const key =
            (politician.bioguide_id &&
              `bioguide:${String(politician.bioguide_id).toLowerCase()}`) ||
            `name:${String(politician.state || "").toUpperCase()}:${String(
              politician.name || ""
            )
              .toLowerCase()
              .replace(/[^a-z\s]/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .split(" ")
              .filter((part) => part.length > 1)
              .join(" ")}`;
          const existing = map.get(key);
          if (!existing) {
            map.set(key, {
              ...politician,
              levels: politicianLevels(politician),
              offices: politicianOffices(politician),
            });
            continue;
          }
          const levels = [
            ...new Set([
              ...politicianLevels(existing),
              ...politicianLevels(politician),
            ]),
          ].sort(
            (a, b) => DISPLAY_LEVEL_ORDER.indexOf(a) - DISPLAY_LEVEL_ORDER.indexOf(b)
          );
          const offices = [...politicianOffices(existing)];
          for (const office of politicianOffices(politician)) {
            const signature = `${office.level}|${office.office_title}|${office.district}`;
            if (
              !offices.some(
                (item) =>
                  `${item.level}|${item.office_title}|${item.district}` ===
                  signature
              )
            ) {
              offices.push(office);
            }
          }
          map.set(key, {
            ...existing,
            ...politician,
            photo_url: existing.photo_url || politician.photo_url,
            website_url: existing.website_url || politician.website_url,
            phone: existing.phone || politician.phone,
            bioguide_id: existing.bioguide_id || politician.bioguide_id,
            levels,
            offices,
            metadata: {
              ...(existing.metadata || {}),
              ...(politician.metadata || {}),
              levels,
              offices,
            },
          });
        }
        return [...map.values()];
      })();

      if (!uniquePeople.length) {
        setStatus(
          "No representatives found for that address. Try a fuller street address.",
          "error"
        );
        return;
      }

      const levelCounts = DISPLAY_LEVEL_ORDER.map((level) => {
        const count = uniquePeople.filter((p) =>
          politicianLevels(p).includes(level)
        ).length;
        return count ? `${levelLabel(level)} ${count}` : null;
      }).filter(Boolean);

      setStatus(
        `Representatives for ${data.address || input.value} · ${uniquePeople.length} people · ${levelCounts.join(" · ")}`,
        "success"
      );
      // Show results immediately; persist in the background for Follow/browse.
      renderPoliticianGroups(results, uniquePeople, { followedIds, user });

      Promise.all(
        uniquePeople.map(async (politician) => {
          if (politician.metadata?.district_only || politician.id) return politician;
          const row = await upsertPoliticianRecord(politician);
          if (row?.id) politician.id = row.id;
          return politician;
        })
      ).catch((error) => console.error(error));
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Address lookup failed.", "error");
    }
  });
}
