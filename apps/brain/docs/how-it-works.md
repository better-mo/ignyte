# How the brain works

- **Observations → people.** Each source record is stored raw and resolved by strong identifiers: normalized email (Gmail dots and plus tags folded), E.164 phone, LinkedIn slug, and X id/handle. When a record proves two people are the same, they merge. A careful same-name pass merges LinkedIn/X-only records into their Gmail/contact twin when nothing contradicts it. Every merge is logged in `merges`; `brain merge <keep> <drop>` fixes misses.
- **Humans only (`src/identity/automated.ts`).** Every source goes through the same checks, and every rebuild re-applies them to existing people:
  1. **Address.** Catches role mailboxes (`billing-eu@`, `team2@`), machine-made addresses (long ids, bounce addresses), and domains that only send notifications:
     - e-signature (`docusign.net`);
     - CRM logging addresses (`bcc.hubspot.com`);
     - helpdesk and tracker relays (`*.zendesk.com`, `*.atlassian.net`);
     - email service providers.

     Companies whose staff you do email (Stripe, Notion, GitHub) are only matched on robot-style addresses.
  2. **Name.** "Jane via Docusign" relays never give Jane's name to the service's address. Organisation, inbox, room and bot names (such as "Fireflies.ai Notetaker") are filtered out.
  3. **Behaviour.** Catches services nobody has listed. Someone who only sends you bulk mail (unsubscribe headers, `Feedback-ID`, or Gmail's Promotions, Social, Forums and Updates tabs) and whom you've never written to or met isn't a contact. A new contact also needs real two-way signal: you emailed them directly, you met, or they replied more than once. Being cc'd isn't enough.

  Filtered people are hidden, not deleted. Sources → *Filtered out as not a person* lists them with the reason, and restoring one means no rule ever hides them again.
- **Profile.** Display fields are rebuilt from all observations plus enrichment, with per-field source priority (contacts for names, enrichment for current role and location).
- **Strength (0–100).** Weighted touches: meetings count most, then direct emails and DMs, with a one-year half-life decay, a crowd penalty for big threads, a reciprocity bonus, and static signals (in your phone or contacts, LinkedIn connection, mutual follow). This yields a tier (Inner circle, Close, Active, Acquaintance, Weak tie) and a trend (warming, steady, cooling, dormant).
- **Graph.** Person↔person edges come from small shared threads, shared meetings, overlapping employment (`worked_together` with dates) and overlapping schools. Shared communities are computed at query time and always labeled as context.
- **Retrieval.** Each person gets a profile document: identity, career, places, communities, your labels, skills, relationship evidence, recent topics and your notes. It's indexed with SQLite FTS5 (BM25), and optionally embedded with Voyage (`VOYAGE_API_KEY`), fused by reciprocal rank. Structured filters and graph tools do the precise work; embeddings help fuzzy asks like "people who've scaled support teams".

`npm run brain -- rebuild` recomputes everything downstream of raw data and is safe to re-run. Imports and syncs run it automatically.

## Claude's tools

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

## Development

```sh
npm run typecheck
npm test                      # unit tests + end-to-end use-case tests over the demo network
node test/mock-anthropic.mjs  # scripted streaming /v1/messages for testing the chat loop offline:
                              # ANTHROPIC_API_KEY=x ANTHROPIC_BASE_URL=http://localhost:4555 npm run brain -- ask "..."
```

Layout: `src/sources` (connectors and importers), `src/identity` (normalization, resolution, promotion, profile rebuild), `src/enrich`, `src/graph` (strength, edges, paths and evidence), `src/index` (documents, FTS, embeddings, search), `src/agent` (tools and Claude loop), `src/server` + `src/ui` (local web app), `src/mcp.ts`, `src/cli.ts`.

## Not in the MVP yet

- Direct community connectors (Slack, Discord) and more digest parsers.
- Gmail push/watch instead of polling `sync`.
- A real map view (the place card lists people and events, with no geocoding).
- Undo for merges (the log exists; splitting doesn't).
- Scheduled sync and re-enrichment of people whose job likely changed.
