import { env } from "cloudflare:workers";
import { owner } from "@/lib/journal-owner";
import {
  digest,
  publicKey,
  supportedEndpoint,
  sendPush,
} from "@/lib/reminder-push";
export const dynamic = "force-dynamic";
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
  if (body.action === "test") {
    const device = await db
      .prepare("SELECT endpoint FROM reminder_devices WHERE id=? AND owner=?")
      .bind(id, user)
      .first<{ endpoint: string }>();
    if (!device)
      return reply(
        { error: "Enable phone notifications for this journal first." },
        409,
      );
    const now = Date.now();
    const testKey = "test:" + id;
    const test = await db
      .prepare(
        "INSERT INTO reminder_receipts(id,created) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET created=excluded.created WHERE reminder_receipts.created<=?",
      )
      .bind(testKey, now, now - 30_000)
      .run();
    if (!test.meta.changes)
      return reply(
        { error: "Wait 30 seconds before sending another test." },
        429,
      );
    try {
      const push = await sendPush(device.endpoint);
      if (push.status === 404 || push.status === 410)
        return reply(
          {
            error:
              "This phone subscription expired. Turn off alerts here, then enable phone notifications again.",
          },
          410,
        );
      if (!push.ok) {
        console.warn("Reminder test rejected by push service", push.status);
        return reply(
          {
            error: `The push service rejected this test (${push.status}). Turn off alerts, then enable phone notifications again.`,
          },
          502,
        );
      }
      return reply({ ok: true });
    } catch {
      console.warn("Reminder test could not reach push service");
      return reply(
        {
          error:
            "Habit Grove could not reach the phone’s push service. Try again in a moment.",
        },
        502,
      );
    }
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
