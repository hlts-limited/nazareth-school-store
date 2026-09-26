-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "isPile" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "OrderLine" ADD COLUMN     "pileItemId" TEXT,
ADD COLUMN     "pileName" TEXT,
ADD COLUMN     "reserved" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "PilePart" (
    "id" TEXT NOT NULL,
    "pileId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PilePart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PilePart_bookId_idx" ON "PilePart"("bookId");

-- CreateIndex
CREATE UNIQUE INDEX "PilePart_pileId_bookId_key" ON "PilePart"("pileId", "bookId");

-- AddForeignKey
ALTER TABLE "PilePart" ADD CONSTRAINT "PilePart_pileId_fkey" FOREIGN KEY ("pileId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilePart" ADD CONSTRAINT "PilePart_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
