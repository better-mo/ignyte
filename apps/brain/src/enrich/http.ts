// Paced HTTP for enrichment vendors. PDL's free plan allows only a few calls a minute,
// so requests go one at a time per vendor, and a 429 waits (Retry-After or the rate-limit
// reset header) and retries instead of failing the person.
const PER_MIN = Number(process.env.ENRICHMENT_PER_MINUTE ?? 10);
const nextSlot = new Map<string, number>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class RateLimitError extends Error {}

async function slot(vendor: string) {
  const now = Date.now();
  const at = Math.max(now, nextSlot.get(vendor) ?? 0);
  nextSlot.set(vendor, at + 60_000 / PER_MIN);
  if (at > now) await sleep(at - now);
}

/** Seconds to wait from a 429 response's headers, if it says. */
export function waitFromHeaders(h: Headers): number | undefined {
  const retry = Number(h.get("retry-after"));
  if (retry > 0) return retry * 1000;
  // PDL: x-ratelimit-reset is a unix timestamp (or seconds left on some endpoints).
  const reset = Number(h.get("x-ratelimit-reset"));
  if (reset > 1e9) return Math.max(1000, reset * 1000 - Date.now());
  if (reset > 0) return reset * 1000;
  return undefined;
}

/**
 * fetch() paced per vendor. Retries 429 and 5xx with backoff; after `maxRetries`
 * consecutive rate limits it throws RateLimitError so the run stops cleanly.
 */
export async function pacedFetch(
  vendor: string,
  url: string,
  init: RequestInit = {},
  log: (s: string) => void = console.log,
  maxRetries = 6,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    await slot(vendor);
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      if (attempt >= maxRetries) throw err;
      await sleep(Math.min(60_000, 2 ** attempt * 2000));
      continue;
    }
    if (res.status !== 429 && res.status < 500) return res;
    if (attempt >= maxRetries) {
      if (res.status === 429)
        throw new RateLimitError(
          `${vendor} is still rate limiting after ${maxRetries} retries: ${(await res.text()).slice(0, 200)}`,
        );
      return res;
    }
    const wait =
      (res.status === 429 ? waitFromHeaders(res.headers) : undefined) ??
      Math.min(120_000, 2 ** attempt * 5000) + Math.random() * 1000;
    await res.text().catch(() => {});
    if (res.status === 429)
      log(`  ${vendor} rate limit, waiting ${Math.round(wait / 1000)}s…`);
    // Hold every later request for this vendor too.
    nextSlot.set(vendor, Math.max(nextSlot.get(vendor) ?? 0, Date.now() + wait));
  }
}
