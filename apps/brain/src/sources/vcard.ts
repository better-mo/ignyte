import fs from "node:fs";
import { run, tx } from "../db/index.ts";
import { hash } from "../identity/normalize.ts";
import { upsertObservation } from "../identity/store.ts";
import type { ObservedPerson } from "../model.ts";

type Prop = { name: string; params: Record<string, string>; value: string };

function decodeQP(s: string, charset = "utf-8"): string {
  const bytes: number[] = [];
  const src = s.replace(/=\r?\n/g, "");
  for (let i = 0; i < src.length; i++) {
    if (src[i] === "=" && /^[0-9A-F]{2}$/i.test(src.slice(i + 1, i + 3))) {
      bytes.push(parseInt(src.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(src.charCodeAt(i));
  }
  return new TextDecoder(charset).decode(new Uint8Array(bytes));
}

const unescape = (s: string) =>
  s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");

function parseCard(block: string): Prop[] {
  // Unfold continuation lines (RFC 6350) and quoted-printable soft breaks (vCard 2.1).
  const unfolded = block
    .replace(/=\r?\n(?=[^\r\n])/g, "=\n")
    .replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);
  const props: Prop[] = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    while (
      /QUOTED-PRINTABLE/i.test(line) &&
      line.endsWith("=") &&
      i + 1 < lines.length
    )
      line = line.slice(0, -1) + "=\n" + lines[++i];
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const [rawName, ...paramParts] = line.slice(0, colon).split(";");
    const name = rawName.replace(/^item\d+\./i, "").toUpperCase();
    const params: Record<string, string> = {};
    for (const p of paramParts) {
      const [k, v] = p.split("=");
      params[(v ? k : "TYPE").toUpperCase()] = (v ?? k).toUpperCase();
    }
    let value = line.slice(colon + 1);
    if (params.ENCODING === "QUOTED-PRINTABLE")
      value = decodeQP(value, params.CHARSET?.toLowerCase() || "utf-8");
    props.push({ name, params, value });
  }
  return props;
}

export function parseVcf(text: string): ObservedPerson[] {
  const cards = text
    .split(/BEGIN:VCARD/i)
    .slice(1)
    .map((c) => c.split(/END:VCARD/i)[0]);
  return cards.map((card) => {
    const props = parseCard(card);
    const one = (n: string) => props.find((p) => p.name === n)?.value;
    const many = (n: string) =>
      props
        .filter((p) => p.name === n)
        .map((p) => unescape(p.value.trim()))
        .filter(Boolean);
    const [last, first] = (one("N") ?? "").split(";").map(unescape);
    const org = one("ORG")?.split(";").map(unescape)[0];
    const adr = one("ADR")?.split(";").map(unescape); // PO;ext;street;city;region;zip;country
    const urls = [...many("URL"), ...many("X-SOCIALPROFILE")];
    return {
      name:
        unescape(one("FN") ?? "").trim() ||
        [first, last].filter(Boolean).join(" "),
      firstName: first || undefined,
      lastName: last || undefined,
      emails: many("EMAIL"),
      phones: many("TEL"),
      company: org || undefined,
      title: one("TITLE") ? unescape(one("TITLE")!) : undefined,
      positions: org
        ? [
            {
              company: org,
              title: one("TITLE") ? unescape(one("TITLE")!) : undefined,
              current: true,
            },
          ]
        : [],
      city: adr?.[3] || undefined,
      region: adr?.[4] || undefined,
      country: adr?.[6] || undefined,
      linkedinUrl: urls.find((u) => /linkedin\.com\/in\//i.test(u)),
      xHandle: urls.find((u) => /(twitter|x)\.com\//i.test(u)),
      urls,
      note: one("NOTE") ? unescape(one("NOTE")!).slice(0, 1000) : undefined,
      birthday: one("BDAY"),
    } satisfies ObservedPerson;
  });
}

/** Import phone contacts exported as .vcf (iPhone: Contacts → select all → Export vCard; Android: Contacts → Export). */
export function importVcf(filePath: string, log = console.log) {
  const people = parseVcf(fs.readFileSync(filePath, "utf8"));
  let count = 0;
  tx(() => {
    for (const p of people) {
      if (!p.name && !p.emails?.length && !p.phones?.length) continue;
      const key = hash(
        [p.name, ...(p.phones ?? []), ...(p.emails ?? [])].join("|"),
      );
      upsertObservation("phone", "phone", key, p);
      count++;
    }
  });
  run(
    `INSERT INTO accounts (id, provider, label, sync_state) VALUES ('phone', 'phone', 'Phone contacts', ?)
     ON CONFLICT(id) DO UPDATE SET sync_state = excluded.sync_state`,
    JSON.stringify({ importedAt: new Date().toISOString(), path: filePath }),
  );
  log(`  phone: ${count} contacts from ${filePath}`);
}
