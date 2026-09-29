import { config } from "../config.ts";
import { all, run, tx } from "../db/index.ts";

/**
 * Voyage AI embeddings (Anthropic's recommended embedding provider).
 * Optional: without VOYAGE_API_KEY, search falls back to full-text + structured filters.
 */
class VoyageError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function voyage(
  input: string[],
  inputType: "document" | "query",
  retries = 3,
): Promise<number[][]> {
  let res: Response | undefined;
  for (let attempt = 0; ; attempt++) {
    res = await fetch("https://api.voyageai.com/v1/embeddings", {
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
    if (res.ok) break;
    const text = (await res.text()).slice(0, 300);
    // A short rate-limit wait is worth it; an account without billing (3 requests/min) isn't.
    if (res.status === 429 && attempt < retries && !/payment method/i.test(text)) {
      const wait = Number(res.headers.get("retry-after")) * 1000 || 2 ** attempt * 5000;
      await new Promise((r) => setTimeout(r, Math.min(wait, 60_000)));
      continue;
    }
    throw new VoyageError(`Voyage ${res.status}: ${text}`, res.status);
  }
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
  let done = 0;
  for (let i = 0; i < stale.length; i += 64) {
    const chunk = stale.slice(i, i + 64);
    let vectors: number[][];
    try {
      vectors = await voyage(
        chunk.map((c) => c.doc),
        "document",
      );
    } catch (err) {
      // Embeddings are an optional boost: never fail a rebuild over them. Finished batches
      // are saved, so the next rebuild continues from here.
      const msg = err instanceof Error ? err.message : String(err);
      log(
        `  embeddings: stopped at ${done}/${stale.length}; search uses keywords for the rest. ${
          /payment method|reduced rate limits/i.test(msg)
            ? "Voyage limits accounts without a payment method to 3 requests/min: add one at dashboard.voyageai.com, or remove VOYAGE_API_KEY to turn semantic search off."
            : msg
        }`,
      );
      return done;
    }
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
    done += chunk.length;
    log(`  embeddings: ${done}/${stale.length}`);
  }
  return done;
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
  // If the query can't be embedded (rate limit, outage), fall back to keyword search.
  const q = await voyage([query], "query", 1)
    .then((v) => v[0])
    .catch(() => null);
  if (!q) return [];
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
