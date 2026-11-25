export const categories = [
  "Health",
  "Wellness",
  "Learning",
  "Mindfulness",
  "Work",
  "Personal",
  "Routines",
] as const;
type Topic = { name: string; examples: string[]; keywords?: RegExp };
type Section = {
  name: (typeof categories)[number];
  description: string;
  topics: Topic[];
};
export const guide: Section[] = [
  {
    name: "Health",
    description: "Medication, measurements and appointments.",
    topics: [
      {
        name: "Medication",
        examples: [
          "Take BP medicine",
          "Refill a prescription",
          "Take prescribed tablets",
        ],
        keywords:
          /\b(medicines?|medications?|meds?|tablets?|pills?|prescriptions?|inhalers?|insulin|doses?)\b/i,
      },
      {
        name: "Measurements",
        examples: [
          "Check blood pressure",
          "Log blood glucose",
          "Measure heart rate",
        ],
        keywords:
          /\b(bp|blood pressure|glucose|blood sugar|heart rate|weigh myself)\b/i,
      },
      {
        name: "Appointments",
        examples: ["Visit the dentist", "Doctor appointment"],
        keywords: /\b(doctor|dentist|clinic|check-?up)\b/i,
      },
    ],
  },
  {
    name: "Mindfulness",
    description: "Attention and reflection.",
    topics: [
      {
        name: "Reflection",
        examples: ["Write in my journal", "List things I’m grateful for"],
        keywords: /\b(journal\w*|reflect\w*|grateful|gratitude)\b/i,
      },
      {
        name: "Meditation",
        examples: ["Meditate", "Practise slow breathing"],
        keywords: /\b(meditat\w*|breath\w*)\b/i,
      },
    ],
  },
  {
    name: "Wellness",
    description: "Daily movement, food, water and rest.",
    topics: [
      {
        name: "Movement",
        examples: ["Take a morning walk", "Stretch after work"],
        keywords:
          /\b(walk\w*|run(?:ning)?|stretch\w*|yoga|gym|exercise|cycling|workout|fitness)\b/i,
      },
      {
        name: "Food and hydration",
        examples: ["Drink water", "Prepare breakfast"],
        keywords: /\b(water|hydrat\w*|breakfast|lunch|dinner|meal|snack)\b/i,
      },
      {
        name: "Sleep",
        examples: ["Go to sleep", "Wind down for bed"],
        keywords: /\b(sleep|bedtime|wind down|go to bed)\b/i,
      },
    ],
  },
  {
    name: "Learning",
    description: "Reading, studying and practising a skill.",
    topics: [
      {
        name: "Reading",
        examples: ["Read 10 pages", "Finish a book"],
        keywords: /\b(read(?:ing)?|books?|pages)\b/i,
      },
      {
        name: "Study and practice",
        examples: ["Study English", "Practise guitar"],
        keywords: /\b(study\w*|learn\w*|course|practi[cs]e|lesson|revise)\b/i,
      },
    ],
  },
  {
    name: "Personal",
    description: "Home, errands and relationships.",
    topics: [
      {
        name: "Home and errands",
        examples: ["Buy groceries", "Pay a bill", "Do laundry"],
        keywords: /\b(grocer\w*|laundry|clean\w*|bills?|errands?)\b/i,
      },
      {
        name: "Family and friends",
        examples: ["Call Mum", "Visit family"],
        keywords: /\b(mum|mom|dad|family|friends?|parents?)\b/i,
      },
      {
        name: "General",
        examples: ["An untimed task without a matching topic"],
      },
    ],
  },
  {
    name: "Work",
    description: "Professional commitments and focused work.",
    topics: [
      {
        name: "Meetings and calls",
        examples: ["Client call", "Attend a team meeting"],
        keywords: /\b(client|meeting|sales|team call)\b/i,
      },
      {
        name: "Focused work",
        examples: ["Prepare a report", "Work on a project"],
        keywords: /\b(work|report|project|email|proposal)\b/i,
      },
    ],
  },
  {
    name: "Routines",
    description: "Time-based groups for tasks without a matching topic.",
    topics: [
      { name: "Morning", examples: ["5 AM to before noon"] },
      { name: "Afternoon", examples: ["Noon to before 5 PM"] },
      { name: "Evening", examples: ["5 PM to before 9 PM"] },
      { name: "Night", examples: ["9 PM to before 5 AM"] },
    ],
  },
];
export function timeBand(time: string) {
  if (!time) return "Anytime";
  const hour = Number(time.slice(0, 2));
  return hour < 5 || hour >= 21
    ? "Night"
    : hour < 12
      ? "Morning"
      : hour < 17
        ? "Afternoon"
        : "Evening";
}
export function topics(category: string) {
  return guide.find((s) => s.name === category)?.topics || [];
}
export function suggestCategory(title: string, time: string) {
  for (const section of guide) {
    const topic = section.topics.find((t) => t.keywords?.test(title));
    if (topic) return { category: section.name, subcategory: topic.name };
  }
  return time
    ? { category: "Routines", subcategory: timeBand(time) }
    : { category: "Personal", subcategory: "General" };
}
type Classified = {
  title: string;
  time: string;
  category: string;
  subcategory?: string;
  autoCategory?: boolean;
};
export function classification(h: Classified) {
  if (h.autoCategory) return suggestCategory(h.title, h.time);
  const matches = topics(h.category);
  const subcategory =
    h.subcategory ||
    matches.find((t) => t.keywords?.test(h.title))?.name ||
    (h.category === "Routines" && h.time ? timeBand(h.time) : "General");
  return { category: h.category, subcategory };
}
