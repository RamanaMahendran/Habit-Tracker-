declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    REMINDER_VAPID_JWK?: string;
    REMINDER_SCHEDULER_TOKEN?: string;
    BUCKET?: R2Bucket;
  }
}
