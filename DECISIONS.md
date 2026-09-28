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

## Landing page — September 28, 2026

- The public root is now the editorial landing page. The complete consumer prototype is preserved at `/app/`; query parameters provide meaningful entry points.
- Story order: instant opportunity reveal; three existing-assistant conversations; two in-product everyday moments; community-based expertise; a closing invitation.
- Six use cases are demonstrated through specific people and grounded sample evidence. Community membership provides context, never proof of a personal relationship.
- Two-click setup is explicitly a demo flow. Click one opens the sample account; click two reveals a graph and Shopify introduction. It requests no real Google permissions. The initial map labels Google contacts/calendar rather than implying access to community memberships.
- Visual direction extends the existing Instrument Serif / DM Sans identity: warm paper, deep forest conversation section, olive illustration lines, rust-orange accents, gently tilted notes, and custom vector people maps. No stock hero photography or feature-grid layout.
- Reused production primitives: Avatar, Spark, Dialog and typed people fixtures. New marketing components stay under `components/landing`; styles use a dedicated `l-` prefix and landing-specific tokens. Tempo canvas tools were not available, so the runnable website is the design deliverable.
- Interactions: keyboard-operable story tabs, assistant switching, evidence expansion, opportunity carousel, local saved-state toggle, meeting question reveal, community switching, mobile navigation, two-click dialog, and privacy detail. All behavior remains UI-only.
- Verified at 360, 390, 768, 1024, 1440 and 1920 pixels. Motion respects reduced-motion settings. Narrative copy is larger than decorative source labels; mobile hero typography fits three lines.
