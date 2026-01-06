import Razorpay from "razorpay";
import prisma from "../db.server";

// Initialize Razorpay instance
export function getRazorpayInstance() {
  const keyId = process.env.RAZORPAY_KEY_ID || "rzp_test_RwlGdxlfk1KfzR";
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "7NbopFDVr6CADgSB5sXny3IJ";

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

// Create or get Razorpay customer
export async function getOrCreateRazorpayCustomer(
  email: string,
  name: string,
  contact?: string
): Promise<string> {
  const razorpay = getRazorpayInstance();

  try {
    // Try to find existing customer by email
    const customers = await razorpay.customers.all({
      count: 100,
    });

    const existingCustomer = customers.items.find(
      (customer) => customer.email === email
    );

    if (existingCustomer) {
      return existingCustomer.id;
    }

    // Create new customer
    const customer = await razorpay.customers.create({
      name,
      email,
      contact: contact || "",
    });

    return customer.id;
  } catch (error) {
    console.error("Error creating/getting Razorpay customer:", error);
    throw error;
  }
}

// Create Razorpay subscription (autopay setup)
export async function createRazorpaySubscription(
  customerId: string,
  planId: string,
  totalCount: number, // Total number of billing cycles (0 for infinite)
  startAt?: number // Unix timestamp for when subscription should start
): Promise<any> {
  const razorpay = getRazorpayInstance();

  try {
    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      customer_notify: 1,
      total_count: totalCount,
      start_at: startAt || Math.floor(Date.now() / 1000),
      notes: {
        source: "shopify_subscription",
      },
    });

    return subscription;
  } catch (error) {
    console.error("Error creating Razorpay subscription:", error);
    throw error;
  }
}

// Create Razorpay plan
export async function createRazorpayPlan(
  planName: string,
  amount: number, // Amount in paise (smallest currency unit)
  interval: "daily" | "weekly" | "monthly" | "yearly",
  intervalCount: number = 1
): Promise<any> {
  const razorpay = getRazorpayInstance();

  try {
    const plan = await razorpay.plans.create({
      period: interval,
      interval: intervalCount,
      item: {
        name: planName,
        amount: amount,
        currency: "INR",
        description: `Subscription plan: ${planName}`,
      },
      notes: {
        source: "shopify_subscription",
      },
    });

    return plan;
  } catch (error) {
    console.error("Error creating Razorpay plan:", error);
    throw error;
  }
}

// Get subscription details
export async function getRazorpaySubscription(
  subscriptionId: string
): Promise<any> {
  const razorpay = getRazorpayInstance();

  try {
    const subscription = await razorpay.subscriptions.fetch(subscriptionId);
    return subscription;
  } catch (error) {
    console.error("Error fetching Razorpay subscription:", error);
    throw error;
  }
}

// Verify webhook signature
export function verifyRazorpayWebhookSignature(
  webhookBody: string,
  signature: string,
  secret: string
): boolean {
  const crypto = require("crypto");
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(webhookBody)
    .digest("hex");

  return expectedSignature === signature;
}

// Save Razorpay subscription to database
export async function saveRazorpaySubscription(
  data: {
    razorpaySubscriptionId: string;
    razorpayCustomerId: string;
    shop: string;
    shopifyOrderId?: string;
    shopifyContractId?: string;
    customerEmail: string;
    customerName: string;
    subscriptionPlanId: string;
    subscriptionPlanName: string;
    amount: number;
    currency?: string;
    status: string;
    lineItemsJson?: string;
  }
) {
  return await prisma.razorpaySubscription.create({
    data: {
      razorpaySubscriptionId: data.razorpaySubscriptionId,
      razorpayCustomerId: data.razorpayCustomerId,
      shop: data.shop,
      shopifyOrderId: data.shopifyOrderId || null,
      shopifyContractId: data.shopifyContractId || null,
      customerEmail: data.customerEmail,
      customerName: data.customerName,
      subscriptionPlanId: data.subscriptionPlanId,
      subscriptionPlanName: data.subscriptionPlanName,
      amount: data.amount,
      currency: data.currency || "INR",
      status: data.status,
      lineItemsJson: data.lineItemsJson || null,
    },
  });
}

// Save Razorpay payment to database
export async function saveRazorpayPayment(
  data: {
    razorpayPaymentId: string;
    razorpaySubscriptionId: string;
    shopifyOrderId?: string;
    amount: number;
    currency?: string;
    status: string;
    paymentDate: Date;
  }
) {
  return await prisma.razorpayPayment.create({
    data: {
      razorpayPaymentId: data.razorpayPaymentId,
      razorpaySubscriptionId: data.razorpaySubscriptionId,
      shopifyOrderId: data.shopifyOrderId || null,
      amount: data.amount,
      currency: data.currency || "INR",
      status: data.status,
      paymentDate: data.paymentDate,
    },
  });
}

