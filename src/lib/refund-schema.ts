import { transactionSchema } from "./transaction-schema";

export const refundSchema = transactionSchema.pick({ amount: true, date: true, description: true });
