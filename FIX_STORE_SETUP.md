# Fix: Store Setup Issue

## Problem

The CLI is looking for `stackly-subscriptions-test-store.myshopify.com` but can't find it in your organization.

## Solution Options

### Option 1: Use Interactive Store Selection (Easiest)

Run the dev command without specifying a store, and select from the list:

```bash
npm run dev
```

When prompted, select your store from the list. The CLI will show all available stores.

### Option 2: Find the Correct Store Domain

The store URL you provided was:

- `https://admin.shopify.com/store/stackly-subscriptions-test-store`

But the CLI needs the actual store domain. To find it:

1. **From the Admin URL:**
   - If the admin URL is `https://admin.shopify.com/store/stackly-subscriptions-test-store`
   - The store domain might be: `stackly-subscriptions-test-store.myshopify.com`
   - OR it might be a custom domain

2. **Check your Shopify Partner Dashboard:**
   - Go to https://partners.shopify.com
   - Navigate to "Stores" or "Development stores"
   - Find "stackly-subscriptions-test-store"
   - Check the exact domain shown there

3. **From the Store Admin:**
   - Log into: https://admin.shopify.com/store/stackly-subscriptions-test-store
   - Go to Settings > General
   - Look for "Store domain" - this shows the actual domain

### Option 3: Use the Working Store

I see you already have `sorted-testing-apps.myshopify.com` working. You can use that:

```bash
npm run dev -- --store=sorted-testing-apps
```

### Option 4: Install via Installation Link (Recommended for Production)

1. **Get Installation Link:**
   - Go to https://partners.shopify.com
   - Find your "Stackly Subscriptions" app
   - Go to "Overview" or "Distribution"
   - Copy the installation link (looks like: `https://partners.shopify.com/...`)

2. **Install in Store:**
   - Log into: https://admin.shopify.com/store/stackly-subscriptions-test-store
   - Paste the installation link in your browser
   - Follow the installation prompts

## Quick Fix: Try These Commands

```bash
# Option 1: Interactive selection
npm run dev

# Option 2: Try with just the store name (without .myshopify.com)
npm run dev -- --store=stackly-subscriptions-test-store

# Option 3: Use the working store
npm run dev -- --store=sorted-testing-apps
```

## If Store is Not in Your Partner Account

If the store is not showing up, you may need to:

1. **Add the store to your Partner account:**
   - Go to https://partners.shopify.com
   - Navigate to "Stores"
   - Click "Add store"
   - Enter the store domain

2. **Or use a Development Store:**
   - Create a development store in Partner Dashboard
   - Use that for testing
