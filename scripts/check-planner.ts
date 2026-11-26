import { checkInLabel, customCheckInStatus } from "../lib/check-in-labels";
import { productivityArea } from "../lib/productivity";
import { formatRecoveryCode, parseRecoveryCode } from "../lib/journal-key";
import {
  periodBounds,
  shiftPeriod,
  trendBuckets,
} from "../lib/progress-period";
import { classification, suggestCategory, timeBand } from "../lib/categories";
import { progressStatus, timingNote } from "../components/daily-progress";
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
assert.deepEqual(suggestCategory("Take BP medicine after lunch", "12:30"), {
  category: "Health",
  subcategory: "Medication",
});
assert.equal(
  suggestCategory("Check blood pressure", "08:00").subcategory,
  "Measurements",
);
assert.equal(
  ask("What category is BP medicine?").text.includes("Health → Medication"),
  true,
);
assert.equal(
  classification({ ...walk, title: "Take BP medicine", category: "Personal" })
    .category,
  "Personal",
);
assert.deepEqual(
  [
    "04:59",
    "05:00",
    "11:59",
    "12:00",
    "16:59",
    "17:00",
    "20:59",
    "21:00",
    "",
  ].map(timeBand),
  [
    "Night",
    "Morning",
    "Morning",
    "Afternoon",
    "Afternoon",
    "Evening",
    "Evening",
    "Night",
    "Anytime",
  ],
);
assert.equal(suggestCategory("Review my list", "19:00").subcategory, "Evening");
const states = journal
  .rows(day)
  .filter((r) => r.id === flower.id)
  .map((r) => progressStatus(r, at("11:31"), day));
assert.match(
  timingNote(
    journal.rows(day).find((r) => r.id === flower.id && r.status === "Done")!,
  ),
  /90 min after reminder/,
);
assert.deepEqual(states, [
  "Done",
  "Overdue",
  "Estimated",
  "Estimated",
  "Estimated",
]);
assert.equal(
  ask("Remind me to take BP tablets at 8 am").create?.[0].subcategory,
  "Medication",
);
console.log("Planner, categories, daily dashboard and reminder checks passed.");

assert.deepEqual(periodBounds("1 week", "2026-11-25", day), {
  start: "2026-11-23",
  end: day,
});
assert.deepEqual(periodBounds("1 week", "2026-01-01", day), {
  start: "2025-12-29",
  end: "2026-01-04",
});
assert.deepEqual(periodBounds("1 month", "2024-02-07", day), {
  start: "2024-02-01",
  end: "2024-02-29",
});
const year = periodBounds("12 months", day, day);
assert.deepEqual(year, { start: "2025-12-01", end: day });
assert.equal(shiftPeriod("1 month", "2024-03-31", -1), "2024-02-01");
assert.equal(shiftPeriod("12 months", day, -1), "2025-11-01");
const sample = journal.rows(day).filter((r) => r.id === flower.id);
const yearTrend = trendBuckets(year.start, year.end, "12 months", [
  ...sample,
  { ...sample[0], outsideDay: true },
]);
assert.equal(yearTrend.length, 12);
assert.equal(yearTrend[0].total, 0);
assert.deepEqual([yearTrend[11].total, yearTrend[11].done], [5, 1]);
assert.equal(
  trendBuckets("2024-02-01", "2024-02-29", "1 month", []).length,
  29,
);
console.log("Calendar ranges and progress totals passed.");

const sampleKey = "0123456789abcdef".repeat(4);
const code = formatRecoveryCode(sampleKey);
assert.equal(parseRecoveryCode(code), sampleKey);
assert.equal(
  parseRecoveryCode(
    "Habit Grove recovery code\r\n\r\n" + code + "\r\n\r\nKeep this private.",
  ),
  sampleKey,
);
assert.equal(
  parseRecoveryCode(code.replaceAll("-", "–").replace("89ab", "89\u200bab")),
  sampleKey,
);
assert.equal(parseRecoveryCode(code.slice(0, -1)), null);
assert.equal(parseRecoveryCode(code + "xyz"), null);
console.log("Journal recovery code checks passed.");

assert.equal(productivityArea("Work"), "Work");
assert.equal(productivityArea("Learning"), "Personal");
assert.equal(productivityArea("Routines"), "Personal");
for (const category of ["Health", "Wellness", "Mindfulness"])
  assert.equal(productivityArea(category), "Wellbeing");
console.log("Productivity area checks passed.");

