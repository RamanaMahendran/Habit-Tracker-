import assert from "node:assert/strict";
import { indexJournal, isOverdue, type Entry, type Habit } from "../lib/habits";
import { answerPlan } from "../lib/planning-assistant";

const day = "2026-11-25";
const at = (clock: string) => new Date(day + "T" + clock + "+05:30");
const flower: Habit = {
  id: "flower",
  title: "Flower Essence",
  time: "08:00",
  start: day,
  repeat: "Daily",
  category: "Personal",
  rolling: true,
  inDay: { hours: 2, count: 5 },
};
const walk = {
  ...flower,
  id: "walk",
  title: "Walking",
  time: "19:00",
  rolling: false,
  inDay: undefined,
};
const anytime = { ...walk, id: "notes", title: "Notes", time: "" };
const entries: Entry[] = [flower, walk, anytime].map((h, i) => ({
  seq: i + 1,
  day,
  created: at("00:00").toISOString(),
  habit: h.id,
  kind: "plan",
  payload: h,
}));
let journal = indexJournal(entries);
const overdue = (when: string) =>
  journal.rows(day).filter((r) => isOverdue(r, at(when)));
assert.equal(overdue("07:59:59").length, 0);
assert.equal(overdue("08:00:00").length, 0);
assert.deepEqual(
  overdue("08:00:01").map((r) => r.time),
  ["08:00"],
);
assert.deepEqual(
  overdue("18:00").map((r) => r.time),
  ["08:00"],
);
entries.push({
  seq: 4,
  habit: "flower",
  kind: "status",
  day,
  created: at("09:30").toISOString(),
  payload: { slot: "", actualTime: "09:30", status: "Done", note: "" },
});
journal = indexJournal(entries);
assert.deepEqual(overdue("11:29:59"), []);
assert.deepEqual(
  overdue("11:30:01").map((r) => r.time),
  ["11:30"],
);
assert.deepEqual(
  overdue("19:00:01").map((r) => r.time),
  ["11:30", "19:00"],
);
assert(!journal.rows("2026-11-26").some((r) => isOverdue(r, at("23:59"))));
assert.equal(journal.rows(day).filter((r) => r.id === "flower").length, 5);
const ask = (s: string) => answerPlan(s, journal, day, at("11:00"));
assert.match(ask("What’s next?").text, /11:30 AM.*Flower Essence/);
assert.match(ask("What's overdue?").text, /No overdue/);
assert.match(ask("Plan my day").text, /Next scheduled: 11:30 AM/);
assert.match(
  ask("Show my progress this week").text,
  /This week so far: 1 completed/,
);
assert.match(
  ask("Show tomorrow's schedule").text,
  /Thu, 26 Nov|Thu, Nov 26|Thu 26 Nov/,
);
const edit = ask("Move Walking to 7:30 pm").edit!;
assert.equal(edit.id, walk.id);
assert.equal(edit.time, "19:30");
assert.equal(walk.time, "19:00");
const follow = ask("Move Walking").followUp;
assert.equal(
  answerPlan("8 pm", journal, day, at("11:00"), follow).edit?.time,
  "20:00",
);
assert.equal(
  ask("Change Flower Essence to every 3 hours five times").edit?.rolling,
  true,
);
assert.equal(
  ask("Remind me to read tomorrow at 7 pm").create?.[0].start,
  "2026-11-26",
);
assert.equal(
  ask("How can I build a reading routine?").create?.[0].title,
  "Read 2 pages",
);
assert.equal(ask("Hello").create, undefined);
console.log("Planner and reminder checks passed.");
