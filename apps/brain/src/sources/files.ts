import fs from "node:fs";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { parse } from "csv-parse/sync";

/** Read an export given as a folder or a .zip into a basename -> text map. */
export function readExport(p: string): Map<string, string> {
  const files = new Map<string, string>();
  const add = (name: string, text: string) =>
    files.set(path.basename(name).toLowerCase(), text);
  const stat = fs.statSync(p);
  if (stat.isDirectory()) {
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(csv|js|json|vcf|txt)$/i.test(entry.name))
          add(entry.name, fs.readFileSync(full, "utf8"));
      }
    };
    walk(p);
  } else if (p.toLowerCase().endsWith(".zip")) {
    const entries = unzipSync(fs.readFileSync(p), {
      filter: (f) => /\.(csv|js|json|vcf|txt)$/i.test(f.name),
    });
    for (const [name, data] of Object.entries(entries))
      add(name, strFromU8(data));
  } else {
    add(p, fs.readFileSync(p, "utf8"));
  }
  return files;
}

/** Parse CSV, skipping any preamble before the line that starts with `headerStart`. */
export function readCsv(
  text: string | undefined,
  headerStart?: string,
): Record<string, string>[] {
  if (!text) return [];
  let body = text.replace(/^﻿/, "");
  if (headerStart) {
    const idx = body
      .split(/\r?\n/)
      .findIndex((l) => l.replace(/^"/, "").startsWith(headerStart));
    if (idx < 0) return [];
    body = body.split(/\r?\n/).slice(idx).join("\n");
  }
  return parse(body, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    trim: true,
  });
}

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

/** "15 Mar 2021" | "Mar 2019" | "2019" | "2023-05-01 14:22:10 UTC" -> "YYYY[-MM[-DD]]" */
export function looseDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/);
  if (m)
    return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`;
  m = s.match(/^([A-Za-z]{3})[a-z]*\s+(\d{4})$/);
  if (m && MONTHS[m[1].toLowerCase()])
    return `${m[2]}-${MONTHS[m[1].toLowerCase()]}`;
  m = s.match(/^(\d{4})$/);
  if (m) return m[1];
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

export const toIso = (raw?: string) => {
  if (!raw) return new Date(0).toISOString();
  const d = new Date(raw.replace(" UTC", "Z").replace(" ", "T"));
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  const loose = looseDate(raw);
  return loose
    ? new Date(
        loose.length === 4
          ? `${loose}-01-01`
          : loose.length === 7
            ? `${loose}-01`
            : loose,
      ).toISOString()
    : new Date(0).toISOString();
};
