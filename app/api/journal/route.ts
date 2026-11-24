import { env } from "cloudflare:workers";
import {
  categories,
  frequencies,
  indiaDay,
  scheduled,
  type Habit,
} from "@/lib/habits";
export const dynamic = "force-dynamic";
const reply = (x: unknown, status = 200) =>
  Response.json(x, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
function owner(req: Request) {
  return (
    req.headers.get("oai-authenticated-user-id") ||
    (import.meta.env.DEV ? "local-preview" : "")
  );
}
const uuid = (x: unknown) =>
  typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x);
const date = (x: unknown) =>
  typeof x === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(x) &&
  !isNaN(Date.parse(x)) &&
  new Date(x).toISOString().slice(0, 10) === x;
export async function GET(req: Request) {
  const user = owner(req);
  if (!user) return reply({ error: "Sign in to view your planner." }, 401);
  const after = Number(new URL(req.url).searchParams.get("after") || 0);
  if (!Number.isSafeInteger(after) || after < 0)
    return reply({ error: "Invalid cursor." }, 400);
  const result = await env
    .DB!.prepare(
      "SELECT seq,habit,kind,day,payload,created FROM habit_journal WHERE owner=? AND seq>? ORDER BY seq LIMIT 500",
    )
    .bind(user, after)
    .all();
  return reply({
    events: result.results.map((r) => ({
      ...r,
      payload: JSON.parse(String(r.payload)),
    })),
    more: result.results.length === 500,
  });
}
export async function POST(req: Request) {
  const user = owner(req);
  if (!user) return reply({ error: "Sign in to save." }, 401);
  if (
    req.headers.get("origin") !== new URL(req.url).origin ||
    !req.headers.get("content-type")?.includes("application/json")
  )
    return reply({ error: "Invalid request." }, 403);
  const body = (await req.json().catch(() => null)) as {
    events?: unknown;
  } | null;
  const batch = body?.events;
  if (!Array.isArray(batch) || batch.length < 1 || batch.length > 8)
    return reply({ error: "Invalid change." }, 400);
  const ops = [],
    today = indiaDay();
  for (const e of batch) {
    if (!e || !uuid(e.uid) || !uuid(e.habit) || !e.payload || !date(e.day))
      return reply({ error: "Invalid change." }, 400);
    let data,
      day = e.day;
    if (e.kind === "plan") {
      const h = e.payload;
      if (
        typeof h.title !== "string" ||
        !h.title.trim() ||
        h.title.length > 160 ||
        !date(h.start) ||
        !categories.includes(h.category) ||
        !frequencies.includes(h.repeat) ||
        typeof h.time !== "string" ||
        (h.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(h.time))
      )
        return reply({ error: "Check the habit details." }, 400);
      const last = await env
        .DB!.prepare(
          "SELECT seq FROM habit_journal WHERE owner=? AND habit=? AND kind='plan' LIMIT 1",
        )
        .bind(user, e.habit)
        .first();
      day = last ? today : h.start < today ? h.start : today;
      data = {
        id: e.habit,
        title: h.title.trim(),
        category: h.category,
        start: h.start,
        time: h.time,
        repeat: h.repeat,
        archived: h.archived === true,
      };
    } else if (e.kind === "status") {
      const v = e.payload;
      if (
        day > today ||
        !["Done", "Skipped", "Pending"].includes(v.status) ||
        typeof v.note !== "string" ||
        v.note.length > 1000
      )
        return reply({ error: "Invalid check-in." }, 400);
      const plan = await env
        .DB!.prepare(
          "SELECT payload FROM habit_journal WHERE owner=? AND habit=? AND kind='plan' AND day<=? ORDER BY seq DESC LIMIT 1",
        )
        .bind(user, e.habit, day)
        .first<{ payload: string }>();
      if (!plan || !scheduled(JSON.parse(plan.payload) as Habit, day))
        return reply(
          { error: "This habit is not scheduled on that day." },
          409,
        );
      data = { status: v.status, note: v.note };
    } else return reply({ error: "Unknown change." }, 400);
    ops.push(
      env
        .DB!.prepare(
          "INSERT INTO habit_journal(owner,uid,habit,kind,day,payload,created) VALUES(?,?,?,?,?,?,?) ON CONFLICT(owner,uid) DO NOTHING",
        )
        .bind(
          user,
          e.uid,
          e.habit,
          e.kind,
          day,
          JSON.stringify(data),
          new Date().toISOString(),
        ),
    );
  }
  await env.DB!.batch(ops);
  return reply({ saved: true });
}
