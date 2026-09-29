const $ = (s, el = document) => el.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const api = async (path, opts) => {
  const res = await fetch(path, opts);
  if (!res.ok)
    throw new Error(
      (await res.json().catch(() => ({}))).error ?? res.statusText,
    );
  return res.json();
};
const initials = (name = "?") =>
  name
    .replace(/^@/, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";
const avatar = (p, me = false) =>
  `<span class="avatar${me ? " me" : ""}">${p?.photoUrl || p?.photo ? `<img src="${esc(p.photoUrl || p.photo)}" alt="" onerror="this.remove()">` : ""}${esc(initials(p?.name))}</span>`;
const ago = (iso) => {
  if (!iso) return "";
  const d = Math.round((Date.now() - Date.parse(iso)) / 864e5);
  if (d < 0) return `in ${-d}d`;
  if (d < 1) return "today";
  if (d < 45) return `${d}d ago`;
  if (d < 540) return `${Math.round(d / 30)}mo ago`;
  return `${(d / 365).toFixed(1)}y ago`;
};

/** Minimal, safe markdown: paragraphs, bullets, bold, italics, inline code. */
function md(text) {
  const inline = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1<i>$2</i>")
      .replace(/`(.+?)`/g, "<code>$1</code>");
  const out = [];
  let list = null;
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    if (m) {
      list ??= [];
      list.push(`<li>${inline(m[1])}</li>`);
      continue;
    }
    if (list) (out.push(`<ul>${list.join("")}</ul>`), (list = null));
    if (line.trim()) out.push(`<p>${inline(line.replace(/^#+\s*/, ""))}</p>`);
  }
  if (list) out.push(`<ul>${list.join("")}</ul>`);
  return out.join("");
}

// ---------- navigation ----------
document.querySelectorAll(".nav").forEach((b) =>
  b.addEventListener("click", () => {
    document
      .querySelectorAll(".nav")
      .forEach((x) => x.classList.toggle("active", x === b));
    document
      .querySelectorAll(".view")
      .forEach((v) =>
        v.classList.toggle("active", v.id === `view-${b.dataset.view}`),
      );
    if (b.dataset.view === "people") loadPeople();
    if (b.dataset.view === "map") loadMap();
    if (b.dataset.view === "communities") loadCommunities();
    if (b.dataset.view === "graph") loadGraph();
    if (b.dataset.view === "sources") loadSources();
  }),
);

// ---------- ask ----------
const SUGGESTIONS = [
  ["Get into a company", "Who can introduce me to someone at Shopify?"],
  [
    "Find first customers",
    "Who do I know that leads a support or CX team? Rank them for a customer conversation.",
  ],
  [
    "Make a trip count",
    "I'm in New York next week. Who should I see and is anything happening?",
  ],
  [
    "Hidden opportunity",
    "Is anyone in my network hiring, and who do I know that might be a fit?",
  ],
  ["Prepare for a meeting", "Prep me for my next meeting with Priya."],
  [
    "Someone who's done it",
    "Who has been through SOC 2 and how could I reach them?",
  ],
  ["Reconnect", "Which strong relationships am I letting go cold?"],
];
$("#suggestions").innerHTML = SUGGESTIONS.map(
  ([t, q]) =>
    `<button class="suggestion" data-q="${esc(q)}"><b>${esc(t)}</b><span>${esc(q)}</span></button>`,
).join("");
$("#suggestions").addEventListener("click", (e) => {
  const b = e.target.closest(".suggestion");
  if (b) ask(b.dataset.q);
});

const conversationId = crypto.randomUUID();
const prompt = $("#prompt");
prompt.addEventListener("input", () => {
  prompt.style.height = "auto";
  prompt.style.height = `${prompt.scrollHeight}px`;
});
prompt.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    $("#composer").requestSubmit();
  }
});
$("#composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = prompt.value.trim();
  if (q) ask(q);
});

const TOOL_LABELS = {
  search_people: "Searching people",
  get_person: "Reading profile",
  who_do_i_know_at: "Checking company",
  find_warm_paths: "Finding intro paths",
  search_activity: "Searching conversations",
  communities: "Checking communities",
  upcoming: "Checking calendar",
  prep_meeting: "Building brief",
  relationships_needing_attention: "Checking relationships",
  overview: "Reading network",
  add_note: "Saving note",
  present: "Preparing view",
};

async function ask(q) {
  $("#welcome")?.remove();
  prompt.value = "";
  prompt.style.height = "auto";
  $("#send").disabled = true;
  const thread = $("#thread");
  thread.insertAdjacentHTML(
    "beforeend",
    `<div class="msg user">${esc(q)}</div>`,
  );
  const bot = document.createElement("div");
  bot.className = "msg bot";
  bot.innerHTML = `<div class="tools"></div><div class="body"><span class="muted">Thinking…</span></div>`;
  thread.appendChild(bot);
  thread.scrollTop = thread.scrollHeight;
  let text = "";
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId, message: q }),
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const event = chunk.match(/^event: (.*)$/m)?.[1];
        const data = JSON.parse(chunk.match(/^data: (.*)$/m)?.[1] ?? "null");
        if (event === "text") {
          text += data;
          $(".body", bot).innerHTML = md(text);
        } else if (event === "tool") {
          $(".tools", bot).insertAdjacentHTML(
            "beforeend",
            `<span class="tool-chip">${esc(TOOL_LABELS[data.name] ?? data.name)}</span>`,
          );
        } else if (event === "card") {
          renderCard(data);
        } else if (event === "error") {
          $(".body", bot).insertAdjacentHTML(
            "beforeend",
            `<p class="error">${esc(data.message)}</p>`,
          );
        }
        thread.scrollTop = thread.scrollHeight;
      }
    }
    if (!text) $(".body", bot).querySelector(".muted")?.remove();
  } catch (err) {
    $(".body", bot).innerHTML = `<p class="error">${esc(err.message)}</p>`;
  } finally {
    $("#send").disabled = false;
    prompt.focus();
  }
}

