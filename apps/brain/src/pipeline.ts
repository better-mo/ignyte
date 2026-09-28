import { setMeta } from "./db/index.ts";
import { resolveCompanies } from "./companies/index.ts";
import { computeEdges } from "./graph/edges.ts";
import { computeStrength } from "./graph/strength.ts";
import { rebuildAllPeople } from "./identity/profile.ts";
import { promoteAddresses } from "./identity/promote.ts";
import {
  linkParticipants,
  relinkOrphans,
  resolveByName,
} from "./identity/store.ts";
import { indexDocuments } from "./index/documents.ts";
import { embedPeople, invalidateVectorCache } from "./index/embeddings.ts";
import { googleAccounts } from "./sources/google/auth.ts";
import { syncCalendar } from "./sources/google/calendar.ts";
import { syncContacts } from "./sources/google/contacts.ts";
import { syncGmail } from "./sources/google/gmail.ts";

/** Everything downstream of raw data: people, strength, graph, index. Safe to re-run. */
export async function rebuild(
  log = console.log,
  opts: { embed?: boolean } = {},
) {
  promoteAddresses(log);
  const relinked = relinkOrphans();
  rebuildAllPeople();
  const merged = resolveByName();
  if (merged) rebuildAllPeople();
  linkParticipants();
  const companies = resolveCompanies();
  log(
    `  identity: ${merged} same-name merges, ${relinked} orphan records re-linked`,
  );
  log(`  companies: ${companies}`);
  log(`  strength: scored ${computeStrength()} people`);
  log(`  graph: ${computeEdges()} person↔person edges`);
  log(`  index: ${indexDocuments()} profile documents`);
  if (opts.embed !== false) await embedPeople(log);
  invalidateVectorCache();
  setMeta("last_rebuild_at", new Date().toISOString());
}

export async function syncGoogle(
  log = console.log,
  only?: string,
  parts = ["contacts", "gmail", "calendar"],
) {
  const accounts = googleAccounts().filter(
    (a) => !only || a.email === only || a.label === only,
  );
  if (!accounts.length)
    throw new Error(
      "No Google accounts connected. Run: npm run brain -- connect google <label>",
    );
  for (const account of accounts) {
    log(`Syncing ${account.label} <${account.email}>`);
    if (parts.includes("contacts")) await syncContacts(account, log);
    if (parts.includes("gmail")) await syncGmail(account, log);
    if (parts.includes("calendar")) await syncCalendar(account, log);
  }
  setMeta("last_google_sync_at", new Date().toISOString());
}
