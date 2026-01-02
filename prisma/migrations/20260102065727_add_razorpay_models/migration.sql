-- CreateTable
CREATE TABLE "RazorpaySubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "razorpaySubscriptionId" TEXT NOT NULL,
    "razorpayCustomerId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "shopifyOrderId" TEXT,
    "shopifyContractId" TEXT,
    "customerEmail" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "subscriptionPlanId" TEXT NOT NULL,
    "subscriptionPlanName" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL,
    "lineItemsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RazorpayPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "razorpayPaymentId" TEXT NOT NULL,
    "razorpaySubscriptionId" TEXT NOT NULL,
    "shopifyOrderId" TEXT,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL,
    "paymentDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "RazorpaySubscription_razorpaySubscriptionId_key" ON "RazorpaySubscription"("razorpaySubscriptionId");

-- CreateIndex
CREATE INDEX "RazorpaySubscription_shop_idx" ON "RazorpaySubscription"("shop");

-- CreateIndex
CREATE INDEX "RazorpaySubscription_razorpaySubscriptionId_idx" ON "RazorpaySubscription"("razorpaySubscriptionId");

-- CreateIndex
CREATE INDEX "RazorpaySubscription_razorpayCustomerId_idx" ON "RazorpaySubscription"("razorpayCustomerId");

-- CreateIndex
CREATE INDEX "RazorpaySubscription_shopifyContractId_idx" ON "RazorpaySubscription"("shopifyContractId");

-- CreateIndex
CREATE UNIQUE INDEX "RazorpayPayment_razorpayPaymentId_key" ON "RazorpayPayment"("razorpayPaymentId");

-- CreateIndex
CREATE INDEX "RazorpayPayment_razorpayPaymentId_idx" ON "RazorpayPayment"("razorpayPaymentId");

-- CreateIndex
CREATE INDEX "RazorpayPayment_razorpaySubscriptionId_idx" ON "RazorpayPayment"("razorpaySubscriptionId");

-- CreateIndex
CREATE INDEX "RazorpayPayment_shopifyOrderId_idx" ON "RazorpayPayment"("shopifyOrderId");
