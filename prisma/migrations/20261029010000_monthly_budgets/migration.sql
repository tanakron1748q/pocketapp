CREATE TYPE "BudgetScope" AS ENUM ('DEFAULT', 'MONTH');

CREATE TABLE "budget_settings" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "categoryType" "TransactionType" NOT NULL DEFAULT 'EXPENSE',
  "month" DATE NOT NULL,
  "scope" "BudgetScope" NOT NULL,
  "amountSatang" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "budget_settings_nonnegative_amount" CHECK ("amountSatang" >= 0),
  CONSTRAINT "budget_settings_month_start" CHECK (EXTRACT(DAY FROM "month") = 1 AND "month" >= DATE '0001-01-01' AND "month" < DATE '10000-01-01'),
  CONSTRAINT "budget_settings_expense_only" CHECK ("categoryType" = 'EXPENSE'),
  CONSTRAINT "budget_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "budget_settings_categoryId_userId_categoryType_fkey" FOREIGN KEY ("categoryId", "userId", "categoryType")
    REFERENCES "categories"("id", "userId", "type") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "budget_settings_userId_categoryId_month_scope_key" ON "budget_settings"("userId", "categoryId", "month", "scope");
CREATE INDEX "budget_settings_categoryId_userId_categoryType_idx" ON "budget_settings"("categoryId", "userId", "categoryType");
