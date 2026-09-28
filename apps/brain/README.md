# People Brain (personal MVP)

A private, local "people" part of your brain. It pulls in everyone you know from your own accounts, works out who's who across sources, enriches the people who matter, builds a relationship graph with evidence, and lets you talk to it with Claude.

It's built for one user: you. Everything lives in one SQLite file on your machine. There's no server to run beyond `npm run serve`.

```
Gmail (n accounts) ─┐
Google Contacts ────┤                 ┌─ identity resolution (email, phone, LinkedIn, X, name)
Google Calendar ────┤                 ├─ enrichment (People Data Labs / Apollo) ─ work history
LinkedIn export ────┼─► observations ─┼─ relationship strength (recency × frequency × reciprocity)
X archive ──────────┤   interactions  ├─ person↔person graph (threads, meetings, worked/studied together)
Phone .vcf ─────────┤                 ├─ communities (mailing lists, member/post CSVs)
Community CSVs ─────┘                 └─ retrieval index (FTS5 + optional Voyage embeddings)
                                                     │
                                  Claude tool use ◄──┴──► web app · terminal · MCP (Claude Desktop/Code)
```

## Try it in two minutes (no accounts needed)

```sh
cd apps/brain
npm install
IGNYTE_DATA_DIR=.demo npm run demo       # loads a fictional network through the real pipeline
IGNYTE_DATA_DIR=.demo npm run brain -- paths Shopify
ANTHROPIC_API_KEY=sk-... IGNYTE_DATA_DIR=.demo npm run serve   # http://localhost:4321
```

The demo network is built to cover the six use cases: Sara → Daniel at Shopify, support leaders in CX Leaders, Maya and a Design Collective event in New York, Priya hiring and Maya exploring roles, a Priya meeting brief, and Omar's SOC 2 post reachable through Leo.

Requires Node 22.13+ (it uses the built-in `node:sqlite`).

## Connect your real data

Copy `.env.example` to `.env`. Data goes to `~/.ignyte/brain.db` unless you set `IGNYTE_DATA_DIR`.

### Gmail, Google Contacts, Google Calendar (multiple accounts)

One OAuth client covers all your Google accounts:

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable **Gmail API**, **People API** and **Google Calendar API**.
2. OAuth consent screen: set User type to External and publishing status to Testing, then add each of your Google accounts as a test user.
3. Credentials → Create OAuth client ID → **Desktop app**. Put the ID and secret in `.env`.
4. Connect each account, then sync:

```sh
npm run brain -- connect google Work --hint you@company.com
npm run brain -- connect google Personal --hint you@gmail.com
npm run brain -- sync                       # all accounts; later runs are incremental
```

What's read: Gmail **headers and the snippet only** (From/To/Cc/Date/Subject/List-Id, never bodies or attachments), contacts and "other contacts", and calendar events from the last 3 years plus the next 60 days. Only addresses you actually correspond with become people: you wrote to them, they replied on a thread you're on, you met, or they post to a mailing list you're on. Newsletters and unanswered cold email are ignored. Mailing lists (`List-Id`) become communities.

> Google expires refresh tokens after 7 days for External apps in Testing. If a sync says the token is invalid, re-run `connect google`. A Workspace account can use an Internal consent screen to avoid this.

### LinkedIn

On LinkedIn, go to Settings → Data privacy → **Get a copy of your data**. The "connections + messages" subset arrives within minutes; the full archive also includes positions and education.

```sh
npm run brain -- import linkedin ~/Downloads/Basic_LinkedInDataExport_09-28-2026.zip
```

This imports Connections (company, title, connected-on), messages, endorsements, and your own positions and schools. Your positions power "you worked together at X". Most connections have no email, so they're matched to Gmail/contacts people by name and company, and by LinkedIn URL once enriched.

### X

Settings → Your account → **Download an archive of your data**.

```sh
npm run brain -- import x ~/Downloads/twitter-archive.zip
```

People are created from mutual follows and DM partners. One-way follows only attach to people already known by handle. The archive has account ids but not handles. Set `X_BEARER_TOKEN` to resolve ids to handles and names through the X API (billed per request).

### Phone contacts

- iPhone: open contacts on iCloud.com, select all, then Export vCard. On a Mac: Contacts → File → Export → Export vCard.
- Android: Contacts → Settings → Export → `.vcf`.

```sh
npm run brain -- import vcf ~/Downloads/contacts.vcf
```

### Communities

Until there are direct connectors (Bettermode, Slack, Discord), communities come from Gmail mailing lists automatically, plus two CSV imports:

```sh
npm run brain -- import communities members.csv            # community,name,email,linkedin,x,role,provider  (role=me for yourself)
npm run brain -- import community-activity posts.csv       # community,type(post|event),author_email,author_name,date,title,body,url,location
```

**Community emails (who else is in your communities).** `sync` reads the full body of community notification emails only. Other mail stays headers-only. It starts with Mobilize, the platform behind the Bessemer portfolio community. Each author becomes a community member with their company, each post becomes searchable activity, and you're recorded as a member. Mobilize relay addresses are never treated as real emails. Authors are matched to people you already know by name and company. Parsing is rule-based, so there's no Claude cost. To backfill 3 years:

```sh
npm run brain -- sync --only communities
```

Community membership is treated as **context, not proof of a relationship**, in scoring, paths and Claude's answers.

## Enrichment

```sh
npm run brain -- enrich --limit 25            # strongest relationships first, each once per 180 days
npm run brain -- enrich --person p_abc123     # or the "Enrich profile" button in the web app
```

