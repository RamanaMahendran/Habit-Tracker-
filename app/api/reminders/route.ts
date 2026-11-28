import { env, waitUntil } from "cloudflare:workers";
import { owner } from "@/lib/journal-owner";
import {
  digest,
  publicKey,
  supportedEndpoint,
  sendPush,
} from "@/lib/reminder-push";
export const dynamic = "force-dynamic";
const testDelay = 15_000;
const testCooldown = 30_000;
const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function GET(req: Request) {
  if (!(await owner(req)))
    return reply({ error: "Open your journal first." }, 401);
  return reply({ key: publicKey() });
}
export async function POST(req: Request) {
  const user = await owner(req);
  if (!user || req.headers.get("origin") !== new URL(req.url).origin)
    return reply({ error: "Open this journal to change its alerts." }, 403);
  const body = (await req.json().catch(() => null)) as {
    action?: string;
    endpoint?: string;
  } | null;
  if (!body || !supportedEndpoint(body.endpoint))
    return reply({ error: "This browser’s push service is unsupported." }, 400);
  const id = await digest(body.endpoint),
    db = env.DB!;
  if (body.action === "disable") {
    await db
      .prepare("DELETE FROM reminder_devices WHERE id=? AND owner=?")
      .bind(id, user)
      .run();
    return reply({ ok: true });
  }
  if (body.action === "test" || body.action === "test-status") {
    const device = await db
      .prepare("SELECT endpoint FROM reminder_devices WHERE id=? AND owner=?")
      .bind(id, user)
      .first<{ endpoint: string }>();
    if (!device)
      return reply(
        { error: "Enable phone notifications for this journal first." },
        409,
      );
    const testKey = "test:" + (await digest(user + "|" + id));
    if (body.action === "test-status") {
      const receipt = await db
        .prepare("SELECT created FROM reminder_receipts WHERE id=?")
        .bind(testKey)
        .first<{ created: number }>();
      if (!receipt) return reply({ state: "none" });
      const runKey = `${testKey}:${receipt.created}`;
      const result = await db
        .prepare("SELECT id,created FROM reminder_receipts WHERE id IN (?,?)")
        .bind("accepted:" + runKey, "failed:" + runKey)
        .first<{ id: string; created: number }>();
      return reply({
        state: result
          ? result.id.startsWith("accepted:")
            ? "accepted"
            : "failed"
          : Date.now() - receipt.created < testCooldown
            ? "queued"
            : "unconfirmed",
        sentAt: result?.created,
      });
    }
    const now = Date.now();
    const test = await db
      .prepare(
        "INSERT INTO reminder_receipts(id,created) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET created=excluded.created WHERE reminder_receipts.created<=?",
      )
      .bind(testKey, now, now - testCooldown)
      .run();
    if (!test.meta.changes)
      return reply(
        { error: "Wait 30 seconds before sending another test." },
        429,
      );
    waitUntil(runPushTest(id, user, testKey, now));
    return reply({ delaySeconds: testDelay / 1000 }, 202);
  }
  if (body.action !== "enable")
    return reply({ error: "Unknown alert setting." }, 400);
  const result = await db
    .prepare(
      "INSERT INTO reminder_devices(id,owner,endpoint,enabledAt) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET endpoint=excluded.endpoint WHERE owner=excluded.owner",
    )
    .bind(id, user, body.endpoint, Date.now())
    .run();
  if (!result.meta.changes)
    return reply(
      {
        error: "Turn off the old journal’s alerts before linking this device.",
      },
      409,
    );
  return reply({ ok: true });
}

async function runPushTest(
  id: string,
  user: string,
  testKey: string,
  startedAt: number,
) {
  await new Promise((resolve) => setTimeout(resolve, testDelay));
  const db = env.DB!;
  const device = await db
    .prepare("SELECT endpoint FROM reminder_devices WHERE id=? AND owner=?")
    .bind(id, user)
    .first<{ endpoint: string }>();
  if (!device) return;

  let accepted = false;
  try {
    const push = await sendPush(device.endpoint);
    accepted = push.ok;
    if (!accepted)
      console.warn("Reminder test rejected by push service", push.status);
  } catch {
    console.warn("Reminder test could not reach push service");
  }
  const result = accepted ? "accepted" : "failed";
  await db
    .prepare("INSERT INTO reminder_receipts(id,created) VALUES(?,?)")
    .bind(`${result}:${testKey}:${startedAt}`, Date.now())
    .run();
}
