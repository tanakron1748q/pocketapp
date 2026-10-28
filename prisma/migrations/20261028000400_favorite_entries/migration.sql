CREATE TABLE "favorite_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amountSatang" INTEGER NOT NULL,
    "description" TEXT,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "favorite_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "favorite_entries_positive_amount" CHECK ("amountSatang" > 0),
    CONSTRAINT "favorite_entries_name_length" CHECK (length(trim("name")) BETWEEN 1 AND 100),
    CONSTRAINT "favorite_entries_description_length" CHECK (length("description") <= 1000)
);

CREATE INDEX "favorite_entries_userId_createdAt_id_idx" ON "favorite_entries"("userId", "createdAt" DESC, "id" DESC);
CREATE INDEX "favorite_entries_categoryId_userId_type_idx" ON "favorite_entries"("categoryId", "userId", "type");

ALTER TABLE "favorite_entries" ADD CONSTRAINT "favorite_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Match the existing Transaction invariant: both owner and type must match the Category.
ALTER TABLE "favorite_entries" ADD CONSTRAINT "favorite_entries_categoryId_userId_type_fkey" FOREIGN KEY ("categoryId", "userId", "type") REFERENCES "categories"("id", "userId", "type") ON DELETE NO ACTION ON UPDATE NO ACTION;
