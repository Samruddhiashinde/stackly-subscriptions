import type { ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import {
  verifyRazorpayWebhookSignature,
  saveRazorpayPayment,
} from "../lib/razorpay.server";
import { createShopifyOrder } from "../lib/shopify-orders.server";
import { sendSubscriptionPaymentEmail } from "../lib/email.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // Razorpay webhooks don't use Shopify authentication
  const body = await request.text();
  const signature = request.headers.get("X-Razorpay-Signature") || "";

  const keySecret = process.env.RAZORPAY_KEY_SECRET || "7NbopFDVr6CADgSB5sXny3IJ";

  // Verify webhook signature
  const isValid = verifyRazorpayWebhookSignature(body, signature, keySecret);

  if (!isValid) {
    console.error("Invalid Razorpay webhook signature");
    return new Response("Invalid signature", { status: 401 });
  }

  try {
    const payload = JSON.parse(body);
    const event = payload.event;

    console.log(`Received Razorpay webhook: ${event}`);

    // Handle payment.authorized or payment.captured events
    if (event === "payment.authorized" || event === "payment.captured") {
      const payment = payload.payload.payment.entity;

      if (!payment) {
        console.log("No payment entity in webhook payload");
        return new Response("OK", { status: 200 });
      }

      // Check if payment is for a subscription
      if (!payment.subscription_id) {
        console.log("Payment is not for a subscription");
        return new Response("OK", { status: 200 });
      }

      const subscriptionId = payment.subscription_id;

      // Get subscription from database
      const razorpaySubscription = await prisma.razorpaySubscription.findUnique({
        where: {
          razorpaySubscriptionId: subscriptionId,
        },
      });

      if (!razorpaySubscription) {
        console.log(`Subscription not found in database: ${subscriptionId}`);
        return new Response("OK", { status: 200 });
      }

      // Check if payment already processed
      const existingPayment = await prisma.razorpayPayment.findUnique({
        where: {
          razorpayPaymentId: payment.id,
        },
      });

      if (existingPayment) {
        console.log(`Payment already processed: ${payment.id}`);
        return new Response("OK", { status: 200 });
      }

      // Only process captured payments (successful payments)
      if (payment.status === "captured" && event === "payment.captured") {
        // Get Shopify Admin API for the shop
        const { getShopifyAdminForShop } = await import("../lib/shopify-admin.server");

        let admin;
        try {
          admin = await getShopifyAdminForShop(razorpaySubscription.shop);
        } catch (error) {
          console.error(`Failed to get Shopify admin for shop ${razorpaySubscription.shop}:`, error);
          return new Response("OK", { status: 200 });
        }

        if (!admin) {
          console.error("Failed to authenticate with Shopify");
          return new Response("OK", { status: 200 });
        }

        // Parse line items from JSON
        const lineItems = razorpaySubscription.lineItemsJson
          ? JSON.parse(razorpaySubscription.lineItemsJson)
          : [];

        if (lineItems.length === 0) {
          console.error("No line items found for subscription");
          return new Response("OK", { status: 200 });
        }

        // Create Shopify order
        const shopifyOrderId = await createShopifyOrder(admin, {
          customerEmail: razorpaySubscription.customerEmail,
          customerName: razorpaySubscription.customerName,
          lineItems: lineItems.map((item: { variantId: string; quantity: number; price: string | number }) => ({
            variantId: item.variantId,
            quantity: item.quantity,
            price: typeof item.price === 'string' ? parseFloat(item.price) : item.price,
          })),
          note: `Auto-generated from Razorpay subscription payment. Payment ID: ${payment.id}`,
        });

        if (shopifyOrderId) {
          // Save payment to database
          await saveRazorpayPayment({
            razorpayPaymentId: payment.id,
            razorpaySubscriptionId: subscriptionId,
            shopifyOrderId: shopifyOrderId,
            amount: payment.amount / 100, // Convert from paise to rupees
            currency: payment.currency || "INR",
            status: payment.status,
            paymentDate: new Date(payment.created_at * 1000),
          });

          // Update subscription with new order ID if this is the first payment
          if (!razorpaySubscription.shopifyOrderId) {
            await prisma.razorpaySubscription.update({
              where: {
                id: razorpaySubscription.id,
              },
              data: {
                shopifyOrderId: shopifyOrderId,
              },
            });
          }

          // Send email notification
          await sendSubscriptionPaymentEmail(
            razorpaySubscription.customerName,
            razorpaySubscription.customerEmail,
            razorpaySubscription.subscriptionPlanName,
            payment.amount / 100,
            payment.currency || "INR",
            shopifyOrderId
          );

          console.log(
            `Shopify order created: ${shopifyOrderId} for Razorpay payment: ${payment.id}`
          );
        } else {
          console.error("Failed to create Shopify order");
        }
      }

      // Save payment record even if not captured yet (for tracking)
      if (!existingPayment) {
        await saveRazorpayPayment({
          razorpayPaymentId: payment.id,
          razorpaySubscriptionId: subscriptionId,
          amount: payment.amount / 100,
          currency: payment.currency || "INR",
          status: payment.status,
          paymentDate: new Date(payment.created_at * 1000),
        });
      }
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Error processing Razorpay webhook:", error);
    return new Response("Error", { status: 500 });
  }
};

