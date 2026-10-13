import { DEFAULT_CLASSES } from "@/shared/config/school";

// Content shared by the Our schools, Curriculum and Admissions pages.
// Class lists come from DEFAULT_CLASSES so they always match the store (including Prep 2).

const classes = (from: (typeof DEFAULT_CLASSES)[number], to: (typeof DEFAULT_CLASSES)[number]) =>
  DEFAULT_CLASSES.slice(DEFAULT_CLASSES.indexOf(from), DEFAULT_CLASSES.indexOf(to) + 1) as string[];

export const STAGES = [
  {
    id: "pre-school",
    name: "Pre-School",
    classes: classes("Kindergarten", "Pre-Nursery"),
    text: "A nurturing environment where young learners develop foundational skills through play-based and structured learning activities.",
    areas: ["Phonics & numeracy", "Creative arts & music", "Social skills development", "Play-based & structured learning"],
  },
  {
    id: "lower-primary",
    name: "Lower Primary",
    classes: classes("Prep 1", "Primary 2"),
    text: "Strong academic foundations, with a balanced curriculum that develops critical thinking and problem-solving abilities.",
    areas: ["English, Mathematics & Science", "Computer Studies", "French Language"],
  },
  {
    id: "upper-primary",
    name: "Upper Primary",
    classes: classes("Primary 3", "Primary 6"),
    text: "A rigorous programme aligned with national standards that prepares pupils for the next stage of their education.",
    areas: ["FSLC (First School Leaving Certificate) preparation", "Coding programmes", "Core subjects aligned with national standards"],
  },
];

export const SCHOOLS = [
  {
    href: "/schools/pre-school",
    name: "Pre-School",
    classes: "Kindergarten & Pre-Nursery",
    stages: ["pre-school"],
    summary: "A nurturing start where young learners build foundational skills through play-based and structured learning.",
  },
  {
    href: "/schools/primary",
    name: "Primary School",
    classes: "Prep 1 – Primary 6",
    stages: ["lower-primary", "upper-primary"],
    summary: "A balanced curriculum that builds strong foundations, critical thinking, and readiness for the FSLC examination.",
  },
];

export const SUBJECTS = ["Mathematics", "English Language", "Science", "History", "Computer Science", "Coding", "General Paper", "Home Economics"];

export const FACILITIES: [string, string, string][] = [
  ["layers", "Computer laboratory", "Modern computers and internet access for digital learning."],
  ["zoomin", "Science laboratory", "Well-equipped labs for practical experiments."],
  ["file", "Library", "Books, journals and digital resources for reading and research."],
  ["users", "Sports facilities", "A football field, basketball court, and indoor sports facilities."],
];
