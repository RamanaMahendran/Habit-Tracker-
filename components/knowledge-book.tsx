import { useState } from "react";
import { BookOpen, Search } from "lucide-react";
import { guide, classification } from "@/lib/categories";
import type { Habit } from "@/lib/habits";

export function KnowledgeBook({ habits }: { habits: Habit[] }) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const active = habits
    .filter((h) => !h.archived)
    .map((h) => ({ ...h, ...classification(h) }));
  const sections = guide
    .map((section) => {
      const members = active.filter((h) => h.category === section.name);
      const items = section.topics.map((t) => ({
        ...t,
        habits: members.filter((h) => h.subcategory === t.name),
      }));
      const other = members.filter(
        (h) => !items.some((t) => t.name === h.subcategory),
      );
      if (other.length)
        items.push({ name: "General", examples: [], habits: other });
      const visible = items.filter((t) =>
        [
          section.name,
          section.description,
          t.name,
          ...t.examples,
          ...t.habits.map((h) => h.title),
        ].some((x) => x.toLowerCase().includes(query)),
      );
      return { ...section, visible, count: members.length };
    })
    .filter((s) => s.visible.length);
  return (
    <section aria-label="Category guide">
      <div className="card book-intro">
        <span className="eyebrow">
          <BookOpen size={16} />
          Category guide
        </span>
        <h2>Where does my task belong?</h2>
        <p>
          Taking BP medicine belongs to <strong>Health → Medication</strong>.
          Checking your blood pressure belongs to{" "}
          <strong>Health → Measurements</strong>.
        </p>
        <p>
          Automatic selection uses your task name first. For an unfamiliar task,
          the reminder time selects a morning, afternoon, evening or night
          routine. You can also choose a category yourself.
        </p>
        <label className="book-search">
          <Search size={18} />
          <input
            type="search"
            aria-label="Search categories, examples or habits"
            placeholder="Search categories, examples or habits"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div className="book-grid">
        {sections.map((s) => (
          <article className="card book-section" key={s.name}>
            <div className="row">
              <h2>{s.name}</h2>
              <small>
                {s.count} active {s.count === 1 ? "habit" : "habits"}
              </small>
            </div>
            <p>{s.description}</p>
            {s.visible.map((t) => (
              <div className="book-topic" key={t.name}>
                <h3>{t.name}</h3>
                {t.examples.length > 0 && <p>{t.examples.join(" · ")}</p>}
                {t.habits.length > 0 && (
                  <details>
                    <summary>Your habits ({t.habits.length})</summary>
                    <ul>
                      {t.habits.map((h) => (
                        <li key={h.id}>{h.title}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}
          </article>
        ))}
      </div>
      {!sections.length && (
        <div className="card empty">
          No matches. Try “medicine”, “walk” or “morning”.
        </div>
      )}
    </section>
  );
}
