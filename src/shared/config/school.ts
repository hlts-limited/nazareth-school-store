export const SCHOOL = {
  name: "Nazareth School",
  storeName: "Nazareth School Store",
  shortName: "Nazareth Store",
  motto: "Growing in Wisdom, Age and Grace",
  pickupPlace: "the school store (Admin block, ground floor), Mon–Fri 8am–3pm",
} as const;

/** Classes in promotion order. Seeded into the database; Super Admin can reorder them. */
export const DEFAULT_CLASSES = [
  "Kindergarten",
  "Pre-Nursery",
  "Prep 1",
  "Prep 2",
  "Primary 1",
  "Primary 2",
  "Primary 3",
  "Primary 4",
  "Primary 5",
  "Primary 6",
] as const;

export const ORDER_NUMBER_OFFSET = 24800;
