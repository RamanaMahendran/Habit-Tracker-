import { dateObj, displayDay, moveDay, type Row } from "./habits";

export const periods = ["Day", "1 week", "1 month", "12 months"] as const;
export type ProgressPeriod = (typeof periods)[number];
function monthStart(date: string, offset = 0) {
  const first = dateObj(date.slice(0, 7) + "-01");
  first.setUTCMonth(first.getUTCMonth() + offset);
  return first.toISOString().slice(0, 10);
}
export function periodBounds(
  period: ProgressPeriod,
  selected: string,
  today: string,
) {
  if (period === "Day") return { start: selected, end: selected };
  const anchor = selected > today ? today : selected;
  const start =
    period === "1 week"
      ? moveDay(anchor, -((dateObj(anchor).getUTCDay() + 6) % 7))
      : monthStart(anchor, period === "12 months" ? -11 : 0);
  const nominalEnd =
    period === "1 week"
      ? moveDay(start, 6)
      : moveDay(monthStart(anchor, 1), -1);
  return { start, end: nominalEnd > today ? today : nominalEnd };
}
export function shiftPeriod(period: ProgressPeriod, day: string, step: -1 | 1) {
  if (period === "Day" || period === "1 week")
    return moveDay(day, (period === "Day" ? 1 : 7) * step);
  return monthStart(day, step * (period === "12 months" ? 12 : 1));
}
export function trendBuckets(
  start: string,
  end: string,
  period: ProgressPeriod,
  rows: Row[],
) {
  const monthly = period === "12 months";
  const buckets = new Map<
    string,
    { day: string; label: string; total: number; done: number }
  >();
  for (
    let d = start;
    d <= end;
    d = monthly ? monthStart(d, 1) : moveDay(d, 1)
  ) {
    const key = monthly ? d.slice(0, 7) : d;
    buckets.set(key, {
      day: d,
      label: displayDay(
        d,
        monthly
          ? { month: "short", year: "numeric" }
          : { weekday: "short", day: "numeric", month: "short" },
      ),
      total: 0,
      done: 0,
    });
  }
  for (const row of rows) {
    if (row.outsideDay) continue;
    const bucket = buckets.get(monthly ? row.day.slice(0, 7) : row.day);
    if (!bucket) continue;
    bucket.total++;
    if (row.status === "Done") bucket.done++;
  }
  return [...buckets.values()];
}
