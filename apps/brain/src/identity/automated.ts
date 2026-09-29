// Is this a human? One place that decides, used by every source (Gmail, Calendar,
// contacts, imports) and re-checked on every rebuild, so rules added later also clean
// up people created earlier.
//
// Three layers, cheapest first:
//  1. Address: role mailboxes (noreply, billing, …), machine-generated local parts,
//     and domains that only ever send notifications (e-signature, CRM logging, bots).
//  2. Name: "Jane Smith via Docusign" relays, organisations and rooms.
//  3. Behaviour (see promote.ts): someone who only sends you bulk mail and whom you've
//     never written to or met isn't a contact. This catches services nobody listed.

/** Words that make a mailbox a role or a robot when the local part is made only of them. */
const ROLE_TOKENS = new Set(
  (
    "no noreply donotreply do not reply replies notification notifications notify alert alerts " +
    "mailer daemon postmaster bounce bounces auto automated automailer system robot bot bots " +
    "support help helpdesk billing invoice invoices receipt receipts order orders payment payments " +
    "account accounts accounting ap ar team hello hi info information contact contactus news " +
    "newsletter newsletters marketing updates update digest feedback admin administrator security " +
    "verify verification confirm confirmation welcome calendar events event jobs careers recruiting " +
    "talent office members member community service services customerservice customer care success " +
    "sales enquiries inquiries press media legal privacy compliance dpo hr ops operations it " +
    "webmaster root www mail email e ping comments comment share sharing drive docs notes notetaker " +
    "assistant scheduler scheduling booking bookings reservations tickets ticket cases case workflow " +
    "reports report statements statement alerts cs"
  ).split(/\s+/),
);

/**
 * Domains that only send machine mail: nobody's personal address lives there. A leading
 * "." means subdomains only (acme.zendesk.com relays; zendesk.com staff are people).
 */
const NOTIFICATION_DOMAINS = [
  // e-signature
  "docusign.net", "echosign.com", "adobesign.com", "hellosign.com", "pandadoc.net",
  // CRM and sales-engagement logging (BCC addresses) and relays
  "bcc.hubspot.com", "hubspotemail.net", "pipedrivemail.com", "emailtosalesforce.com",
  "bcc.salesloft.com", ".apex.salesforce.com",
  // email service providers and product relays
  "facebookmail.com", "amazonses.com", "sendgrid.net", "mcsv.net", "mailgun.org", "intercom-mail.com",
  "calendly-mail.com", "luma-mail.com", "shopifyemail.com", "squarespace-mail.com", "wixemails.com",
  "googlegroups.com", "linkedin.email", "discordapp.com", "mandrillapp.com", "mktomail.com",
  "sparkpostmail.com", "customeriomail.com", "hubspotemail.com", "mailchimpapp.com", "rsgsv.net",
  // helpdesk / tracker tenants
  ".zendesk.com", ".freshdesk.com", ".helpscoutapp.com", ".atlassian.net", ".slack.com",
];

/**
 * Companies whose staff you might really email, but which also send lots of machine mail:
 * only role or robot local parts count as automated here.
 */
const MIXED_DOMAINS = [
  "google.com", "microsoft.com", "apple.com", "amazon.com", "linkedin.com", "slack.com", "github.com",
  "notion.so", "figma.com", "zoom.us", "asana.com", "atlassian.com", "stripe.com", "paypal.com",
  "uber.com", "airbnb.com", "otter.ai", "fireflies.ai", "read.ai", "fathom.video", "gong.io",
];

const tokens = (local: string) =>
  local
    .toLowerCase()
    .replace(/\+.*$/, "")
    .split(/[._\-]+|(?<=\D)(?=\d)|(?<=\d)(?=\D)/)
    .filter(Boolean);

const onDomain = (domain: string, list: string[]) =>
  list.some((d) =>
    d.startsWith(".") ? domain.endsWith(d) : domain === d || domain.endsWith(`.${d}`),
  );
const REGION = /^(us|eu|uk|ca|na|emea|apac|latam|en|global|intl)$/;

