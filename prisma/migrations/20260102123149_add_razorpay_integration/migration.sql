-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RazorpayPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "razorpayPaymentId" TEXT NOT NULL,
    "razorpaySubscriptionId" TEXT NOT NULL,
    "shopifyOrderId" TEXT,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL,
    "paymentDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RazorpayPayment_razorpaySubscriptionId_fkey" FOREIGN KEY ("razorpaySubscriptionId") REFERENCES "RazorpaySubscription" ("razorpaySubscriptionId") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_RazorpayPayment" ("amount", "createdAt", "currency", "id", "paymentDate", "razorpayPaymentId", "razorpaySubscriptionId", "shopifyOrderId", "status", "updatedAt") SELECT "amount", "createdAt", "currency", "id", "paymentDate", "razorpayPaymentId", "razorpaySubscriptionId", "shopifyOrderId", "status", "updatedAt" FROM "RazorpayPayment";
DROP TABLE "RazorpayPayment";
ALTER TABLE "new_RazorpayPayment" RENAME TO "RazorpayPayment";
CREATE UNIQUE INDEX "RazorpayPayment_razorpayPaymentId_key" ON "RazorpayPayment"("razorpayPaymentId");
CREATE INDEX "RazorpayPayment_razorpayPaymentId_idx" ON "RazorpayPayment"("razorpayPaymentId");
CREATE INDEX "RazorpayPayment_razorpaySubscriptionId_idx" ON "RazorpayPayment"("razorpaySubscriptionId");
CREATE INDEX "RazorpayPayment_shopifyOrderId_idx" ON "RazorpayPayment"("shopifyOrderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
