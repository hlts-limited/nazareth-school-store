/* Seed the database: classes, roles, categories, the first Super Admin, and (optionally) demo data.
 * Run with:  npx prisma db seed      (safe to run again — existing rows are kept)
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import { DEFAULT_CLASSES } from "../src/shared/config/school";
import { ROLE_DEFS } from "../src/modules/access-control/permissions";
import { DEFAULT_SETTINGS } from "../src/modules/settings/service";

const db = new PrismaClient();
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

async function main() {
  console.log("Seeding…");

  // Roles
  for (const r of ROLE_DEFS) {
    await db.role.upsert({ where: { id: r.id }, create: { id: r.id, name: r.name, permissions: r.permissions }, update: { name: r.name, permissions: r.permissions } });
  }

  // Classes (promotion order)
  for (const [i, name] of DEFAULT_CLASSES.entries()) {
    await db.class.upsert({ where: { name }, create: { name, sortOrder: i }, update: {} });
  }
  const classes = await db.class.findMany({ orderBy: { sortOrder: "asc" } });

  // Settings
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.setting.upsert({ where: { key }, create: { key, value: value as Prisma.InputJsonValue }, update: {} });
  }

  // Categories
  const cat = async (name: string, color: string, sortOrder: number, parentId?: string, parentSlug?: string) => {
    const s = slug((parentSlug ? parentSlug + "-" : "") + name);
    return db.category.upsert({ where: { slug: s }, create: { name, slug: s, color, sortOrder, parentId }, update: {} });
  };
  const books = await cat("Books", "#D7262D", 1);
  for (const [i, c] of classes.entries()) await cat(c.name, "#D7262D", i, books.id, books.slug);
  const uniforms = await cat("Uniforms", "#2A62A3", 2);
  for (const [i, n] of ["Shirts & Blouses", "Shorts & Skirts", "Sweaters", "Socks & Badges"].entries()) await cat(n, "#2A62A3", i, uniforms.id, uniforms.slug);
  await cat("Sportswear", "#1C7C47", 3);
  await cat("Shoes", "#4A4446", 4);
  await cat("Bags", "#5B45A8", 5);
  const stationery = await cat("Stationery", "#B06A12", 6);
  for (const [i, n] of ["Exercise books", "Writing & art"].entries()) await cat(n, "#B06A12", i, stationery.id, stationery.slug);
  await cat("Accessories", "#0F7C86", 7);

  // First Super Admin
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!2026";
  let admin = await db.user.findUnique({ where: { email } });
  if (!admin) {
    admin = await db.user.create({
      data: { type: "STAFF", status: "ACTIVE", firstName: "School", lastName: "Admin", email, passwordHash: await bcrypt.hash(password, 12), totpSecret: authenticator.generateSecret(), roles: { create: { roleId: "admin" } } },
    });
    // Never print the password on a hosted build: build logs are kept and shared with the project team
    console.log(`\nSuper Admin created: ${email}${process.env.VERCEL ? "" : ` / ${password}`}  (change the password after first sign-in)`);
    console.log(`Super Admin 2FA secret: ${admin.totpSecret}  → add it to an authenticator app now; it's only shown this once.`);
  } else if (!process.env.VERCEL) {
    console.log(`Super Admin 2FA secret: ${admin.totpSecret}  → or run "npm run totp -- ${email}" to see the current code.`);
  }

  if (process.env.SEED_DEMO === "true") await seedDemo(classes);
  console.log("\nDone.");
}

async function seedDemo(classes: { id: string; name: string }[]) {
  if (await db.item.count()) { console.log("Demo items already exist — skipping demo data."); return; }
  console.log("Adding demo items, parents, pupils and orders…");
  const cats = await db.category.findMany();
  const bySlug = (s: string) => cats.find((c) => c.slug === s)!;
  const clsId = (n: string) => classes.find((c) => c.name === n)!.id;

  // Books per class
  const SUBJECTS = {
    early: ["Rhymes & Songs", "Early Numbers", "Colouring Fun", "My First Letters"],
    prep: ["Number Work", "Letter Work", "Phonics Reader", "Writing Practice"],
    primary: ["Mathematics", "English Studies", "Basic Science & Technology", "Social Studies", "Christian Religious Studies", "Quantitative Reasoning", "Verbal Reasoning"],
  };
  let n = 1;
  for (const [ci, c] of classes.entries()) {
    const group = ci < 2 ? "early" : ci < 4 ? "prep" : "primary";
    const base = ci < 2 ? 1800 : ci < 4 ? 2400 : 2900 + (ci - 4) * 250;
    for (const [si, s] of SUBJECTS[group].entries()) {
      const sku = `BOO-${String(n++).padStart(4, "0")}`;
      await db.item.create({
        data: {
          sku, name: `${s} — ${c.name}`, categoryId: bySlug(`books-${slug(c.name)}`).id, price: base + si * 150 + (s === "Mathematics" ? 600 : 0), reorderLevel: 10,
          classes: { create: { classId: c.id, isCompulsory: group !== "primary" || si < 5 } },
          variants: { create: { label: "Standard", sku, onHand: 20 + ((si * 7 + ci * 3) % 30) } },
        },
      });
    }
  }
  const CLOTH = ["Age 3–4", "Age 5–6", "Age 7–8", "Age 9–10", "Age 11–12", "Age 13–14"];
  const SHOE = ["26", "28", "30", "32", "34", "36", "38"];
  const all = classes.map((c) => c.name);
  const OTHER: [string, string, number, string[] | null, boolean, string[]][] = [
    ["Uniform shirt (white, crested)", "uniforms-shirts-blouses", 6500, CLOTH, true, all],
    ["Uniform shorts / pinafore (maroon)", "uniforms-shorts-skirts", 5500, CLOTH, true, all],
    ["School sweater (maroon)", "uniforms-sweaters", 8000, CLOTH, false, all],
    ["White socks (3 pairs)", "uniforms-socks-badges", 2000, null, false, all],
    ["Nazareth crest badge", "uniforms-socks-badges", 800, null, false, all],
    ["House sportswear set", "sportswear", 7500, CLOTH, false, all],
    ["Black school shoes", "shoes", 12000, SHOE, false, all],
    ["School backpack (crested)", "bags", 9500, null, false, all],
    ["Exercise books (pack of 20)", "stationery-exercise-books", 4000, null, true, all],
    ["Stationery pack (pencils, eraser, ruler)", "stationery-writing-art", 3500, null, true, all],
    ["Mathematical set", "stationery-writing-art", 2500, null, false, ["Primary 4", "Primary 5", "Primary 6"]],
    ["Wax crayons (24)", "stationery-writing-art", 1500, null, false, ["Kindergarten", "Pre-Nursery", "Prep 1", "Prep 2"]],
    ["Water bottle (750 ml)", "accessories", 2000, null, false, all],
    ["Lunch box", "accessories", 3000, null, false, all],
  ];
  for (const [name, catSlug, price, sizes, req, forClasses] of OTHER) {
    const sku = `${catSlug.slice(0, 3).toUpperCase()}-${String(n++).padStart(4, "0")}`;
    const labels = sizes ?? ["Standard"];
    await db.item.create({
      data: {
        sku, name, categoryId: bySlug(catSlug).id, price, hasVariants: !!sizes, reorderLevel: sizes ? 4 : 15,
        classes: { create: forClasses.map((cn) => ({ classId: clsId(cn), isCompulsory: req })) },
        variants: { create: labels.map((l, i) => ({ label: l, sku: sizes ? `${sku}-${i + 1}` : sku, onHand: 6 + ((i * 5 + n) % 18), sortOrder: i })) },
      },
    });
  }

  // Demo staff (password "Demo!2026", no 2FA for registrar/secretary; accountant has 2FA)
  const demoPw = await bcrypt.hash("Demo!2026", 12);
  const staff: [string, string, string, string][] = [["Blessing", "Okon", "accounts@example.com", "accountant"], ["Samuel", "Adebayo", "store@example.com", "registrar"], ["Joy", "Nnamdi", "office@example.com", "secretary"]];
  for (const [f, l, e, r] of staff) {
    if (await db.user.findUnique({ where: { email: e } })) continue;
    const u = await db.user.create({ data: { type: "STAFF", status: "ACTIVE", firstName: f, lastName: l, email: e, passwordHash: demoPw, totpSecret: r === "accountant" ? authenticator.generateSecret() : null, roles: { create: { roleId: r } } } });
    console.log(`Demo ${r}: ${e} / Demo!2026${u.totpSecret ? `  (2FA secret ${u.totpSecret})` : ""}`);
  }

  // Demo families
  const fam: [string, string, string, string, [string, string, string][]][] = [
    ["Mrs", "Funke", "Adeyemi", "08034567812", [["Tobi", "NAZ/2019/014", "Primary 4"], ["Kemi", "NAZ/2022/031", "Primary 1"], ["David", "NAZ/2023/047", "Prep 2"]]],
    ["Mr", "Chinedu", "Okafor", "08023344556", [["Adaeze", "NAZ/2017/008", "Primary 6"], ["Chidi", "NAZ/2020/022", "Primary 3"]]],
    ["Mrs", "Aisha", "Bello", "08091122334", [["Zainab", "NAZ/2025/063", "Kindergarten"]]],
    ["Mr", "Emeka", "Nwosu", "08145566778", [["Ifeoma", "NAZ/2018/011", "Primary 5"], ["Obinna", "NAZ/2021/029", "Primary 2"], ["Nneka", "NAZ/2024/055", "Pre-Nursery"]]],
  ];
  for (const [title, first, last, phone, kids] of fam) {
    const p = await db.user.create({ data: { type: "PARENT", status: "ACTIVE", title, firstName: first, lastName: last, phone, email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`, passwordHash: demoPw, consentAt: new Date() } });
    for (const [kf, reg, cn] of kids) {
      await db.pupil.create({ data: { firstName: kf, lastName: last, regNumber: reg, classId: clsId(cn), guardians: { create: { parentId: p.id } }, wallet: { create: {} } } });
    }
  }
  console.log("Demo parents: funke.adeyemi@example.com (or 08034567812) / Demo!2026 — pupils sign in with surname + reg number, e.g. Adeyemi + NAZ/2019/014");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
