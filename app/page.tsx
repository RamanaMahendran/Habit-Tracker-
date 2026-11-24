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
  Sun,
  Layers,
  CheckCheck,
  SquarePen,
  CloudCheck,
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
  draftPlan,
  type Row,
  type Habit,
  type Entry,
} from "@/lib/habits";
import release from "../public/version.json";
import { workbook, saveFile, calendar } from "@/lib/downloads";

import { JournalAccess } from "@/components/journal-access";
import { journalFetch, onJournalSwitch } from "@/lib/journal-key";

const tabs = [
  { name: "Planner", icon: CalendarDays },
  { name: "Check-in chat", icon: MessageCircle },
  { name: "Analytics", icon: ChartNoAxesColumnIncreasing },
];
const seeds = [
  { title: "Take a morning walk", category: "Wellness", time: "07:00" },
  { title: "Read 10 pages", category: "Learning", time: "20:00" },
  { title: "Write a journal entry", category: "Mindfulness", time: "21:00" },
];
const icons: Record<string, typeof Leaf> = {
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
            value={h.category}
            onChange={(e) => change({ ...h, category: e.target.value })}
          >
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
          Check-in time · IST
          <input
            type="time"
            value={h.time}
            onChange={(e) => change({ ...h, time: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}
export default function App() {
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
    [proposals, setProposals] = useState<Habit[]>([]),
    [message, setMessage] = useState(""),
    [chatHelp, setChatHelp] = useState(""),
    [toast, setToast] = useState(""),
    [period, setPeriod] = useState("7"),
    [limit, setLimit] = useState(50),
    [exporting, setExporting] = useState(false);
  const today = indiaDay(now),
    minute = indiaTime(now),
    rows = journal.rows(day),
    done = rows.filter((r) => r.status === "Done").length;
  const monday = moveDay(day, -((dateObj(day).getUTCDay() + 6) % 7)),
    todayRows = journal.rows(today),
    due = todayRows.filter(
      (r) => r.time && r.time <= minute && r.status === "Pending",
    );
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
      const key = r.id + today + r.time;
      if (!lastToast.current.has(key)) {
        lastToast.current.add(key);
        setToast("Check-in due · " + r.title);
        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "granted" &&
          "serviceWorker" in navigator
        )
          navigator.serviceWorker.ready
            .then((reg) =>
              reg.showNotification("Habit Grove check-in", {
                body: r.title,
                tag: key,
                icon: "/icon-192.png",
              }),
            )
            .catch(() => {});
      }
    }
  }, [due, today]);
  const rangeStart =
    period === "all" ? journal.first : moveDay(today, 1 - Number(period));
  const history = useMemo(() => {
    const a: Row[] = [];
    for (let d = today; d >= rangeStart; d = moveDay(d, -1))
      a.push(...journal.rows(d));
    return a;
  }, [journal, rangeStart, today]);
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
      payload: h,
    };
  }
  async function mark(r: Row, status: string, note = "") {
    if (
      await save([
        {
          uid: crypto.randomUUID(),
          habit: r.id,
          kind: "status",
          day: r.day,
          payload: { status, note },
        },
      ])
    ) {
      setToast(r.title + " · " + status);
      setChatHelp("");
      return true;
    }
    return false;
  }
  async function submitDraft(e: FormEvent) {
    e.preventDefault();
    if (draft && (await save([planChange(draft)]))) {
      setToast(editing ? "Habit updated" : "Added to your planner");
      setDraft(null);
    }
  }
  function buildPlan(e: FormEvent) {
    e.preventDefault();
    const next = draftPlan(prompt, day);
    if (next.length) setProposals(next);
    else setToast("Describe a task, for example “Walk tomorrow at 7 am”.");
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
        : /\b(done|completed|finished|did|walked|read|drank|wrote|practised|practiced|studied)\b/i.test(
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
    const ranks = possible
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
        "Which habit did you mean? Include its name or use its check-in buttons.",
      );
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
    if (location.search.includes("view=chat")) setTab("Check-in chat");
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
                className={tab === name ? "active" : ""}
                onClick={() => nav(name)}
              >
                <I size={17} />
                {name}
                {name === "Check-in chat" && due.length > 0 && <i />}
              </button>
            ))}
          </nav>
          <span className="private">
            <Sprout size={16} /> Personal space
          </span>
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
                  ? "Activity analytics"
                  : "Check-in chat"}
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
            <section className="hero">
              <div className="hero-art" />
              <div className="hero-copy">
                {iconTitle(
                  Sprout,
                  day === today ? "Daily overview" : "Day overview",
                )}
                <h2>{day === today ? "Today’s progress" : "Daily progress"}</h2>
                <div className="hero-count">
                  <b>{done}</b>
                  <span>of {rows.length} habits complete</span>
                </div>
                <div className="meter">
                  <i
                    style={{
                      width:
                        (rows.length ? (100 * done) / rows.length : 0) + "%",
                    }}
                  />
                </div>
              </div>
            </section>
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
                      <div className="habitrow" key={r.id}>
                        <button
                          aria-label={
                            (r.status === "Done" ? "Reopen " : "Complete ") +
                            r.title
                          }
                          disabled={busy || day > today}
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
                            {displayTime(r.time)} · {r.repeat}
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
                        No habits scheduled for{" "}
                        {day === today ? "today" : "this day"}.
                      </p>
                      <button className="linkbtn" onClick={() => newDraft()}>
                        Add a habit
                      </button>
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
                            {h.repeat} · {displayTime(h.time)}
                          </small>
                        </div>
                        <SquarePen size={17} />
                      </button>
                    ))
                ) : (
                  <div className="empty">
                    <p>Your saved habits will appear here.</p>
                    <button className="linkbtn" onClick={() => newDraft()}>
                      Create your first habit
                    </button>
                  </div>
                )}
              </section>
              <aside>
                <section className="card assistant">
                  <div className="assistant-head">
                    <span className="spark">
                      <Sparkles size={20} />
                    </span>
                    <h2>Planning assistant</h2>
                  </div>
                  <p>Tell me what you want to do, by voice or text.</p>
                  <form onSubmit={buildPlan}>
                    <textarea
                      aria-label="Describe your plan"
                      value={prompt}
                      maxLength={1000}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="e.g. Remind me to walk every morning at 7 am"
                    />
                    <div className="composer-bar">
                      <MicButton onText={setPrompt} notice={setToast} />
                      <button
                        className="primary small"
                        disabled={!prompt.trim()}
                      >
                        Plan it <Sparkles size={14} />
                      </button>
                    </div>
                  </form>
                </section>
                <section className="card ideas">
                  {iconTitle(Leaf, "Habit ideas")}
                  <h2>Start small</h2>
                  {seeds.map((s) => (
                    <button
                      className="idea"
                      key={s.title}
                      onClick={() => newDraft(s)}
                    >
                      <Badge cat={s.category} />
                      <span>{s.title}</span>
                      <Plus size={16} />
                    </button>
                  ))}
                </section>
              </aside>
            </div>
          </>
        )}
        {tab === "Check-in chat" && (
          <section className="card chat">
            <div className="chathead">
              <div className="row">
                <div className="assistant-head">
                  <span className="chatavatar">
                    <Sprout />
                  </span>
                  <div>
                    <h2>Grove check-ins</h2>
                    <small>Your habit updates</small>
                  </div>
                </div>
                <input
                  aria-label="Chat date"
                  type="date"
                  max={today}
                  value={day}
                  onChange={(e) => e.target.value && setDay(e.target.value)}
                />
              </div>
            </div>
            <div className="notifyline">
              <Bell size={15} />
              <button
                onClick={async () => {
                  if (typeof Notification === "undefined") {
                    setToast(
                      "For phone alerts, open a habit and import its calendar reminder.",
                    );
                    return;
                  }
                  try {
                    const p = await Notification.requestPermission();
                    setToast(
                      p === "granted"
                        ? "Device alerts enabled while Habit Grove is active."
                        : "For closed-app reminders, import this habit into your calendar.",
                    );
                  } catch {
                    setToast("Device alerts are unavailable in this browser.");
                  }
                }}
              >
                Enable device alerts
              </button>
            </div>
            <div className="chatbody">
              <span className="datetag">
                {displayDay(day, {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
              </span>
              {rows.length === 0 && (
                <div className="bubble">
                  You have no habits scheduled for this day. Add one to start
                  checking in.
                </div>
              )}
              {rows.map((r) => (
                <div key={r.id} className="thread">
                  <div className="bubble">
                    <small>
                      <Bell size={13} />{" "}
                      {r.time ? displayTime(r.time) + " IST" : "Anytime"}
                      {r.day === today && r.time > minute ? " · Upcoming" : ""}
                    </small>
                    <p>
                      Did you complete <b>{r.title}</b>?
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
                            disabled={busy || day > today}
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
                      <button
                        onClick={() =>
                          edit(journal.current.find((h) => h.id === r.id) || r)
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
                        e.day === day,
                    )
                    .map((e) => {
                      const p = e.payload as { note: string; status: string };
                      return (
                        <div key={e.seq} className="bubble outgoing">
                          {p.note || p.status}
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
        )}
        {tab === "Analytics" && (
          <>
            <div className="analyticshead">
              <label>
                Period{" "}
                <select
                  value={period}
                  onChange={(e) => {
                    setPeriod(e.target.value);
                    setLimit(50);
                  }}
                >
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="365">Last year</option>
                  <option value="all">All time</option>
                </select>
              </label>
            </div>
            <div className="stats">
              {[
                ["Scheduled", history.length],
                [
                  "Completed",
                  history.filter((x) => x.status === "Done").length,
                ],
                [
                  "Completion rate",
                  history.length
                    ? Math.round(
                        (history.filter((x) => x.status === "Done").length /
                          history.length) *
                          100,
                      ) + "%"
                    : "—",
                ],
              ].map(([s, v]) => (
                <div className="card" key={s}>
                  <small>{s}</small>
                  <strong>{v}</strong>
                </div>
              ))}
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
                      <tr key={r.id + r.day}>
                        <td>{r.day}</td>
                        <td>{r.title}</td>
                        <td>{r.category}</td>
                        <td>{displayTime(r.time)}</td>
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
          <button
            className="updatebtn"
            onClick={() => {
              setUpdates(true);
              checkUpdate();
            }}
          >
            {available ? "Update available" : "App updates"}
          </button>
          <button className="updatebtn" onClick={() => setAccess(true)}>
            Journal access
          </button>
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
      {draft && (
        <Modal
          title={editing ? "Edit habit" : "Add a habit"}
          close={() => setDraft(null)}
        >
          <form onSubmit={submitDraft}>
            <Fields h={draft} change={setDraft} />
            <p className="hint">
              <Bell size={16} /> In-app prompts appear at the check-in time. For
              alerts when closed, import the reminder into your phone calendar.
            </p>
            <div className="modalactions">
              {editing && draft.time && (
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
              <button className="primary" disabled={busy}>
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
              if (await save(proposals.map(planChange))) {
                setProposals([]);
                setPrompt("");
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
            <button className="primary" disabled={busy}>
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