const nextDay = "2026-11-26";
const reviewNow = new Date(nextDay + "T08:01:00+05:30");
const reviewRequest =
  "I need to track Evening reflection. The task reminder should be for yesterday i should record today. But the data should store in yesterday report";
const proposedReview = answerPlan(reviewRequest, journal, nextDay, reviewNow);
const reviewHabit = proposedReview.create?.[0];
assert.ok(
  reviewHabit,
  "A previous-day tracking request should produce a habit draft",
);
assert.deepEqual(
  [
    reviewHabit.title,
    reviewHabit.start,
    reviewHabit.time,
    reviewHabit.repeat,
    reviewHabit.reviewPreviousDay,
  ],
  ["Evening reflection", day, "08:00", "Daily", true],
);
const reviewPlan: Entry = {
  kind: "plan",
  seq: 1,
  habit: reviewHabit.id,
  day,
  payload: reviewHabit,
  created: reviewNow.toISOString(),
};
let reviewJournal = indexJournal([reviewPlan]);
assert.equal(reviewJournal.checkIns(day).length, 0);
const reviewRow = reviewJournal.checkIns(nextDay)[0];
assert.equal(reviewRow.day, day);
assert.equal(
  isOverdue(reviewRow, new Date(nextDay + "T07:59:59+05:30")),
  false,
);
assert.equal(
  isOverdue(reviewRow, new Date(nextDay + "T08:00:00+05:30")),
  false,
);
assert.equal(isOverdue(reviewRow, reviewNow), true);
assert.equal(
  progressStatus(reviewJournal.rows(day)[0], reviewNow, nextDay),
  "Overdue",
);
const result: Entry = {
  kind: "status",
  seq: 2,
  habit: reviewHabit.id,
  day: reviewRow.day,
  payload: { status: "Done", note: "" },
  created: reviewNow.toISOString(),
};
reviewJournal = indexJournal([reviewPlan, result]);
assert.equal(reviewJournal.rows(day)[0].status, "Done");
assert.equal(reviewJournal.rows(nextDay)[0].status, "Pending");
assert.equal(isOverdue(reviewJournal.checkIns(nextDay)[0], reviewNow), false);
assert.match(
  answerPlan("Show yesterday’s report", reviewJournal, nextDay, reviewNow).text,
  /1 completed/,
);
assert.equal(
  answerPlan(
    "Track Evening reflection daily and record the previous day at 10 am",
    reviewJournal,
    nextDay,
    reviewNow,
  ).edit?.time,
  "10:00",
);
const edited: Entry = {
  ...reviewPlan,
  seq: 3,
  day: nextDay,
  payload: { ...reviewHabit, time: "09:00", reviewPreviousDay: false },
};
assert.deepEqual(
  indexJournal([reviewPlan, result, edited])
    .checkIns(nextDay)
    .map((r) => [r.day, r.time]),
  [
    [day, "08:00"],
    [nextDay, "09:00"],
  ],
);
console.log("Previous-day scheduling and reporting checks passed.");

const labeledDraft = answerPlan(
  "Screen-free evening should be Watched / Missed",
  journal,
  nextDay,
  reviewNow,
).create?.[0];
assert.ok(labeledDraft);
assert.equal(labeledDraft.checkInStyle, "watched-missed");
assert.equal(labeledDraft.reviewPreviousDay, true);
const labeledEdit = answerPlan(
  "Evening reflection should be Watched / Missed",
  reviewJournal,
  nextDay,
  reviewNow,
).edit;
assert.ok(labeledEdit);
assert.equal(labeledEdit.id, reviewHabit.id);
const afterLabelEdit = indexJournal([
  reviewPlan,
  result,
  { ...reviewPlan, seq: 3, day: nextDay, payload: labeledEdit },
]);
const historicalResult = afterLabelEdit.checkIns(nextDay)[0];
assert.equal(historicalResult.day, day);
assert.equal(checkInLabel(historicalResult, historicalResult.status), "Missed");
assert.equal(checkInLabel(historicalResult, "Skipped"), "Watched");
assert.equal(
  customCheckInStatus(historicalResult, "Watched yesterday"),
  "Skipped",
);
assert.equal(customCheckInStatus(historicalResult, "Missed yesterday"), "Done");
assert.equal(checkInLabel(walk, "Done"), "Done");
assert.equal(customCheckInStatus(walk, "Missed"), "");
console.log("Check-in label and previous-day attribution checks passed.");
