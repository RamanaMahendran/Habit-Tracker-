export type InDay = { hours: number } & ({ until: string } | { count: number });
export const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export const minutes = (s: string) =>
  Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const clock = (n: number) =>
  [Math.floor(n / 60), n % 60].map((v) => String(v).padStart(2, "0")).join(":");

export function slotTimes(first: string, rule?: InDay): string[] {
  if (!rule) return [first];
  if (
    !timePattern.test(first) ||
    !Number.isInteger(rule.hours) ||
    rule.hours < 1 ||
    rule.hours > 12
  )
    return [];
  const start = minutes(first),
    step = rule.hours * 60;
  let count: number;
  if ("until" in rule) {
    if (!timePattern.test(rule.until)) return [];
    count = 1 + Math.floor((minutes(rule.until) - start) / step);
  } else count = rule.count;
  if (
    !Number.isInteger(count) ||
    count < 2 ||
    start + (count - 1) * step >= 1440
  )
    return [];
  return Array.from({ length: count }, (_, i) => clock(start + i * step));
}

const words: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};
const numberOf = (s: string) => words[s.toLowerCase()] ?? Number(s);
const clockText = "(?:[01]?\\d|2[0-3])(?::[0-5]\\d)?(?:\\s*[ap]\\.?m\\.?)?";
function parseClock(s: string) {
  const m = s.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?m?\.?$/i);
  if (!m) return "";
  const hour = Number(m[1]);
  if (m[3] && (hour < 1 || hour > 12)) return "";
  return clock(
    (m[3] ? (hour % 12) + (m[3].toLowerCase() === "p" ? 12 : 0) : hour) * 60 +
      Number(m[2] || 0),
  );
}
export function messageTime(input: string) {
  const m = input.match(
    /\b(\d{1,2}(?::[0-5]\d)?\s*[ap]\.?m\.?|(?:[01]?\d|2[0-3]):[0-5]\d)\b/i,
  );
  return m ? parseClock(m[1]) : "";
}
export function parseInterval(part: string) {
  const interval = part.match(
    /\bevery\s+(?:(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+)?(?:hours?|hrs?)\b/i,
  );
  if (!interval) return null;
  const hours = numberOf(interval[1] || "1");
  let rest = part.replace(interval[0], "");
  const from = rest.match(
    new RegExp(
      "\\b(?:from|starting(?: at)?|between|at)\\s+(" + clockText + ")\\b",
      "i",
    ),
  );
  const to = rest.match(
    new RegExp(
      "\\b(?:until|till|through|to|and)\\s+(" + clockText + ")\\b",
      "i",
    ),
  );
  const times = rest.match(
    /\b(?:for\s+)?(\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+times(?:\s+(?:a|per)\s+day)?\b/i,
  );
  for (const match of [from, to, times])
    if (match) rest = rest.replace(match[0], "");
  const first = from ? parseClock(from[1]) : "08:00";
  const rule: InDay = times
    ? { hours, count: numberOf(times[1]) }
    : to
      ? { hours, until: parseClock(to[1]) }
      : { hours, count: 2 };
  return { rest, first, rule };
}