// ---------- cards ----------
const personChip = (p, extra = "") => `
  <button class="person-chip" data-person="${esc(p.id)}">
    ${avatar(p)}
    <span><span class="name">${esc(p.name)}</span><br><span class="sub">${esc(p.headline ?? "")}${p.city ? ` · ${esc(p.city)}` : ""}</span>${extra}</span>
  </button>`;
const badges = (list = []) =>
  list.length
    ? `<div class="badges">${list.map((b) => `<span class="badge${/community|collective|circle|club/i.test(b) ? " community" : ""}">${esc(b)}</span>`).join("")}</div>`
    : "";
const strengthBar = (s) =>
  `<div class="strength" title="Relationship strength ${s}/100"><i style="width:${s}%"></i></div>`;

function renderCard(card) {
  const c = $("#canvas");
  const people = card.people ?? [];
  let body = "";
  if (card.kind === "path") {
    const hops = card.hops ?? [];
    body = `<div class="path">
      <div class="path-node"><div class="person-chip">${avatar(card.me ?? { name: "You" }, true)}<span><span class="name">You</span></span></div></div>
      ${people
        .map(
          (p, i) => `
        <div class="path-hop ${hops[i] && hops[i].confirmed === false ? "context" : ""}">
          <div class="hop-label">${hops[i]?.confirmed === false ? "Context only" : "Evidence"}</div>
          <ul>${(hops[i]?.evidence ?? []).map((e) => `<li>${esc(e)}</li>`).join("")}</ul>
        </div>
        <div class="path-node">${personChip(p)}${badges(p.badges)}<div class="reason">${esc(p.reason)}</div></div>`,
        )
        .join("")}
    </div>`;
  } else if (card.kind === "bridge" && people.length >= 2) {
    body = `<div class="bridge">
      <div class="path-node">${personChip(people[0])}${badges(people[0].badges)}<div class="reason">${esc(people[0].reason)}</div></div>
      <div class="connector">⇄</div>
      <div class="path-node">${personChip(people[1])}${badges(people[1].badges)}<div class="reason">${esc(people[1].reason)}</div></div>
    </div>`;
  } else if (card.kind === "brief" && people[0]) {
    const p = people[0];
    body = `<div class="path-node">${personChip(p, strengthBar(p.strength))}${badges(p.badges)}<div class="reason">${md(p.reason)}</div></div>`;
  } else {
    body = `<div class="shortlist">${people
      .map(
        (p, i) =>
          `<div class="short-item"><span class="rank">${i + 1}</span><div>${personChip(p, strengthBar(p.strength))}${badges(p.badges)}<div class="reason">${esc(p.reason)}</div></div></div>`,
      )
      .join("")}</div>`;
  }
  const events = card.events?.length
    ? `<div class="events">${card.events
        .map(
          (e) =>
            `<div class="event"><b>${esc(e.title)}</b><br><span class="muted">${esc([e.when, e.where, e.source].filter(Boolean).join(" · "))}</span></div>`,
        )
        .join("")}</div>`
    : "";
  const draft = card.draft
    ? `<div class="draft"><button data-copy>Copy</button>${esc(card.draft)}</div>`
    : "";
  const company = card.company
    ? `<button class="company-strip" data-company="${esc(card.company.id)}"><b>${esc(card.company.name)}</b><span class="muted">${esc([card.company.industry, card.company.location, card.company.domain].filter(Boolean).join(" · "))}</span></button>`
    : "";
  c.innerHTML = `<div class="kind">${esc(card.kind)}</div><h3 class="card-title">${esc(card.title)}</h3>${company}${body}${events}${draft}`;
  c.querySelector("[data-copy]")?.addEventListener("click", (e) => {
    navigator.clipboard.writeText(card.draft);
    e.target.textContent = "Copied";
  });
}

document.addEventListener("click", (e) => {
  const community = e.target.closest("[data-community]");
  if (community) return openCommunity(community.dataset.community);
  const company = e.target.closest("[data-company]");
  if (company) return openCompany(company.dataset.company);
  const el = e.target.closest("[data-person]");
  if (el) openPerson(el.dataset.person);
});

const companyLink = (id, name) =>
  id
    ? `<button class="link" data-company="${esc(id)}">${esc(name)}</button>`
    : `<b>${esc(name)}</b>`;

// ---------- your map (onboarding) ----------
const showView = (v) => document.querySelector(`.nav[data-view="${v}"]`)?.click();
const ROLE_LABEL = {
  host: "Host",
  speaker: "Speaker",
  "active member": "Active member",
  attendee: "Attendee",
  member: "Member",
  invited: "Invited",
};
const monthYear = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "";

