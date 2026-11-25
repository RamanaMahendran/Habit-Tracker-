import { env } from "cloudflare:workers";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { dueRows, deliverDevice } from "@/lib/reminder-push";
const issuer = "https://token.actions.githubusercontent.com";
const keys = createRemoteJWKSet(new URL(issuer + "/.well-known/jwks"));
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return new Response(null, { status: 401 });
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer,
      audience: "habit-grove-reminders",
      algorithms: ["RS256"],
    });
    if (
      payload.repository_id !== "1470015794" ||
      payload.ref !== "refs/heads/main" ||
      payload.workflow_ref !==
        "RamanaMahendran/Habit-Tracker-/.github/workflows/habit-reminders.yml@refs/heads/main"
    )
      return new Response(null, { status: 403 });
  } catch {
    return new Response(null, { status: 401 });
  }
  const now = new Date(),
    db = env.DB!;
  await db
    .prepare("DELETE FROM reminder_receipts WHERE created<?")
    .bind(now.getTime() - 3 * 86400000)
    .run();
  let after = "",
    failed = false;
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
      try {
        await deliverDevice(d, await dueRows(d.owner, now), now);
      } catch {
        failed = true;
      }
    }
    if (page.results.length < 20) break;
    after = page.results.at(-1)!.id;
  }
  return new Response(
    failed ? "Reminder delivery needs a retry." : "Reminder check complete.",
    { status: failed ? 503 : 200 },
  );
}
