-- One wallet per parent (shared by all their children), and returns approved by Accounts.

-- 1. Wallets now belong to parents. Old per-pupil wallets keep pupilId; their entries move to the parent's wallet.
ALTER TABLE "Wallet" ALTER COLUMN "pupilId" DROP NOT NULL;
ALTER TABLE "Wallet" ADD COLUMN "parentId" TEXT;
CREATE UNIQUE INDEX "Wallet_parentId_key" ON "Wallet"("parentId");
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A wallet for every parent who has a child with wallet entries
INSERT INTO "Wallet" ("id", "parentId")
SELECT gen_random_uuid()::text, p."parentId"
FROM (
  SELECT DISTINCT ON (w."pupilId") w."pupilId", g."parentId"
  FROM "Wallet" w JOIN "Guardian" g ON g."pupilId" = w."pupilId"
  WHERE w."pupilId" IS NOT NULL AND EXISTS (SELECT 1 FROM "WalletTransaction" t WHERE t."walletId" = w."id")
  ORDER BY w."pupilId", g."isPrimary" DESC, g."parentId"
) p
GROUP BY p."parentId";

-- Move each child's entries to their (primary) parent's wallet
UPDATE "WalletTransaction" t
SET "walletId" = pw."id",
    "reason" = COALESCE(t."reason", '') || CASE WHEN t."reason" IS NULL OR t."reason" = '' THEN '' ELSE ' · ' END || 'was ' || pu."firstName" || '''s wallet'
FROM "Wallet" w
JOIN LATERAL (
  SELECT g."parentId" FROM "Guardian" g WHERE g."pupilId" = w."pupilId" ORDER BY g."isPrimary" DESC, g."parentId" LIMIT 1
) gp ON true
JOIN "Wallet" pw ON pw."parentId" = gp."parentId"
JOIN "Pupil" pu ON pu."id" = w."pupilId"
WHERE t."walletId" = w."id" AND w."pupilId" IS NOT NULL;

-- Old pupil wallets that are now empty are no longer needed
DELETE FROM "Wallet" w WHERE w."pupilId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "WalletTransaction" t WHERE t."walletId" = w."id");

-- 2. Returns
ALTER TYPE "WalletTxType" ADD VALUE 'RETURN_CREDIT';
ALTER TABLE "OrderLine" ADD COLUMN "handedOutAt" TIMESTAMP(3);
ALTER TABLE "OrderLine" ADD COLUMN "returnedQty" INTEGER NOT NULL DEFAULT 0;
-- Lines already collected: the order's last pick-up is when they were collected
UPDATE "OrderLine" l SET "handedOutAt" = (SELECT MAX(p."createdAt") FROM "Pickup" p WHERE p."orderId" = l."orderId") WHERE l."status" = 'HANDED_OUT';

CREATE TYPE "ReturnStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TABLE "ReturnRequest" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "resellable" BOOLEAN NOT NULL DEFAULT true,
    "status" "ReturnStatus" NOT NULL DEFAULT 'PENDING',
    "recordedById" TEXT NOT NULL,
    "recordedBy" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReturnRequest_status_createdAt_idx" ON "ReturnRequest"("status", "createdAt");
CREATE INDEX "ReturnRequest_orderId_idx" ON "ReturnRequest"("orderId");
CREATE INDEX "ReturnRequest_lineId_idx" ON "ReturnRequest"("lineId");
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "OrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
