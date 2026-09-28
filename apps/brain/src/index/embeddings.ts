import { config } from "../config.ts";
import { all, run, tx } from "../db/index.ts";

/**
 * Voyage AI embeddings (Anthropic's recommended embedding provider).
 * Optional: without VOYAGE_API_KEY, search falls back to full-text + structured filters.
 */
async function voyage(
  input: string[],
  inputType: "document" | "query",
): Promise<number[][]> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.voyage.key}`,
    },
    body: JSON.stringify({
      input,
      model: config.voyage.model,
      input_type: inputType,
    }),
  });
  if (!res.ok)
    throw new Error(
      `Voyage ${res.status}: ${(await res.text()).slice(0, 300)}`,
    );
  const body = (await res.json()) as {
    data: { embedding: number[]; index: number }[];
  };
  return body.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export const embeddingsEnabled = () => !!config.voyage.key;

export async function embedPeople(log = console.log) {
  if (!embeddingsEnabled()) {
    log("  embeddings: skipped (set VOYAGE_API_KEY to enable semantic search)");
    return 0;
  }
  const stale = all<{ id: string; doc: string; doc_hash: string }>(
    `SELECT p.id, p.doc, p.doc_hash FROM people p
     LEFT JOIN embeddings e ON e.person_id = p.id AND e.model = ?
     WHERE p.is_me = 0 AND p.doc IS NOT NULL AND (e.doc_hash IS NULL OR e.doc_hash != p.doc_hash)`,
    config.voyage.model,
  );
  for (let i = 0; i < stale.length; i += 64) {
    const chunk = stale.slice(i, i + 64);
    const vectors = await voyage(
      chunk.map((c) => c.doc),
      "document",
    );
    tx(() => {
      chunk.forEach((c, j) => {
        run(
          "INSERT OR REPLACE INTO embeddings (person_id, model, doc_hash, vector) VALUES (?, ?, ?, ?)",
          c.id,
          config.voyage.model,
          c.doc_hash,
          new Uint8Array(new Float32Array(vectors[j]).buffer),
        );
      });
    });
    log(`  embeddings: ${Math.min(i + 64, stale.length)}/${stale.length}`);
  }
  return stale.length;
}

let cache: { model: string; rows: { id: string; v: Float32Array }[] } | null =
  null;
export const invalidateVectorCache = () => (cache = null);

/** Cosine similarity over every stored vector (brute force is fine at personal-network scale). */
export async function semanticSearch(
  query: string,
  k = 50,
): Promise<{ id: string; score: number }[]> {
  if (!embeddingsEnabled()) return [];
  if (!cache || cache.model !== config.voyage.model) {
    cache = {
      model: config.voyage.model,
      rows: all<{ person_id: string; vector: Uint8Array }>(
        "SELECT person_id, vector FROM embeddings WHERE model = ?",
        config.voyage.model,
      ).map((r) => ({
        id: r.person_id,
        v: new Float32Array(
          r.vector.buffer.slice(
            r.vector.byteOffset,
            r.vector.byteOffset + r.vector.byteLength,
          ),
        ),
      })),
    };
  }
  if (!cache.rows.length) return [];
  const [q] = await voyage([query], "query");
  const qn = Math.hypot(...q);
  return cache.rows
    .map((r) => {
      let dot = 0;
      let n = 0;
      for (let i = 0; i < r.v.length; i++) {
        dot += r.v[i] * q[i];
        n += r.v[i] * r.v[i];
      }
      return { id: r.id, score: dot / (Math.sqrt(n) * qn) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
