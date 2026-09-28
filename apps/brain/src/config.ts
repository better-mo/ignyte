import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const APP_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// Load apps/brain/.env if present; real environment variables win.
const envFile = path.join(APP_ROOT, ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const env = (name: string, fallback = "") =>
  process.env[name]?.trim() || fallback;

export const config = {
  dataDir: path.resolve(
    env("IGNYTE_DATA_DIR", path.join(os.homedir(), ".ignyte")),
  ),
  get dbPath() {
    return path.join(this.dataDir, "brain.db");
  },
  defaultCountry: env("IGNYTE_DEFAULT_COUNTRY", "US"),

  anthropicModel: env("IGNYTE_MODEL", "claude-opus-5"),
  anthropicEffort: env("IGNYTE_EFFORT", "high") as
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | "max",

  google: {
    clientId: env("GOOGLE_CLIENT_ID"),
    clientSecret: env("GOOGLE_CLIENT_SECRET"),
    // How far back the first Gmail / Calendar sync reaches.
    gmailLookbackDays: Number(env("GMAIL_LOOKBACK_DAYS", "1095")),
    calendarLookbackDays: Number(env("CALENDAR_LOOKBACK_DAYS", "1095")),
    calendarLookaheadDays: Number(env("CALENDAR_LOOKAHEAD_DAYS", "60")),
  },

  x: { bearerToken: env("X_BEARER_TOKEN") },

  enrichment: {
    provider: env("ENRICHMENT_PROVIDER", "pdl") as "pdl" | "apollo",
    pdlKey: env("PDL_API_KEY"),
    apolloKey: env("APOLLO_API_KEY"),
    // Don't re-enrich someone more often than this.
    refreshDays: Number(env("ENRICHMENT_REFRESH_DAYS", "180")),
  },

  voyage: {
    key: env("VOYAGE_API_KEY"),
    model: env("VOYAGE_MODEL", "voyage-3.5-lite"),
  },

  port: Number(env("PORT", "4321")),
};

fs.mkdirSync(config.dataDir, { recursive: true });
