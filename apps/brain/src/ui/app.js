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
  c.innerHTML = `<div class="kind">${esc(card.kind)}</div><h3 class="card-title">${esc(card.title)}</h3>${body}${events}${draft}`;
  c.querySelector("[data-copy]")?.addEventListener("click", (e) => {
    navigator.clipboard.writeText(card.draft);
    e.target.textContent = "Copied";
  });
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-person]");
  if (el) openPerson(el.dataset.person);
});

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
      <button class="btn" data-act="enrich">Enrich profile</button>
      <button class="btn" data-act="hide">Hide</button>
    </div>
    ${section("How you know them", list(p.how_you_know_them.map(esc)))}
    ${section("Career", list(p.career.map((j) => `${esc(j.title ?? "")}${j.title ? " at " : ""}<b>${esc(j.company)}</b>${j.start_date ? ` <span class="muted">${esc(j.start_date.slice(0, 4))}–${j.is_current ? "now" : esc(j.end_date?.slice(0, 4) ?? "?")}</span>` : ""}`)))}
    ${section("Education", list(p.education.map((s) => `${esc(s.school)}${s.degree ? ` <span class="muted">${esc(s.degree)}</span>` : ""}`)))}
    ${section("Communities", p.communities.length ? badges(p.communities.map((c) => (p.shared_communities_with_you.includes(c) ? `${c} (you too)` : c))) : "")}
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
async function loadPeople() {
  const params = new URLSearchParams({
    q: $("#q").value,
    city: $("#fCity").value,
    company: $("#fCompany").value,
    community: $("#fCommunity").value,
    weak: "1",
    limit: "120",
  });
  const people = await api(`/api/people?${params}`);
  $("#peopleList").innerHTML =
    people
      .map(
        (
          p,
        ) => `<button class="person-card" data-person="${esc(p.id)}">${avatar(p)}<div><b>${esc(p.name)}</b><div class="muted">${esc(p.headline ?? "")}</div>
        <div class="tier">${esc(p.tier ?? "—")}${p.city ? ` · ${esc(p.city)}` : ""}${p.last ? ` · ${ago(p.last)}` : ""}</div>${strengthBar(p.strength)}</div></button>`,
      )
      .join("") || `<p class="muted">No one matches.</p>`;
}

// ---------- graph ----------
async function loadGraph() {
  const el = $("#graph");
  if (!window.d3)
    return (el.innerHTML = `<p class="muted">Graph library failed to load.</p>`);
  const data = await api("/api/graph?limit=150");
  el.innerHTML = "";
  const { width, height } = el.getBoundingClientRect();
  const meNode = {
    id: "me",
    name: "You",
    strength: 100,
    me: true,
    fx: width / 2,
    fy: height / 2,
  };
  const nodes = [meNode, ...data.nodes];
  const links = [
    ...data.nodes.map((n) => ({
      source: "me",
      target: n.id,
      weight: n.strength / 25,
      me: true,
    })),
    ...data.edges.map((e) => ({
      source: e.a,
      target: e.b,
      weight: e.weight,
      kind: e.kind,
    })),
  ];
  const tierColor = {
    "Inner circle": "#344f3c",
    Close: "#5b7a5f",
    Active: "#8fa88c",
    Acquaintance: "#c9b79c",
    "Weak tie": "#d9d4c7",
  };
  const svg = d3
    .select(el)
    .append("svg")
    .attr("viewBox", [0, 0, width, height]);
  const g = svg.append("g");
  svg.call(
    d3
      .zoom()
      .scaleExtent([0.3, 4])
      .on("zoom", (e) => g.attr("transform", e.transform)),
  );
  const sim = d3
    .forceSimulation(nodes)
    .force(
      "link",
      d3
        .forceLink(links)
        .id((d) => d.id)
        .distance((l) => (l.me ? 260 - l.target.strength * 2 : 60))
        .strength((l) => (l.me ? 0.08 : 0.4)),
    )
    .force("charge", d3.forceManyBody().strength(-120))
    .force(
      "collide",
      d3.forceCollide().radius((d) => 6 + d.strength / 8),
    );
  const link = g
    .append("g")
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke", (l) =>
      l.me ? "#e6e6dd" : l.kind === "worked_together" ? "#bc5c3b" : "#8a8e83",
    )
    .attr("stroke-opacity", (l) => (l.me ? 0.5 : 0.7))
    .attr("stroke-width", (l) =>
      l.me ? 0.6 : Math.min(3, 0.6 + l.weight / 2),
    );
  const node = g
    .append("g")
    .selectAll("g")
    .data(nodes)
    .join("g")
    .style("cursor", "pointer")
    .on("click", (_, d) => !d.me && openPerson(d.id))
    .call(
      d3
        .drag()
        .on("start", (e, d) => {
          if (!e.active) sim.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (e, d) => {
          d.fx = e.x;
          d.fy = e.y;
        })
        .on("end", (e, d) => {
          if (!e.active) sim.alphaTarget(0);
          if (!d.me) {
            d.fx = null;
            d.fy = null;
          }
        }),
    );
  node
    .append("circle")
    .attr("r", (d) => (d.me ? 14 : 4 + d.strength / 10))
    .attr("fill", (d) => (d.me ? "#bc5c3b" : (tierColor[d.tier] ?? "#d9d4c7")))
    .attr("stroke", "#fffefa")
    .attr("stroke-width", 1.5);
  node
    .append("title")
    .text((d) => `${d.name}${d.headline ? ` — ${d.headline}` : ""}`);
  node
    .filter((d) => d.me || data.nodes.length < 40 || d.strength >= 35)
    .append("text")
    .attr("x", (d) => 8 + d.strength / 10)
    .attr("y", 4)
    .text((d) => d.name);
  sim.on("tick", () => {
    link
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);
    node.attr("transform", (d) => `translate(${d.x},${d.y})`);
  });
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
    ${block("X", acct("x").length ? `${esc(acct("x")[0].label)} · ${count("x")} people · ${state(acct("x")[0])}` : "Not imported.", "npm run brain -- import x ~/Downloads/twitter-archive.zip")}
    ${block("Phone contacts", acct("phone").length ? `${count("phone")} people · ${state(acct("phone")[0])}` : "Not imported.", "npm run brain -- import vcf ~/Downloads/contacts.vcf")}
    ${block("Communities", o.communities.length ? o.communities.map((c) => `${esc(c.name)} (${c.members})`).join(", ") : "None yet.", "npm run brain -- import communities members.csv\nnpm run brain -- import community-activity posts.csv")}
    ${block("Enrichment", `${o.enriched ?? 0} profiles enriched`, "npm run brain -- enrich --limit 25")}
  `;
}

// ---------- boot ----------
api("/api/status").then((s) => {
  $("#railFoot").innerHTML =
    `${s.people} people<br>${esc(s.model)}${s.hasAnthropicKey ? "" : '<br><span class="error">ANTHROPIC_API_KEY not set</span>'}`;
});
