-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "sellingPlanGroupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "billingInterval" TEXT NOT NULL,
    "intervalCount" INTEGER NOT NULL,
    "discountValue" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_sellingPlanGroupId_key" ON "SubscriptionPlan"("sellingPlanGroupId");

-- CreateIndex
CREATE INDEX "SubscriptionPlan_shop_idx" ON "SubscriptionPlan"("shop");

-- CreateIndex
CREATE INDEX "SubscriptionPlan_sellingPlanGroupId_idx" ON "SubscriptionPlan"("sellingPlanGroupId");
