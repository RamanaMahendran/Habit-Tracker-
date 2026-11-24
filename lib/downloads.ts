import { zipSync, strToU8 } from "fflate";
import {
  type Row,
  type Habit,
  type Entry,
  indiaDay,
  moveDay,
  scheduled,
} from "./habits";
const xml = (x: unknown) =>
  String(x ?? "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
export function saveFile(data: BlobPart, type: string, name: string) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(new Blob([data], { type }));
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function workbook(rows: Row[], events: Entry[], habits: Habit[]) {
  const sheets = [
    {
      name: "Daily activity",
      data: [
        ["Date", "Habit", "Category", "Reminder (IST)", "Frequency", "Status"],
        ...rows.map((r) => [
          r.day,
          r.title,
          r.category,
          r.time,
          r.repeat,
          r.status === "Pending" && r.day < indiaDay()
            ? "Unrecorded"
            : r.status,
        ]),
      ],
    },
    {
      name: "Habits",
      data: [
        [
          "Habit",
          "Category",
          "Start",
          "Reminder (IST)",
          "Frequency",
          "Archived",
        ],
        ...habits.map((h) => [
          h.title,
          h.category,
          h.start,
          h.time,
          h.repeat,
          h.archived ? "Yes" : "No",
        ]),
      ],
    },
    {
      name: "History",
      data: [
        ["Recorded (UTC)", "Effective date", "Habit ID", "Change", "Details"],
        ...events.map((e) => [
          e.created,
          e.day,
          e.habit,
          e.kind,
          JSON.stringify(e.payload),
        ]),
      ],
    },
  ];
  const ss = "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    pk = "http://schemas.openxmlformats.org/package/2006/relationships";
  const files: Record<string, Uint8Array> = {};
  const put = (key: string, value: string) => {
    files[key] = strToU8('<?xml version="1.0" encoding="UTF-8"?>' + value);
  };
  put(
    "[Content_Types].xml",
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      sheets
        .map(
          (_, i) =>
            '<Override PartName="/xl/worksheets/s' +
            i +
            '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
        )
        .join("") +
      "</Types>",
  );
  put(
    "_rels/.rels",
    '<Relationships xmlns="' +
      pk +
      '"><Relationship Id="r1" Type="' +
      rel +
      '/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  );
  put(
    "xl/workbook.xml",
    '<workbook xmlns="' +
      ss +
      '" xmlns:r="' +
      rel +
      '"><sheets>' +
      sheets
        .map(
          (s, i) =>
            '<sheet name="' +
            s.name +
            '" sheetId="' +
            (i + 1) +
            '" r:id="r' +
            i +
            '"/>',
        )
        .join("") +
      "</sheets></workbook>",
  );
  put(
    "xl/_rels/workbook.xml.rels",
    '<Relationships xmlns="' +
      pk +
      '">' +
      sheets
        .map(
          (_, i) =>
            '<Relationship Id="r' +
            i +
            '" Type="' +
            rel +
            '/worksheet" Target="worksheets/s' +
            i +
            '.xml"/>',
        )
        .join("") +
      "</Relationships>",
  );
  sheets.forEach((s, i) =>
    put(
      "xl/worksheets/s" + i + ".xml",
      '<worksheet xmlns="' +
        ss +
        '"><cols><col min="1" max="6" width="25" customWidth="1"/></cols><sheetData>' +
        s.data
          .map(
            (line, n) =>
              '<row r="' +
              (n + 1) +
              '">' +
              line
                .map(
                  (v, k) =>
                    '<c r="' +
                    String.fromCharCode(65 + k) +
                    (n + 1) +
                    '" t="inlineStr"><is><t xml:space="preserve">' +
                    xml(v) +
                    "</t></is></c>",
                )
                .join("") +
              "</row>",
          )
          .join("") +
        "</sheetData></worksheet>",
    ),
  );
  return zipSync(files);
}
export function calendar(h: Habit) {
  if (!h.time) return;
  let start = h.start;
  while (!scheduled({ ...h, archived: false }, start))
    start = moveDay(start, 1);
  const stamp = (date: Date) =>
    date
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const escape = (s: string) =>
    s
      .replace(/\\/g, "\\\\")
      .replace(/\r?\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  const line = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Habit Grove//Planner//EN",
    "BEGIN:VEVENT",
    "UID:" + h.id + "@habitgrove",
    "DTSTAMP:" + stamp(new Date()),
    "DTSTART:" + stamp(new Date(start + "T" + h.time + ":00+05:30")),
    "DURATION:PT5M",
    "SUMMARY:" + escape(h.title),
  ];
  // Keep the weekday rule on the Indian calendar even when the UTC day differs.
  if (h.repeat === "Weekdays") {
    const prev = h.time < "05:30";
    line.push(
      "RRULE:FREQ=WEEKLY;BYDAY=" + (prev ? "SU,MO,TU,WE,TH" : "MO,TU,WE,TH,FR"),
    );
  }
  if (h.repeat === "Daily" || h.repeat === "Weekly")
    line.push("RRULE:FREQ=" + h.repeat.toUpperCase());
  line.push(
    "DESCRIPTION:Open Habit Grove to check in.",
    "URL:" + location.origin,
    "BEGIN:VALARM",
    "TRIGGER:PT0M",
    "ACTION:DISPLAY",
    "DESCRIPTION:" + escape("Check in: " + h.title),
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  );
  saveFile(
    line.join("\r\n") + "\r\n",
    "text/calendar;charset=utf-8",
    "habit-reminder.ics",
  );
}
