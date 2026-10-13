import { DEFAULT_CLASSES, SCHOOL_DIVISIONS } from "@/shared/config/school";

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
    id: "school-a",
    name: "School A",
    classes: classes("Prep 1", "Primary 2"),
    text: "Strong academic foundations, with a balanced curriculum that develops critical thinking and problem-solving abilities.",
    areas: ["English, Mathematics & Science", "Computer Studies", "French Language"],
  },
  {
    id: "school-b",
    name: "School B",
    classes: classes("Primary 3", "Primary 6"),
    text: "A rigorous programme aligned with national standards that prepares pupils for the next stage of their education.",
    areas: ["FSLC (First School Leaving Certificate) preparation", "Coding programmes", "Core subjects aligned with national standards"],
  },
];

/** The three schools, in order. Classes come from SCHOOL_DIVISIONS so admissions and the back office agree. */
export const SCHOOLS = SCHOOL_DIVISIONS.map((d) => ({
  id: d.id,
  href: `/schools/${d.id}`,
  name: d.name,
  classes: `${d.classes[0]} – ${d.classes[d.classes.length - 1]}`.replace("Kindergarten – Pre-Nursery", "Kindergarten & Pre-Nursery"),
  stages: [d.id],
  ...{
    "pre-school": { summary: "A nurturing start where young learners build foundational skills through play-based and structured learning.", img: "/images/cultural-day/05.jpg" },
    "school-a": { summary: "Strong foundations in reading, numbers and science, with a balanced curriculum that builds confident thinkers.", img: "/images/cultural-day/12.jpg" },
    "school-b": { summary: "A rigorous programme that builds critical thinking and prepares pupils for the FSLC examination and secondary school.", img: "/images/cultural-day/13.jpg" },
  }[d.id],
}));

export const SUBJECTS = ["Mathematics", "English Language", "Science", "History", "Computer Science", "Coding", "General Paper", "Home Economics"];

export const FACILITIES: [string, string, string][] = [
  ["layers", "Computer laboratory", "Modern computers and internet access for digital learning."],
  ["zoomin", "Science laboratory", "Well-equipped labs for practical experiments."],
  ["file", "Library", "Books, journals and digital resources for reading and research."],
  ["users", "Sports facilities", "A football field, basketball court, and indoor sports facilities."],
];
