import { env } from "cloudflare:workers";
import { importJWK, SignJWT, base64url, type JWK } from "jose";
import {
  indiaDay,
  indexJournal,
  isOverdue,
  reminderAt,
  moveDay,
  type Entry,
  type Row,
} from "./habits";
export function publicKey() {
  const jwk = JSON.parse(env.REMINDER_VAPID_JWK || "null") as JWK | null;
  if (!jwk?.x || !jwk.y) throw Error("Push service is not configured.");
  return base64url.encode(
    new Uint8Array([4, ...base64url.decode(jwk.x), ...base64url.decode(jwk.y)]),
  );
}
export function supportedEndpoint(s: unknown): s is string {
  if (typeof s !== "string" || s.length > 2048) return false;
  try {
    const u = new URL(s);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      !u.hash &&
      (u.hostname === "fcm.googleapis.com" ||
        u.hostname === "updates.push.services.mozilla.com" ||
        u.hostname.endsWith(".push.services.mozilla.com") ||
        u.hostname === "web.push.apple.com" ||
        u.hostname.endsWith(".push.apple.com") ||
        u.hostname.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}
export async function digest(value: string) {
  return base64url.encode(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  );
}
export async function sendPush(endpoint: string) {
  if (!supportedEndpoint(endpoint)) throw Error("Unsupported push service.");
  const signing = await importJWK(JSON.parse(env.REMINDER_VAPID_JWK!), "ES256");
  const token = await new SignJWT({
    sub: "https://habit-grove-planner.ramanan-portfolio93.chatgpt.site/",
  })
    .setProtectedHeader({ alg: "ES256", typ: "JWT" })
    .setAudience(new URL(endpoint).origin)
    .setExpirationTime("1h")
    .sign(signing);
  return fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: "vapid t=" + token + ", k=" + publicKey(),
      TTL: "300",
      Urgency: "high",
    },
    body: new Uint8Array(0),
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
}
export async function dueRows(owner: string, now: Date) {
  const day = indiaDay(now);
  const res = await env
    .DB!.prepare(
      `SELECT seq,habit,kind,day,payload,created FROM habit_journal WHERE owner=? AND (
    seq IN (SELECT max(seq) FROM habit_journal WHERE owner=? AND kind='plan' AND day<=? GROUP BY habit)
    OR seq IN (SELECT max(seq) FROM habit_journal WHERE owner=? AND kind='plan' AND day<=? GROUP BY habit)
    OR (kind='status' AND day BETWEEN ? AND ?)) ORDER BY seq`,
    )
    .bind(owner, owner, day, owner, moveDay(day, -1), moveDay(day, -1), day)
    .all();
  const entries = res.results.map((e) => ({
    ...e,
    payload: JSON.parse(String(e.payload)),
  })) as Entry[];
  return indexJournal(entries)
    .checkIns(day)
    .filter((r) => isOverdue(r, now));
}
export async function deliverDevice(
  device: { id: string; endpoint: string; enabledAt: number },
  rows: Row[],
  now: Date,
) {
  const db = env.DB!;
  const keys: string[] = [];
  for (const r of rows) {
    const timestamp = reminderAt(r);
    if (!r.rolling && timestamp < device.enabledAt - 60000) continue;
    const key = await digest(
      [device.id, r.id, r.day, r.slot, r.time].join("|"),
    );
    const claim = await db
      .prepare(
        "INSERT OR IGNORE INTO reminder_receipts(id,created) VALUES(?,?)",
      )
      .bind(key, now.getTime())
      .run();
    if (claim.meta.changes) keys.push(key);
  }
  if (!keys.length) return;
  try {
    const result = await sendPush(device.endpoint);
    if (result.status === 404 || result.status === 410) {
      await db
        .prepare("DELETE FROM reminder_devices WHERE id=?")
        .bind(device.id)
        .run();
      return "expired";
    }
    if (!result.ok) throw Error("Push service returned " + result.status);
  } catch (err) {
    await db.batch(
      keys.map((key) =>
        db.prepare("DELETE FROM reminder_receipts WHERE id=?").bind(key),
      ),
    );
    throw err;
  }
  return "accepted";
}