/** Why an address isn't a person's own, or null if it could be. */
export function automatedAddressReason(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1) return "invalid address";
  const local = email.slice(0, at).toLowerCase();
  const domain = email.slice(at + 1).toLowerCase();

  if (onDomain(domain, NOTIFICATION_DOMAINS)) return `notification sender (${domain})`;
  // Community relays, calendar resources and marketing subdomains.
  if (/^(members|groups)\.mobilize\.io$|^(reply|replies|relay|bounce|bounces)\./.test(domain))
    return "relay address";
  if (/^(resource|group|import)\.calendar\.google\.com$/.test(domain)) return "calendar resource";
  if (/^(mail|email|e|em|mg|news|newsletter|notifications?|info|marketing|updates|alerts|mailer|send|sender|t|go|link|click|comms)\.[^.]+\.[a-z.]+$/.test(domain))
    return "marketing subdomain";

  // A local part made only of role words (plus numbers or a region): support, billing-eu, team2.
  const parts = tokens(local);
  if (
    parts.some((p) => ROLE_TOKENS.has(p)) &&
    parts.every((p) => ROLE_TOKENS.has(p) || /^\d+$/.test(p) || REGION.test(p))
  )
    return "role mailbox";
  if (/(^|[._\-])(no-?reply|do-?not-?reply|noreply)([._\-]|$)/.test(local)) return "no-reply";
  // Machine-made local parts: long ids, hashes, VERP bounces.
  if (/[0-9a-f]{16,}/.test(local) || /\d{6,}/.test(local) || /^(bounces?|msprvs\d|prvs)[+=]/.test(local))
    return "machine-generated address";
  if (local.length > 40) return "machine-generated address";
  if (onDomain(domain, MIXED_DOMAINS) && parts.some((p) => ROLE_TOKENS.has(p) || /^(fred|otter|notes?|recorder)$/.test(p)))
    return `notification sender (${domain})`;
  return null;
}

/** "Jane Smith via Docusign", "Jane (Google Docs)": the address is a service relaying for Jane. */
export function isRelayedName(name?: string | null): boolean {
  if (!name) return false;
  return /\s(via|on behalf of)\s+\S/i.test(name) || /\((google (docs|sheets|slides|drive|calendar)|docusign|dropbox|notion|figma|slack|linkedin)\)/i.test(name);
}

const ROLE_NAME =
  /^(info|hello|hi|team|support|help|admin|sales|billing|accounts?|notes?|client ?services|customer ?(service|success|care)|noreply|no-reply|contact|office|hr|jobs|careers|press|marketing|finance|legal|security|ops|operations|notifications?|alerts?|reminders?|calendar|mailer daemon)$/i;
const ORG_WORD =
  /\b(team|inc\.?|llc|ltd|corp(oration)?|bank|trust|group|wires|services|support|notifications?|newsletter|digest|alerts?|hq|foundation|capital|ventures|partners|labs?|studio|agency|app|platform|bot|assistant|notetaker|no-?reply|helpdesk|billing|payments?|receipts?|store|shop)\b/i;
/** Rooms and resources ("Meeting room 3", "Boardroom (8)"). */
export const ROOM_NAME =
  /\b(meeting|conference|board|huddle|phone|focus)[ -]?(room|booth)\b|^room\b|\broom \d|\(\d+\)\s*$|\bresource\b/i;

const BOT_NAME = /note ?taker|meeting notes|recorder|\bbot\b|\.ai\b|assistant/i;

/** Names that are clearly an inbox, team, organisation or room rather than a person. */
export function looksLikePerson(name: string): boolean {
  const n = name.trim();
  if (!n || n.includes("@") || /\d{3,}/.test(n)) return false;
  if (ROLE_NAME.test(n.replace(/[._-]+/g, " "))) return false;
  if (ORG_WORD.test(n) || ROOM_NAME.test(n) || isRelayedName(n) || BOT_NAME.test(n)) return false;
  // One-word names are fine ("Sara") but not glued-together product names ("ClientServices").
  if (!/\s/.test(n) && /[a-z][A-Z]/.test(n)) return false;
  return true;
}

export const looksAutomated = (email: string) => automatedAddressReason(email) !== null;
