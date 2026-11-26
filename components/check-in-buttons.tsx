import { Check } from "lucide-react";
import { checkInLabel } from "@/lib/check-in-labels";
import type { Row } from "@/lib/habits";

export function CheckInButtons({
  row,
  disabled,
  onMark,
}: {
  row: Row;
  disabled: boolean;
  onMark: (row: Row, status: string) => void;
}) {
  const custom = row.checkInStyle === "watched-missed";
  const goalMet = (
    <button
      className="primary small"
      type="button"
      disabled={disabled}
      onClick={() => onMark(row, "Done")}
    >
      {!custom && <Check size={15} />} {checkInLabel(row, "Done")}
    </button>
  );
  const goalMissed = (
    <button
      className="secondary"
      type="button"
      disabled={disabled}
      onClick={() => onMark(row, "Skipped")}
    >
      {custom ? checkInLabel(row, "Skipped") : "Skip"}
    </button>
  );
  return (
    <div className="check-in-actions">
      {custom ? (
        <>
          {goalMissed}
          {goalMet}
        </>
      ) : (
        <>
          {goalMet}
          {goalMissed}
        </>
      )}
    </div>
  );
}
