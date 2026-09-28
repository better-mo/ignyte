import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { APP_ROOT, config } from "../config.ts";
import { all, get, run } from "../db/index.ts";
import { Conversation } from "../agent/chat.ts";
import { personProfile, toolByName } from "../agent/tools.ts";
import { enrichPeople } from "../enrich/index.ts";
import { findCompany } from "../companies/index.ts";
import { enrichCompanies } from "../companies/enrich.ts";
import { companyProfile } from "../companies/profile.ts";
import { findWarmPaths, getPerson, me } from "../graph/query.ts";
import { indexDocuments } from "../index/documents.ts";
import { searchPeople } from "../index/search.ts";
import type { PersonRow } from "../model.ts";
import { rebuild } from "../pipeline.ts";

const UI_DIR = path.join(APP_ROOT, "src", "ui");
const conversations = new Map<string, Conversation>();
const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
};

const json = (res: http.ServerResponse, status: number, body: unknown) => {
  res
    .writeHead(status, { "content-type": "application/json" })
    .end(JSON.stringify(body));
};

async function readBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function graph(limit: number) {
  const self = me();
  const nodes = all<PersonRow>(
    "SELECT * FROM people WHERE is_me = 0 AND hidden = 0 AND strength > 0 ORDER BY strength DESC LIMIT ?",
    limit,
  );
  const ids = new Set(nodes.map((n) => n.id));
  const edges = all<{ a: string; b: string; kind: string; weight: number }>(
    "SELECT a, b, kind, weight FROM edges",
  ).filter((e) => ids.has(e.a) && ids.has(e.b));
  const communities = all<{ person_id: string; name: string }>(
    "SELECT m.person_id, c.name FROM memberships m JOIN communities c ON c.id = m.community_id",
  );
  const byPerson = new Map<string, string[]>();
  for (const c of communities)
    byPerson.set(c.person_id, [...(byPerson.get(c.person_id) ?? []), c.name]);
  return {
    me: self
      ? { id: self.id, name: self.display_name, photo: self.photo_url }
      : null,
    nodes: nodes.map((n) => ({
      id: n.id,
      name: n.display_name,
      headline: n.headline,
      company: n.company,
      city: n.city,
      strength: n.strength,
      tier: n.tier,
      photo: n.photo_url,
      communities: byPerson.get(n.id) ?? [],
    })),
    edges,
  };
}

export function startServer(port = config.port) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const p = url.pathname;
    try {
      if (p === "/vendor/d3.min.js") {
        return void res
          .writeHead(200, { "content-type": "text/javascript" })
          .end(
            fs.readFileSync(
              path.join(APP_ROOT, "node_modules", "d3", "dist", "d3.min.js"),
            ),
          );
      }
      if (req.method === "GET" && !p.startsWith("/api/")) {
        const file = path.join(
          UI_DIR,
          p === "/" ? "index.html" : path.normalize(p).replace(/^[/\\]+/, ""),
        );
        if (!file.startsWith(UI_DIR) || !fs.existsSync(file))
          return void res.writeHead(404).end("Not found");
        return void res
          .writeHead(200, {
            "content-type":
              MIME[path.extname(file)] ?? "application/octet-stream",
          })
          .end(fs.readFileSync(file));
      }

      if (p === "/api/overview")
        return json(res, 200, {
          me: me() ?? null,
          ...((await toolByName.get("overview")!.run({})) as object),
        });

      if (p === "/api/people") {
        // Rank everyone that matches, then page; fine at personal-network scale.
        const results = await searchPeople(
          url.searchParams.get("q") ?? "",
          {
            city: url.searchParams.get("city") || undefined,
            company: url.searchParams.get("company") || undefined,
            community: url.searchParams.get("community") || undefined,
            includeWeak: url.searchParams.get("weak") === "1",
          },
          1_000_000,
        );
        const offset = Number(url.searchParams.get("offset") ?? 0);
        const limit = Number(url.searchParams.get("limit") ?? 60);
        return json(res, 200, {
          total: results.length,
          items: results.slice(offset, offset + limit).map((r) => ({
            id: r.person.id,
            name: r.person.display_name,
            headline: r.person.headline,
            city: r.person.city,
            strength: r.person.strength,
            tier: r.person.tier,
            trend: r.person.trend,
            photo: r.person.photo_url,
            last: r.person.last_interaction_at,
          })),
        });
      }

      const personMatch = p.match(
        /^\/api\/person\/([^/]+)(\/(note|hide|enrich))?$/,
      );
      if (personMatch) {
        const person = getPerson(personMatch[1]);
        if (!person) return json(res, 404, { error: "not found" });
        const action = personMatch[3];
        if (!action) return json(res, 200, personProfile(person));
        if (req.method !== "POST")
          return json(res, 405, { error: "POST only" });
        if (action === "note") {
          const body = await readBody(req);
          run(
            "INSERT INTO notes (person_id, body) VALUES (?, ?)",
            person.id,
            String(body.body ?? "").slice(0, 4000),
          );
          indexDocuments();
        } else if (action === "hide") {
          run("UPDATE people SET hidden = 1 - hidden WHERE id = ?", person.id);
        } else if (action === "enrich") {
          await enrichPeople({ personIds: [person.id], force: true }, () => {});
          indexDocuments();
        }
        return json(res, 200, personProfile(getPerson(person.id) ?? person));
      }

      const companyMatch = p.match(/^\/api\/company\/([^/]+)(\/enrich)?$/);
      if (companyMatch) {
        const c = findCompany(decodeURIComponent(companyMatch[1]));
        if (!c) return json(res, 404, { error: "not found" });
        if (companyMatch[2]) {
          if (req.method !== "POST")
            return json(res, 405, { error: "POST only" });
          await enrichCompanies({ companyIds: [c.id], force: true }, () => {});
          indexDocuments();
        }
        return json(res, 200, companyProfile(findCompany(c.id) ?? c));
      }

      if (p === "/api/graph")
        return json(
          res,
          200,
          graph(Number(url.searchParams.get("limit") ?? 150)),
        );

      if (p === "/api/paths") {
        return json(
          res,
          200,
          findWarmPaths({
            company: url.searchParams.get("company") ?? undefined,
            personId: url.searchParams.get("person") ?? undefined,
          }),
        );
      }

      if (p === "/api/rebuild" && req.method === "POST") {
        const lines: string[] = [];
        await rebuild((l) => lines.push(l));
        return json(res, 200, { log: lines });
      }

      if (p === "/api/chat" && req.method === "POST") {
        const body = await readBody(req);
        const id = String(body.conversationId ?? "default");
        const convo = conversations.get(id) ?? new Conversation();
        conversations.set(id, convo);
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        const send = (event: string, data: unknown) =>
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        try {
          await convo.send(String(body.message ?? ""), {
            onText: (d) => send("text", d),
            onToolCall: (name, input) => send("tool", { name, input }),
            onCard: (card) => send("card", card),
          });
          send("done", {});
        } catch (err) {
          send("error", {
            message: err instanceof Error ? err.message : String(err),
          });
        }
        return void res.end();
      }

      if (p === "/api/status") {
        return json(res, 200, {
          hasAnthropicKey: !!(
            process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN
          ),
          people:
            get("SELECT COUNT(*) AS n FROM people WHERE is_me = 0")?.n ?? 0,
          model: config.anthropicModel,
        });
      }

      json(res, 404, { error: "not found" });
    } catch (err) {
      console.error(err);
      if (!res.headersSent)
        json(res, 500, {
          error: err instanceof Error ? err.message : String(err),
        });
      else res.end();
    }
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(`People Brain running at http://localhost:${port}`),
  );
  return server;
}
