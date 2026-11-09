-- Indexes for a school of 4,000 pupils and 5,000 items: lookups that would otherwise read whole tables
CREATE INDEX "ItemClass_classId_idx" ON "ItemClass"("classId");
CREATE INDEX "ItemVariant_itemId_idx" ON "ItemVariant"("itemId");
CREATE INDEX "OrderLine_variantId_idx" ON "OrderLine"("variantId");
CREATE INDEX "Guardian_pupilId_idx" ON "Guardian"("pupilId");
CREATE INDEX "Receipt_paymentId_idx" ON "Receipt"("paymentId");
CREATE INDEX "Pickup_orderId_idx" ON "Pickup"("orderId");
