export const SCHOOL = {
  name: "Nazareth School",
  storeName: "Nazareth School Store",
  shortName: "Nazareth Store",
  motto: "Growing in Wisdom, Age and Grace",
  pickupPlace: "the school store (Admin block, ground floor), Mon–Fri 8am–3pm",
  tagline: "Empowering minds, shaping futures",
  supervisor: "Sr. Irene Ugwoegbu",
  address: { line1: "3rd Avenue, J Close", line2: "Festac Town", state: "Lagos State" },
  phone: { display: "+234 911 640 9689", tel: "+2349116409689" },
  email: "nazarethschoolfestac@gmail.com",
  officeHours: "Monday – Friday, 7:30 AM – 4:00 PM",
  mapQuery: "3rd Avenue, J Close, Festac Town, Lagos, Nigeria",
  social: {
    facebook: "https://www.facebook.com/profile.php?id=61577951935358",
    instagram: "https://www.instagram.com/nazarethschoolfestac",
    tiktok: "https://vm.tiktok.com/ZS9LNG4T6pFdM-cPe44/",
    youtube: "https://www.youtube.com/@nsfestactv",
    whatsapp: "https://wa.me/2349116409689",
  },
} as const;

/**
 * Public website menu. `ready: false` hides an entry until its page exists,
 * so the menu never links to a page that isn't built yet.
 */
export const PUBLIC_NAV: { label: string; href: string; ready: boolean; children?: { label: string; href: string }[] }[] = [
  { label: "Home", href: "/", ready: true },
  { label: "About", href: "/about/welcome", ready: true, children: [
    { label: "Welcome address", href: "/about/welcome" },
    { label: "Our history", href: "/about/history" },
    { label: "Vision & mission", href: "/about/vision" },
    { label: "Management", href: "/about/management" },
  ] },
  { label: "Our schools", href: "/schools/pre-school", ready: true, children: [
    { label: "Pre-School", href: "/schools/pre-school" },
    { label: "Primary School", href: "/schools/primary" },
  ] },
  { label: "Academics", href: "/academics/curriculum", ready: true, children: [
    { label: "Curriculum", href: "/academics/curriculum" },
    { label: "Co-curricular", href: "/academics/co-curricular" },
  ] },
  { label: "Admissions", href: "/admissions/process", ready: true, children: [
    { label: "Why Nazareth?", href: "/admissions/why-nazareth" },
    { label: "Admission process", href: "/admissions/process" },
    { label: "FAQs", href: "/admissions/faqs" },
    { label: "Apply online", href: "/admissions/apply" },
    { label: "Admission results", href: "/admissions/results" },
  ] },
  { label: "School life", href: "/gallery", ready: true, children: [
    { label: "Gallery", href: "/gallery" },
    { label: "Events", href: "/events" },
  ] },
  { label: "Contact", href: "/contact", ready: true },
];

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
