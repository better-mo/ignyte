# People Brain

A private "people" part of your brain. It reads your email, calendar, contacts and LinkedIn, works out who you actually know and how well, and lets you ask Claude about your network: who can introduce you to a company, who to see on a trip, who to prep for.

Everything lives in one SQLite file on your machine.

```
Gmail + Calendar + Contacts ─┐                 ┌─ who's who (email, phone, LinkedIn, name)
(one or more Google accounts)├─► your network ─┼─ how close you are (meetings, replies, recency)
LinkedIn export ─────────────┘                 ├─ companies and communities you're connected to
                                               └─ Claude answers with evidence
```

## Try it with demo data (2 minutes)

```sh
cd apps/brain
npm install
IGNYTE_DATA_DIR=.demo npm run demo
ANTHROPIC_API_KEY=sk-... IGNYTE_DATA_DIR=.demo npm run serve   # http://localhost:4321
```

Requires Node 22.13+.

## Set up with your data

Copy `.env.example` to `.env` and add your `ANTHROPIC_API_KEY`.

### 1. Google: Gmail, Calendar, Contacts

One OAuth client covers all your Google accounts:

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable **Gmail API**, **People API** and **Google Calendar API**.
2. OAuth consent screen: User type External, status Testing. Add each of your Google accounts as a test user.
3. Credentials → Create OAuth client ID → **Desktop app**. Put the ID and secret in `.env`.
4. Connect each account, then sync:

```sh
npm run brain -- connect google Work --hint you@company.com
npm run brain -- connect google Personal --hint you@gmail.com
npm run brain -- sync
```

Gmail is read as **headers and snippets only**, never full bodies or attachments. Only people you really correspond with become contacts, and newsletters, notifications and shared inboxes are filtered out. Sync also detects the communities you're part of from your email.

> Google expires refresh tokens after 7 days for apps in Testing. If sync says the token is invalid, run `connect google` again.

### 2. LinkedIn

LinkedIn → Settings → Data privacy → **Get a copy of your data**. The connections file arrives within minutes.

```sh
npm run brain -- import linkedin ~/Downloads/Basic_LinkedInDataExport.zip
```

This adds titles and companies for your connections and your own work history.

## Use it

```sh
npm run serve        # http://localhost:4321
```

- **Your map** (opens first): your closest people, the companies you can reach, and your top communities. Confirm the communities that are yours.
- **Ask**: questions about your network, answered with evidence. Start with these:
  - "Who can introduce me to someone at Shopify?"
  - "Which support or CX leaders do I know who could be early customers?"
  - "I'm in New York next week. Who should I see?"
  - "Is anyone in my network hiring, and who might be a fit?"
  - "Prep me for my next meeting."
  - "Who in my network has been through SOC 2?"
- **People**, **Communities**, **Graph**: browse.

Also from the terminal: `npm run brain -- ask "..."` or `npm run brain -- chat`.

When an answer is wrong or thin, write down the question and what you expected. Those notes decide what gets fixed next.

Re-run `npm run brain -- sync` whenever you want fresh data. It's incremental.

## Privacy

Your data stays in `~/.ignyte/brain.db`. During a chat, Claude receives your question and the profiles and snippets it looks up. The web app listens on `127.0.0.1` only. Optional services (enrichment, Voyage, X) get data only if you set their keys; see [what they receive](docs/advanced.md#what-optional-services-receive).

## More

- [Optional sources and features](docs/advanced.md): phone contacts, X, enrichment, semantic search, community CSV imports, MCP for Claude Desktop and Claude Code.
- [How it works](docs/how-it-works.md): identity resolution, relationship strength, the human-only filter, the graph, search, Claude's tools and development.
