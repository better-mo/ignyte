import readline from "node:readline/promises";
import { config } from "./config.ts";
import { get } from "./db/index.ts";
import { Conversation } from "./agent/chat.ts";
import { toolByName } from "./agent/tools.ts";
import { enrichPeople } from "./enrich/index.ts";
import { mergePeople } from "./identity/store.ts";
import { rebuildPerson } from "./identity/profile.ts";
import { rebuild, syncGoogle } from "./pipeline.ts";
import { connectGoogleAccount } from "./sources/google/auth.ts";
import {
  importCommunityActivity,
  importCommunityMembers,
} from "./sources/communities.ts";
import { importLinkedIn } from "./sources/linkedin.ts";
import { googleAccounts } from "./sources/google/auth.ts";
import { detectCommunities } from "./sources/google/communityDetect.ts";
import {
  confirmCandidate,
  dismissCandidate,
  listCandidates,
} from "./communities/detect.ts";

function printCandidates() {
  const list = listCandidates(10);
  if (!list.length) return console.log("No communities detected yet.");
  console.log("\nYour top communities:");
  list.forEach((c, i) => {
    const e = c.evidence;
    const mark = c.status === "confirmed" ? "✓" : " ";
    console.log(
      `${mark} ${String(i + 1).padStart(2)}. ${c.name}${e.groups.length ? ` (${e.groups.join(", ")})` : ""} — ${c.role}, ${e.messages} email${e.messages === 1 ? "" : "s"} over ${e.months} month${e.months === 1 ? "" : "s"}, last ${e.last.slice(0, 10)} [${c.platform}]`,
    );
  });
  console.log("\nConfirm with: communities --confirm <n> [--role host]   Hide with: communities --dismiss <n>");
}
import { importVcf } from "./sources/vcard.ts";
import { importX } from "./sources/x.ts";

const HELP = `People Brain — your network, resolved, enriched and queryable by Claude.

Data: ${config.dataDir}

Set up
  connect google <label> [--hint you@gmail.com]   Sign in to a Google account (repeat per account)
  sync [--account <email|label>] [--only gmail,contacts,calendar,communities]
  import linkedin <export.zip|folder>

Use
  serve [--port 4321]                             Web app: Your map, Ask, People, Communities, Graph
  ask "<question>"                                One question to Claude
  chat                                            Terminal chat
  communities [--confirm <n>] [--dismiss <n>] [--role host]   Review your detected communities
  search "<query>" [--city X] [--company X] [--community X]
  person <id|name>
  paths <company>
  company <name|domain>
  stats

Maintain
  rebuild                                         Recompute everything (runs after sync and imports)
  merge <keep-id> <merge-id>                      Merge two people
  company-alias <alias> <company>                 e.g. company-alias "Square" "Block"

Optional (see docs/advanced.md)
  import vcf <contacts.vcf>                       Phone contacts
  import x <archive.zip|folder>
  import communities <members.csv>                community,name,email,linkedin,x,role
  import community-activity <posts.csv>
  detect-communities [--account <email|label>]    Re-scan Gmail for communities (sync does this)
  enrich [--limit 25] [--min-strength 35] [--person <id>]   Needs PDL_API_KEY or APOLLO_API_KEY
  enrich-companies [--limit 25] [--company <name>]
  companies [--industry X] [--city X]
  mcp                                             MCP server for Claude Desktop / Claude Code
`;

function flags(args: string[]) {
  const out: Record<string, string | boolean> = {};
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      if (v !== undefined) out[k] = v;
      else if (args[i + 1] && !args[i + 1].startsWith("--")) out[k] = args[++i];
      else out[k] = true;
    } else rest.push(a);
  }
  return { flags: out, rest };
}

const print = (v: unknown) => console.log(JSON.stringify(v, null, 2));

