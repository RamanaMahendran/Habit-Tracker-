import { owner } from "@/lib/journal-owner";
import { slotTimes } from "@/lib/interval";
import { env } from "cloudflare:workers";
import {
  categories,
  frequencies,
  indiaDay,
  indiaTime,
  type CheckIn,
  rowsForHabit,
  scheduled,
  type Habit,
} from "@/lib/habits";
export const dynamic = "force-dynamic";
const reply = (x: unknown, status = 200) =>
  Response.json(x, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
// The platform identity is used only to copy records from the original release.
function previousOwner(req: Request) {
  return req.headers.get("oai-authenticated-user-id");
}
const uuid = (x: unknown) =>
  typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x);
const date = (x: unknown) =>
  typeof x === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(x) &&
  !isNaN(Date.parse(x)) &&
  new Date(x).toISOString().slice(0, 10) === x;
export async function GET(req: Request) {
  const user = await owner(req);
  if (!user)
    return reply({ error: "Reload Habit Grove to open your journal." }, 401);
  const after = Number(new URL(req.url).searchParams.get("after") || 0);
  if (!Number.isSafeInteger(after) || after < 0)
    return reply({ error: "Invalid cursor." }, 400);
  const legacy = previousOwner(req);
  const legacyAvailable =
    !after && legacy
      ? Boolean(
          await env
            .DB!.prepare(
              "SELECT 1 FROM habit_journal old WHERE old.owner=? AND NOT EXISTS (SELECT 1 FROM habit_journal dest WHERE dest.owner=? AND dest.uid=old.uid) LIMIT 1",
            )
            .bind(legacy, user)
            .first(),
        )
      : false;
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
    legacyAvailable,
  });
}
export async function POST(req: Request) {
  const user = await owner(req);
  if (!user)
    return reply({ error: "Reload Habit Grove to save your changes." }, 401);
  if (
    req.headers.get("origin") !== new URL(req.url).origin ||
    !req.headers.get("content-type")?.includes("application/json")
  )
    return reply({ error: "Invalid request." }, 403);
  const body = (await req.json().catch(() => null)) as {
    events?: unknown;
    action?: unknown;
  } | null;
  if (body?.action === "import-previous") {
    const legacy = previousOwner(req);
    if (!legacy)
      return reply(
        {
          error:
            "Open the previous journal with its original account to import it.",
        },
        401,
      );
    const result = await env
      .DB!.prepare(
        "INSERT INTO habit_journal(owner,uid,habit,kind,day,payload,created) SELECT ?,uid,habit,kind,day,payload,created FROM habit_journal WHERE owner=? ORDER BY seq ON CONFLICT(owner,uid) DO NOTHING",
      )
      .bind(user, legacy)
      .run();
    return reply({ imported: result.meta.changes });
  }
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
        (h.inDay !== undefined &&
          (!h.inDay ||
            typeof h.inDay !== "object" ||
            !slotTimes(h.time, h.inDay).length)) ||
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
        ...(h.rolling === true && h.inDay && "count" in h.inDay
          ? { rolling: true }
          : {}),
        ...(h.inDay
          ? {
              inDay:
                "until" in h.inDay
                  ? { hours: h.inDay.hours, until: h.inDay.until }
                  : { hours: h.inDay.hours, count: h.inDay.count },
            }
          : {}),
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
      const h = JSON.parse(plan!.payload) as Habit;
      const slots = slotTimes(h.time, h.inDay);
      const slot = v.slot ?? "";
      if (typeof slot !== "string" || (slot && !slots.slice(1).includes(slot)))
        return reply(
          { error: "That check-in time has changed. Refresh the planner." },
          409,
        );
      const actualTime =
        v.status === "Done"
          ? (v.actualTime ?? (day === today ? indiaTime() : undefined))
          : undefined;
      if (
        actualTime !== undefined &&
        (typeof actualTime !== "string" ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(actualTime) ||
          (day === today && actualTime > indiaTime()))
      )
        return reply(
          {
            error:
              "Choose the time it actually happened, up to the current time.",
          },
          400,
        );
      if (h.rolling) {
        const latest = await env
          .DB!.prepare(
            "SELECT payload,created FROM habit_journal WHERE owner=? AND habit=? AND day=? AND kind='status' ORDER BY seq",
          )
          .bind(user, e.habit, day)
          .all<{ payload: string; created: string }>();
        const marks = new Map<string, CheckIn>();
        for (const x of latest.results) {
          const m = JSON.parse(x.payload) as CheckIn;
          if (
            m.status === "Done" &&
            !m.actualTime &&
            indiaDay(new Date(x.created)) === day
          )
            m.actualTime = indiaTime(new Date(x.created));
          marks.set(m.slot || "", m);
        }
        const rows = rowsForHabit(h, day, marks),
          index = rows.findIndex((r) => r.slot === slot),
          current = rows[index];
        if (
          current?.status === "Pending" &&
          !current.next &&
          v.status !== "Pending"
        )
          return reply(
            {
              error:
                "Record or skip the earlier check-in first. Refresh if you just logged it.",
            },
            409,
          );
        if (
          v.status === "Done" &&
          (!actualTime ||
            rows.some(
              (r, i) =>
                r.status === "Done" &&
                r.actualTime &&
                (i < index
                  ? r.actualTime > actualTime
                  : i > index && r.actualTime < actualTime),
            ))
        )
          return reply(
            { error: "Use a time in order with the other recorded check-ins." },
            400,
          );
      }
      data = {
        status: v.status,
        note: v.note,
        slot,
        ...(actualTime ? { actualTime } : {}),
      };
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