async function loadMap(data) {
  const el = $("#map");
  if (!data) {
    el.innerHTML = `<p class="muted">Loading…</p>`;
    data = await api("/api/onboarding");
  }
  const first = data.me?.name?.split(" ")[0];
  const community = (c) => {
    const e = c.evidence;
    const facts = [
      e.groups.length ? e.groups.join(", ") : null,
      `${e.messages} email${e.messages === 1 ? "" : "s"} since ${monthYear(e.first)}`,
      e.posts ? `you posted ${e.posts}×` : null,
      e.registrations ? `${e.registrations} event${e.registrations === 1 ? "" : "s"}` : null,
      c.people_you_know ? `${c.people_you_know} ${c.people_you_know === 1 ? "person" : "people"} you know` : null,
    ].filter(Boolean);
    return `<div class="map-comm is-${c.status}" data-key="${esc(c.key)}">
      <div class="map-comm-main">
        <button class="link map-comm-name" ${c.community_id ? `data-community="${esc(c.community_id)}"` : "disabled"}>${esc(c.name)}</button>
        <span class="role-pill">${esc(ROLE_LABEL[c.role] ?? c.role)}</span>
        <div class="muted small">${esc(facts.join(" · "))}</div>
        ${e.samples[0] ? `<div class="sample">“${esc(e.samples[0])}”</div>` : ""}
      </div>
      <div class="map-comm-actions">
        ${
          c.status === "confirmed"
            ? `<span class="confirmed">✓ Yours</span><button class="icon" data-act="dismiss" title="Not mine">✕</button>`
            : `<button class="btn small" data-act="confirm">Yes, mine</button><button class="icon" data-act="dismiss" title="Not mine">✕</button>`
        }
      </div>
    </div>`;
  };
  el.innerHTML = `
    <header class="map-head">
      <h1>${first ? `${esc(first)}, here's` : "Here's"} your network</h1>
      <p class="muted">Who you're closest to, the companies you have warm access to, and the communities you're part of, all from your own email, calendar and contacts. Check the communities; everything else updates as you sync.</p>
    </header>
    <div class="map-cols">
      <section class="map-col">
        <h3>Closest people</h3>
        <div class="map-list">${
          data.people.length
            ? data.people
                .map(
                  (p) => `<button class="map-row" data-person="${esc(p.id)}">${avatar(p)}<span><b>${esc(p.name)}</b><small>${esc(p.headline || p.why || p.tier || "")}</small></span></button>`,
                )
                .join("")
            : `<p class="muted">Connect a source to see your people.</p>`
        }</div>
      </section>
      <section class="map-col">
        <h3>Companies you can reach</h3>
        <div class="map-list">${
          data.companies.length
            ? data.companies
                .map(
                  (c) => `<button class="map-row" data-company="${esc(c.id)}"><span class="avatar company">${esc(initials(c.name))}</span><span><b>${esc(c.name)}</b><small>${esc([c.best_contact ? `via ${c.best_contact.name}` : null, `${c.current_people} ${c.current_people === 1 ? "person" : "people"}`].filter(Boolean).join(" · "))}</small></span></button>`,
                )
                .join("")
            : `<p class="muted">Companies appear once people's jobs are known (LinkedIn import or enrichment).</p>`
        }</div>
      </section>
      <section class="map-col wide">
        <h3>Your communities <span class="muted small">detected from your email</span></h3>
        <div class="map-list">${
          data.communities.length
            ? data.communities.map(community).join("")
            : `<div class="muted">${data.detected_at ? "No communities found in your email yet." : "Not scanned yet. Run:"}<pre>npm run brain -- detect-communities</pre></div>`
        }</div>
      </section>
    </div>
    <div class="map-foot">
      <button class="btn primary" id="mapDone">${data.onboarded ? "Back to asking" : "Looks right, start asking"}</button>
    </div>`;
  el.querySelectorAll(".map-comm [data-act]").forEach((b) =>
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      const key = b.closest(".map-comm").dataset.key;
      b.disabled = true;
      loadMap(
        await api(`/api/community-candidate/${encodeURIComponent(key)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: b.dataset.act }),
        }),
      );
    }),
  );
  $("#mapDone").addEventListener("click", async () => {
    await api("/api/onboarding/done", { method: "POST" });
    showView("ask");
  });
}

// First run: open the map instead of an empty chat.
api("/api/onboarding")
  .then((d) => {
    if (!d.onboarded && (d.people.length || d.communities.length)) {
      showView("map");
      loadMap(d);
    }
  })
  .catch(() => {});

// ---------- communities ----------
async function loadCommunities() {
  const list = $("#communityList");
  list.innerHTML = `<p class="muted">Loading…</p>`;
  const rows = await api("/api/communities");
  if (!rows.length) {
    list.innerHTML = "";
    list.insertAdjacentHTML(
      "beforeend",
      `<div class="community-empty"><p>No communities yet. Import your list, then pull community digests from Gmail:</p>
      <pre>npm run brain -- import communities communities.csv
npm run brain -- sync --only communities
npm run brain -- rebuild</pre></div>`,
    );
    return;
  }
  list.innerHTML = rows
    .map(
      (c) => `<button class="community-card" data-community="${esc(c.id)}">
      <b>${esc(c.name)}</b>
      ${c.my_role ? `<span class="you">You: ${esc(c.my_role)}</span>` : ""}
      <div class="muted">${c.known} you know · ${c.members} in your network${c.posts ? ` · ${c.posts} post${c.posts === 1 ? "" : "s"}` : ""}${c.last_activity ? ` · active ${ago(c.last_activity)}` : ""}</div>
      ${c.top.length ? `<div class="faces">${c.top.map((p) => avatar(p)).join("")}</div>` : ""}
    </button>`,
    )
    .join("");
}

