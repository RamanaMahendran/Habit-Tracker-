"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { displayDay } from "@/lib/habits";
import type { ProgressPeriod } from "@/lib/progress-period";
import type { AndroidBridge } from "@/lib/android-bridge";

export const isWalkingHabit = (title: string) => /\bwalk(?:s|ing)?\b/i.test(title);
type WalkingDay = { date: string; meters: number | null; kcal: number | null };
type WalkingReport = {
  access: "connected" | "permission";
  days: WalkingDay[];
  historyLimited: boolean;
};

const metric = (value: number | null, divisor: number, digits: number) =>
  value === null
    ? "—"
    : (value / divisor).toLocaleString(undefined, {
        maximumFractionDigits: digits,
      });

function groupDays(days: WalkingDay[], monthly: boolean) {
  const grouped = new Map<string, WalkingDay>();
  for (const day of days) {
    const date = monthly ? day.date.slice(0, 7) + "-01" : day.date;
    const next = grouped.get(date) ?? { date, meters: null, kcal: null };
    if (day.meters !== null) next.meters = (next.meters ?? 0) + day.meters;
    if (day.kcal !== null) next.kcal = (next.kcal ?? 0) + day.kcal;
    grouped.set(date, next);
  }
  return [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function WalkingPerformance({
  android,
  start,
  end,
  period,
}: {
  android?: AndroidBridge;
  start: string;
  end: string;
  period: ProgressPeriod;
}) {
  const [report, setReport] = useState<WalkingReport>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const read = useCallback(
    async (ask: boolean) => {
      if (!android) return;
      const request = ++sequence.current;
      setBusy(true);
      setError("");
      try {
        const result = await android.request<WalkingReport>("walking", {
          start,
          end,
          ask,
        });
        if (request === sequence.current) setReport(result);
      } catch (err) {
        if (request === sequence.current) {
          setReport(undefined);
          setError(err instanceof Error ? err.message : "Could not read Health Connect.");
        }
      } finally {
        if (request === sequence.current) setBusy(false);
      }
    },
    [android, start, end],
  );
  useEffect(() => {
    setReport(undefined);
    void read(false);
    return () => { sequence.current++; };
  }, [read]);
  const monthly = period === "12 months";
  const rows = useMemo(() => groupDays(report?.days ?? [], monthly), [report, monthly]);
  const total = useMemo(() => groupDays(
    (report?.days ?? []).map((day) => ({ ...day, date: start })),
    false,
  )[0], [report, start]);
  return (
    <section className="card walking-performance" aria-label="Walking performance">
      <div className="row walking-heading">
        <h2>Walking performance</h2>
        {android && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void read(report?.access !== "connected")}
          >
            {report?.access === "connected" ? "Refresh Health Connect" : "Connect Health Connect"}
          </button>
        )}
      </div>
      {!android ? (
        <p>
          Open the <a href="/android/habit-grove.apk" download>Habit Grove Android app</a> to see
          walking distance and active calories from Health Connect.
        </p>
      ) : busy ? (
        <p role="status">Reading walking workouts…</p>
      ) : error ? (
        <p role="status">{error}</p>
      ) : report?.access === "connected" ? (
        <>
          <div className="band-grid walking-totals">
            <div><small>Distance</small><strong>{metric(total?.meters ?? null, 1000, 2)} km</strong></div>
            <div><small>Active calories</small><strong>{metric(total?.kcal ?? null, 1, 0)} kcal</strong></div>
          </div>
          {report.historyLimited && <p>Older dates require Health Connect history access.</p>}
          {rows.length ? (
            <div className="scrolltable">
              <table>
                <thead><tr><th>{monthly ? "Month" : "Date"}</th><th>Distance (km)</th><th>Active calories (kcal)</th></tr></thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.date}>
                      <td>{displayDay(row.date, monthly ? { month: "short", year: "numeric" } : { weekday: "short", day: "numeric", month: "short" })}</td>
                      <td>{metric(row.meters, 1000, 2)}</td>
                      <td>{metric(row.kcal, 1, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p>No recorded walking workouts in this period. Sync your fitness app with Health Connect.</p>}
        </>
      ) : (
        <p>Allow read access to walking workouts, distance and active calories. The measurements stay on this device.</p>
      )}
    </section>
  );
}
