import Link from "next/link";
import { SCHOOL } from "../config/school";
import { Icon } from "./icon";
import { DataSaverToggle } from "./client";
import { isLite } from "../lib/lite";

/** Slim footer on store pages (parents and pupils) linking back to the school website. */
export async function SchoolFooter() {
  const lite = await isLite();
  return (
    <footer className="school-foot">
      <Link className="school-foot-home" href="/"><Icon name="back" size="sm" />{SCHOOL.name} website</Link>
      <nav aria-label="School website" className="school-foot-links">
        <Link href="/events">Events</Link>
        <Link href="/admissions/process">Admissions</Link>
        <Link href="/gallery">Gallery</Link>
        <Link href="/contact">Contact the school</Link>
        <a href={`tel:${SCHOOL.phone.tel}`}>{SCHOOL.phone.display}</a>
      </nav>
      <DataSaverToggle on={lite} />
    </footer>
  );
}