async function chatOnce(convo: Conversation, question: string) {
  await convo.send(question, {
    onText: (d) => process.stdout.write(d),
    onToolCall: (name, input) =>
      process.stderr.write(`\n  · ${name} ${JSON.stringify(input)}\n`),
    onCard: (card) => {
      const c = card as {
        kind: string;
        title: string;
        people: { name: string; reason: string }[];
      };
      process.stdout.write(
        `\n\n[${c.kind}] ${c.title}\n${c.people.map((p, i) => `  ${i + 1}. ${p.name} — ${p.reason}`).join("\n")}\n`,
      );
    },
  });
  process.stdout.write("\n");
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const { flags: f, rest } = flags(args);
  switch (cmd) {
    case "connect": {
      if (rest[0] !== "google" || !rest[1])
        throw new Error("Usage: connect google <label> [--hint email]");
      const acct = await connectGoogleAccount(
        rest[1],
        typeof f.hint === "string" ? f.hint : undefined,
      );
      console.log(
        `Connected ${acct.email} as "${acct.label}". Next: npm run brain -- sync --account ${acct.email}`,
      );
      break;
    }
    case "sync": {
      const parts = typeof f.only === "string" ? f.only.split(",") : undefined;
      await syncGoogle(
        console.log,
        typeof f.account === "string" ? f.account : undefined,
        parts,
      );
      await rebuild(console.log, { embed: !f["no-embed"] });
      break;
    }
    case "import": {
      const [kind, file] = rest;
      if (!file)
        throw new Error(
          "Usage: import <linkedin|x|vcf|communities|community-activity> <path>",
        );
      if (kind === "linkedin") importLinkedIn(file);
      else if (kind === "x") await importX(file);
      else if (kind === "vcf" || kind === "phone") importVcf(file);
      else if (kind === "communities") importCommunityMembers(file);
      else if (kind === "community-activity") importCommunityActivity(file);
      else throw new Error(`Unknown import kind ${kind}`);
      await rebuild(console.log, { embed: !f["no-embed"] });
      break;
    }
    case "rebuild":
      await rebuild(console.log, { embed: !f["no-embed"] });
      break;
    case "detect-communities": {
      const accounts = googleAccounts().filter(
        (a) => typeof f.account !== "string" || a.email === f.account || a.label === f.account,
      );
      if (!accounts.length) throw new Error("No Google accounts connected.");
      for (const a of accounts) await detectCommunities(a);
      printCandidates();
      break;
    }
    case "communities": {
      const list = listCandidates(30);
      const pick = (v: unknown) =>
        typeof v === "string" ? (list[Number(v) - 1]?.key ?? v) : undefined;
      const confirm = pick(f.confirm);
      const dismiss = pick(f.dismiss);
      if (confirm) confirmCandidate(confirm, typeof f.role === "string" ? f.role : undefined);
      if (dismiss) dismissCandidate(dismiss);
      if (confirm || dismiss) await rebuild(console.log, { embed: false });
      printCandidates();
      break;
    }
    case "enrich":
      await enrichPeople({
        limit: f.limit ? Number(f.limit) : undefined,
        minStrength: f["min-strength"] ? Number(f["min-strength"]) : undefined,
        provider: typeof f.provider === "string" ? f.provider : undefined,
        personIds: typeof f.person === "string" ? [f.person] : undefined,
        force: !!f.force,
      });
      await rebuild(console.log);
      break;
    case "enrich-companies": {
      const { enrichCompanies } = await import("./companies/enrich.ts");
      const { findCompany } = await import("./companies/index.ts");
      const target =
        typeof f.company === "string" ? findCompany(f.company) : undefined;
      if (typeof f.company === "string" && !target)
        throw new Error(`No company matching "${f.company}"`);
      await enrichCompanies({
        limit: f.limit ? Number(f.limit) : undefined,
        companyIds: target ? [target.id] : undefined,
        provider: typeof f.provider === "string" ? f.provider : undefined,
        force: !!f.force,
      });
      await rebuild(console.log, { embed: !f["no-embed"] });
      break;
    }
    case "company":
      print(
        await toolByName.get("get_company")!.run({ company: rest.join(" ") }),
      );
      break;
    case "companies":
      print(
        await toolByName.get("companies_where_i_know_people")!.run({
          query: rest.join(" ") || undefined,
          industry: f.industry,
          city: f.city,
        }),
      );
      break;
    case "company-alias": {
      const { aliasCompany } = await import("./companies/index.ts");
      const [alias, target] = rest;
      if (!alias || !target)
        throw new Error('Usage: company-alias "<alias>" "<company>"');
      const c = aliasCompany(alias, target);
      console.log(`"${alias}" now resolves to ${c.name}`);
      await rebuild(console.log, { embed: false });
      break;
    }
    case "serve": {
      const { startServer } = await import("./server/index.ts");
      startServer(f.port ? Number(f.port) : undefined);
      break;
    }
    case "mcp": {
      const { startMcpServer } = await import("./mcp.ts");
      await startMcpServer();
      break;
    }
    case "ask":
      await chatOnce(new Conversation(), rest.join(" "));
      break;
    case "chat": {
      const convo = new Conversation();
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      for (;;) {
        const q = (await rl.question("\nyou › ")).trim();
        if (!q || q === "exit") break;
        await chatOnce(convo, q);
      }
      rl.close();
      break;
    }
    case "search":
      print(
        await toolByName.get("search_people")!.run({
          query: rest.join(" "),
          city: f.city,
          company: f.company,
          community: f.community,
          include_weak_ties: !!f.weak,
        }),
      );
      break;
    case "person":
      print(
        await toolByName.get("get_person")!.run({ person: rest.join(" ") }),
      );
      break;
    case "paths":
      print(
        await toolByName
          .get("find_warm_paths")!
          .run({ company: rest.join(" ") }),
      );
      break;
    case "stats":
      print(await toolByName.get("overview")!.run({}));
      break;
    case "merge": {
      const [keep, drop] = rest;
      if (
        !get("SELECT id FROM people WHERE id = ?", keep) ||
        !get("SELECT id FROM people WHERE id = ?", drop)
      )
        throw new Error("Unknown person id");
      mergePeople(drop, keep, "manual");
      rebuildPerson(keep);
      await rebuild(console.log, { embed: false });
      break;
    }
    default:
      console.log(HELP);
  }
}

main().catch((err) => {
  console.error(`\nError: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
