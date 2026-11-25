"use client";
import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  type FormEvent,
} from "react";
import {
  Sprout,
  HeartPulse,
  CalendarDays,
  MessageCircle,
  ChartNoAxesColumnIncreasing,
  Plus,
  Check,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Mic,
  Send,
  Footprints,
  BookOpen,
  Flower2,
  Briefcase,
  Leaf,
  Bell,
  Clock,
  CalendarPlus,
  Download,
  X,
  Ellipsis,
  CheckCheck,
  SquarePen,
  CloudCheck,
  KeyRound,
  RefreshCw,
  NotebookPen,
} from "lucide-react";
import {
  categories,
  frequencies,
  indiaDay,
  indiaTime,
  moveDay,
  displayDay,
  displayTime,
  dateObj,
  blank,
  indexJournal,
  isOverdue,
  type Row,
  type Habit,
  type Entry,
} from "@/lib/habits";
import { answerPlan, type Reply } from "@/lib/planning-assistant";
import { KnowledgeBook } from "@/components/knowledge-book";
import { periodBounds, type ProgressPeriod } from "@/lib/progress-period";
import {
  productivityAreas,
  productivityArea,
  type ProductivityArea,
} from "@/lib/productivity";
import { ProgressDashboard } from "@/components/daily-progress";
import { classification, topics } from "@/lib/categories";
import { slotTimes, messageTime } from "@/lib/interval";
import {
  SoundSettings,
  ring,
  soundEnabled,
  useAudioUnlock,
} from "@/components/reminder-sound";
import release from "../public/version.json";
import { workbook, saveFile, calendar } from "@/lib/downloads";

import { JournalAccess } from "@/components/journal-access";
import { journalFetch, onJournalSwitch } from "@/lib/journal-key";

