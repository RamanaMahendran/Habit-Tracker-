import { Bell, Check, Clock, Ellipsis } from "lucide-react";
import {
  displayDay,
  displayTime,
  indiaTime,
  type CheckIn,
  type Entry,
  type Row,
} from "@/lib/habits";
import { SoundSettings } from "@/components/reminder-sound";

const rowKey = (id: string, slot: string) => `${id}|${slot}`;

export function CheckInFeed({
  day,
  today,
  pending,
  recorded,
  events,
  busy,
  onMark,
  onEdit,
  children,
}: {
  day: string;
  today: string;
  pending: Row[];
  recorded: Row[];
  events: Entry[];
  busy: boolean;
  onMark: (row: Row, status: string) => void;
  onEdit: (row: Row) => void;
  children: React.ReactNode;
}) {
  const latest = new Map<string, Entry>();
  for (const entry of events) {
    if (entry.kind !== "status" || entry.day !== day) continue;
    const mark = entry.payload as CheckIn;
    latest.set(rowKey(entry.habit, mark.slot || ""), entry);
  }
  const history = recorded
    .map((row) => ({ row, update: latest.get(rowKey(row.id, row.slot)) }))
    .sort((a, b) => (b.update?.seq ?? 0) - (a.update?.seq ?? 0));
  const readOnly = busy || day > today;
  const renderPending = (row: Row) => (
    <div className="due-check-in" key={rowKey(row.id, row.slot)}>
      <div className="due-check-in-top">
        <div>
          <strong>{row.title}</strong>
          <small>
            <Clock size={13} />
            {displayTime(row.time)} · Overdue
          </small>
        </div>
        <button
          className="iconbtn"
          type="button"
          aria-label={`Edit ${row.title}`}
          onClick={() => onEdit(row)}
        >
          <Ellipsis size={19} />
        </button>
      </div>
      <div className="check-in-actions">
        <button
          className="primary small"
          disabled={readOnly}
          onClick={() => onMark(row, "Done")}
        >
          <Check size={15} /> Done
        </button>
        <button
          className="secondary"
          disabled={readOnly}
          onClick={() => onMark(row, "Skipped")}
        >
          Skip
        </button>
      </div>
    </div>
  );
  return (
    <section
      className="card chat check-in-feed"
      id="check-ins"
      aria-label="Check-ins"
    >
      <div className="chathead">
        <div>
          <h2>Check-ins</h2>
          <small>
            {displayDay(day, {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}
          </small>
        </div>
        <details className="check-in-sound">
          <summary aria-label="Reminder sound" title="Reminder sound">
            <Bell size={18} />
          </summary>
          <SoundSettings />
        </details>
      </div>
      {pending.length > 0 ? (
        <div className="check-in-pending">
          {renderPending(pending[0])}
          {pending.length > 1 && (
            <details key={day} className="check-in-more">
              <summary>{pending.length - 1} more overdue</summary>
              {pending.slice(1).map(renderPending)}
            </details>
          )}
        </div>
      ) : (
        <p className="check-in-empty">
          {day > today
            ? "Check-ins open on the scheduled day."
            : "No overdue check-ins."}
        </p>
      )}
      {children}
      {history.length > 0 && (
        <details className="check-in-history" key={day}>
          <summary>
            Recorded check-ins <span>{history.length}</span>
          </summary>
          <ul>
            {history.map(({ row, update }) => {
              const note = (update?.payload as CheckIn | undefined)?.note;
              return (
                <li key={rowKey(row.id, row.slot)}>
                  <div className="recorded-check-in-top">
                    <strong>{row.title}</strong>
                    <span className={`pill ${row.status.toLowerCase()}`}>
                      {row.status}
                    </span>
                  </div>
                  <small>
                    {displayTime(row.actualTime || row.time)}
                    {update &&
                      !row.actualTime &&
                      ` · Logged at ${displayTime(indiaTime(new Date(update.created)))}`}
                  </small>
                  {note && <p>{note}</p>}
                  <div className="choices">
                    {row.status === "Skipped" && (!row.rolling || row.time) && (
                      <button
                        disabled={readOnly}
                        onClick={() => onMark(row, "Done")}
                      >
                        Mark done
                      </button>
                    )}
                    {row.status === "Done" && (
                      <button
                        disabled={readOnly}
                        onClick={() => onMark(row, "Skipped")}
                      >
                        Mark skipped
                      </button>
                    )}
                    {row.status === "Done" && row.rolling && (
                      <button
                        disabled={readOnly}
                        onClick={() => onMark(row, "Done")}
                      >
                        Edit actual time
                      </button>
                    )}
                    <button
                      disabled={readOnly}
                      onClick={() => onMark(row, "Pending")}
                    >
                      Reopen
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}
