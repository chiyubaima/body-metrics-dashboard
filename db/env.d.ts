declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    COACH_PROVIDER?: string;
    COACH_API_BASE_URL?: string;
    COACH_API_KEY?: string;
    COACH_MODEL?: string;
    COACH_CODEX_URL?: string;
    COACH_CODEX_TOKEN?: string;
  }
}