async function openCommunity(id) {
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  $("#drawerBody").innerHTML = `<p class="muted">Loading…</p>`;
  const c = await api(`/api/community/${encodeURIComponent(id)}`);
  const section = (title, html) =>
    html ? `<div class="section"><h4>${title}</h4>${html}</div>` : "";
  const member = (p) =>
    `<div><button class="person-chip" data-person="${esc(p.id)}">${avatar(p)}<span><span class="name">${esc(p.name)}</span><br><span class="sub">${esc([p.role, p.headline, p.city].filter(Boolean).join(" · "))}</span></span></button>${p.how_you_know_them.length ? `<small>${esc(p.how_you_know_them.join(" · "))}</small>` : ""}</div>`;
  const known = c.members.filter((p) => p.strength >= 12);
  const others = c.members.filter((p) => p.strength < 12);
  $("#drawerBody").innerHTML = `
    <div class="profile-head"><span class="avatar company">${esc(initials(c.name))}</span><div><h3>${esc(c.name)}</h3>
      <div class="muted">${esc([c.provider !== "manual" ? c.provider : null, c.my_role ? `you: ${c.my_role}` : null].filter(Boolean).join(" · "))}</div>
      <div class="tier">${c.counts.known} you know · ${c.counts.members} in your network</div></div></div>
    ${c.url ? `<div class="actions"><a class="btn" href="${esc(c.url)}" target="_blank" rel="noreferrer">Open</a></div>` : ""}
    ${c.description ? `<p class="section">${esc(c.description)}</p>` : ""}
    ${section("People you know there", known.length ? `<div class="timeline">${known.map(member).join("")}</div>` : `<p class="muted">Nobody you're in touch with yet.</p>`)}
    ${section("Other members", others.length ? `<div class="timeline">${others.map(member).join("")}</div>` : "")}
    ${section("Recent activity", c.activity.length ? `<div class="timeline">${c.activity.map((a) => `<div>${esc(a.subject || a.snippet || a.kind)}<small>${a.author ? `${esc(a.author)} · ` : ""}${esc(a.kind.replace("_", " "))} · ${ago(a.occurred_at)}</small></div>`).join("")}</div>` : "")}
    ${section("Related groups", c.related.length ? `<div class="badges">${c.related.map((r) => `<button class="badge community" data-community="${esc(r.id)}">${esc(r.name)}</button>`).join("")}</div>` : "")}
  `;
}

// ---------- company drawer ----------
async function openCompany(id) {
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  $("#drawerBody").innerHTML = `<p class="muted">Loading…</p>`;
  renderCompany(await api(`/api/company/${encodeURIComponent(id)}`));
}

function renderCompany(c) {
  const section = (title, html) =>
    html ? `<div class="section"><h4>${title}</h4>${html}</div>` : "";
  const personRow = (p, sub) =>
    `<div><button class="person-chip" data-person="${esc(p.id)}">${avatar(p)}<span><span class="name">${esc(p.name)}</span><br><span class="sub">${esc(sub)}</span></span></button></div>`;
  const facts = [
    c.industry,
    c.size,
    c.location,
    c.founded ? `founded ${c.founded}` : null,
    c.funding_stage,
  ].filter(Boolean);
  $("#drawerBody").innerHTML = `
    <div class="profile-head"><span class="avatar company">${esc(initials(c.name))}</span><div><h3>${esc(c.name)}</h3>
      <div class="muted">${esc(facts.join(" · ") || "Not enriched yet")}</div>
      <div class="tier">${c.counts.current} current · ${c.counts.alumni} alumni in your network</div></div></div>
    <div class="actions">
      ${c.domain ? `<a class="btn" href="https://${esc(c.domain)}" target="_blank" rel="noreferrer">${esc(c.domain)}</a>` : ""}
      ${c.linkedin ? `<a class="btn" href="${esc(c.linkedin)}" target="_blank" rel="noreferrer">LinkedIn</a>` : ""}
      <button class="btn enrich-only" data-act="enrich">${c.enriched ? "Refresh company data" : "Enrich company"}</button>
    </div>
    ${c.description ? `<p class="section">${esc(c.description)}</p>` : ""}
    ${section(
      "Best ways in",
      c.warm_paths.length
        ? `<div class="timeline">${c.warm_paths
            .slice(0, 3)
            .map(
              (w) =>
                `<div>${w.people
                  .slice(1)
                  .map(
                    (x) =>
                      `<button class="link" data-person="${esc(x.id)}">${esc(x.name)}</button>`,
                  )
                  .join(
                    " → ",
                  )}<small>${esc([w.target_role, ...(w.hops.at(-1)?.evidence ?? []).slice(0, 2)].filter(Boolean).join(" · "))}</small></div>`,
            )
            .join("")}</div>`
        : "",
    )}
    ${section("Works there now", c.current_people.length ? `<div class="timeline">${c.current_people.map((p) => personRow(p, [p.role, ...(p.how_you_know_them ?? [])].join(" · "))).join("")}</div>` : "")}
    ${section("Used to work there", c.alumni.length ? `<div class="timeline">${c.alumni.map((p) => personRow(p, p.role)).join("")}</div>` : "")}
    ${section("Mentioned in", c.recent_mentions.length ? `<div class="timeline">${c.recent_mentions.map((m) => `<div>${esc(m.subject || m.snippet || m.kind)}<small>${esc(m.kind.replace("_", " "))}${m.community ? ` · ${esc(m.community)}` : ""} · ${ago(m.occurred_at)}${m.people ? ` · ${esc(m.people.replace(/ \[p_[^\]]+\]/g, ""))}` : ""}</small></div>`).join("")}</div>` : "")}
    ${c.tags.length ? section("Tags", badges(c.tags)) : ""}
    ${section("Also known as", `<span class="muted">${esc([...c.also_known_as, ...c.domains].join(", "))}</span>`)}
  `;
  $("#drawerBody [data-act=enrich]")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    e.target.textContent = "Working…";
    try {
      renderCompany(
        await api(`/api/company/${encodeURIComponent(c.id)}/enrich`, {
          method: "POST",
        }),
      );
    } catch (err) {
      e.target.textContent = err.message;
    }
  });
}

// ---------- person drawer ----------
const drawer = $("#drawer");
drawer.addEventListener("click", (e) => {
  if (e.target.closest("[data-close]")) closeDrawer();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDrawer();
});
function closeDrawer() {
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
}

async function openPerson(id) {
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  $("#drawerBody").innerHTML = `<p class="muted">Loading…</p>`;
  renderPerson(await api(`/api/person/${encodeURIComponent(id)}`));
}

function renderPerson(p) {
  const section = (title, html) =>
    html ? `<div class="section"><h4>${title}</h4>${html}</div>` : "";
  const list = (items) =>
    items?.length
      ? `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`
      : "";
  $("#drawerBody").innerHTML = `
    <div class="profile-head">${avatar(p)}<div><h3>${esc(p.name)}</h3><div class="muted">${esc(p.headline ?? "")}</div>
      <div class="tier">${esc(p.tier ?? "No interactions yet")} · strength ${p.strength}/100${p.trend ? ` · ${esc(p.trend)}` : ""}${p.location ? ` · ${esc(p.location)}` : ""}</div></div></div>
    <div class="actions">
      ${p.linkedin ? `<a class="btn" href="${esc(p.linkedin)}" target="_blank" rel="noreferrer">LinkedIn</a>` : ""}
      ${p.x ? `<a class="btn" href="https://x.com/${esc(p.x.slice(1))}" target="_blank" rel="noreferrer">${esc(p.x)}</a>` : ""}
      <button class="btn enrich-only" data-act="enrich">Enrich profile</button>
      <button class="btn" data-act="hide">Hide</button>
    </div>
    ${section("How you know them", list(p.how_you_know_them.map(esc)))}
    ${section("Career", list(p.career.map((j) => `${esc(j.title ?? "")}${j.title ? " at " : ""}${companyLink(j.company_id, j.company)}${j.industry ? ` <span class="muted">· ${esc(j.industry)}</span>` : ""}${j.start_date ? ` <span class="muted">${esc(j.start_date.slice(0, 4))}–${j.is_current ? "now" : esc(j.end_date?.slice(0, 4) ?? "?")}</span>` : ""}`)))}
    ${section("Education", list(p.education.map((s) => `${esc(s.school)}${s.degree ? ` <span class="muted">${esc(s.degree)}</span>` : ""}`)))}
    ${section("Communities", p.communities.length ? `<div class="badges">${p.communities.map((c) => `<button class="badge community" data-community="${esc(c)}">${esc(p.shared_communities_with_you.includes(c) ? `${c} (you too)` : c)}</button>`).join("")}</div>` : "")}
    ${section("Knows in your network", p.knows.length ? `<div class="timeline">${p.knows.map((k) => `<div><button class="person-chip" data-person="${esc(k.id)}"><span class="name">${esc(k.name)}</span></button><small>${esc(k.evidence.join(" · "))}</small></div>`).join("")}</div>` : "")}
    ${section("Recent", p.recent_interactions.length ? `<div class="timeline">${p.recent_interactions.map((i) => `<div>${esc(i.subject || i.snippet || i.kind)}<small>${esc(i.kind.replace("_", " "))} · ${esc(i.source)}${i.community ? ` · ${esc(i.community)}` : ""} · ${ago(i.occurred_at)}</small></div>`).join("")}</div>` : "")}
    ${p.summary ? section("About", `<p>${esc(p.summary)}</p>`) : ""}
    <div class="section"><h4>Notes</h4>${list(p.notes.map((n) => `${esc(n.body)} <span class="muted">${ago(n.created_at + "Z")}</span>`))}
      <form class="note-form"><input placeholder="Add a note…" /><button class="btn primary">Save</button></form></div>
    ${section("Sources", `<span class="muted">${esc(p.sources.join(", "))}${p.enriched_by.length ? ` · enriched by ${esc(p.enriched_by.map((e) => e.provider).join(", "))}` : ""}</span>`)}
  `;
  $("#drawerBody .note-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = e.target.querySelector("input").value.trim();
    if (body)
      renderPerson(
        await api(`/api/person/${p.id}/note`, {
          method: "POST",
          body: JSON.stringify({ body }),
        }),
      );
  });
  $("#drawerBody")
    .querySelectorAll("[data-act]")
    .forEach((b) =>
      b.addEventListener("click", async () => {
        b.disabled = true;
        b.textContent = "Working…";
        try {
          renderPerson(
            await api(`/api/person/${p.id}/${b.dataset.act}`, {
              method: "POST",
            }),
          );
        } catch (err) {
          b.textContent = err.message;
        }
      }),
    );
}

// ---------- people ----------
let peopleTimer;
["#q", "#fCity", "#fCompany", "#fCommunity"].forEach((s) =>
  $(s).addEventListener("input", () => {
    clearTimeout(peopleTimer);
    peopleTimer = setTimeout(loadPeople, 200);
  }),
);
const PAGE = 120;
let peopleQuery = "";
let peopleOffset = 0;
let peopleTotal = 0;
let peopleLoading = false;

const personCard = (
  p,
) => `<button class="person-card" data-person="${esc(p.id)}">${avatar(p)}<div><b>${esc(p.name)}</b><div class="muted">${esc(p.headline ?? "")}</div>
  <div class="tier">${esc(p.tier ?? "—")}${p.city ? ` · ${esc(p.city)}` : ""}${p.last ? ` · ${ago(p.last)}` : ""}</div>${strengthBar(p.strength)}</div></button>`;

/** First page for the current filters; later pages load as you scroll. */
async function loadPeople() {
  peopleQuery = new URLSearchParams({
    q: $("#q").value,
    city: $("#fCity").value,
    company: $("#fCompany").value,
    community: $("#fCommunity").value,
    weak: "1",
  }).toString();
  peopleOffset = 0;
  $("#peopleList").innerHTML = "";
  await loadMorePeople();
}

async function loadMorePeople() {
  if (peopleLoading) return;
  peopleLoading = true;
  const query = peopleQuery;
  try {
    const page = await api(
      `/api/people?${query}&offset=${peopleOffset}&limit=${PAGE}`,
    );
    if (query !== peopleQuery) return; // filters changed while loading
    peopleTotal = page.total;
    peopleOffset += page.items.length;
    $("#peopleList").insertAdjacentHTML(
      "beforeend",
      page.items.map(personCard).join(""),
    );
    $("#peopleCount").textContent = peopleTotal
      ? `${peopleOffset.toLocaleString()} of ${peopleTotal.toLocaleString()}`
      : "No one matches.";
  } finally {
    peopleLoading = false;
  }
}

new IntersectionObserver(
  (entries) => {
    if (entries[0].isIntersecting && peopleOffset < peopleTotal)
      loadMorePeople();
  },
  { root: $("#view-people"), rootMargin: "600px" },
).observe($("#peopleMore"));

// ---------- graph ----------
// Orbit view: you in the middle, distance = how close the relationship is. Tier rings
// mark Inner circle → Acquaintance; people fade and shrink as ties weaken. People are
// grouped into angular slices (by company or community) so clusters read at a glance;
// connections between people show on hover (or all, faintly, when toggled on).
const TIERS = [
  { name: "Inner circle", min: 80, color: "var(--t0)" },
  { name: "Close", min: 60, color: "var(--t1)" },
  { name: "Active", min: 35, color: "var(--t2)" },
  { name: "Acquaintance", min: 12, color: "var(--t3)" },
  { name: "Weak tie", min: 0, color: "var(--t4)" },
];
const tierOf = (s) => TIERS.find((t) => s >= t.min) ?? TIERS.at(-1);
let graphData = null;

["#gLimit", "#gGroup", "#gLinks"].forEach((s) =>
  $(s)?.addEventListener("change", () => loadGraph(s === "#gLimit")),
);

async function loadGraph(refetch = true) {
  const el = $("#graph");
  if (!window.d3)
    return (el.innerHTML = `<p class="muted">Graph library failed to load.</p>`);
  const limit = Number($("#gLimit").value);
  if (refetch || !graphData) graphData = await api(`/api/graph?limit=${limit}`);
  const data = graphData;
  const groupBy = $("#gGroup").value;
  const showAll = $("#gLinks").checked;
  el.innerHTML = "";
  const { width, height } = el.getBoundingClientRect();
  const cx = width / 2;
  const cy = height / 2;
  const R = Math.max(220, Math.min(width, height) / 2 - 40);
  const r0 = 46;
  // Each tier gets a ring whose width follows how many people are in it (with a floor),
  // so a crowded Inner circle still has room; inside a ring, stronger sits closer to you.
  const counts = TIERS.map((t, i) =>
    data.nodes.filter((n) => tierOf(n.strength) === t).length,
  );
  const weights = counts.map((c) => (c ? Math.pow(Math.max(0.1, c / (data.nodes.length || 1)), 0.6) : 0));
  const wsum = weights.reduce((a, b) => a + b, 0);
  const bands = [];
  let edge = r0;
  TIERS.forEach((t, i) => {
    const w = ((R - r0) * weights[i]) / wsum;
    bands.push({ ...t, inner: edge, outer: edge + w, max: i ? TIERS[i - 1].min : 100, count: counts[i] });
    edge += w;
  });
  const bandOf = (s) => bands.find((b) => s >= b.min) ?? bands.at(-1);
  const radius = (s) => {
    const b = bandOf(s);
    const f = (b.max - Math.min(s, b.max)) / Math.max(1, b.max - b.min);
    return b.inner + (0.15 + 0.7 * f) * (b.outer - b.inner);
  };
  // Dots shrink where a ring is crowded so neighbours don't pile up.
  for (const b of bands) {
    const area = Math.PI * (b.outer ** 2 - b.inner ** 2);
    const need = data.nodes
      .filter((n) => bandOf(n.strength) === b)
      .reduce((a, n) => a + Math.PI * (baseSize(n.strength) + 2) ** 2, 0);
    b.scale = need > 0.35 * area ? Math.sqrt((0.35 * area) / need) : 1;
  }
  function baseSize(s) {
    return 2.5 + Math.pow(s / 100, 1.3) * 8.5;
  }
  const size = (s) => Math.max(2, baseSize(s) * bandOf(s).scale);
  const fade = (s) => 0.28 + 0.72 * Math.pow(s / 100, 0.7);
  const hashAngle = (id) => {
    let h = 2166136261;
    for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    h ^= h >>> 15;
    return Math.imul(h, 2246822507) >>> 0;
  };

  // Angular slices: groups with 2+ people get a contiguous sector; singles fill the gaps.
  const keyOf = (n) =>
    groupBy === "company"
      ? n.company_id || (n.company ? `n:${n.company.toLowerCase()}` : null)
      : groupBy === "community"
        ? n.communities[0] || null
        : null;
  const labelOf = (n) => (groupBy === "company" ? n.company : n.communities[0]);
  const groups = new Map();
  for (const n of data.nodes) {
    const k = keyOf(n) ?? `solo:${n.id}`;
    if (!groups.has(k)) groups.set(k, { key: k, label: labelOf(n), nodes: [] });
    groups.get(k).nodes.push(n);
  }
  const multi = [...groups.values()]
    .filter((g) => g.nodes.length > 1)
    .sort((a, b) => b.nodes.length - a.nodes.length);
  const solos = [...groups.values()]
    .filter((g) => g.nodes.length === 1)
    .sort((a, b) => hashAngle(a.key) - hashAngle(b.key));
  // Interleave big groups with singles so no side of the circle is empty.
  const ordered = [];
  const step = Math.max(1, Math.floor(solos.length / Math.max(1, multi.length)));
  multi.forEach((g, i) => {
    ordered.push(g, ...solos.slice(i * step, (i + 1) * step));
  });
  ordered.push(...solos.slice(multi.length * step));
  const total = data.nodes.length || 1;
  let cursor = -Math.PI / 2;
  for (const g of ordered) {
    const span = (g.nodes.length / total) * Math.PI * 2;
    const sorted = [...g.nodes].sort((a, b) => b.strength - a.strength);
    const petal = [];
    sorted.forEach((n, i) => (i % 2 ? petal.push(n) : petal.unshift(n)));
    petal.forEach((n, i) => {
      n.angle = cursor + (span * (i + 0.5)) / g.nodes.length;
    });
    cursor += span;
  }
  // Then spread each ring evenly around the whole circle, keeping that order, so every
  // ring is full and people from one company still line up across rings.
  for (const b of bands) {
    const ring = data.nodes
      .filter((n) => bandOf(n.strength) === b)
      .sort((x, y) => x.angle - y.angle);
    const phase = ring.length ? ring[0].angle : 0;
    ring.forEach((n, i) => {
      n.angle = phase + (i * Math.PI * 2) / ring.length;
    });
  }
  const sectors = [...groups.values()]
    .filter((g) => g.nodes.length > 2 && g.label)
    .map((g) => ({
      label: g.label,
      count: g.nodes.length,
      mid: Math.atan2(
        g.nodes.reduce((a, n) => a + Math.sin(n.angle), 0),
        g.nodes.reduce((a, n) => a + Math.cos(n.angle), 0),
      ),
    }))
    .sort((a, b) => b.count - a.count);

  const meNode = { id: "me", name: data.me?.name ?? "You", me: true, strength: 100, fx: cx, fy: cy };
  const people = data.nodes.map((n) => ({
    ...n,
    x: cx + Math.cos(n.angle) * radius(n.strength),
    y: cy + Math.sin(n.angle) * radius(n.strength),
  }));
  const nodes = [meNode, ...people];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const links = data.edges
    .filter((e) => byId.has(e.a) && byId.has(e.b))
    .map((e) => ({ source: byId.get(e.a), target: byId.get(e.b), kind: e.kind, weight: e.weight }));
  const neighbors = new Map(people.map((n) => [n.id, new Set()]));
  for (const l of links) {
    neighbors.get(l.source.id)?.add(l.target.id);
    neighbors.get(l.target.id)?.add(l.source.id);
  }

  const svg = d3.select(el).append("svg").attr("viewBox", [0, 0, width, height]);
  const g = svg.append("g");
  svg.call(
    d3.zoom().scaleExtent([0.4, 5]).on("zoom", (e) => {
      g.attr("transform", e.transform);
      label.style("display", (d) => (showLabel(d, e.transform.k) ? null : "none"));
    }),
  );

  // Tier rings (soft bands, darkest near you) with labels on the top edge.
  const rings = g.append("g");
  bands.slice(0, 4).forEach((t, i) => {
    if (!t.count) return;
    rings
      .append("circle")
      .attr("class", "ring")
      .attr("cx", cx)
      .attr("cy", cy)
      .attr("r", t.outer)
      .style("fill-opacity", 0.025)
      .style("stroke-opacity", 0.45 - i * 0.08)
      .attr("stroke-dasharray", "3 5");
    rings
      .append("text")
      .attr("class", "ring-label")
      .attr("x", cx)
      .attr("y", cy - t.outer + 13)
      .attr("text-anchor", "middle")
      .text(`${t.name} · ${t.count}`);
  });
  rings
    .selectAll(".sector")
    .data(sectors.slice(0, 14))
    .join("text")
    .attr("class", "sector-label")
    .attr("text-anchor", (d) => (Math.cos(d.mid) >= 0 ? "start" : "end"))
    .attr("x", (d) => cx + Math.cos(d.mid) * (R + 14))
    .attr("y", (d) => cy + Math.sin(d.mid) * (R + 14) + 4)
    .text((d) => `${d.label} · ${d.count}`);

  const link = g
    .append("g")
    .attr("fill", "none")
    .selectAll("path")
    .data(links)
    .join("path")
    .style("stroke", (l) => (l.kind === "worked_together" ? "var(--orange)" : "var(--muted)"))
    .attr("stroke-width", (l) => Math.min(2.2, 0.5 + l.weight / 3))
    .attr("stroke-opacity", showAll ? 0.12 : 0);

  const node = g
    .append("g")
    .selectAll("g")
    .data(nodes)
    .join("g")
    .attr("class", "gnode")
    .style("cursor", (d) => (d.me ? "default" : "pointer"))
    .on("click", (_, d) => !d.me && openPerson(d.id))
    .on("mouseenter", (_, d) => focus(d))
    .on("mouseleave", () => focus(null));
  node
    .append("circle")
    .attr("r", (d) => (d.me ? 18 : size(d.strength)))
    .style("fill", (d) => (d.me ? "var(--orange)" : tierOf(d.strength).color))
    .attr("fill-opacity", (d) => (d.me ? 1 : fade(d.strength)))
    .attr("stroke-width", (d) => (d.me ? 3 : 1));
  node
    .filter((d) => d.me)
    .append("text")
    .attr("class", "me-label")
    .attr("text-anchor", "middle")
    .attr("y", 4)
    .text("You");

  // Names: always for close ties; the rest appear as you zoom in or hover.
  const labelled = new Set(people.filter((n) => n.strength >= 80).slice(0, 20).map((n) => n.id));
  const showLabel = (d, k = 1) =>
    !d.me && (labelled.has(d.id) || (k > 1.6 && d.strength >= 60) || (k > 2.4 && d.strength >= 35) || k > 3.4);
  const label = node
    .filter((d) => !d.me)
    .append("text")
    .attr("class", "gname")
    .attr("text-anchor", (d) => (Math.cos(d.angle) >= 0 ? "start" : "end"))
    .attr("x", (d) => (Math.cos(d.angle) >= 0 ? 1 : -1) * (size(d.strength) + 4))
    .attr("y", 3.5)
    .attr("fill-opacity", (d) => Math.max(0.55, fade(d.strength)))
    .style("font-weight", (d) => (d.strength >= 80 ? 600 : 400))
    .style("display", (d) => (showLabel(d) ? null : "none"))
    .text((d) => d.name);

  const tip = d3.select(el).append("div").attr("class", "gtip").style("opacity", 0);
  function focus(d) {
    if (!d || d.me) {
      node.style("opacity", 1);
      label.style("display", (x) => (showLabel(x, d3.zoomTransform(svg.node()).k) ? null : "none"));
      link.attr("stroke-opacity", showAll ? 0.12 : 0);
      tip.style("opacity", 0);
      return;
    }
    const near = neighbors.get(d.id) ?? new Set();
    node.style("opacity", (x) => (x.me || x.id === d.id || near.has(x.id) ? 1 : 0.12));
    label.style("display", (x) => (x.id === d.id || near.has(x.id) || showLabel(x) ? null : "none"));
    link.attr("stroke-opacity", (l) => (l.source.id === d.id || l.target.id === d.id ? 0.75 : showAll ? 0.03 : 0));
    tip
      .html(
        `<b>${esc(d.name)}</b><span>${esc(d.headline ?? d.company ?? "")}</span><small>${esc(tierOf(d.strength).name)} · ${Math.round(d.strength)}/100${near.size ? ` · knows ${near.size} here` : ""}</small>`,
      )
      .style("left", `${Math.min(width - 240, d.x + 16)}px`)
      .style("top", `${Math.max(8, d.y - 12)}px`)
      .style("opacity", 1);
  }

  // A short simulation just untangles overlaps; each person stays on their ring and angle.
  const sim = d3
    .forceSimulation(nodes)
    .force("radial", d3.forceRadial((d) => (d.me ? 0 : radius(d.strength)), cx, cy).strength(0.9))
    .force("x", d3.forceX((d) => (d.me ? cx : cx + Math.cos(d.angle) * radius(d.strength))).strength(0.25))
    .force("y", d3.forceY((d) => (d.me ? cy : cy + Math.sin(d.angle) * radius(d.strength))).strength(0.25))
    .force("collide", d3.forceCollide((d) => (d.me ? 24 : size(d.strength) + 1.5)).iterations(2))
    .alphaDecay(0.06)
    .stop();
  for (let i = 0; i < 160; i++) sim.tick();
  const draw = () => {
    // Links curve gently toward the centre so they don't cut straight across the rings.
    link.attr("d", (l) => {
      const mx = (l.source.x + l.target.x) / 2;
      const my = (l.source.y + l.target.y) / 2;
      const qx = mx + (cx - mx) * 0.25;
      const qy = my + (cy - my) * 0.25;
      return `M${l.source.x},${l.source.y} Q${qx},${qy} ${l.target.x},${l.target.y}`;
    });
    node.attr("transform", (d) => `translate(${d.x},${d.y})`);
  };
  draw();
}

// ---------- filtered (not a person) ----------
async function loadFiltered() {
  const rows = await api("/api/filtered");
  const el = $("#filtered");
  if (!el) return;
  el.innerHTML = `<h3>Filtered out as not a person</h3>
    <p class="muted">${rows.length ? `${rows.length} automated senders, shared inboxes and rooms are kept out of your network. Restore anyone real.` : "Nothing filtered."}</p>
    ${rows.length ? `<details><summary>Show list</summary><div class="filtered-list">${rows.map((r) => `<div><span><b>${esc(r.name)}</b><small>${esc([r.email, r.reason.replace(/^auto:\s*/, "")].filter(Boolean).join(" · "))}</small></span><button class="btn small" data-restore="${esc(r.id)}">Restore</button></div>`).join("")}</div></details>` : ""}`;
  el.querySelectorAll("[data-restore]").forEach((b) =>
    b.addEventListener("click", async () => {
      b.disabled = true;
      await api(`/api/person/${encodeURIComponent(b.dataset.restore)}/hide`, { method: "POST" });
      b.closest("div").remove();
    }),
  );
}

// ---------- sources ----------
async function loadSources() {
  const o = await api("/api/overview");
  const count = (src) => o.by_source.find((s) => s.source === src)?.people ?? 0;
  const acct = (provider) => o.accounts.filter((a) => a.provider === provider);
  const state = (a) => {
    const s = JSON.parse(a.sync_state || "{}");
    return s.importedAt
      ? `imported ${ago(s.importedAt)}`
      : s.gmailAfter
        ? `Gmail synced to ${new Date(s.gmailAfter * 1000).toLocaleDateString()}`
        : s.calendarSyncedAt
          ? `synced ${ago(s.calendarSyncedAt)}`
          : "not synced yet";
  };
  const block = (title, status, cmd) =>
    `<div class="source"><h3>${title}</h3><p class="muted">${status}</p><pre>${esc(cmd)}</pre></div>`;
  $("#sources").innerHTML = `
    <div class="source"><h3>Your network</h3><div class="stat-row">
      <div class="stat"><b>${o.people ?? 0}</b>people</div>
      ${o.by_tier.map((t) => `<div class="stat"><b>${t.n}</b>${esc(t.tier)}</div>`).join("")}
      <div class="stat"><b>${o.enriched ?? 0}</b>enriched</div></div></div>
    ${block(
      "Gmail, Calendar & Contacts",
      acct("google").length
        ? acct("google")
            .map(
              (a) =>
                `${esc(a.label)} &lt;${esc(a.id.slice(7))}&gt; — ${state(a)}`,
            )
            .join("<br>") + ` · ${count("google_contacts")} contacts`
        : "No Google accounts yet.",
      "npm run brain -- connect google Work\nnpm run brain -- connect google Personal\nnpm run brain -- sync",
    )}
    ${block("LinkedIn", acct("linkedin").length ? `${count("linkedin")} people · ${state(acct("linkedin")[0])}` : "Not imported.", "npm run brain -- import linkedin ~/Downloads/Basic_LinkedInDataExport.zip")}
    ${acct("x").length ? block("X", `${esc(acct("x")[0].label)} · ${count("x")} people · ${state(acct("x")[0])}`, "npm run brain -- import x ~/Downloads/twitter-archive.zip") : ""}
    ${acct("phone").length ? block("Phone contacts", `${count("phone")} people · ${state(acct("phone")[0])}`, "npm run brain -- import vcf ~/Downloads/contacts.vcf") : ""}
    ${block("Communities", o.communities.length ? `Detected from your email: ${o.communities.slice(0, 6).map((c) => esc(c.name)).join(", ")}. Review them in Your map.` : "Detected from your email when you sync.", "npm run brain -- communities")}
    ${o.enriched ? block("Enrichment", `${o.enriched} profiles enriched`, "npm run brain -- enrich --limit 25") : ""}
    <div class="source" id="filtered"></div>
  `;
  loadFiltered();
}

// ---------- boot ----------
api("/api/status").then((s) => {
  // Enrichment is optional: its buttons only appear once a provider key is set.
  document.body.classList.toggle("no-enrichment", !s.hasEnrichment);
  $("#railFoot").innerHTML =
    `${s.people} people<br>${esc(s.model)}${s.hasAnthropicKey ? "" : '<br><span class="error">ANTHROPIC_API_KEY not set</span>'}`;
});
