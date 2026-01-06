import prisma from "../db.server";
import { apiVersion } from "../shopify.server";

// Get Shopify Admin GraphQL client for a specific shop using offline session
export async function getShopifyAdminForShop(shop: string) {
  const session = await prisma.session.findFirst({
    where: {
      shop: shop,
      isOnline: false, // Use offline token for webhooks
    },
  });

  if (!session) {
    throw new Error(`No offline session found for shop: ${shop}`);
  }

  // Create a GraphQL client using the access token
  const adminUrl = `https://${shop}/admin/api/${apiVersion}/graphql.json`;

  return {
    graphql: async (query: string, options?: { variables?: any }) => {
      const response = await fetch(adminUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": session.accessToken,
        },
        body: JSON.stringify({
          query,
          variables: options?.variables || ({} as Record<string, unknown>),
        }),
      });

      return response;
    },
  };
}

