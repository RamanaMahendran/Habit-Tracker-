import { CalendarDays } from "lucide-react";
import { displayTime, indiaDay, isOverdue, type Row } from "@/lib/habits";
import { minutes } from "@/lib/interval";
import { timeBand } from "@/lib/categories";
export function progressStatus(row: Row, now: Date, today: string) {
  if (row.status !== "Pending") return row.status;
  if (row.day < today) return "Unrecorded";
  if (row.rolling && !row.next) return "Estimated";
  if (!row.time) return "Anytime";
  return isOverdue(row, now) ? "Overdue" : "Upcoming";
}
export function timingNote(r: Row) {
  if (r.status !== "Done" || !r.actualTime) return "";
  const recorded = "Recorded at " + displayTime(r.actualTime);
  if (!r.time) return recorded;
  const delta = minutes(r.actualTime) - minutes(r.time);
  return (
    recorded +
    " · " +
    (delta === 0
      ? "on time"
      : Math.abs(delta) +
        " min " +
        (delta > 0 ? "after" : "before") +
        " reminder")
  );
}
export function DailyProgress({
  day,
  onDay,
  rows,
  now,
}: {
  day: string;
  onDay: (d: string) => void;
  rows: Row[];
  now: Date;
}) {
  const scheduled = rows.filter((r) => !r.outsideDay);
  const done = scheduled.filter((r) => r.status === "Done").length;
  const today = indiaDay(now);
  return (
    <section className="card day-dashboard" aria-label="Daily progress by time">
      <div className="row day-heading">
        <div>
          <span className="eyebrow">
            <CalendarDays size={15} />
            Daily dashboard
          </span>
          <h2>Progress by time</h2>
        </div>
        <label>
          Day · IST
          <input
            type="date"
            value={day}
            onChange={(e) => e.target.value && onDay(e.target.value)}
          />
        </label>
      </div>
      {scheduled.length ? (
        <>
          <div className="day-total">
            <strong>
              {done} of {scheduled.length} completed
            </strong>
            <span>{Math.round((done * 100) / scheduled.length)}%</span>
          </div>
          <progress
            aria-label="Daily completion"
            value={done}
            max={scheduled.length}
          />
          <div className="band-grid">
            {["Morning", "Afternoon", "Evening", "Night", "Anytime"].map(
              (b) => {
                const slots = scheduled.filter((r) => timeBand(r.time) === b);
                return slots.length ? (
                  <div key={b}>
                    <small>{b}</small>
                    <strong>
                      {slots.filter((r) => r.status === "Done").length} /{" "}
                      {slots.length}
                    </strong>
                  </div>
                ) : null;
              },
            )}
          </div>
          <ol className="day-timeline">
            {scheduled.map((r) => {
              const status = progressStatus(r, now, today);
              return (
                <li key={r.id + r.slot}>
                  <time>{displayTime(r.time)}</time>
                  <div>
                    <strong>{r.title}</strong>
                    {r.status === "Done" && r.actualTime && (
                      <small>{timingNote(r)}</small>
                    )}
                  </div>
                  <span className={"pill " + status.toLowerCase()}>
                    {status}
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <p className="empty">No check-ins scheduled for this day.</p>
      )}
    </section>
  );
}
