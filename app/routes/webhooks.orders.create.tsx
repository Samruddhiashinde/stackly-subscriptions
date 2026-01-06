import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  getOrCreateRazorpayCustomer,
  createRazorpayPlan,
  createRazorpaySubscription,
  saveRazorpaySubscription,
} from "../lib/razorpay.server";
import { sendSubscriptionSetupEmail } from "../lib/email.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, admin } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  if (!admin) {
    console.log("Admin API not available for this webhook");
    return new Response("OK", { status: 200 });
  }

  try {
    const body = await request.json();
    const orderId = body.admin_graphql_api_id;

    if (!orderId) {
      console.log("No order ID found in webhook payload");
      return new Response("OK", { status: 200 });
    }

    // Fetch order details with subscription contract information
    const orderQuery = `#graphql
      query getOrder($id: ID!) {
        order(id: $id) {
          id
          name
          email
          customer {
            id
            email
            firstName
            lastName
          }
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          lineItems(first: 10) {
            edges {
              node {
                id
                title
                quantity
                variant {
                  id
                  title
                  price
                }
                sellingPlan {
                  id
                  name
                  sellingPlanGroup {
                    id
                    name
                  }
                }
              }
            }
          }
          subscriptionContracts(first: 1) {
            edges {
              node {
                id
                status
                billingPolicy {
                  ... on SubscriptionBillingPolicy {
                    interval
                    intervalCount
                  }
                }
              }
            }
          }
        }
      }
    `;

    const orderResponse = await admin.graphql(orderQuery, {
      variables: { id: orderId },
    });

    const orderData = await orderResponse.json();
    const order = orderData.data?.order;

    if (!order) {
      console.log("Order not found");
      return new Response("OK", { status: 200 });
    }

    // Check if this is a subscription order
    const subscriptionLineItem = order.lineItems.edges.find(
      (edge: { node: { sellingPlan?: { id: string; sellingPlanGroup?: { id: string } } } }) => edge.node.sellingPlan
    );

    if (!subscriptionLineItem) {
      console.log("Not a subscription order, skipping");
      return new Response("OK", { status: 200 });
    }

    // Check if we've already processed this order
    const existingSubscription = await prisma.razorpaySubscription.findFirst({
      where: {
        shopifyOrderId: order.id,
        shop: shop,
      },
    });

    if (existingSubscription) {
      console.log("Order already processed for Razorpay subscription");
      return new Response("OK", { status: 200 });
    }

    const sellingPlan = subscriptionLineItem.node.sellingPlan;
    const sellingPlanGroup = sellingPlan.sellingPlanGroup;
    const customer = order.customer;

    // Get subscription plan from database
    const subscriptionPlan = await prisma.subscriptionPlan.findUnique({
      where: {
        sellingPlanGroupId: sellingPlanGroup.id,
      },
    });

    if (!subscriptionPlan) {
      console.log("Subscription plan not found in database");
      return new Response("OK", { status: 200 });
    }

    // Get subscription contract if available
    const subscriptionContract = order.subscriptionContracts?.edges?.[0]?.node;

    // Calculate amount in paise (Razorpay uses smallest currency unit)
    const amount = parseFloat(order.totalPriceSet.shopMoney.amount);
    const amountInPaise = Math.round(amount * 100);

    // Get customer details
    const customerEmail = customer?.email || order.email;
    const customerName = customer
      ? `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || customerEmail
      : order.email;

    // Create or get Razorpay customer
    const razorpayCustomerId = await getOrCreateRazorpayCustomer(
      customerEmail,
      customerName
    );

    // Map Shopify billing interval to Razorpay interval
    const intervalMap: Record<string, "daily" | "weekly" | "monthly" | "yearly"> = {
      DAY: "daily",
      WEEK: "weekly",
      MONTH: "monthly",
      YEAR: "yearly",
    };

    const razorpayInterval = intervalMap[subscriptionPlan.billingInterval] || "monthly";

    // Create Razorpay plan
    const razorpayPlan = await createRazorpayPlan(
      subscriptionPlan.name,
      amountInPaise,
      razorpayInterval,
      subscriptionPlan.intervalCount
    );

    // Create Razorpay subscription (autopay setup)
    // Use 0 for infinite billing cycles, or calculate based on subscription contract
    const totalCount = 0; // Infinite subscription

    const razorpaySubscription = await createRazorpaySubscription(
      razorpayCustomerId,
      razorpayPlan.id,
      totalCount
    );

    // Save line items as JSON
    const lineItemsJson = JSON.stringify(
      order.lineItems.edges.map((edge: { node: { title: string; quantity: number; variant: { id: string; price: string } } }) => ({
        title: edge.node.title,
        quantity: edge.node.quantity,
        variantId: edge.node.variant.id,
        price: edge.node.variant.price,
      }))
    );

    // Save to database
    await saveRazorpaySubscription({
      razorpaySubscriptionId: razorpaySubscription.id,
      razorpayCustomerId: razorpayCustomerId,
      shop: shop,
      shopifyOrderId: order.id,
      shopifyContractId: subscriptionContract?.id || null,
      customerEmail: customerEmail,
      customerName: customerName,
      subscriptionPlanId: subscriptionPlan.id,
      subscriptionPlanName: subscriptionPlan.name,
      amount: amount,
      currency: order.totalPriceSet.shopMoney.currencyCode || "INR",
      status: razorpaySubscription.status,
      lineItemsJson: lineItemsJson,
    });

    // Send email notification
    await sendSubscriptionSetupEmail(
      customerName,
      customerEmail,
      subscriptionPlan.name,
      razorpaySubscription.id
    );

    console.log(
      `Razorpay subscription created: ${razorpaySubscription.id} for order ${order.id}`
    );

    // Add a note to the order with a link to view/edit the subscription plan
    const planLink = `/apps/stackly-subscriptions-2/app?planId=${sellingPlanGroup.id}`;
    const orderNote = `Subscription Plan: ${subscriptionPlan.name}\nView/Edit Plan: ${planLink}`;

    // Update order with note containing the link
    try {
      const updateOrderMutation = `#graphql
        mutation orderUpdate($input: OrderInput!) {
          orderUpdate(input: $input) {
            order {
              id
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      await admin.graphql(updateOrderMutation, {
        variables: {
          input: {
            id: order.id,
            note: orderNote,
          },
        },
      });
    } catch (error) {
      console.error("Error updating order note:", error);
      // Don't fail the webhook if note update fails
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Error processing order webhook:", error);
    return new Response("Error", { status: 500 });
  }
};

