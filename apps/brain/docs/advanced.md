# Optional sources and features

Not needed for the core setup in the [README](../README.md). They all work; they're left out of the main path so the core gets proven first. Add one when a real question needs it.

## More sources

### Phone contacts

- iPhone: open contacts on iCloud.com, select all, then Export vCard. On a Mac: Contacts → File → Export → Export vCard.
- Android: Contacts → Settings → Export → `.vcf`.

```sh
npm run brain -- import vcf ~/Downloads/contacts.vcf
```

### X

Settings → Your account → **Download an archive of your data**.

```sh
npm run brain -- import x ~/Downloads/twitter-archive.zip
```

People are created from mutual follows and DM partners. One-way follows only attach to people already known by handle. The archive has account ids but not handles. Set `X_BEARER_TOKEN` to resolve ids to handles and names through the X API (billed per request).

## Communities in detail

**Detected automatically.** `sync` finds the communities you belong to from your email and ranks your top 10. You confirm them on the **Your map** screen, which opens on first run, or from the terminal:

```sh
npm run brain -- detect-communities          # also runs as part of sync
npm run brain -- communities                 # review: --confirm 2 [--role host] / --dismiss 5
```

How it works:
- **A catalog (`src/communities/catalog.ts`)** describes how communities show up in an inbox.
  - Platform rules: Mobilize groups, Luma calendars and hosts, Slack workspace invites, Discourse, Circle, Meetup, Bevy, Mighty Networks, Skool, Hivebrite, Bettermode, Google Groups.
  - Known public communities: canonical names, aliases, sub-groups and sending addresses.
  - No one's membership is stored there, so it can become a shared catalog later.
- **The scan** searches every Gmail category, including Promotions and Social where community mail usually lands. It reads headers and snippets only, except one email per unknown Mobilize group, whose footer gives the community's name.
  - It skips mail addressed to a colleague, newsletters, Slack Connect and your own company's workspace.
- **The ranking** weighs involvement: hosting, speaking, your own posts to a group, and event registrations count far more than digests. Recency and months of activity also count. Sub-groups roll up under their community (BVP → CFO, GTM and the rest).
- **Confirming** makes the community yours (with your role) across the app.

You can also add communities from two CSV imports:

```sh
npm run brain -- import communities members.csv            # community,name,email,linkedin,x,role,provider  (role=me for yourself)
npm run brain -- import community-activity posts.csv       # community,type(post|event),author_email,author_name,date,title,body,url,location
```

**Community emails (who else is in your communities).** `sync` reads the full body of community notification emails only. Other mail stays headers-only. It starts with Mobilize, the platform behind the Bessemer portfolio community. Each author becomes a community member with their company, each post becomes searchable activity, and you're recorded as a member. Mobilize relay addresses are never treated as real emails. Authors are matched to people you already know by name and company. Parsing is rule-based, so there's no Claude cost. To backfill 3 years:

```sh
npm run brain -- sync --only communities
```

Community membership is treated as **context, not proof of a relationship**, in scoring, paths and Claude's answers.

## Enrichment (People Data Labs / Apollo)

```sh
npm run brain -- enrich --limit 25            # strongest relationships first, each once per 180 days
npm run brain -- enrich --person p_abc123     # or the "Enrich profile" button in the web app
```

Default provider: **People Data Labs** (`PDL_API_KEY`). It looks people up by email, phone, LinkedIn URL or name + company, and it returns dated work and education history. That history is what lets the graph say "Sara worked with Daniel at Shopify 2018–2021". PDL bills only on a match and has a free monthly allowance, so enriching your top few hundred ties costs little. **Apollo** is the alternative (`ENRICHMENT_PROVIDER=apollo`, `APOLLO_API_KEY`), and it uses your plan's credits. Check both vendors' current pricing before a big run.

Enrichment calls are paced (`ENRICHMENT_PER_MINUTE`, default 10) and a rate-limit reply waits and retries, so a long run just goes slowly instead of failing. If the vendor keeps refusing, the run stops; people it didn't reach are picked up on the next run and nobody is looked up twice. Records that are clearly an inbox, team or organisation ("info", "Support Team", "TD Canada Trust") are skipped.

Enrichment can also _merge_ records: a LinkedIn-only person and a Gmail person with the same LinkedIn URL become one.

Companies can be enriched too (industry, size, HQ): `npm run brain -- enrich-companies --limit 25`. It uses the same provider and key.

## Semantic search (Voyage)

Set `VOYAGE_API_KEY` to add embeddings to search, which helps with vague questions like "people who've scaled support teams". Without it, search uses keywords plus structured filters. Voyage accounts without a payment method are limited to 3 requests a minute; the rebuild then stops embedding and carries on, and search falls back to keywords.

## Use it from Claude Desktop / Claude Code (MCP)

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

## What optional services receive

- **Enrichment provider:** name, emails, phone and LinkedIn URL of the people you enrich.
- **Voyage:** profile documents, for embedding.
- **X API:** account ids to resolve.

Nothing is sent to any of them unless you set its key.
