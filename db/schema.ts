import {
  integer,
  sqliteTable,
  text,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
export const journal = sqliteTable(
  "habit_journal",
  {
    seq: integer().primaryKey({ autoIncrement: true }),
    owner: text().notNull(),
    uid: text().notNull(),
    habit: text().notNull(),
    kind: text().notNull(),
    day: text().notNull(),
    payload: text().notNull(),
    created: text().notNull(),
  },
  (t) => [
    uniqueIndex("journal_request").on(t.owner, t.uid),
    index("journal_history").on(t.owner, t.seq),
    index("journal_habit").on(t.owner, t.habit, t.seq),
  ],
);
