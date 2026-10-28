CREATE UNIQUE INDEX "transactions_id_userId_type_key" ON "transactions"("id", "userId", "type");

CREATE TABLE "refunds" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "expenseId" TEXT NOT NULL,
  "expenseType" "TransactionType" NOT NULL DEFAULT 'EXPENSE',
  "amountSatang" INTEGER NOT NULL CHECK ("amountSatang" > 0),
  "date" DATE NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "refunds_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "refunds_expense_only" CHECK ("expenseType" = 'EXPENSE'),
  CONSTRAINT "refunds_expenseId_userId_expenseType_fkey"
    FOREIGN KEY ("expenseId", "userId", "expenseType")
    REFERENCES "transactions"("id", "userId", "type") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX "refunds_expenseId_userId_expenseType_idx" ON "refunds"("expenseId", "userId", "expenseType");
CREATE INDEX "refunds_userId_date_idx" ON "refunds"("userId", "date");
