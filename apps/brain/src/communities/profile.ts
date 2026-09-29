import { all, get } from "../db/index.ts";
import { me, myEvidence } from "../graph/query.ts";
import type { PersonRow } from "../model.ts";

type CommunityRow = {
  id: string;
  name: string;
  provider: string;
  url: string | null;
  description: string | null;
};

/** All communities: yours first, then by how many people you actually know there. */
export function listCommunities() {
  const self = me();
  const rows = all<{
    id: string;
    name: string;
    provider: string;
    url: string | null;
    members: number;
    known: number;
    my_role: string | null;
    posts: number;
    last_activity: string | null;
  }>(
    `SELECT c.id, c.name, c.provider, c.url,
            (SELECT COUNT(*) FROM memberships m JOIN people p ON p.id = m.person_id
              WHERE m.community_id = c.id AND p.is_me = 0 AND p.hidden = 0) AS members,
            (SELECT COUNT(*) FROM memberships m JOIN people p ON p.id = m.person_id
              WHERE m.community_id = c.id AND p.is_me = 0 AND p.hidden = 0 AND p.strength >= 12) AS known,
            (SELECT role FROM memberships m WHERE m.community_id = c.id AND m.person_id = ?) AS my_role,
            (SELECT COUNT(*) FROM interactions i WHERE i.community_id = c.id) AS posts,
            (SELECT MAX(occurred_at) FROM interactions i WHERE i.community_id = c.id) AS last_activity
     FROM communities c`,
    self?.id ?? "",
  );
  const top = (id: string) =>
    all<PersonRow>(
      `SELECT p.* FROM memberships m JOIN people p ON p.id = m.person_id
       WHERE m.community_id = ? AND p.is_me = 0 AND p.hidden = 0 ORDER BY p.strength DESC LIMIT 5`,
      id,
    ).map((p) => ({ id: p.id, name: p.display_name, photo: p.photo_url }));
  return rows
    .filter((r) => r.my_role || r.members > 0)
    .sort(
      (a, b) =>
        Number(!!b.my_role) - Number(!!a.my_role) ||
        b.known - a.known ||
        b.members - a.members ||
        a.name.localeCompare(b.name),
    )
    .map((r) => ({ ...r, top: top(r.id) }));
}

/** One community: your role, who you know there (strongest first), and recent activity. */
export function communityProfile(idOrName: string) {
  const c =
    get<CommunityRow>("SELECT * FROM communities WHERE id = ?", idOrName) ??
    get<CommunityRow>(
      "SELECT * FROM communities WHERE name = ? COLLATE NOCASE",
      idOrName,
    ) ??
    get<CommunityRow>(
      "SELECT * FROM communities WHERE name LIKE ? LIMIT 1",
      `%${idOrName}%`,
    );
  if (!c) return undefined;
  const self = me();
  const members = all<PersonRow & { role: string | null }>(
    `SELECT p.*, m.role FROM memberships m JOIN people p ON p.id = m.person_id
     WHERE m.community_id = ? AND p.is_me = 0 AND p.hidden = 0 ORDER BY p.strength DESC`,
    c.id,
  );
  const activity = all<{
    kind: string;
    occurred_at: string;
    subject: string | null;
    snippet: string | null;
    url: string | null;
    author: string | null;
    author_id: string | null;
  }>(
    `SELECT i.kind, i.occurred_at, i.subject, substr(i.snippet, 1, 240) AS snippet, i.url,
            (SELECT p.display_name FROM participants pa JOIN people p ON p.id = pa.person_id
              WHERE pa.interaction_id = i.id AND pa.role = 'from' LIMIT 1) AS author,
            (SELECT pa.person_id FROM participants pa WHERE pa.interaction_id = i.id AND pa.role = 'from' LIMIT 1) AS author_id
     FROM interactions i WHERE i.community_id = ? ORDER BY i.occurred_at DESC LIMIT 20`,
    c.id,
  );
  // Sub-groups share the parent's name as a prefix ("BVP CXO Community · CFO").
  const base = c.name.split(" · ")[0];
  const related = all<{ id: string; name: string }>(
    "SELECT id, name FROM communities WHERE id != ? AND (name LIKE ? OR ? LIKE name || ' · %') ORDER BY name",
    c.id,
    `${base} · %`,
    c.name,
  );
  return {
    id: c.id,
    name: c.name,
    provider: c.provider,
    url: c.url,
    description: c.description,
    my_role: self
      ? (get<{ role: string }>(
          "SELECT role FROM memberships WHERE community_id = ? AND person_id = ?",
          c.id,
          self.id,
        )?.role ?? null)
      : null,
    counts: {
      members: members.length,
      known: members.filter((m) => m.strength >= 12).length,
    },
    members: members.slice(0, 200).map((p) => ({
      id: p.id,
      name: p.display_name,
      headline: p.headline,
      city: p.city,
      strength: p.strength,
      tier: p.tier,
      photo: p.photo_url,
      role: p.role && p.role !== "member" ? p.role : null,
      how_you_know_them: p.strength >= 12 ? myEvidence(p.id).slice(0, 2) : [],
    })),
    activity,
    related,
  };
}
