# Ignyte — Your people, closer.

> **Looking for the working personal MVP?** [`apps/brain`](apps/brain/README.md) is a real, local People Brain. It connects Gmail (multiple accounts), Google Contacts and Calendar, LinkedIn, X, phone contacts and communities, then resolves identities, enriches profiles and builds an evidence-backed relationship graph. You can talk to it with Claude in a local web app, the terminal, or over MCP. The rest of this README covers the UI-only design prototype in `apps/web`.

A complete, responsive, UI-only consumer prototype of a private **People Brain**. It tells the story from first setup to a growing personal graph, warm introductions, daily context, and a permissioned connection to the user's own AI.

**All people, profiles, evidence, source connections, counts, and agent answers are fictional demo fixtures.** No Google sign-in, uploaded files, recording, external messaging, real model calls, database, or MCP server is implemented. Prototype interactions live in browser memory and reset on reload. Portraits use remote placeholder images with initials as a fallback; fonts are bundled locally.

## Run it

Requirements: Node 22+ and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. No environment variables, account credentials, or services are needed.

```sh
npm run build
npm run typecheck
```

The production build exports a static site to `apps/web/out`. The explicit Webpack build avoids restricted-environment Turbopack worker port issues; it does not change the UI. To serve the production export locally:

```sh
python3 -m http.server 4173 --directory apps/web/out
```

## Five-minute demo

1. **First 60 seconds:** Click **Start setup**. Continue with the sample Google account. Review Contacts, Calendar, and Email headers separately. The map reveals the first familiar faces progressively, followed by the Shopify introduction aha. Complete setup to see the first 50 people.
2. **Instant value:** From Today, choose **Someone at Shopify**. Explore **You → Sara → Daniel**. Inspect why the path exists, then edit and copy the intro request. Nothing is sent. Search an unknown company to see the honest no-evidence state.
3. **Make relationships useful:** Open Priya's profile, inspect the connection explanation, read her meeting brief, and draft a congratulations. Preview a voice note, review the transcript, confirm the person, and find it in **Your notes**.
4. **A growing graph:** Explore **Possibilities**. Switch First day → Growing → Connected. Follow the hiring, Toronto, meeting-prep, and AI stories. Add sample LinkedIn, phone, or X data under Connections; the source previews include guidance, matching, and import error recovery. Cohesive is clearly a future concept.
5. **The People Brain:** Open **Your people brain**. Connect the simulated ChatGPT assistant, approve read access, and optionally allow confirmed notes. Ask about Shopify, designer hiring, or Toronto. Inspect exactly which context was shared. Try a note, confirm it, and inspect the activity trail. Revoke the connection. The Claude and Other agents tabs use the same conceptual permission flow.

## What is interactive

- Full onboarding: account selection, three permission explanations, incremental map build, first aha, optional-source wishlist.
- Today: three grounded nudges with dismissal and undo, editable drafts, morning brief, meeting briefs, growth stage selector.
- People: 50 fixture records, name/company/role search, tier/city/trend filters, curated map, profile tabs, score explanations, personal notes, visibility controls.
- Paths: demo searches with direct matches, a confirmed Shopify introduction, evidence, intro drafts, and empty results.
- Graph growth: three narrative stages and four end-to-end use cases.
- Sources: Google consent preview, LinkedIn profile/export instructions, sample CSV/vCard/archive import reviews, recoverable error, disconnection and deletion previews, Cohesive context.
- Voice: sample capture → editable transcript → person selection → confirmed note.
- Agent concept: ChatGPT/Claude/MCP-compatible agent selection, scoped consent, grounded sample responses, context inspection, per-note confirmation, activity, revocation.
- Privacy: morning email preference preview, personal-note sharing preference, hidden people, demo reset.
- Responsive layouts, keyboard navigation, dialog focus traps, escape-to-dismiss, and reduced motion.

A saved note remains in this browser session. No persistence or real integration is implied. The first-day/growing/connected counts describe a fictional wider graph; the searchable fixture list is explicitly the closest 50. The map is a curated 12-person visualization, not a force-directed implementation of the entire dataset.

## Project layout

```text
apps/web/app/              Entry point, global design tokens, responsive styles
apps/web/components/      Today and core screens, onboarding, People Brain, UI primitives
apps/web/lib/demo.ts       User-scoped people, identities, relationship evidence, communities
public/                   Reserved static asset directory
tests/                   Browser journey verification
DECISIONS.md              Scope, visual direction, and implementation defaults
vercel.json               Reproducible static deployment configuration
```

## Future integration contract

This prototype deliberately has no backend. The fixture types separate person identity, source provenance, evidence-backed graph links, and community memberships. Cohesive adds memberships with `provider`, `externalId`, and `communityName` to the existing user-scoped graph. A shared community signals context, not proof of a personal relationship.

The intended remote MCP contract is `search_people`, `get_person`, `who_do_i_know_at`, `find_warm_paths`, `recent_changes`, `relationships_needing_attention`, `prep_meeting`, and `add_note`. Everything is read-only except a user-confirmed note. Production must enforce per-user authorization, hidden-person filters, separate note permissions, token revocation, and an audit log on the server. This UI does not provide those security mechanisms.

### ChatGPT and Claude connector concept

There is no published Ignyte ChatGPT app and no live MCP endpoint yet. The **How it connects** screen demonstrates the intended setup:

1. Add the future Ignyte app/custom connector in an assistant that supports it.
2. Sign into Ignyte and approve a limited read scope.
3. Optionally enable note requests; review every proposed write.
4. Ask about a company or person; receive relationship summaries with evidence.
5. Review activity and revoke access from Ignyte.

Actual app availability, custom-connector setup, and OAuth configuration belong to a future integration phase and should be verified against the assistant's current documentation. This prototype doesn't ask the user to paste a non-working endpoint into Claude.

### Google production handoff

Future Google work should request contacts, calendar, and `gmail.metadata` incrementally. Read only From, To, Cc, and Date; never fetch or store bodies or attachments. The product brief calls out Google's restricted-scope verification and security-assessment requirements. Use Google Cloud testing mode and explicit test users during integration development, and verify the applicable requirements before public launch. None of these scopes is requested by this prototype.

## Browser verification

With the production export served on port 4173:

```sh
npx playwright install chromium
npm run test:e2e
```

The tests exercise the complete onboarding, evidence-backed warm paths, honest empty search, people filters/map, voice confirmation, agent permissions/write confirmation/revocation, source import recovery, privacy reset, and mobile overflow. These validate the UI prototype, not unimplemented graph engines or access-control servers.

## Deploy to Vercel

The project builds as a static export; no secrets or external services are required. Import the repository in Vercel at the repository root. `vercel.json` configures `npm run build` and `apps/web/out` automatically, with the framework preset set to Other.

Or deploy a preview using the authenticated CLI:

```sh
npx vercel --yes --scope betterborg
```

Review the preview before promoting it to a permanent production URL. Deployment access protection follows the Vercel team's project defaults.
