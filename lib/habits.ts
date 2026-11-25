import { slotTimes, parseInterval, type InDay } from "./interval";
export const categories = [
  "Wellness",
  "Learning",
  "Mindfulness",
  "Work",
  "Personal",
] as const;
export const frequencies = ["Daily", "Weekdays", "Weekly", "Once"] as const;
export type Habit = {
  id: string;
  title: string;
  category: string;
  start: string;
  time: string;
  repeat: string;
  archived?: boolean;
  inDay?: InDay;
};
export type Entry = {
  seq: number;
  habit: string;
  kind: "plan" | "status";
  day: string;
  payload: Habit | { status: string; note: string; slot?: string };
  created: string;
};
export type Row = Habit & { status: string; day: string; slot: string };
export const indiaDay = (now = new Date()) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kolkata" }).format(now);
export const indiaTime = (now = new Date()) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
export const dateObj = (s: string) => new Date(s + "T12:00:00Z");
export const moveDay = (s: string, n: number) => {
  const d = dateObj(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const displayDay = (s: string, opts: Intl.DateTimeFormatOptions) =>
  dateObj(s).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
export const displayTime = (s: string) =>
  s
    ? new Date("2000-01-01T" + s + ":00Z").toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
      })
    : "Anytime";
export function scheduled(h: Habit, day: string) {
  if (h.archived || h.start > day) return false;
  const weekday = dateObj(day).getUTCDay();
  return (
    h.repeat === "Daily" ||
    (h.repeat === "Weekdays" && weekday > 0 && weekday < 6) ||
    (h.repeat === "Weekly" && weekday === dateObj(h.start).getUTCDay()) ||
    (h.repeat === "Once" && h.start === day)
  );
}
export function indexJournal(entries: Entry[]) {
  const plans = new Map<string, Entry[]>(),
    marks = new Map<string, string>();
  for (const e of entries) {
    if (e.kind === "plan") {
      if (!plans.has(e.habit)) plans.set(e.habit, []);
      plans.get(e.habit)!.push(e);
    } else {
      const mark = e.payload as { status: string; slot?: string };
      marks.set(e.habit + e.day + (mark.slot || ""), mark.status);
    }
  }
  const rows = (day: string): Row[] =>
    Array.from(plans.values())
      .flatMap((versions) => {
        const event = versions.findLast((v) => v.day <= day);
        if (!event) return [];
        const h = event.payload as Habit;
        return scheduled(h, day)
          ? slotTimes(h.time, h.inDay).map((time, i) => {
              const slot = i === 0 ? "" : time;
              return {
                ...h,
                time,
                day,
                slot,
                status: marks.get(h.id + day + slot) || "Pending",
              };
            })
          : [];
      })
      .sort(
        (a, b) =>
          (a.time || "99").localeCompare(b.time || "99") ||
          a.title.localeCompare(b.title),
      );
  const current = Array.from(
    plans.values(),
    (v) => v[v.length - 1].payload as Habit,
  );
  return {
    rows,
    current,
    first: entries
      .filter((e) => e.kind === "plan")
      .reduce((s, e) => (s < e.day ? s : e.day), indiaDay()),
  };
}
export function blank(day = indiaDay()): Habit {
  return {
    id: crypto.randomUUID(),
    title: "",
    category: "Personal",
    start: day,
    time: "",
    repeat: "Daily",
  };
}
export function categoryFor(s: string) {
  if (/walk|yoga|water|exercise|run|fitness|stretch|sleep|gym/i.test(s))
    return "Wellness";
  if (/read|study|learn|course|practice|book/i.test(s)) return "Learning";
  if (/journal|breathe|meditat|reflect/i.test(s)) return "Mindfulness";
  if (/sales|call|client|work|meeting/i.test(s)) return "Work";
  return "Personal";
}
export function draftPlan(input: string, day = indiaDay()): Habit[] {
  const days = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const pieces = input
    .trim()
    .split(
      /\s*(?:;|\n|\band then\b|\band (?=(?:read|walk|call|study|drink|write|practice|stretch|journal|meditate)\b))\s*/i,
    )
    .filter(Boolean)
    .slice(0, 8);
  return pieces.flatMap((part) => {
    const within = parseInterval(part);
    if (within) part = within.rest;
    const lower = part.toLowerCase(),
      weekday = days.findIndex((x) => lower.includes(x));
    let start = lower.includes("tomorrow") ? moveDay(day, 1) : day;
    if (weekday >= 0)
      start = moveDay(day, (weekday - dateObj(day).getUTCDay() + 7) % 7);
    let repeat = /weekday|monday to friday/i.test(part)
      ? "Weekdays"
      : /weekly|every (?:mon|tues|wednes|thurs|fri|satur|sun)day/i.test(part)
        ? "Weekly"
        : /daily|every day|every morning|every evening|habit|routine/i.test(
              part,
            )
          ? "Daily"
          : /tomorrow|today|once/i.test(part) || weekday >= 0
            ? "Once"
            : "Daily";
    let time = /(morning|before work)/i.test(part)
      ? "07:00"
      : /evening|after work/i.test(part)
        ? "18:00"
        : /bedtime|at night/i.test(part)
          ? "21:00"
          : "";
    const clock =
      part.match(/(?:\bat\s+|\bby\s+)(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i) ||
      part.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    if (clock) {
      let h = +clock[1];
      const m = +(clock[2] || 0);
      if (clock[3]) h = (h % 12) + (clock[3].toLowerCase() === "pm" ? 12 : 0);
      if (h < 24 && m < 60)
        time = [h, m].map((n) => String(n).padStart(2, "0")).join(":");
    }
    let title = part.replace(
      /^(?:please\s+)?(?:remind me to|help me to|i (?:want|need) to|schedule|add a task to|plan to)\s*/i,
      "",
    );
    if (clock) title = title.replace(clock[0], "");
    title = title
      .replace(
        /\b(?:(?:every|on|next)\s+)?(?:monday to friday|weekdays?|saturdays?|sundays?|mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|tomorrow|today|once|daily|weekly|every day|every morning|every evening|in the morning|in the evening)\b/gi,
        "",
      )
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^[, .]+|[, .]+$/g, "");
    const suggestions =
      /^(?:get fit|improve (?:my )?fitness|build (?:a )?fitness routine|be (?:more )?active)$/i.test(
        title,
      )
        ? ["Take a 15-minute walk", "Stretch for 5 minutes"]
        : /^(?:learn sales|improve (?:my )?sales|become better at sales)$/i.test(
              title,
            )
          ? [
              "Practise a sales opening for 10 minutes",
              "Review one practice call",
            ]
          : /^(?:read more|build a reading habit)$/i.test(title)
            ? ["Read 10 pages"]
            : [title];
    return suggestions.filter(Boolean).map((s, i) => ({
      ...blank(start),
      title: (s[0].toUpperCase() + s.slice(1)).slice(0, 160),
      repeat,
      time: within ? within.first : i && time ? "" : time,
      ...(within ? { inDay: within.rule } : {}),
      category: categoryFor(s),
    }));
  });
}
