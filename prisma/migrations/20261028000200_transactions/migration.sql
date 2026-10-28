-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "name" TEXT NOT NULL,
    "starterKey" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amountSatang" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_userId_starterKey_key" ON "categories"("userId", "starterKey");

-- CreateIndex
CREATE UNIQUE INDEX "categories_id_userId_type_key" ON "categories"("id", "userId", "type");

-- CreateIndex
CREATE INDEX "transactions_userId_date_createdAt_id_idx" ON "transactions"("userId", "date" DESC, "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "transactions_categoryId_userId_type_idx" ON "transactions"("categoryId", "userId", "type");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_categoryId_userId_type_fkey" FOREIGN KEY ("categoryId", "userId", "type") REFERENCES "categories"("id", "userId", "type") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- Money is stored in positive integer satang, never floating point.
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_positive_amount" CHECK ("amountSatang" > 0);
