import crypto from "node:crypto";
import {
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";
import { config } from "../config.ts";

export const newId = (prefix = "p") =>
  `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
export const hash = (s: string) =>
  crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/** Lowercase, strip gmail dots and +tags so one inbox has one key. */
export function normalizeEmail(raw?: string | null): string | null {
  if (!raw) return null;
  const email = raw
    .trim()
    .toLowerCase()
    .replace(/^mailto:/, "")
    .replace(/^<|>$/g, "");
  const at = email.lastIndexOf("@");
  if (at < 1 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  let local = email.slice(0, at);
  let domain = email.slice(at + 1);
  if (GMAIL_DOMAINS.has(domain)) {
    domain = "gmail.com";
    local = local.replace(/\./g, "");
  }
  local = local.replace(/\+.*$/, "");
  return `${local}@${domain}`;
}

export function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const parsed = parsePhoneNumberFromString(
    raw,
    config.defaultCountry as CountryCode,
  );
  if (parsed?.isValid()) return parsed.number;
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 7 ? `+${digits}` : null;
}

/** "https://www.linkedin.com/in/sara-chen-123/" -> "sara-chen-123" */
export function linkedinSlug(raw?: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/linkedin\.com\/(?:mwlite\/)?in\/([^/?#\s]+)/i);
  if (m) return decodeURIComponent(m[1]).toLowerCase();
  return null;
}

export const linkedinUrl = (slug: string) =>
  `https://www.linkedin.com/in/${slug}`;

/** "@Sara", "https://x.com/sara", "twitter.com/sara" -> "sara" */
export function xHandle(raw?: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  const m = s.match(
    /(?:twitter\.com|x\.com)\/(?:#!\/)?@?([A-Za-z0-9_]{1,15})(?:[/?#]|$)/i,
  );
  if (m && !["intent", "i", "home", "share"].includes(m[1].toLowerCase()))
    return m[1].toLowerCase();
  const h = s.replace(/^@/, "");
  return /^[A-Za-z0-9_]{1,15}$/.test(h) ? h.toLowerCase() : null;
}

export function nameKey(name?: string | null): string {
  if (!name) return "";
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)|".*?"/g, " ")
    .replace(/\b(dr|mr|mrs|ms|prof|jr|sr|phd|mba|md)\b\.?/gi, " ")
    .replace(/[^a-zA-Z\s'-]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const COMPANY_SUFFIX =
  /\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|gmbh|sa|ag|plc|bv|oy|ab|srl|pty|technologies|technology|labs|hq)\b\.?/g;

export function companyKey(name?: string | null): string {
  if (!name) return "";
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[.,()]/g, " ")
    .replace(COMPANY_SUFFIX, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export const schoolKey = companyKey;

/** Split "Sara Chen" into first/last when a source gives only a display name. */
export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

const NOREPLY =
  /(no-?reply|do-?not-?reply|notifications?|mailer-daemon|postmaster|bounce|newsletter|updates?|alerts?|support|billing|invoice|receipts?|hello|info|team|news|marketing|feedback|calendar-notification|automated|digest)@/i;
// Email-service-provider domains and marketing subdomains (mail.x.com), not employers.
const BULK_DOMAINS =
  /@((.*\.)?(mailchimp|mcsv|sendgrid|mandrillapp|amazonses|intercom-mail|hubspotemail|mktomail|sparkpostmail|mailgun|customeriomail|substack)\.(com|net|io)|(mail|email|e|em|news|newsletter|notifications?|info|marketing|updates|alerts|mailer|bounce|reply)\.[^@]+)$/i;

export function looksAutomated(email: string): boolean {
  return NOREPLY.test(email) || BULK_DOMAINS.test(email);
}

/** Best-effort: company name from a work email domain. */
export function domainOf(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1);
}

const FREE_MAIL = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "hey.com",
  "fastmail.com",
  "gmx.com",
  "yandex.com",
  "msn.com",
]);
export const isFreeMail = (email: string) => FREE_MAIL.has(domainOf(email));
