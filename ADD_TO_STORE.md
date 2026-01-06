# Adding Stackly Subscriptions App to Your Store

## Option 1: Development Mode (Recommended for Testing)

1. **Start the development server:**

   ```bash
   npm run dev
   ```

2. **Follow the prompts:**
   - The CLI will ask you to select your store
   - Choose: `stackly-subscriptions-test-store`
   - The app will be automatically installed and opened in your browser

3. **Access the app:**
   - The app will be available at: `https://admin.shopify.com/store/stackly-subscriptions-test-store/apps/stackly-subscriptions`
   - Or navigate to Apps > Stackly Subscriptions in your Shopify admin

## Option 2: Production Deployment

1. **Build the app:**

   ```bash
   npm run build
   ```

2. **Deploy to Shopify:**

   ```bash
   npm run deploy
   ```

3. **Install from Partner Dashboard:**
   - Go to https://partners.shopify.com
   - Navigate to your app
   - Click "Get shareable link" or "Install app"
   - Use the installation link in your store

## Option 3: Manual Installation via Partner Dashboard

1. **Go to Partner Dashboard:**
   - Visit https://partners.shopify.com
   - Log in with your Shopify Partner account

2. **Select your app:**
   - Find "Stackly Subscriptions" in your apps list
   - Click on it

3. **Get installation link:**
   - Go to "Overview" or "Distribution"
   - Copy the installation link

4. **Install in your store:**
   - Visit: https://admin.shopify.com/store/stackly-subscriptions-test-store
   - Paste the installation link in your browser
   - Follow the installation prompts

## Troubleshooting

If you encounter issues:

1. **Clear Shopify CLI cache:**

   ```bash
   rm -rf ~/Library/Preferences/shopify-cli-app-nodejs
   ```

2. **Re-authenticate:**

   ```bash
   shopify auth logout
   shopify auth login
   ```

3. **Check app configuration:**
   - Ensure `shopify.app.toml` has the correct `client_id`
   - Verify your store URL matches: `stackly-subscriptions-test-store`

## Current App Configuration

- **App Name:** Stackly Subscriptions
- **Client ID:** 222c44ca65f68829aed78fba8c5b1580
- **Store:** stackly-subscriptions-test-store
- **Embedded:** Yes

## Required Permissions

The app requires these scopes:

- `write_products`
- `write_purchase_options`
- `write_orders`
- `read_orders`
- `write_customers`
- `read_customers`

These will be requested during installation.
