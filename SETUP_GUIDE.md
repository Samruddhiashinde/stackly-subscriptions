# Step-by-Step Setup Guide for Razorpay Integration

This guide will walk you through setting up the Razorpay integration step by step. Don't worry if you're new to Shopify app development - we'll explain everything!

## Prerequisites

Before we start, make sure you have:

- ✅ A Shopify app already set up (which you have)
- ✅ Razorpay account with test credentials (you provided these)

---

## Step 1: Set Up Environment Variables

Environment variables store sensitive information like API keys. We need to add them to your project.

### 1.1 Create or Edit `.env` File

1. In your project folder (`stackly-subscriptions`), look for a file named `.env`
2. If it doesn't exist, create a new file named `.env` (with the dot at the beginning)
3. Open the `.env` file in a text editor

### 1.2 Add Razorpay Credentials

Add these lines to your `.env` file:

```env
# Razorpay Credentials (you already have these)
RAZORPAY_KEY_ID=rzp_test_RwlGdxlfk1KfzR
RAZORPAY_KEY_SECRET=7NbopFDVr6CADgSB5sXny3IJ
```

**What this does:** These are your Razorpay API keys that allow your app to talk to Razorpay.

### 1.3 About Shopify Variables

**Good news!** If you're using Shopify CLI (which you are), the Shopify environment variables are automatically managed for you when you run `shopify app dev`. You don't need to manually add:

- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_APP_URL`
- `SCOPES`

These are automatically set by the Shopify CLI when you start your development server.

**Note:** If you see these variables in your `.env` file, that's fine - just don't delete them. If you don't see them, that's also fine - the Shopify CLI handles them automatically.

**What to do:** Just make sure you have the Razorpay credentials added (from Step 1.2 above), and you're all set!

---

## Step 2: Update Your Database

The database needs new tables to store Razorpay subscription and payment information.

### 2.1 Run Database Migration

Open your terminal/command prompt in the project folder and run:

```bash
npx prisma migrate dev --name add_razorpay_integration
```

**What this does:** This creates the database tables needed to store Razorpay subscription and payment data.

**If you see an error:** Make sure you're in the project folder (`stackly-subscriptions`). You can check by running `pwd` (Mac/Linux) or `cd` (Windows).

### 2.2 Verify Migration

After the migration completes, you should see a message like "Migration applied successfully".

**What to check:**

- No error messages
- New migration file created in `prisma/migrations/` folder

---

## Step 3: Update Shopify App Scopes

Your app needs permission to read and create orders. The scopes are already configured in your `shopify.app.toml` file.

### 3.1 Check Your App Configuration

The file `shopify.app.toml` has been updated with these scopes:

- `write_products` - Create and update products
- `write_purchase_options` - Manage subscription plans
- `write_orders` - Create orders
- `read_orders` - Read orders
- `write_customers` - Create customers
- `read_customers` - Read customers

### 3.2 Deploy the Updated Scopes

For custom apps, scopes are managed through the `shopify.app.toml` file. To apply the new scopes:

1. **If you're in development mode:**
   - The scopes will be automatically requested when you run `shopify app dev`
   - When you access the app, Shopify will prompt you to approve the new scopes
   - Click **Approve** when prompted

2. **If you need to deploy to update scopes:**
   - Run this command in your terminal:
     ```bash
     shopify app deploy
     ```
   - This will sync your scopes with Shopify
   - The store owner will need to approve the new scopes when they use the app

**What this does:** Gives your app permission to create orders and manage customers in Shopify.

**Note:** The page you see in Shopify admin (Settings → Apps → Stackly Subscriptions) shows the app installation details, but scopes are managed through the configuration file and deployment process, not through that page.

---

## Step 4: Set Up Razorpay Webhook

Razorpay needs to send payment notifications to your app. We need to configure this in Razorpay's dashboard.

### 4.1 Get Your App URL

When you run `shopify app dev`, Shopify CLI automatically creates a public URL for your app. Here's how to find it:

**Look in your terminal output for a line that says:**

```
app_home │ └ Using URL: https://something.trycloudflare.com
```

**Or look for:**

```
Preview URL: https://your-store.myshopify.com/admin/oauth/redirect_from_cli?client_id=...
```

The URL you need is the one that shows `Using URL:` - it will look like:

- `https://favorites-workers-factory-flowers.trycloudflare.com` (example)
- Or similar with `.trycloudflare.com` or `.ngrok.io`

**Important:** This URL changes each time you restart `shopify app dev`, so you'll need to update the Razorpay webhook URL if you restart the dev server.

**If deployed to production:**

- Use your production URL (e.g., `https://your-app.com`)

### 4.2 Configure Webhook in Razorpay

