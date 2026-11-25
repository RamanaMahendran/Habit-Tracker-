import { suggestCategory } from "./categories";
import {
  dateObj,
  displayDay,
  displayTime,
  draftPlan,
  indiaDay,
  indexJournal,
  isOverdue,
  moveDay,
  type Habit,
  type Row,
} from "./habits";
import { messageTime, parseInterval, slotTimes } from "./interval";

type Journal = ReturnType<typeof indexJournal>;
export type FollowUp = { kind: "edit"; id: string } | { kind: "goal" };
export type Reply = {
  text: string;
  create?: Habit[];
  edit?: Habit;
  followUp?: FollowUp;
};

function scheduleLine(r: Row) {
  const detail =
    r.status !== "Pending" ? r.status : r.rolling && !r.next ? "estimated" : "";
  return [displayTime(r.time), r.title, detail].filter(Boolean).join(" · ");
}

function editReply(h: Habit, input: string): Reply {
  if (
    /\b(today|tomorrow|yesterday|only this time|just once)\b/i.test(input) &&
    h.repeat !== "Once"
  )
    return {
      text: "This edit changes the recurring reminder. To change its usual time, say the new time. You can record an individual check-in at its actual time in Planner.",
      followUp: { kind: "edit", id: h.id },
    };
  const interval = parseInterval(input);
  const time = messageTime(input);
  const repeat = /\bweekdays?\b/i.test(input)
    ? "Weekdays"
    : /\bweekly\b/i.test(input)
      ? "Weekly"
      : /\b(daily|every day)\b/i.test(input)
        ? "Daily"
        : undefined;
  if (!time && !repeat && !interval)
    return {
      text: `What time or repeat schedule would you like for ${h.title}? Its current start time is ${displayTime(h.time)} IST.`,
      followUp: { kind: "edit", id: h.id },
    };
  const next: Habit = {
    ...h,
    time: interval ? h.time || interval.first : time || h.time,
    repeat: repeat || h.repeat,
  };
  if (interval) {
    next.inDay =
      /\b(times|until|till|through|between)\b/i.test(input) || !h.inDay
        ? interval.rule
        : { ...h.inDay, hours: interval.rule.hours };
    if (/\b(from|starting|between|at)\s+\d/i.test(input))
      next.time = interval.first;
  }
  if (!slotTimes(next.time, next.inDay).length)
    return {
      text: "Those check-ins would extend past midnight or leave an invalid interval. Try an earlier start or fewer check-ins.",
      followUp: { kind: "edit", id: h.id },
    };
  const details = [
    next.repeat,
    displayTime(next.time),
    ...(next.inDay
      ? [
          `every ${next.inDay.hours} h, ${slotTimes(next.time, next.inDay).length} check-ins`,
        ]
      : []),
  ];
  return {
    text: `Proposed schedule for ${h.title}: ${details.join(" · ")}. Review it before saving.`,
    edit: next,
  };
}

function routine(input: string, day: string): Reply {
  const idea = /read|book/i.test(input)
    ? [
        "Read 2 pages",
        "Keep the book where you usually sit after dinner. Two pages is a clear stopping point.",
      ]
    : /sales|call practice/i.test(input)
      ? [
          "Practise one sales opening",
          "Pick one customer problem and practise a 30-second opening aloud.",
        ]
      : /walk|fitness|active|exercise/i.test(input)
        ? [
            "Walk for 5 minutes",
            "Choose a familiar starting point and attach the walk to a break you already take.",
          ]
        : /writ|journal/i.test(input)
          ? [
              "Write one sentence",
              "After you sit down for the evening, write one sentence about the day.",
            ]
          : /learn|study/i.test(input)
            ? [
                "Study for 5 minutes",
                "Pick one topic before you start and end by recalling one thing you learned.",
              ]
            : null;
  if (
    !idea &&
    input.length <= 80 &&
    !/\b(habit|routine|ideas|what|how|help|build)\b/i.test(input)
  ) {
    const activity = input.trim();
    const habit = {
      ...draftPlan("Practise for 5 minutes", day)[0],
      title: "Spend 5 minutes on " + activity,
    };
    return {
      text:
        "Start with five minutes of " +
        activity +
        " after something you already do each day. Choose a reminder time when you review the habit.",
      create: [habit],
    };
  }
  if (!idea)
    return {
      text: "Which activity would you like to make easier to repeat? For example, reading, walking, studying, or writing.",
      followUp: { kind: "goal" },
    };
  return {
    text:
      idea[1] +
      " If that fits, you can review the suggested habit and choose a reminder time.",
    create: draftPlan(idea[0], day),
  };
}

