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
