import http from "node:http";
import crypto from "node:crypto";
import { config } from "../../config.ts";
import { all, get, run } from "../../db/index.ts";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  // Headers + snippets only are used, but gmail.metadata forbids search queries (`q`),
  // which incremental sync needs. This is a personal, testing-mode OAuth client.
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/contacts.other.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
];

type Tokens = {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  scope?: string;
};

export type GoogleAccount = {
  id: string;
  label: string;
  email: string;
  tokens: Tokens;
  sync_state: Record<string, unknown>;
};

function requireClient() {
  if (!config.google.clientId || !config.google.clientSecret) {
    throw new Error(
      "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in apps/brain/.env (a Desktop-app OAuth client). See README.",
    );
  }
}

/** Interactive loopback OAuth. Prints a URL; you sign in once per Google account. */
export async function connectGoogleAccount(
  label: string,
  loginHint?: string,
): Promise<GoogleAccount> {
  requireClient();
  const state = crypto.randomBytes(12).toString("hex");
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");

  const { code, redirectUri } = await new Promise<{
    code: string;
    redirectUri: string;
  }>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/") return void res.writeHead(404).end();
      const err = url.searchParams.get("error");
      const got = url.searchParams.get("code");
      if (err || url.searchParams.get("state") !== state || !got) {
        res
          .writeHead(400, { "content-type": "text/plain" })
          .end(`Google sign-in failed: ${err ?? "state mismatch"}`);
        server.close();
        return reject(new Error(err ?? "OAuth state mismatch"));
      }
      res
        .writeHead(200, { "content-type": "text/html" })
        .end("<h2>Connected. You can close this tab.</h2>");
      const port = (server.address() as { port: number }).port;
      server.close();
      resolve({ code: got, redirectUri: `http://127.0.0.1:${port}` });
    });
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      auth.search = new URLSearchParams({
        client_id: config.google.clientId,
        redirect_uri: `http://127.0.0.1:${port}`,
        response_type: "code",
        scope: GOOGLE_SCOPES.join(" "),
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        ...(loginHint ? { login_hint: loginHint } : {}),
      }).toString();
      console.log(
        `\nOpen this URL and sign in to the Google account for "${label}":\n\n${auth}\n`,
      );
    });
  });

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  if (!tokenRes.ok)
    throw new Error(
      `Token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`,
    );
  const t = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };
  const tokens: Tokens = {
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: Date.now() + (t.expires_in - 60) * 1000,
    scope: t.scope,
  };
  const me = (await (
    await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    })
  ).json()) as { email: string; name?: string };

  const id = `google:${me.email.toLowerCase()}`;
  const prior = get<{ tokens: string }>(
    "SELECT tokens FROM accounts WHERE id = ?",
    id,
  );
  if (!tokens.refresh_token && prior)
    tokens.refresh_token = (JSON.parse(prior.tokens) as Tokens).refresh_token;
  run(
    `INSERT INTO accounts (id, provider, label, email, tokens) VALUES (?, 'google', ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET label = excluded.label, tokens = excluded.tokens`,
    id,
    label,
    me.email.toLowerCase(),
    JSON.stringify(tokens),
  );
  return loadGoogleAccount(id)!;
}

export function loadGoogleAccount(id: string): GoogleAccount | undefined {
  const row = get<{
    id: string;
    label: string;
    email: string;
    tokens: string;
    sync_state: string;
  }>("SELECT * FROM accounts WHERE id = ?", id);
  if (!row) return undefined;
  return {
    ...row,
    tokens: JSON.parse(row.tokens),
    sync_state: JSON.parse(row.sync_state),
  };
}

export function googleAccounts(): GoogleAccount[] {
  return all<{ id: string }>(
    "SELECT id FROM accounts WHERE provider = 'google' ORDER BY created_at",
  ).map((r) => loadGoogleAccount(r.id)!);
}

export function saveSyncState(account: GoogleAccount) {
  run(
    "UPDATE accounts SET sync_state = ? WHERE id = ?",
    JSON.stringify(account.sync_state),
    account.id,
  );
}

async function accessToken(account: GoogleAccount): Promise<string> {
  if (account.tokens.expires_at > Date.now())
    return account.tokens.access_token;
  requireClient();
  if (!account.tokens.refresh_token)
    throw new Error(
      `No refresh token for ${account.email}; run: brain connect google`,
    );
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      refresh_token: account.tokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok)
    throw new Error(
      `Token refresh failed for ${account.email}: ${res.status} ${await res.text()}`,
    );
  const t = (await res.json()) as { access_token: string; expires_in: number };
  account.tokens.access_token = t.access_token;
  account.tokens.expires_at = Date.now() + (t.expires_in - 60) * 1000;
  run(
    "UPDATE accounts SET tokens = ? WHERE id = ?",
    JSON.stringify(account.tokens),
    account.id,
  );
  return t.access_token;
}

// Gmail allows ~6000 quota units/min/user (a message read costs 5), so ~20 reads/s.
// Every call for one account waits for its slot; a rate-limit reply pauses the whole account.
const MAX_RPS = Number(process.env.GOOGLE_MAX_RPS ?? 12);
const nextSlot = new Map<string, number>();

async function throttle(accountId: string) {
  const now = Date.now();
  const slot = Math.max(now, nextSlot.get(accountId) ?? 0);
  nextSlot.set(accountId, slot + 1000 / MAX_RPS);
  if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
}

/** GET a Google API JSON endpoint with auth, pacing, and retries on rate limits / 5xx. */
export async function gget<T>(
  account: GoogleAccount,
  url: string,
  params: Record<string, string | string[] | undefined> = {},
): Promise<T> {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    for (const item of Array.isArray(v) ? v : [v])
      u.searchParams.append(k, item);
  }
  for (let attempt = 0; ; attempt++) {
    await throttle(account.id);
    const res = await fetch(u, {
      headers: { authorization: `Bearer ${await accessToken(account)}` },
    });
    if (res.ok) return (await res.json()) as T;
    const body = await res.text();
    const rateLimited =
      res.status === 429 || (res.status === 403 && /rate|quota/i.test(body));
    if ((rateLimited || res.status >= 500) && attempt < 8) {
      const retryAfter = Number(res.headers.get("retry-after")) * 1000;
      const wait =
        retryAfter ||
        Math.min(60_000, 2 ** attempt * 2000) + Math.random() * 1000;
      if (rateLimited) {
        // Back off every worker for this account, not just this request.
        nextSlot.set(
          account.id,
          Math.max(nextSlot.get(account.id) ?? 0, Date.now() + wait),
        );
      } else {
        await new Promise((r) => setTimeout(r, wait));
      }
      continue;
    }
    throw new Error(`Google API ${res.status} ${u.pathname}: ${body}`);
  }
}

/** Run async work over items with bounded concurrency. */
export async function pool<T>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<void>,
) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}