const tabs = [
  { name: "Planner", icon: CalendarDays },
  { name: "Analytics", icon: ChartNoAxesColumnIncreasing },
  { name: "Knowledge Book", icon: BookOpen },
];
const icons: Record<string, typeof Leaf> = {
  Health: HeartPulse,
  Routines: Clock,
  Wellness: Footprints,
  Learning: BookOpen,
  Mindfulness: Flower2,
  Work: Briefcase,
  Personal: Leaf,
};
function Badge({ cat }: { cat: string }) {
  const Icon = icons[cat] || Leaf;
  return (
    <span className={"badge " + cat.toLowerCase()}>
      <Icon size={21} />
    </span>
  );
}
type Change = {
  uid: string;
  habit: string;
  kind: string;
  day: string;
  payload: unknown;
};
function useJournal() {
  const [events, setEvents] = useState<Entry[]>([]),
    [error, setError] = useState(""),
    [state, setState] = useState("Connecting"),
    [busy, setBusy] = useState(false);
  const [legacyAvailable, setLegacyAvailable] = useState(false);
  const cursor = useRef(0),
    queue = useRef(Promise.resolve()),
    lock = useRef(false);
  const refresh = useCallback(() => {
    const run = async () => {
      let more = true;
      while (more) {
        const r = await journalFetch("/api/journal?after=" + cursor.current, {
          cache: "no-store",
        });
        if (!r.ok)
          throw Error(
            r.status === 401
              ? "Reload the page to reconnect your journal."
              : "Cloud data is unavailable. Try again.",
          );
        const json = (await r.json()) as {
          events: Entry[];
          more: boolean;
          legacyAvailable: boolean;
        };
        if (!cursor.current) setLegacyAvailable(json.legacyAvailable);
        if (json.events.length) {
          cursor.current = json.events.at(-1)!.seq;
          setEvents((old) => [...old, ...json.events]);
        }
        more = json.more;
      }
      setState("Cloud synced");
      setError("");
    };
    const p = queue.current.then(run);
    queue.current = p.catch((e) => {
      setState("Sync paused");
      setError(e.message);
    });
    return p;
  }, []);
  useEffect(() => {
    const go = () => {
      refresh().catch(() => {});
    };
    go();
    const id = setInterval(go, 20000);
    window.addEventListener("focus", go);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", go);
    };
  }, [refresh]);
  async function save(changes: Change[]) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    try {
      const r = await journalFetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: changes }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw Error(j.error || "Could not save. Try again.");
      }
      await refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function importPrevious() {
    const r = await journalFetch("/api/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "import-previous" }),
    });
    if (!r.ok)
      throw Error(
        "Could not import your previous journal. Verify the original account and try again.",
      );
    await refresh();
    setLegacyAvailable(false);
  }
  return {
    events,
    refresh,
    save,
    error,
    state,
    busy,
    legacyAvailable,
    importPrevious,
  };
}
function MicButton({
  onText,
  notice,
}: {
  onText: (s: string) => void;
  notice: (s: string) => void;
}) {
  const [listening, setListening] = useState(false);
  const active = useRef<any>(null);
  useEffect(() => () => active.current?.abort(), []);
  function start() {
    if (listening) {
      active.current?.stop();
      return;
    }
    const w = window as any;
    const Recognition = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Recognition) {
      notice("Use your keyboard’s microphone to dictate into this field.");
      return;
    }
    const rec = new Recognition();
    active.current = rec;
    rec.lang = "en-IN";
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onerror = (e: any) =>
      notice(
        e.error === "not-allowed"
          ? "Microphone access is off. Enable it in browser settings or use keyboard dictation."
          : "Voice input stopped. Try again or type your request.",
      );
    rec.onresult = (e: any) => onText(e.results[0][0].transcript);
    try {
      rec.start();
    } catch {
      notice("Microphone unavailable. Try keyboard dictation.");
    }
  }
  return (
    <button
      type="button"
      className={"iconbtn " + (listening ? "listening" : "")}
      onClick={start}
      aria-label={listening ? "Stop recording" : "Dictate with microphone"}
    >
      <Mic size={18} />
    </button>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={close}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="row">
        <h2>{title}</h2>
        <button className="iconbtn" onClick={close} aria-label="Close dialog">
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Fields({ h, change }: { h: Habit; change: (h: Habit) => void }) {
  const selected = classification(h);
  const options = topics(selected.category);
  const rule = h.inDay;
  const times = slotTimes(h.time, rule);
  return (
    <div className="fields">
      <label>
        Habit or task
        <input
          autoFocus
          required
          maxLength={160}
          value={h.title}
          placeholder="What would you like to do?"
          onChange={(e) => change({ ...h, title: e.target.value })}
        />
      </label>
      <div className="pair">
        <label>
          Category
          <select
            value={h.autoCategory ? "auto" : h.category}
            onChange={(e) =>
              change({
                ...h,
                autoCategory: e.target.value === "auto",
                category:
                  e.target.value === "auto"
                    ? selected.category
                    : e.target.value,
                subcategory: undefined,
              })
            }
          >
            <option value="auto">
              Automatic ·{" "}
              {h.autoCategory ? selected.category : "use task and time"}
            </option>
            {categories.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Repeat
          <select
            value={h.repeat}
            onChange={(e) => change({ ...h, repeat: e.target.value })}
          >
            {frequencies.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      </div>
      {h.autoCategory ? (
        <p className="category-result" aria-live="polite">
          Suggested category{" "}
          <strong>
            {selected.category} → {selected.subcategory}
          </strong>
        </p>
      ) : (
        <label>
          Subcategory
          <select
            value={selected.subcategory}
            onChange={(e) => change({ ...h, subcategory: e.target.value })}
          >
            {!options.some((t) => t.name === "General") && (
              <option>General</option>
            )}
            {options.map((t) => (
              <option key={t.name}>{t.name}</option>
            ))}
          </select>
        </label>
      )}
      <div className="pair">
        <label>
          Start date
          <input
            type="date"
            required
            value={h.start}
            onChange={(e) => change({ ...h, start: e.target.value })}
          />
        </label>
        <label>
          {rule ? "First check-in · IST" : "Check-in time · IST"}
          <input
            type="time"
            required={!!rule}
            value={h.time}
            onChange={(e) => change({ ...h, time: e.target.value })}
          />
        </label>
      </div>
      <label className="interval-switch">
        <input
          type="checkbox"
          checked={!!rule}
          onChange={(e) => {
            if (e.target.checked)
              change({
                ...h,
                time: h.time || "08:00",
                inDay: { hours: 2, count: 5 },
                rolling: true,
              });
            else {
              const { inDay, rolling, ...single } = h;
              change(single);
            }
          }}
        />
        Repeat within the day
      </label>
      {rule && (
        <>
          <label>
            Calculate next reminder
            <select
              value={h.rolling ? "actual" : "fixed"}
              onChange={(e) => {
                const rolling = e.target.value === "actual";
                change({
                  ...h,
                  rolling,
                  inDay: rolling
                    ? {
                        hours: rule.hours,
                        count: "count" in rule ? rule.count : 5,
                      }
                    : rule,
                });
              }}
            >
              <option value="fixed">From scheduled times</option>
              <option value="actual">From last actual check-in</option>
            </select>
          </label>
          <div className="pair">
            <label>
              Interval (hours)
              <input
                type="number"
                required
                min="1"
                max="12"
                step="1"
                value={rule.hours || ""}
                onChange={(e) =>
                  change({
                    ...h,
                    inDay: { ...rule, hours: Number(e.target.value) },
                  })
                }
              />
            </label>
            <label>
              Stop repeating
              <select
                disabled={!!h.rolling}
                value={"until" in rule ? "until" : "count"}
                onChange={(e) =>
                  change({
                    ...h,
                    inDay:
                      e.target.value === "until"
                        ? { hours: rule.hours, until: times.at(-1) || "18:00" }
                        : { hours: rule.hours, count: times.length || 2 },
                  })
                }
              >
                <option value="until">At end time</option>
                <option value="count">After a number of check-ins</option>
              </select>
            </label>
          </div>
          {"until" in rule ? (
            <label>
              End time · IST
              <input
                type="time"
                required
                min={h.time}
                value={rule.until}
                onChange={(e) =>
                  change({
                    ...h,
                    inDay: { hours: rule.hours, until: e.target.value },
                  })
                }
              />
            </label>
          ) : (
            <label>
              Check-ins per day
              <input
                type="number"
                required
                min="2"
                max="24"
                step="1"
                value={rule.count || ""}
                onChange={(e) =>
                  change({
                    ...h,
                    inDay: { hours: rule.hours, count: Number(e.target.value) },
                  })
                }
              />
            </label>
          )}
          <p
            className={times.length ? "interval-preview" : "interval-error"}
            aria-live="polite"
          >
            {times.length
              ? times.length +
                (h.rolling ? " planned check-ins · " : " check-ins · ") +
                times.map(displayTime).join(", ")
              : "Choose an interval and times that fit at least two check-ins before midnight."}
          </p>
          {h.rolling && (
            <small>
              Only the next check-in rings. Recording the actual time moves the
              remaining reminders. Check-ins that would fall after midnight are
              omitted for that day.
            </small>
          )}
        </>
      )}
    </div>
  );
}
export default function App() {
  useAudioUnlock();
  const {
    events,
    refresh,
    save,
    error,
    state,
    busy,
    legacyAvailable,
    importPrevious,
  } = useJournal();
  const [access, setAccess] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(location.search).get("previous") === "1")
      setAccess(true);
    window.addEventListener("storage", onJournalSwitch);
    return () => window.removeEventListener("storage", onJournalSwitch);
  }, []);
  const journal = useMemo(() => indexJournal(events), [events]);
  const [tab, setTab] = useState("Planner"),
    [day, setDay] = useState(indiaDay),
    [now, setNow] = useState(() => new Date()),
    [view, setView] = useState("Scheduled"),
    [draft, setDraft] = useState<Habit | null>(null),
    [editing, setEditing] = useState(false),
    [prompt, setPrompt] = useState(""),
    [turns, setTurns] = useState<{ question: string; reply: Reply }[]>([]),
    [proposals, setProposals] = useState<Habit[]>([]),
    [message, setMessage] = useState(""),
    [chatHelp, setChatHelp] = useState(""),
    [toast, setToast] = useState(""),
    [dashboardDay, setDashboardDay] = useState(indiaDay),
    [dashboardPeriod, setDashboardPeriod] = useState<ProgressPeriod>("Day"),
    [area, setArea] = useState<ProductivityArea | "All">("All"),
    [period, setPeriod] = useState("dashboard"),
    [limit, setLimit] = useState(50),
    [exporting, setExporting] = useState(false);
  const [record, setRecord] = useState<{
    r: Row;
    time: string;
    note: string;
  } | null>(null);
  const [recordError, setRecordError] = useState("");
  const today = indiaDay(now),
    rows = journal.rows(day),
    chatRows = rows.filter((r) => r.status !== "Pending" || isOverdue(r, now)),
    scheduled = rows.filter((r) => !r.outsideDay),
    done = scheduled.filter((r) => r.status === "Done").length,
    overdue = chatRows.filter((r) => r.status === "Pending").length;
  const plannerEnd = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const panel = plannerEnd.current?.parentElement;
    if (panel) panel.scrollTop = panel.scrollHeight;
  }, [turns]);
  const monday = moveDay(day, -((dateObj(day).getUTCDay() + 6) % 7)),
    todayRows = journal.rows(today),
    due = todayRows.filter((r) => isOverdue(r, now));
  const lastToast = useRef(new Set<string>());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    for (const r of due) {
      const key = [r.id, today, r.slot, r.time].join("|");
      if (!lastToast.current.has(key)) {
        lastToast.current.add(key);
        if (soundEnabled() && document.visibilityState === "visible") ring();
        setToast("Check-in due · " + r.title + " · " + displayTime(r.time));
        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "granted" &&
          localStorage.getItem("grove.push") !== "on" &&
          "serviceWorker" in navigator
        )
          navigator.serviceWorker.ready
            .then((reg) =>
              reg.showNotification("Habit Grove check-in", {
                body: r.title + " · " + displayTime(r.time),
                tag: key,
                silent:
                  !soundEnabled() || document.visibilityState === "visible",
                icon: "/icon-192.png",
              }),
            )
            .catch(() => {});
      }
    }
  }, [due, today]);
  const bounds = periodBounds(dashboardPeriod, dashboardDay, today);
  const readRows = useCallback(
    (start: string, end: string) => {
      const result: Row[] = [];
      for (
        let date = end;
        date >= start && date >= journal.first;
        date = moveDay(date, -1)
      )
        result.push(...journal.rows(date));
      return result;
    },
    [journal],
  );
  const periodRows = useMemo(
    () =>
      tab === "Analytics"
        ? readRows(bounds.start, bounds.end).filter((row) => !row.outsideDay)
        : [],
    [tab, readRows, bounds.start, bounds.end],
  );
  const dashboardRows = useMemo(
    () =>
      area === "All"
        ? periodRows
        : periodRows.filter((row) => productivityArea(row.category) === area),
    [area, periodRows],
  );
  const history = useMemo(() => {
    if (period === "dashboard") return dashboardRows;
    if (tab !== "Analytics") return [];
    const start =
      period === "all" ? journal.first : moveDay(today, 1 - Number(period));
    return readRows(start, today).filter(
      (row) =>
        !row.outsideDay &&
        (area === "All" || productivityArea(row.category) === area),
    );
  }, [dashboardRows, tab, period, readRows, journal.first, today, area]);
  const changeDashboardDay = (d: string) => {
    setDashboardDay(d);
    setLimit(50);
  };
  const changeDashboardPeriod = (v: ProgressPeriod) => {
    setDashboardPeriod(v);
    setLimit(50);
  };
  const newDraft = (h?: Partial<Habit>) => {
    setEditing(false);
    setDraft({ ...blank(day), ...h });
  };
  const edit = (h: Habit) => {
    setEditing(true);
    setDraft({ ...h });
  };
  function planChange(h: Habit): Change {
    return {
      uid: crypto.randomUUID(),
      habit: h.id,
      kind: "plan",
      day: today,
      payload: { ...h, ...classification(h) },
    };
  }
  async function mark(r: Row, status: string, note = "", actualTime?: string) {
    if (r.rolling && status === "Done" && actualTime === undefined) {
      setRecordError("");
      setRecord({
        r,
        time: r.actualTime || (r.day === indiaDay() ? indiaTime() : r.time),
        note,
      });
      return false;
    }
    if (
      await save([
        {
          uid: crypto.randomUUID(),
          habit: r.id,
          kind: "status",
          day: r.day,
          payload: { status, note, slot: r.slot, actualTime },
        },
      ])
    ) {
      setToast(
        r.title + (r.inDay ? " · " + displayTime(r.time) : "") + " · " + status,
      );
      setChatHelp("");
      return true;
    }
    return false;
  }
  async function submitDraft(e: FormEvent) {
    e.preventDefault();
    if (draft?.inDay && !slotTimes(draft.time, draft.inDay).length) return;
    if (draft && (await save([planChange(draft)]))) {
      setToast(editing ? "Habit updated" : "Added to your planner");
      if (turns.at(-1)?.reply.edit?.id === draft.id) finishReview();
      setDraft(null);
    }
  }
  function askPlanner(question: string) {
    if (!question.trim()) return;
    const reply = answerPlan(
      question,
      journal,
      day,
      new Date(),
      turns.at(-1)?.reply.followUp,
    );
    setTurns((old) => [...old.slice(-9), { question: question.trim(), reply }]);
    setPrompt("");
  }
  function finishReview() {
    setTurns((old) =>
      old.map((turn) => ({ ...turn, reply: { text: turn.reply.text } })),
    );
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    const s = message.trim();
    if (!s) return;
    const targetDay = /yesterday/i.test(s) ? moveDay(today, -1) : day;
    const possible = journal.rows(targetDay);
    const status = /\b(skip(?:ped)?|missed|couldn.t|didn.t)\b/i.test(s)
      ? "Skipped"
      : /\b(undo|reopen|pending)\b/i.test(s)
        ? "Pending"
        : /\b(done|completed|finished|did|took|taken|walked|read|drank|wrote|practised|practiced|studied)\b/i.test(
              s,
            )
          ? "Done"
          : "";
    if (!status) {
      setChatHelp(
        "Try “Finished my walk” or “Skipped reading yesterday”. You can also use the buttons below each check-in.",
      );
      return;
    }
    const stop = new Set([
      "with",
      "pages",
      "today",
      "yesterday",
      "minutes",
      "done",
      "the",
      "for",
      "and",
      "had",
      "was",
      "just",
      "completed",
      "finished",
      "skipped",
      "did",
      "task",
      "habit",
      "mark",
      "my",
      "as",
      "not",
      "undo",
      "pending",
      "reopen",
      "one",
      "didnt",
    ]);
    const tokens = (v: string) =>
      v
        .toLowerCase()
        .replace(/reading/g, "read")
        .replace(/walking|walked/g, "walk")
        .replace(/drank|drinking/g, "drink")
        .replace(/wrote|writing/g, "write")
        .replace(/studied|studying/g, "study")
        .replace(/journal(?:ing|ling)/g, "journal")
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 1 && !stop.has(t));
    const terms = tokens(s);
    const requestedTime = messageTime(s);
    const ranks = possible
      .filter((r) =>
        r.rolling && status === "Done"
          ? r.next
          : !requestedTime || r.time === requestedTime,
      )
      .map((r) => ({
        r,
        n: tokens(r.title).filter((t) => terms.includes(t)).length,
      }))
      .sort((a, b) => b.n - a.n);
    const pick =
      ranks.length === 1 && (ranks[0].n || !terms.length)
        ? ranks[0].r
        : ranks[0]?.n && ranks[0].n > (ranks[1]?.n || 0)
          ? ranks[0].r
          : null;
    if (!pick) {
      setChatHelp(
        "Which check-in did you mean? Include its name and time, for example “Finished my walk at 10 am”, or tap its button.",
      );
      return;
    }
    if (pick.rolling && status === "Done") {
      setRecordError("");
      setRecord({
        r: pick,
        time:
          requestedTime || (targetDay === indiaDay() ? indiaTime() : pick.time),
        note: s,
      });
      return;
    }
    if (await mark(pick, status, s)) {
      setMessage("");
      setDay(targetDay);
    }
  }
  async function exportExcel() {
    setExporting(true);
    try {
      const all: Row[] = [];
      for (let d = today; d >= journal.first; d = moveDay(d, -1))
        all.push(...journal.rows(d));
      const bytes = workbook(all, events, journal.current);
      saveFile(
        new Uint8Array(bytes).buffer,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "habit-grove-" + today + ".xlsx",
      );
    } catch {
      setToast("The workbook could not be created. Please retry.");
    } finally {
      setExporting(false);
    }
  }
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("view") === "chat" || location.hash === "#check-ins")
      requestAnimationFrame(() =>
        document.getElementById("check-ins")?.scrollIntoView(),
      );
    if (params.get("view") === "habits") setView("All habits");
    if ("serviceWorker" in navigator)
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((r) => {
          r.update().catch(() => {});
        })
        .catch(() => {});
  }, []);
  const [updates, setUpdates] = useState(false),
    [available, setAvailable] = useState(""),
    [checking, setChecking] = useState(false),
    [updateMessage, setUpdateMessage] = useState("");
  const [installEvent, setInstallEvent] = useState<any>(null),
    [installed, setInstalled] = useState(false);
  useEffect(() => {
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    const capture = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e);
    };
    const finish = () => {
      setInstallEvent(null);
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", finish);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", finish);
    };
  }, []);
  const checkUpdate = useCallback(async () => {
    setChecking(true);
    try {
      const r = await fetch("/version.json?check=" + Date.now(), {
        cache: "no-store",
      });
      if (!r.ok) throw Error();
      const next = (await r.json()) as { version: string };
      if (!next.version) throw Error();
      setAvailable(next.version === release.version ? "" : next.version);
      setUpdateMessage(
        next.version === release.version
          ? "You’re running the latest version."
          : "A new version is ready.",
      );
    } catch {
      setUpdateMessage(
        "Could not check for updates. Try again when connected.",
      );
    } finally {
      setChecking(false);
    }
  }, []);
  useEffect(() => {
    const handle = () => {
      if (document.visibilityState === "visible") checkUpdate();
    };
    document.addEventListener("visibilitychange", handle);
    const t = setInterval(handle, 300000);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", handle);
    };
  }, [checkUpdate]);
  const nav = (n: string) => {
    setTab(n);
    setDay(today);
    setChatHelp("");
  };
  const week = (
    <div className="week" aria-label="Choose a day">
      {Array.from({ length: 7 }, (_, i) => moveDay(monday, i)).map((d) => (
        <button
          key={d}
          aria-pressed={day === d}
          className={day === d ? "selected" : ""}
          onClick={() => setDay(d)}
        >
          <small>{displayDay(d, { weekday: "short" })}</small>
          <strong>{+d.slice(-2)}</strong>
          <i className={d === today ? "today-dot" : ""} />
        </button>
      ))}
    </div>
  );
  const weekControls = (
    <div className="week-controls">
      <button
        className="iconbtn"
        aria-label="Previous week"
        onClick={() => setDay(moveDay(day, -7))}
      >
        <ChevronLeft size={17} />
      </button>
      <button className="week-today" onClick={() => setDay(today)}>
        Today
      </button>
      <button
        className="iconbtn"
        aria-label="Next week"
        onClick={() => setDay(moveDay(day, 7))}
      >
        <ChevronRight size={17} />
      </button>
    </div>
  );
  const iconTitle = (Icon: typeof Leaf, label: string) => (
    <span className="eyebrow">
      <Icon size={15} />
      {label}
    </span>
  );
  return (
    <>
      <header>
        <div className="headwrap">
          <button className="brand" onClick={() => nav("Planner")}>
            <img src="/favicon.svg" alt="" />
            Habit Grove
          </button>
          <nav aria-label="Main views">
            {tabs.map(({ name, icon: I }) => (
              <button
                key={name}
                aria-current={tab === name ? "page" : undefined}
                className={tab === name ? "active" : ""}
                onClick={() => nav(name)}
              >
                <I size={17} />
                {name}
              </button>
            ))}
          </nav>
          <div className="header-tools">
            <button onClick={() => setAccess(true)}>
              <KeyRound size={15} />
              Journal access
            </button>
            <button
              onClick={() => {
                setUpdates(true);
                checkUpdate();
              }}
            >
              <RefreshCw size={15} />
              {available ? "Update available" : "App updates"}
            </button>
          </div>
        </div>
      </header>
      <main>
        <div className="page-head">
          <div>
            <div className="eyebrow">
              <span className="date-line" />
              {displayDay(today, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </div>
            <h1>
              {tab === "Planner"
                ? "My planner"
                : tab === "Analytics"
                  ? "Productivity & wellbeing"
                  : tab}
            </h1>
          </div>
          <button
            className="primary"
            onClick={() => (tab === "Analytics" ? exportExcel() : newDraft())}
            disabled={exporting || busy}
          >
            {tab === "Analytics" ? <Download size={17} /> : <Plus size={18} />}{" "}
            {tab === "Analytics" ? "Export Excel" : "Add habit"}
          </button>
        </div>
        {error && (
          <div className="error" role="alert">
            {error}{" "}
            <button onClick={() => refresh().catch(() => {})}>
              Retry sync
            </button>
          </div>
        )}
        {tab === "Planner" && (
          <>
            <div className="planner-summary" aria-label="Daily progress">
              <span>
                <strong>
                  {done} / {scheduled.length}
                </strong>{" "}
                completed
              </span>
              <a href="#check-ins">
                <MessageCircle size={16} />
                {overdue ? `${overdue} overdue` : "Check-ins"}
              </a>
            </div>
            <div className="columns">
              <section className="card schedule">
                <div className="row">
                  <div>
                    {iconTitle(CalendarDays, "Schedule")}
                    <h2>My habits</h2>
                  </div>
                  {weekControls}
                </div>
                {week}
                <div className="row listhead">
                  <h3>
                    {view === "All habits"
                      ? "All habits"
                      : day === today
                        ? "Today’s habits"
                        : displayDay(day, {
                            weekday: "long",
                            month: "short",
                            day: "numeric",
                          })}
                  </h3>
                  <select
                    aria-label="Habit list"
                    value={view}
                    onChange={(e) => setView(e.target.value)}
                  >
                    <option>Scheduled</option>
                    <option>All habits</option>
                  </select>
                </div>
                {view === "Scheduled" ? (
                  rows.length ? (
                    rows.map((r) => (
                      <div className="habitrow" key={r.id + r.slot}>
                        <button
                          aria-label={
                            (r.status === "Done" ? "Reopen " : "Complete ") +
                            r.title +
                            (r.inDay ? " at " + displayTime(r.time) : "")
                          }
                          disabled={
                            busy ||
                            day > today ||
                            (!!r.rolling && r.status === "Pending" && !r.next)
                          }
                          className={
                            "check " + (r.status === "Done" ? "checked" : "")
                          }
                          onClick={() =>
                            mark(r, r.status === "Done" ? "Pending" : "Done")
                          }
                        >
                          {r.status === "Done" && <Check size={15} />}
                        </button>
                        <Badge cat={r.category} />
                        <div className="stretch">
                          <b>{r.title}</b>
                          <small>
                            {r.outsideDay
                              ? "Outside today"
                              : displayTime(r.time)}{" "}
                            · {r.repeat}
                            {r.actualTime && r.rolling
                              ? " · Recorded at " + displayTime(r.actualTime)
                              : ""}
                            {r.rolling &&
                            r.status === "Pending" &&
                            !r.next &&
                            !r.outsideDay
                              ? " · Estimated"
                              : ""}
                            {r.status === "Skipped" ? " · Skipped" : ""}
                          </small>
                        </div>
                        <button
                          className="iconbtn"
                          aria-label={"Edit " + r.title}
                          onClick={() =>
                            edit(
                              journal.current.find((h) => h.id === r.id) || r,
                            )
                          }
                        >
                          <Ellipsis />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="empty">
                      <span className="empty-icon">
                        <Sprout />
                      </span>
                      <p>
                        {state === "Connecting"
                          ? "Loading your journal…"
                          : `No habits scheduled for ${day === today ? "today" : "this day"}.`}
                      </p>
                      {state === "Cloud synced" &&
                        (journal.current.some((h) => !h.archived) ? (
                          <button
                            className="linkbtn"
                            onClick={() => setView("All habits")}
                          >
                            See all saved habits
                          </button>
                        ) : (
                          <button
                            className="linkbtn"
                            onClick={() => setAccess(true)}
                          >
                            Open a journal from another device
                          </button>
                        ))}
                    </div>
                  )
                ) : journal.current.filter((h) => !h.archived).length ? (
                  journal.current
                    .filter((h) => !h.archived)
                    .map((h) => (
                      <button
                        className="habitrow wide"
                        key={h.id}
                        onClick={() => edit(h)}
                      >
                        <Badge cat={h.category} />
                        <div className="stretch">
                          <b>{h.title}</b>
                          <small>
                            {h.repeat} ·{" "}
                            {h.inDay
                              ? "Every " + h.inDay.hours + " hours from "
                              : ""}
                            {displayTime(h.time)}
                          </small>
                        </div>
                        <SquarePen size={17} />
                      </button>
                    ))
                ) : (
                  <div className="empty">
                    {state === "Connecting" ? (
                      <p>Loading your journal…</p>
                    ) : (
                      state === "Cloud synced" &&
                      (events.length ? (
                        <>
                          <p>There are no active habits in this journal.</p>
                          <button
                            className="linkbtn"
                            onClick={() => {
                              nav("Analytics");
                              setPeriod("all");
                            }}
                          >
                            See activity history
                          </button>
                        </>
                      ) : (
                        <>
                          <p>This journal has no saved habits.</p>
                          <button
                            className="linkbtn"
                            onClick={() => setAccess(true)}
                          >
                            Open another journal
                          </button>
                        </>
                      ))
                    )}
                  </div>
                )}
              </section>
              <aside className="planner-side">
                <section
                  className="card chat"
                  id="check-ins"
                  aria-label="Check-ins"
                >
                  <div className="chathead">
                    <h2>Check-ins</h2>
                  </div>
                  <SoundSettings />
                  <div className="chatbody">
                    <span className="datetag">
                      {displayDay(day, {
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    {chatRows.length === 0 && (
                      <div className="bubble">
                        {rows.length
                          ? "No overdue check-ins."
                          : "No habits scheduled for this day."}
                      </div>
                    )}
                    {chatRows.map((r) => (
                      <div key={r.id + r.slot} className="thread">
                        <div className="bubble">
                          <small>
                            <Bell size={13} />{" "}
                            {r.time ? displayTime(r.time) + " IST" : "Anytime"}{" "}
                            · {r.status === "Pending" ? "Overdue" : r.status}
                          </small>
                          <p>
                            {r.status === "Pending" ? (
                              <>
                                Did you complete <b>{r.title}</b>?
                              </>
                            ) : (
                              <b>{r.title}</b>
                            )}
                          </p>
                          <div className="choices">
                            {["Done", "Skipped", "Pending"]
                              .filter(
                                (s) =>
                                  s !== r.status &&
                                  (s !== "Pending" || r.status !== "Pending"),
                              )
                              .map((s) => (
                                <button
                                  disabled={
                                    busy ||
                                    day > today ||
                                    (!!r.rolling &&
                                      r.status === "Pending" &&
                                      !r.next)
                                  }
                                  key={s}
                                  onClick={() => mark(r, s)}
                                >
                                  {s === "Pending"
                                    ? "Reopen"
                                    : s === "Skipped"
                                      ? "Skip"
                                      : s}
                                </button>
                              ))}
                            {r.rolling && r.status === "Done" && (
                              <button onClick={() => mark(r, "Done")}>
                                Edit actual time
                              </button>
                            )}
                            <button
                              onClick={() =>
                                edit(
                                  journal.current.find((h) => h.id === r.id) ||
                                    r,
                                )
                              }
                            >
                              Edit habit
                            </button>
                          </div>
                        </div>
                        {events
                          .filter(
                            (e) =>
                              e.kind === "status" &&
                              e.habit === r.id &&
                              e.day === day &&
                              ((e.payload as { slot?: string }).slot || "") ===
                                r.slot,
                          )
                          .map((e) => {
                            const p = e.payload as {
                              note: string;
                              status: string;
                            };
                            return (
                              <div key={e.seq} className="bubble outgoing">
                                {p.note || p.status}
                                {(e.payload as { actualTime?: string })
                                  .actualTime
                                  ? " · Recorded for " +
                                    displayTime(
                                      (e.payload as { actualTime: string })
                                        .actualTime,
                                    )
                                  : ""}
                                <small>
                                  {indiaTime(new Date(e.created))}{" "}
                                  <CheckCheck size={14} />
                                </small>
                              </div>
                            );
                          })}
                      </div>
                    ))}
                    {chatHelp && <div className="bubble">{chatHelp}</div>}
                  </div>
                  <form className="chatcompose" onSubmit={send}>
                    <input
                      aria-label="Check-in message"
                      placeholder="Write a check-in…"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      maxLength={1000}
                    />
                    <MicButton onText={setMessage} notice={setToast} />
                    <button
                      className="send"
                      disabled={!message.trim() || busy}
                      aria-label="Send check-in"
                    >
                      <Send size={18} />
                    </button>
                  </form>
                </section>
                <details className="card assistant">
                  <summary className="assistant-head">
                    <span className="spark">
                      <Sparkles size={20} />
                    </span>
                    <strong>Planning assistant</strong>
                    <ChevronRight size={16} className="assistant-chevron" />
                  </summary>
                  <div className="planner-prompts">
                    {[
                      "What’s next?",
                      "What’s overdue?",
                      "Show my progress this week",
                    ].map((question) => (
                      <button
                        key={question}
                        disabled={state === "Connecting"}
                        onClick={() => askPlanner(question)}
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                  {turns.length > 0 && (
                    <div className="planner-dialogue" aria-live="polite">
                      {turns.map(({ question, reply }, i) => (
                        <div key={i}>
                          <p className="planner-question">{question}</p>
                          <p className="planner-answer">{reply.text}</p>
                          {i === turns.length - 1 && reply.edit && (
                            <button
                              className="secondary small"
                              onClick={() => edit(reply.edit!)}
                            >
                              Review change
                            </button>
                          )}
                          {i === turns.length - 1 && reply.create && (
                            <button
                              className="secondary small"
                              onClick={() => setProposals(reply.create!)}
                            >
                              Review suggested plan
                            </button>
                          )}
                        </div>
                      ))}
                      <span ref={plannerEnd} />
                    </div>
                  )}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      askPlanner(prompt);
                    }}
                  >
                    <textarea
                      aria-label="Describe your plan"
                      value={prompt}
                      maxLength={1000}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Ask about a habit or describe a plan…"
                    />
                    <div className="composer-bar">
                      <MicButton onText={setPrompt} notice={setToast} />
                      <button
                        className="primary small"
                        disabled={!prompt.trim() || state === "Connecting"}
                      >
                        Send <Send size={14} />
                      </button>
                    </div>
                  </form>
                </details>
              </aside>
            </div>
          </>
        )}
        {tab === "Knowledge Book" && <KnowledgeBook habits={journal.current} />}
        {tab === "Analytics" && (
          <>
            <div
              className="productivity-areas"
              role="group"
              aria-label="Focus area"
            >
              {(["All", ...productivityAreas] as const).map((name) => {
                const tasks =
                  name === "All"
                    ? periodRows
                    : periodRows.filter(
                        (row) => productivityArea(row.category) === name,
                      );
                const completed = tasks.filter(
                  (row) => row.status === "Done",
                ).length;
                return (
                  <button
                    key={name}
                    aria-pressed={area === name}
                    onClick={() => {
                      setArea(name);
                      setLimit(50);
                    }}
                  >
                    <span>{name === "All" ? "All activity" : name}</span>
                    <strong>
                      {completed} / {tasks.length}
                    </strong>
                    <small>check-ins completed</small>
                  </button>
                );
              })}
            </div>
            <ProgressDashboard
              period={dashboardPeriod}
              onPeriod={changeDashboardPeriod}
              start={bounds.start}
              end={bounds.end}
              day={dashboardDay}
              onDay={changeDashboardDay}
              rows={dashboardRows}
              now={now}
            />
            <div className="analyticshead">
              <label>
                Activity log period{" "}
                <select
                  value={period}
                  onChange={(e) => {
                    setPeriod(e.target.value);
                    setLimit(50);
                  }}
                >
                  <option value="dashboard">Dashboard dates</option>
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="365">Last year</option>
                  <option value="all">All time</option>
                </select>
              </label>
            </div>
            <section className="card activity">
              {iconTitle(NotebookPen, "Activity log")}
              <h2>Habit history</h2>
              <div className="scrolltable">
                <table>
                  <thead>
                    <tr>
                      {["Date", "Habit", "Category", "Reminder", "Status"].map(
                        (h) => (
                          <th key={h}>{h}</th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {history.slice(0, limit).map((r) => (
                      <tr key={r.id + r.day + r.slot}>
                        <td>{r.day}</td>
                        <td>{r.title}</td>
                        <td>{r.category}</td>
                        <td>
                          {r.outsideDay ? "Outside today" : displayTime(r.time)}
                          {r.actualTime && r.rolling && (
                            <small> · Actual {displayTime(r.actualTime)}</small>
                          )}
                        </td>
                        <td>
                          <span className={"pill " + r.status.toLowerCase()}>
                            {r.status === "Pending" && r.day < today
                              ? "Unrecorded"
                              : r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!history.length && (
                <div className="empty">
                  Activity will appear here once you schedule a habit.
                </div>
              )}
              {limit < history.length && (
                <button
                  className="secondary"
                  onClick={() => setLimit(limit + 100)}
                >
                  Show more
                </button>
              )}
            </section>
          </>
        )}
        {legacyAvailable && (
          <p className="priorjournal">
            Habits from your previous journal are available.{" "}
            <button className="linkbtn" onClick={() => setAccess(true)}>
              Import habits
            </button>
          </p>
        )}
        <footer>
          <span>
            <CloudCheck size={15} />
            {state}
          </span>
          <span>India Standard Time · GMT+5:30</span>
        </footer>
      </main>
      {access && (
        <Modal title="Journal access" close={() => setAccess(false)}>
          <JournalAccess
            hasHabits={events.length > 0}
            legacyAvailable={legacyAvailable}
            onImport={importPrevious}
          />
        </Modal>
      )}
      {updates && (
        <Modal title="App updates" close={() => setUpdates(false)}>
          <p className="update-info">Habit Grove {release.version}</p>
          <p>{checking ? "Checking for updates…" : updateMessage}</p>
          {available && (
            <button className="primary" onClick={() => location.reload()}>
              Update now
            </button>
          )}
          {!installed && (
            <div className="installinfo">
              <h3>Install on your phone</h3>
              {installEvent ? (
                <button
                  className="secondary"
                  onClick={async () => {
                    await installEvent.prompt();
                    setInstallEvent(null);
                  }}
                >
                  Install Habit Grove
                </button>
              ) : (
                <p>
                  In Chrome, open the browser menu and choose Install app or Add
                  to Home screen.
                </p>
              )}
            </div>
          )}
        </Modal>
      )}
      {record && (
        <Modal title="Record actual time" close={() => setRecord(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (record.r.day === indiaDay() && record.time > indiaTime()) {
                setRecordError("Choose a time that has already passed.");
                return;
              }
              const ok = await mark(record.r, "Done", record.note, record.time);
              if (ok) {
                setRecord(null);
                if (record.note) setMessage("");
              } else
                setRecordError(
                  "Could not save this check-in. Check the time and order, then retry.",
                );
            }}
          >
            <p className="hint">
              {record.r.title} · {record.r.day}
            </p>
            <div className="fields">
              <label>
                Actual time · IST
                <input
                  type="time"
                  value={record.time}
                  required
                  max={record.r.day === indiaDay() ? indiaTime() : undefined}
                  onChange={(e) =>
                    setRecord({ ...record, time: e.target.value })
                  }
                />
              </label>
            </div>
            {recordError && <p role="alert">{recordError}</p>}
            <button className="primary" disabled={busy}>
              Save actual time
            </button>
          </form>
        </Modal>
      )}
      {draft && (
        <Modal
          title={editing ? "Edit habit" : "Add a habit"}
          close={() => setDraft(null)}
        >
          <form onSubmit={submitDraft}>
            <Fields h={draft} change={setDraft} />
            <p className="hint">
              <Bell size={16} /> In-app prompts appear after the check-in time
              passes. For background reminders, enable sound alerts in Check-in
              chat.
            </p>
            <div className="modalactions">
              {editing && draft.time && !draft.rolling && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    calendar(draft);
                    setToast(
                      "Open the .ics file in your calendar to enable reminders.",
                    );
                  }}
                >
                  <CalendarPlus size={16} /> Calendar reminder
                </button>
              )}
              <button
                className="primary"
                disabled={busy || !slotTimes(draft.time, draft.inDay).length}
              >
                {busy ? "Saving…" : "Save habit"}
              </button>
            </div>
            {editing && (
              <button
                type="button"
                className="linkbtn archive"
                disabled={busy}
                onClick={async () => {
                  if (await save([planChange({ ...draft, archived: true })])) {
                    setDraft(null);
                    setToast("Habit archived. Earlier days remain in history.");
                  }
                }}
              >
                Archive habit
              </button>
            )}
          </form>
        </Modal>
      )}
      {proposals.length > 0 && (
        <Modal title="Review your plan" close={() => setProposals([])}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (proposals.some((h) => !slotTimes(h.time, h.inDay).length))
                return;
              if (await save(proposals.map(planChange))) {
                setProposals([]);
                setPrompt("");
                finishReview();
                setToast("Plan added to your habits");
              }
            }}
          >
            {proposals.map((h, i) => (
              <Fields
                key={h.id}
                h={h}
                change={(v) =>
                  setProposals((old) => old.map((o, k) => (k === i ? v : o)))
                }
              />
            ))}
            <button
              className="primary"
              disabled={
                busy ||
                proposals.some((h) => !slotTimes(h.time, h.inDay).length)
              }
            >
              Add{" "}
              {proposals.length === 1 ? "habit" : proposals.length + " habits"}
            </button>
          </form>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button onClick={() => setToast("")} aria-label="Dismiss">
            <X size={15} />
          </button>
        </div>
      )}
    </>
  );
}
