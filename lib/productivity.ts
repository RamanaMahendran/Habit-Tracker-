export const productivityAreas = ["Work", "Personal", "Wellbeing"] as const;
export type ProductivityArea = (typeof productivityAreas)[number];

export function productivityArea(category: string): ProductivityArea {
  if (category === "Work") return "Work";
  if (["Health", "Wellness", "Mindfulness"].includes(category))
    return "Wellbeing";
  return "Personal";
}
