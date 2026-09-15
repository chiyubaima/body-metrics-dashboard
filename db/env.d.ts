declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    MEDAL_IMAGES?: R2Bucket;
    MEDAL_IMAGE_PROVIDER?: string;
    MEDAL_IMAGE_BASE_URL?: string;
    MEDAL_IMAGE_MODEL?: string;
    MEDAL_IMAGE_API_KEY?: string;
    COACH_PROVIDER?: string;
    COACH_API_BASE_URL?: string;
    COACH_API_KEY?: string;
    COACH_MODEL?: string;
    COACH_CODEX_URL?: string;
    COACH_CODEX_TOKEN?: string;
    COACH_LOCAL_URL?: string;
  }
}
