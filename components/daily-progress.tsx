import { checkInLabel } from "@/lib/check-in-labels";
import { useMemo, useRef } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  periods,
  shiftPeriod,
  trendBuckets,
  type ProgressPeriod,
} from "@/lib/progress-period";
import {
  displayDay,
  displayTime,
  dateObj,
  indiaDay,
  isOverdue,
  moveDay,
  reminderDay,
  type Row,
} from "@/lib/habits";
import { minutes } from "@/lib/interval";
import { timeBand } from "@/lib/categories";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function CompletionCalendar({
  start,
  period,
  today,
  trend,
  onSelect,
}: {
  start: string;
  period: "1 week" | "1 month";
  today: string;
  trend: ReturnType<typeof trendBuckets>;
  onSelect: (date: string) => void;
}) {
  const lastDay =
    period === "1 week"
      ? moveDay(start, 6)
      : moveDay(shiftPeriod(period, start, 1), -1);
  const firstColumn = ((dateObj(start).getUTCDay() + 6) % 7) + 1;
  const byDate = new Map(trend.map((bucket) => [bucket.day, bucket]));
  const dates = [];
  for (let date = start; date <= lastDay; date = moveDay(date, 1)) {
    dates.push(date);
  }

  return (
    <section
      className="completion-calendar"
      aria-label="Daily completion calendar"
    >
      <div className="completion-heading">
        <h3>Daily completion</h3>
        <span>Done / scheduled</span>
      </div>
      <div className="completion-grid">
        {weekdays.map((weekday) => (
          <span className="completion-weekday" key={weekday}>
            {weekday}
          </span>
        ))}
        {dates.map((date, index) => {
          const { done, total } = byDate.get(date) ?? { done: 0, total: 0 };
          const future = date > today;
          const status = !total
            ? "empty"
            : done === total
              ? "complete"
              : done
                ? "partial"
                : "pending";
          const label = displayDay(date, {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          });
          const detail = future
            ? "Future date"
            : total
              ? `${done} of ${total} completed`
              : "No check-ins scheduled";
          return (
            <button
              type="button"
              key={date}
              className={`completion-day completion-${status}`}
              style={index === 0 ? { gridColumnStart: firstColumn } : undefined}
              aria-label={`${label}. ${detail}.`}
              aria-current={date === today ? "date" : undefined}
              disabled={future}
              onClick={() => onSelect(date)}
            >
              <time dateTime={date}>{Number(date.slice(-2))}</time>
              <span>{total ? `${done}/${total}` : "—"}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function progressStatus(row: Row, now: Date, today: string) {
  if (row.status !== "Pending") return row.status;
  if (reminderDay(row) < today) return "Unrecorded";
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
export function ProgressDashboard({
  period,
  onPeriod,
  start,
  end,
  day,
  onDay,
  rows,
  now,
}: {
  period: ProgressPeriod;
  onPeriod: (p: ProgressPeriod) => void;
  start: string;
  end: string;
  day: string;
  onDay: (d: string) => void;
  rows: Row[];
  now: Date;
}) {
  const scheduled = useMemo(() => rows.filter((r) => !r.outsideDay), [rows]);
  const trend = useMemo(
    () => (period === "Day" ? [] : trendBuckets(start, end, period, scheduled)),
    [start, end, period, scheduled],
  );
  const done = scheduled.filter((r) => r.status === "Done").length;
  const dayTab = useRef<HTMLButtonElement>(null);
  const monthPicker = period === "1 month" || period === "12 months";
  const showCalendar = period === "1 week" || period === "1 month";
  const today = indiaDay(now);
  const dateLabel = (d: string) =>
    displayDay(d, { month: "short", day: "numeric", year: "numeric" });
  const selectPeriod = (p: ProgressPeriod) => {
    if (p !== "Day" && day > today) onDay(today);
    onPeriod(p);
  };
  return (
    <section className="card day-dashboard" aria-label="Progress by time">
      <div className="row day-heading">
        <div>
          <span className="eyebrow">
            <CalendarDays size={15} />
            {period === "Day" ? "Daily dashboard" : "Progress dashboard"}
          </span>
          <h2>Progress by time</h2>
        </div>
        <label>
          {period === "Day"
            ? "Day · IST"
            : period === "12 months"
              ? "Ending month · IST"
              : monthPicker
                ? "Choose a month · IST"
                : "Choose a date · IST"}
          <input
            type={monthPicker ? "month" : "date"}
            max={
              period === "Day"
                ? undefined
                : monthPicker
                  ? today.slice(0, 7)
                  : today
            }
            value={monthPicker ? day.slice(0, 7) : day}
            onChange={(e) => {
              const value = e.target.value;
              if (value && e.target.validity.valid)
                onDay(monthPicker ? value + "-01" : value);
            }}
          />
        </label>
      </div>
      <div className="period-tabs" role="group" aria-label="Dashboard period">
        {periods.map((p) => (
          <button
            ref={p === "Day" ? dayTab : undefined}
            aria-pressed={period === p}
            key={p}
            onClick={() => selectPeriod(p)}
          >
            {p}
          </button>
        ))}
      </div>
      {period !== "Day" && (
        <div className="period-dates">
          <button
            className="iconbtn"
            aria-label="Previous period"
            onClick={() =>
              onDay(
                shiftPeriod(period, period === "12 months" ? day : start, -1),
              )
            }
          >
            <ChevronLeft size={18} />
          </button>
          <strong>
            {dateLabel(start)} – {dateLabel(end)}
          </strong>
          <button
            className="iconbtn"
            aria-label="Next period"
            disabled={end >= today}
            onClick={() => {
              const next =
                period === "12 months"
                  ? shiftPeriod(period, day, 1)
                  : shiftPeriod(period, start, 1);
              onDay(next > today ? today : next);
            }}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
      {scheduled.length ? (
        <>
          <div className="day-total">
            <strong>
              {done} of {scheduled.length} completed
            </strong>
            <span>{Math.round((done * 100) / scheduled.length)}%</span>
          </div>
          <progress
            aria-label="Completion for selected period"
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
          {period === "12 months" && (
            <div className="period-trend">
              <h3>Monthly completion</h3>
              <div className="trend-labels">
                <span>Month</span>
                <span>Done / scheduled</span>
              </div>
              {trend.map((b) => (
                <button
                  key={b.day}
                  className="trend-row"
                  aria-label={
                    b.label +
                    ", " +
                    b.done +
                    " of " +
                    b.total +
                    " completed. View month"
                  }
                  onClick={() => {
                    onDay(b.day);
                    onPeriod("1 month");
                  }}
                >
                  <span>{b.label}</span>
                  <span className="trend-track" aria-hidden="true">
                    <i
                      style={{
                        width: (b.total ? (100 * b.done) / b.total : 0) + "%",
                      }}
                    />
                  </span>
                  <span>{b.total ? b.done + " / " + b.total : "—"}</span>
                </button>
              ))}
            </div>
          )}
          {period === "Day" && (
            <ol className="day-timeline">
              {scheduled.map((r) => {
                const status = progressStatus(r, now, today);
                return (
                  <li key={r.id + r.slot}>
                    <time>{displayTime(r.time)}</time>
                    <div>
                      <strong>{r.title}</strong>
                      {r.reviewPreviousDay && (
                        <small>
                          Check-in{" "}
                          {displayDay(reminderDay(r), {
                            month: "short",
                            day: "numeric",
                          })}
                        </small>
                      )}
                      {r.status === "Done" && r.actualTime && (
                        <small>{timingNote(r)}</small>
                      )}
                    </div>
                    <span className={"pill " + status.toLowerCase()}>
                      {checkInLabel(r, status)}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      ) : !showCalendar ? (
        <p className="empty">
          No check-ins scheduled for this {period === "Day" ? "day" : "period"}.
        </p>
      ) : null}
      {showCalendar && (
        <CompletionCalendar
          start={start}
          period={period}
          today={today}
          trend={trend}
          onSelect={(date) => {
            onDay(date);
            onPeriod("Day");
            requestAnimationFrame(() => dayTab.current?.focus());
          }}
        />
      )}
    </section>
  );
}