1. Log in to [Razorpay Dashboard](https://dashboard.razorpay.com/)
2. Go to **Settings** (gear icon in top right)
3. Click on **Webhooks** in the left sidebar
4. Click **+ Add New Webhook**
5. Fill in the details:
   - **Webhook URL:** Use the URL from Step 4.1 and add `/webhooks/razorpay` at the end

     **Example:** If your app URL is `https://favorites-workers-factory-flowers.trycloudflare.com`

     Then your webhook URL is: `https://favorites-workers-factory-flowers.trycloudflare.com/webhooks/razorpay`

   - **Secret:** Leave empty (we verify using key secret)
   - **Active Events:** Select these:
     - ✅ `payment.authorized`
     - ✅ `payment.captured`

6. Click **Create Webhook**

**What this does:** Tells Razorpay to send payment notifications to your app whenever a payment happens.

**Important:**

- The webhook URL must be publicly accessible (not localhost)
- For testing, you can use a service like ngrok to expose your local server
- In production, use your actual domain

---

## Step 5: Test the Integration

Now let's test if everything works!

### 5.1 Start Your Development Server

In your terminal, run:

```bash
npm run dev
```

Or if using Shopify CLI:

```bash
shopify app dev
```

**What this does:** Starts your app so it can receive webhooks and process requests.

### 5.2 Test Scenario 1: First Subscription Order

1. **Create a Subscription Plan** (if you haven't already):
   - Go to your Shopify admin
   - Products → Create a product
   - Add a subscription selling plan to it
   - Save the product

2. **Place a Test Order**:
   - Go to your storefront
   - Add the subscription product to cart
   - Complete checkout with the subscription option
   - Place the order

3. **Check What Happened**:
   - Check your terminal/console for logs
   - You should see messages like:
     - "Received orders/create webhook"
     - "Razorpay subscription created: sub_xxxxx"

**What should happen:**

- Shopify sends webhook → App creates Razorpay subscription → Subscription saved to database

### 5.3 Test Scenario 2: Recurring Payment (Simulated)

Since Razorpay will handle recurring payments automatically, you can test the webhook:

1. **Use Razorpay's Test Tool**:
   - In Razorpay Dashboard → Webhooks
   - Find your webhook → Click "Test" or "Send Test Event"
   - Select `payment.captured` event
   - Send test webhook

2. **Check What Happened**:
   - Check terminal for logs
   - You should see:
     - "Received Razorpay webhook: payment.captured"
     - "Shopify order created: gid://shopify/Order/xxxxx"

**What should happen:**

- Razorpay sends webhook → App creates Shopify order → Order saved to database

---

## Step 6: Monitor and Debug

### 6.1 Check Logs

Your app logs important information. Watch your terminal for:

- ✅ Success messages (subscriptions created, orders created)
- ❌ Error messages (if something goes wrong)

### 6.2 Common Issues and Solutions

**Issue: "No session found for shop"**

- **Solution:** Make sure your app is installed on the shop and you've authenticated

**Issue: "Invalid Razorpay webhook signature"**

- **Solution:** Check that your `RAZORPAY_KEY_SECRET` in `.env` matches your Razorpay dashboard

**Issue: "Webhook not receiving events"**

- **Solution:**
  - Make sure webhook URL is publicly accessible
  - Check Razorpay dashboard webhook configuration
  - Verify webhook is active in Razorpay dashboard

### 6.3 Check Database

You can check if data is being saved:

```bash
# View subscriptions
npx prisma studio
```

This opens a web interface where you can see:

- `RazorpaySubscription` - All subscriptions created
- `RazorpayPayment` - All payments received

---

## Step 7: Deploy to Production (When Ready)

When you're ready to go live:

### 7.1 Update Environment Variables

Make sure your production environment has all the `.env` variables set:

- Razorpay credentials (use production keys, not test keys)
- Email configuration
- Shopify app credentials

### 7.2 Update Razorpay Webhook URL

In Razorpay Dashboard:

- Update webhook URL to your production URL
- Make sure it's using `https://` (not `http://`)

### 7.3 Switch to Production Razorpay Keys

In your production `.env`:

- Replace test keys (`rzp_test_...`) with production keys (`rzp_live_...`)
- Get production keys from Razorpay Dashboard → Settings → API Keys

---

## Quick Reference: File Locations

Here's where important things are:

- **Environment variables:** `.env` file (root of project)
- **Database schema:** `prisma/schema.prisma`
- **Razorpay functions:** `app/lib/razorpay.server.ts`
- **Email functions:** `app/lib/email.server.ts`
- **Shopify order creation:** `app/lib/shopify-orders.server.ts`
- **Webhook handlers:**
  - Shopify orders: `app/routes/webhooks.orders.create.tsx`
  - Razorpay payments: `app/routes/webhooks.razorpay.tsx`
- **App configuration:** `shopify.app.toml`

---

## Need Help?

If you get stuck:

1. **Check the logs** - Your terminal will show error messages
2. **Check RAZORPAY_SETUP.md** - More technical details
3. **Check Razorpay Dashboard** - Webhook logs show if events were sent
4. **Check Shopify Admin** - Orders section shows if orders were created

---

## Summary Checklist

Before you're ready to go:

- [ ] Razorpay credentials added to `.env` file
- [ ] Database migration run successfully
- [ ] Shopify app scopes updated in Partners dashboard
- [ ] Razorpay webhook configured with correct URL
- [ ] Test order placed and subscription created
- [ ] Test payment webhook received and order created
- [ ] Production keys ready (when going live)

That's it! Your Razorpay integration should now be working. 🎉
