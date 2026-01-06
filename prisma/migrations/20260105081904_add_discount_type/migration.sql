-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SubscriptionPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "sellingPlanGroupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "billingInterval" TEXT NOT NULL,
    "intervalCount" INTEGER NOT NULL,
    "discountType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
    "discountValue" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SubscriptionPlan" ("billingInterval", "createdAt", "discountValue", "id", "intervalCount", "isActive", "name", "sellingPlanGroupId", "shop", "updatedAt") SELECT "billingInterval", "createdAt", "discountValue", "id", "intervalCount", "isActive", "name", "sellingPlanGroupId", "shop", "updatedAt" FROM "SubscriptionPlan";
DROP TABLE "SubscriptionPlan";
ALTER TABLE "new_SubscriptionPlan" RENAME TO "SubscriptionPlan";
CREATE UNIQUE INDEX "SubscriptionPlan_sellingPlanGroupId_key" ON "SubscriptionPlan"("sellingPlanGroupId");
CREATE INDEX "SubscriptionPlan_shop_idx" ON "SubscriptionPlan"("shop");
CREATE INDEX "SubscriptionPlan_sellingPlanGroupId_idx" ON "SubscriptionPlan"("sellingPlanGroupId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
