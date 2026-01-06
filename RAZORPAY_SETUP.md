# Razorpay Integration Setup

This document describes the Razorpay integration for automatic subscription payments and Shopify order synchronization.

## Overview

The integration automatically:

1. Creates Razorpay autopay subscriptions when a customer places their first subscription order
2. Syncs Razorpay payment events with Shopify by creating orders automatically
3. Sends email notifications for subscription setup and payments

## Environment Variables

Add the following environment variables to your `.env` file:

### Razorpay Credentials

```env
RAZORPAY_KEY_ID=rzp_test_RwlGdxlfk1KfzR
RAZORPAY_KEY_SECRET=7NbopFDVr6CADgSB5sXny3IJ
```

### Email Configuration (for notifications)

```env
# Email service configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=your-email@gmail.com

# Email recipient for notifications
NOTIFICATION_EMAIL=samruddhi@sorted.agency
```

**Note:** If using Gmail, you'll need to generate an [App Password](https://support.google.com/accounts/answer/185833) instead of your regular password.

## Webhook Setup

### Shopify Webhook

The Shopify order webhook is automatically configured in `shopify.app.toml`:

- **Topic:** `orders/create`
- **URI:** `/webhooks/orders/create`

This webhook triggers when a customer places an order with a subscription plan.

### Razorpay Webhook

You need to configure the Razorpay webhook in your Razorpay dashboard:

1. Log in to [Razorpay Dashboard](https://dashboard.razorpay.com/)
2. Go to **Settings** → **Webhooks**
3. Click **Add New Webhook**
4. Set the webhook URL to: `https://your-app-url.com/webhooks/razorpay`
5. Select the following events:
   - `payment.authorized`
   - `payment.captured`
6. Save the webhook

**Important:** Make sure your app URL is publicly accessible for Razorpay to send webhooks.

## How It Works

### First-Time Subscription Order

1. Customer places a subscription order on Shopify
2. Shopify sends `orders/create` webhook to your app
3. App detects it's a subscription order (has selling plan)
4. App creates/retrieves Razorpay customer
5. App creates Razorpay plan based on subscription details
6. App creates Razorpay subscription (autopay setup)
7. App saves subscription details to database
8. App sends email notification to `NOTIFICATION_EMAIL`

### Recurring Payments

1. Razorpay automatically charges the customer based on subscription schedule
2. Razorpay sends `payment.captured` webhook to your app
3. App verifies webhook signature
4. App retrieves subscription details from database
5. App creates a new Shopify order with the same line items
6. App saves payment record to database
7. App sends email notification with order details

## Database Models

The integration uses two main database models:

### RazorpaySubscription

Stores subscription details linking Shopify and Razorpay:

- `razorpaySubscriptionId`: Razorpay subscription ID
- `shopifyOrderId`: First Shopify order ID
- `shopifyContractId`: Shopify subscription contract ID
- Customer and plan information

### RazorpayPayment

Stores individual payment records:

- `razorpayPaymentId`: Razorpay payment ID
- `shopifyOrderId`: Created Shopify order ID (for recurring payments)
- Payment amount, status, and date

## Testing

### Test Shopify Order Webhook

1. Create a subscription plan in your Shopify admin
2. Place a test order with that subscription plan
3. Check logs for Razorpay subscription creation
4. Verify email notification received

### Test Razorpay Webhook

1. Use Razorpay's webhook testing tool in dashboard
2. Or manually trigger a payment event
3. Check logs for Shopify order creation
4. Verify email notification received

## Troubleshooting

### Webhook Not Receiving Events

- Verify webhook URL is publicly accessible
- Check Razorpay webhook configuration in dashboard
- Verify webhook signature validation (check logs)

### Shopify Order Not Created

- Check if payment status is "captured" (only captured payments create orders)
- Verify subscription exists in database
- Check Shopify API authentication (offline session)

### Email Not Sending

- Verify SMTP credentials are correct
- Check SMTP server allows connections
- For Gmail, ensure App Password is used (not regular password)

## Security Notes

- Razorpay webhook signature is verified for all incoming webhooks
- Shopify webhooks are authenticated using Shopify's webhook verification
- Store sensitive credentials in environment variables, never in code
- Use HTTPS for all webhook endpoints in production