Default provider: **People Data Labs** (`PDL_API_KEY`). It looks people up by email, phone, LinkedIn URL or name + company, and it returns dated work and education history. That history is what lets the graph say "Sara worked with Daniel at Shopify 2018–2021". PDL bills only on a match and has a free monthly allowance, so enriching your top few hundred ties costs little. **Apollo** is the alternative (`ENRICHMENT_PROVIDER=apollo`, `APOLLO_API_KEY`), and it uses your plan's credits. Check both vendors' current pricing before a big run.

Enrichment can also _merge_ records: a LinkedIn-only person and a Gmail person with the same LinkedIn URL become one.

## Talk to it

```sh
npm run serve                 # web app at http://localhost:4321: Ask, People, Graph, Sources
npm run brain -- chat         # terminal
npm run brain -- ask "Who can introduce me to someone at Shopify?"
```

Claude (`claude-opus-5` with adaptive thinking; change with `IGNYTE_MODEL`) answers with these tools:

| Tool                              | Use                                                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `search_people`                   | Hybrid semantic + keyword search with city / company / community / strength filters                        |
| `get_person`                      | Full profile: career, communities, how you know them (evidence), recent interactions, notes, who they know |
| `who_do_i_know_at`                | Current and former employees of a company, including by email domain                                       |
| `find_warm_paths`                 | You → target, you → friend → target, 3 hops if needed; per-hop evidence, with context-only hops flagged    |
| `search_activity`                 | What people said: email subjects/snippets, DMs, LinkedIn messages, community posts and events              |
| `communities`                     | Your communities and their members ranked by relationship                                                  |
| `upcoming`                        | Upcoming meetings and community events, by place (trips) or person                                         |
| `prep_meeting`                    | Meeting brief: last touches, shared communities, their recent posts, mutual connections, next meeting      |
| `relationships_needing_attention` | Strong ties going cold                                                                                     |
| `overview`                        | Shape of the network and sync status                                                                       |
| `add_note`                        | Remember something about someone                                                                           |
| `present`                         | Claude picks what to show: an intro path, shortlist, brief, bridge (two people to introduce) or place card |

### Use it from Claude Desktop / Claude Code (MCP)

The same tools (minus `present`) run as an MCP server:

```json
{
  "mcpServers": {
    "people-brain": {
      "command": "npm",
      "args": [
        "--prefix",
        "/absolute/path/to/ignyte/apps/brain",
        "run",
        "--silent",
        "mcp"
      ]
    }
  }
}
```

In Claude Code: `claude mcp add people-brain -- npm --prefix /absolute/path/to/ignyte/apps/brain run --silent mcp`.

## How the brain works

- **Observations → people.** Each source record is stored raw and resolved by strong identifiers: normalized email (Gmail dots and plus tags folded), E.164 phone, LinkedIn slug, and X id/handle. When a record proves two people are the same, they merge. A careful same-name pass merges LinkedIn/X-only records into their Gmail/contact twin when nothing contradicts it. Every merge is logged in `merges`; `brain merge <keep> <drop>` fixes misses.
- **Profile.** Display fields are rebuilt from all observations plus enrichment, with per-field source priority (contacts for names, enrichment for current role and location).
- **Strength (0–100).** Weighted touches: meetings count most, then direct emails and DMs, with a one-year half-life decay, a crowd penalty for big threads, a reciprocity bonus, and static signals (in your phone or contacts, LinkedIn connection, mutual follow). This yields a tier (Inner circle, Close, Active, Acquaintance, Weak tie) and a trend (warming, steady, cooling, dormant).
- **Graph.** Person↔person edges come from small shared threads, shared meetings, overlapping employment (`worked_together` with dates) and overlapping schools. Shared communities are computed at query time and always labeled as context.
- **Retrieval.** Each person gets a profile document: identity, career, places, communities, your labels, skills, relationship evidence, recent topics and your notes. It's indexed with SQLite FTS5 (BM25), and optionally embedded with Voyage (`VOYAGE_API_KEY`), fused by reciprocal rank. Structured filters and graph tools do the precise work; embeddings help fuzzy asks like "people who've scaled support teams".

`npm run brain -- rebuild` recomputes everything downstream of raw data and is safe to re-run. Imports and syncs run it automatically.

## Privacy

Your data stays in `~/.ignyte/brain.db`. It leaves your machine only when you use these services:

- **Anthropic:** the question and the tool results Claude asks for (profiles, snippets) during a chat.
- **Enrichment provider:** name, emails, phone and LinkedIn URL of the people you enrich.
- **Voyage** (if enabled): profile documents for embedding.
- **X API** (if enabled): account ids to resolve.

The web server binds to `127.0.0.1` only. Hide someone from the web app and they drop out of search, paths and Claude's answers.

## Development

```sh
npm run typecheck
npm test                      # unit tests + end-to-end use-case tests over the demo network
node test/mock-anthropic.mjs  # scripted streaming /v1/messages for testing the chat loop offline:
                              # ANTHROPIC_API_KEY=x ANTHROPIC_BASE_URL=http://localhost:4555 npm run brain -- ask "..."
```

Layout: `src/sources` (connectors and importers), `src/identity` (normalization, resolution, promotion, profile rebuild), `src/enrich`, `src/graph` (strength, edges, paths and evidence), `src/index` (documents, FTS, embeddings, search), `src/agent` (tools and Claude loop), `src/server` + `src/ui` (local web app), `src/mcp.ts`, `src/cli.ts`.

## Not in the MVP yet

- Direct community connectors (Bettermode, Slack, Discord) instead of CSVs.
- Gmail push/watch instead of polling `sync`.
- A real map view (the place card lists people and events, with no geocoding).
- Undo for merges (the log exists; splitting doesn't).
- Scheduled sync and re-enrichment of people whose job likely changed.
