-- Clock-ins refused because of the phone's location (kept 90 days)
CREATE TABLE "ClockAttempt" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "accuracyM" DOUBLE PRECISION,
    "distanceM" INTEGER,
    "branch" TEXT,
    "reason" TEXT NOT NULL,
    "flags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClockAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClockAttempt_employeeId_createdAt_idx" ON "ClockAttempt"("employeeId", "createdAt");
CREATE INDEX "ClockAttempt_createdAt_idx" ON "ClockAttempt"("createdAt");

ALTER TABLE "ClockAttempt" ADD CONSTRAINT "ClockAttempt_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