export function answerPlan(
  input: string,
  journal: Journal,
  selectedDay: string,
  now: Date,
  followUp?: FollowUp,
): Reply {
  const raw = input.trim();
  const q = raw
    .toLowerCase()
    .replace(/\b(today|tomorrow|yesterday)[’']s\b/g, "$1")
    .replace(/[’']/g, "")
    .replace(/[?!.,]+$/g, "")
    .replace(/^please\s+/, "")
    .trim();
  const today = indiaDay(now);
  const day = /\btomorrow\b/.test(q)
    ? moveDay(today, 1)
    : /\byesterday\b/.test(q)
      ? moveDay(today, -1)
      : /\btoday\b/.test(q)
        ? today
        : selectedDay;
  const active = journal.current.filter((h) => !h.archived);
  const named = active.filter((h) =>
    q.includes(h.title.toLowerCase().replace(/[’']/g, "")),
  );
  const label = displayDay(day, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const question =
    /^(what|whats|when|how|which|why|do i|did i|am i|is |are |can i|can you (show|tell|help))\b/.test(
      q,
    );
  if (
    /\b(categor(?:y|ies)|categorise|categorize|classify)\b/.test(q) &&
    (question || /^(categorise|categorize|classify)\b/.test(q))
  ) {
    const match = suggestCategory(raw, messageTime(raw));
    return {
      text:
        match.category === "Personal" && match.subcategory === "General"
          ? "I couldn’t identify a specific topic. Open Knowledge Book to browse examples, or include the task name and reminder time."
          : `Suggested category: ${match.category} → ${match.subcategory}. Open Knowledge Book for examples.`,
    };
  }
  if (/^(cancel|never mind|nevermind)$/.test(q))
    return { text: "Okay. What else would you like to plan?" };
  if (
    /\b(progress|analytics|report|how (?:did i|am i doing)|this week|last seven days)\b/.test(
      q,
    ) &&
    !/\b(schedule|reschedule|move)\b/.test(q)
  ) {
    const weekly = /week|seven days/.test(q);
    const thisWeek = /this week/.test(q);
    const length = thisWeek ? 1 + ((dateObj(today).getUTCDay() + 6) % 7) : 7;
    const days = weekly
      ? Array.from({ length }, (_, i) => moveDay(today, -i))
      : [day];
    const rows = days
      .flatMap((d) => journal.rows(d))
      .filter(
        (r) =>
          !r.outsideDay && (!named.length || named.some((h) => h.id === r.id)),
      );
    const count = (status: string) =>
      rows.filter((r) => r.status === status).length;
    return {
      text: `${thisWeek ? "This week so far" : weekly ? "Last 7 days" : label}${named.length ? " · " + named.map((h) => h.title).join(", ") : ""}: ${count("Done")} completed, ${count("Skipped")} skipped, ${rows.filter((r) => isOverdue(r, now)).length} overdue. ${rows.length ? "Open Analytics for the full activity table." : "There are no scheduled check-ins in this period."}`,
    };
  }
  if (
    /\b(plan|prioriti[sz]e|organise|organize)\b.*\b(my day|today|tomorrow)\b/.test(
      q,
    )
  ) {
    const pending = journal.rows(day).filter((r) => r.next && !r.outsideDay);
    const late = pending.filter((r) => isOverdue(r, now));
    const timed = pending.filter((r) => r.time && !isOverdue(r, now));
    const flexible = pending.filter((r) => !r.time);
    const parts = [
      late.length
        ? "First, review overdue check-ins in Planner: " +
          late.map(scheduleLine).join(", ") +
          "."
        : "",
      timed.length ? "Next scheduled: " + scheduleLine(timed[0]) + "." : "",
      flexible.length
        ? "Fit these around your timed habits: " +
          flexible.map((r) => r.title).join(", ") +
          "."
        : "",
    ].filter(Boolean);
    return {
      text: parts.length
        ? label + " · IST\n" + parts.join("\n")
        : "Your plan is clear for " +
          label +
          ". What would you like to make time for?",
    };
  }
  if (
    (/\b(overdue|late|pending|remaining|left|next|schedule|agenda|day|today|tomorrow|yesterday|due)\b/.test(
      q,
    ) &&
      (question ||
        /^(show|list|view|overdue|pending|next|my (day|schedule)|plan my day|today|tomorrow|yesterday|agenda)\b/.test(
          q,
        ))) ||
    /^(when|what time)\b/.test(q)
  ) {
    const nextOnly = /\bnext\b/.test(q);
    const overdueOnly = /\b(overdue|late|past due)\b/.test(q);
    const pendingOnly = nextOnly || /\b(pending|remaining|left)\b/.test(q);
    const rows = journal
      .rows(day)
      .filter(
        (r) =>
          !r.outsideDay &&
          (!named.length || named.some((h) => h.id === r.id)) &&
          (!overdueOnly || isOverdue(r, now)) &&
          (!pendingOnly || r.status === "Pending") &&
          (!nextOnly || r.next),
      );
    const first = rows[0];
    if (nextOnly && first)
      return {
        text: `${isOverdue(first, now) ? "Waiting for your check-in" : "Next on your plan"} for ${label}: ${scheduleLine(first)}.`,
      };
    return {
      text: rows.length
        ? label + " · IST\n" + rows.map(scheduleLine).join("\n")
        : `No ${overdueOnly ? "overdue " : pendingOnly ? "pending " : ""}check-ins for ${label}${named.length ? " for " + named[0].title : ""}.`,
    };
  }
  if (
    /^(?:please |can you )?(move|reschedule|change|edit|shift|update)\b/.test(q)
  ) {
    if (named.length === 1) return editReply(named[0], raw);
    return {
      text: active.length
        ? "Which habit should I change? Include its name and the new schedule, for example “Move Walking to 7:30 pm”. Your habits: " +
          active.map((h) => h.title).join(", ") +
          "."
        : "Your planner has no active habits to reschedule yet.",
    };
  }
  if (
    followUp?.kind === "edit" &&
    !question &&
    !/^(add|remind|create|schedule)\b/.test(q)
  ) {
    const h = active.find((h) => h.id === followUp.id);
    if (h) return editReply(h, raw);
  }
  if (/\b(consistent|consistency|stick to|keep missing)\b/.test(q)) {
    const skipped = Array.from({ length: 7 }, (_, i) =>
      journal.rows(moveDay(today, -i)),
    )
      .flat()
      .filter((r) => r.status === "Skipped");
    const target = named[0]?.title || skipped.at(0)?.title || active[0]?.title;
    return {
      text: target
        ? `Start with ${target}. Pick a cue you already have each day and a time you can protect. To try a different reminder, say “Move ${target} to 7 pm”.`
        : "Choose one small activity you can repeat after something you already do. Which activity would you like to start with?",
      followUp: target ? undefined : { kind: "goal" },
    };
  }
  if (
    (/\b(routine|read more|get fit|build a habit|habit ideas)\b/.test(q) &&
      !/^(add|remind|schedule|create)\b/.test(q)) ||
    (followUp?.kind === "goal" &&
      !question &&
      !/^(add|remind|schedule|create)\b/.test(q))
  )
    return routine(q, day);
  if (
    !question &&
    /^(?:(?:please |can you )?(?:remind me to|create|add|schedule|plan to)|i (?:need|want) to|walk|read|drink|call|study|write|practice|practise|stretch|journal|meditate|take)\b/.test(
      q,
    )
  ) {
    const clean = raw
      .replace(
        /^(?:please |can you )?(?:add|create|schedule)\s+(?:(?:a |an )?(?:habit|task|reminder)(?: to| for)?\s+)?/i,
        "",
      )
      .replace(/^(?:please |can you )?(remind me to)\s+/i, "$1 ");
    const drafts = draftPlan(
      clean,
      /\b(today|tomorrow)\b/.test(q) ? today : selectedDay,
    );
    if (drafts.length)
      return {
        text:
          "Proposed: " +
          drafts
            .map((h) => [h.title, h.repeat, displayTime(h.time)].join(" · "))
            .join("\n") +
          ". Review the details when you're ready.",
        create: drafts,
      };
  }
  return {
    text: "I can show your schedule, find overdue check-ins, summarize progress, change a reminder, or help build a routine. Try “What’s next?”, “Show my progress this week”, or “Help me build a reading routine”.",
  };
}
