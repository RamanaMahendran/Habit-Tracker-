declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    REMINDER_VAPID_JWK?: string;
    BUCKET?: R2Bucket;
  }
}
