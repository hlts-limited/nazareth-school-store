import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters"),
  DATABASE_URL: z.string().min(1),
  STORAGE_DIR: z.string().default("./storage"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_PUBLIC_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Nazareth School Store <store@example.com>"),
  TERMII_API_KEY: z.string().optional(),
  TERMII_SENDER_ID: z.string().default("NazSchool"),
  BACKUP_PASSWORD: z.string().min(8, "BACKUP_PASSWORD must be at least 8 characters"),
  CRON_SECRET: z.string().min(8).optional(),
  // The owner (first Super Admin, created by the seed): hidden from Staff & roles and can't be changed there
  SEED_ADMIN_EMAIL: z.string().trim().toLowerCase().optional(),
});

let cached: z.infer<typeof schema> | null = null;

/** Validated environment variables. Throws a readable error if something required is missing. */
export function env() {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Missing or invalid environment variables. Check your .env file:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const isProd = () => process.env.NODE_ENV === "production";
