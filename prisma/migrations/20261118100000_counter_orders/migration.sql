-- Orders placed for a parent at the school counter record which member of staff placed them.
ALTER TABLE "Order" ADD COLUMN "placedById" TEXT;
ALTER TABLE "Order" ADD COLUMN "placedBy" TEXT;
CREATE INDEX "Order_placedById_idx" ON "Order"("placedById");
