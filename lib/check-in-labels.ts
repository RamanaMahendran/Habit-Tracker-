export function checkInLabel(
  habit: { checkInStyle?: "watched-missed" },
  status: string,
) {
  if (habit.checkInStyle === "watched-missed") {
    if (status === "Done") return "Missed";
    if (status === "Skipped") return "Watched";
  }
  return status;
}

export function customCheckInStatus(
  habit: { checkInStyle?: "watched-missed" },
  message: string,
) {
  if (habit.checkInStyle !== "watched-missed") return "";
  if (/\b(undo|reopen|pending)\b/i.test(message)) return "Pending";
  if (/\b(missed|(?:did not|didn.t) watch|not watched)\b/i.test(message))
    return "Done";
  if (/\bwatched\b/i.test(message)) return "Skipped";
  return "";
}
