# Ignyte prototype decisions

- Scope: a complete UI-only consumer prototype. All people, insights, interactions, integrations and agent responses are fictional demonstration fixtures. No authentication, recording, uploads, external messaging, enrichment, or MCP calls occur.
- Stack: Next.js App Router, React, TypeScript, Tailwind CSS; custom semantic design tokens and reusable visual primitives. Local React state only; reload resets demo.
- Layout: `apps/web/app` for application entry and tokens; `components` for interactive screens; `lib` for typed fixture graph and provenance. No empty backend packages.
- Visual identity: warm ivory, deep pine, rust-orange highlights, Instrument Serif + DM Sans, fine dividers, relationship constellation. Fonts self-hosted from npm packages.
- Opening experience: populated Today view so reviewers see value immediately; conspicuous Start setup launches the complete onboarding journey.
- Graph maturity: First day (50), Growing (248), Connected (1,240) are narrative demo stages, not fetched counts. Full fixture list contains 50 people; stage counts describe the fictional graph beyond that curated list.
- AI: ChatGPT, Claude and other-agent experiences are explicitly simulated concepts. They show permission approval, grounded responses, source inspection, write confirmation, activity, and revocation. No claim of a published ChatGPT app or working MCP endpoint.
- Future Cohesive compatibility: user-scoped person, source identities, evidence-backed links, and separate community memberships with provider/external IDs. Community data augments identities and relationship evidence without changing person shape.
- Privacy actions only modify session demo state. No real personal data is processed. Demo notes never leave the browser.
- Responsive: desktop rail and two-column Today; compact mobile navigation and stacked cards; keyboard-accessible dialogs and reduced motion.
- Deployment: Vercel preview initially, with no API keys or environment variables required.

## Build phases

1. Foundation and Today: app shell, tokens, fixtures, home, responsive layouts.
2. First aha: people list/map, profile drawer, evidenced paths and intro drafts.
3. Habit: briefs, nudge actions and sample voice capture with person confirmation.
4. Complete journey: onboarding, source/import states, graph growth, AI permission and chat flows, privacy.
5. Verification: production build, browser journeys, mobile overflow, deployment and handoff.

## Personal People Brain MVP (`apps/brain`)

- Scope: a single-user, local tool that runs on real data, separate from the static `apps/web` prototype so the Vercel build is untouched.
- Storage: one SQLite file via Node's built-in `node:sqlite` (FTS5 for search). No database server and no native dependencies.
- Sources: Gmail/Contacts/Calendar via your own Desktop OAuth client (multiple accounts); LinkedIn, X and phone via their official data exports; communities from Gmail `List-Id` plus CSV imports until direct connectors exist.
- People are promoted from email only on two-way signal (you wrote, they replied, you met, they post to your list), which keeps newsletters and cold inbound out.
- Enrichment: People Data Labs by default (billed per match, dated work history powers "worked together" edges), Apollo as the alternative; strongest ties first, once per 180 days.
- Retrieval: structured graph tools do the precise work; FTS5 with optional Voyage embeddings handles fuzzy asks. Claude (`claude-opus-5`, adaptive thinking, server-side refusal fallback) calls 12 tools and ends with a `present` card for the UI.
- The same tools run over MCP (stdio) for Claude Desktop and Claude Code.
- Community membership is context, never proof of a relationship, in scoring, paths and answers.
