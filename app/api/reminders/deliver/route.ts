import { env } from "cloudflare:workers";
import { timingSafeEqual } from "node:crypto";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { dueRows, deliverDevice } from "@/lib/reminder-push";
const issuer = "https://token.actions.githubusercontent.com";
const keys = createRemoteJWKSet(new URL(issuer + "/.well-known/jwks"));
export const dynamic = "force-dynamic";
const schedulerTokenFormat = /^[a-f0-9]{64}$/;

async function authorized(token: string) {
  const schedulerToken = env.REMINDER_SCHEDULER_TOKEN;
  if (
    schedulerToken &&
    schedulerTokenFormat.test(schedulerToken) &&
    schedulerTokenFormat.test(token) &&
    timingSafeEqual(Buffer.from(token), Buffer.from(schedulerToken))
  )
    return true;
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer,
      audience: "habit-grove-reminders",
      algorithms: ["RS256"],
    });
    return (
      payload.repository_id === "1470015794" &&
      payload.ref === "refs/heads/main" &&
      payload.workflow_ref ===
        "RamanaMahendran/Habit-Tracker-/.github/workflows/habit-reminders.yml@refs/heads/main"
    );
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token || !(await authorized(token)))
    return new Response(null, { status: 401 });
  const now = new Date(),
    db = env.DB!;
  await db
    .prepare("DELETE FROM reminder_receipts WHERE created<?")
    .bind(now.getTime() - 3 * 86400000)
    .run();
  let after = "";
  const summary = { devices: 0, accepted: 0, expired: 0, failed: 0 };
  for (;;) {
    const page = await db
      .prepare(
        "SELECT id,owner,endpoint,enabledAt FROM reminder_devices WHERE id>? ORDER BY id LIMIT 20",
      )
      .bind(after)
      .all<{
        id: string;
        owner: string;
        endpoint: string;
        enabledAt: number;
      }>();
    for (const d of page.results) {
      summary.devices++;
      try {
        const result = await deliverDevice(d, await dueRows(d.owner, now), now);
        if (result) summary[result]++;
      } catch (error) {
        const status =
          error instanceof Error
            ? /^Push service returned (\d{3})$/.exec(error.message)?.[1]
            : undefined;
        console.warn(
          "Scheduled reminder delivery failed",
          status ?? "request failed",
        );
        summary.failed++;
      }
    }
    if (page.results.length < 20) break;
    after = page.results.at(-1)!.id;
  }
  console.info("Scheduled reminder check", summary);
  return Response.json(summary, {
    status: summary.failed ? 503 : 200,
    headers: { "Cache-Control": "private, no-store" },
  });
}
