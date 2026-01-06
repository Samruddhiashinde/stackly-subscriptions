import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

// Type for admin API that has graphql method
type AdminApi = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

// Create a Shopify order from subscription payment
export async function createShopifyOrder(
  admin: AdminApiContext | AdminApi,
  data: {
    customerId?: string;
    customerEmail: string;
    customerName: string;
    lineItems: Array<{
      variantId: string;
      quantity: number;
      price: number;
    }>;
    shippingAddress?: {
      firstName: string;
      lastName: string;
      address1: string;
      address2?: string;
      city: string;
      province: string;
      country: string;
      zip: string;
      phone?: string;
    };
    billingAddress?: {
      firstName: string;
      lastName: string;
      address1: string;
      address2?: string;
      city: string;
      province: string;
      country: string;
      zip: string;
      phone?: string;
    };
    note?: string;
  }
): Promise<string | null> {
  try {
    // First, try to get or create customer
    let customerId = data.customerId;

    if (!customerId) {
      // Search for existing customer by email
      const customerSearchQuery = `#graphql
        query getCustomerByEmail($email: String!) {
          customers(first: 1, query: $email) {
            edges {
              node {
                id
              }
            }
          }
        }
      `;

      const customerSearchResponse = await admin.graphql(customerSearchQuery, {
        variables: {
          email: `email:${data.customerEmail}`,
        },
      });

      const customerSearchData = await customerSearchResponse.json();
      const existingCustomer = customerSearchData.data?.customers?.edges?.[0]?.node;

      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        // Create new customer
        const createCustomerMutation = `#graphql
          mutation customerCreate($input: CustomerInput!) {
            customerCreate(input: $input) {
              customer {
                id
                email
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        const [firstName, ...lastNameParts] = data.customerName.split(" ");
        const lastName = lastNameParts.join(" ") || "";

        const createCustomerResponse = await admin.graphql(createCustomerMutation, {
          variables: {
            input: {
              email: data.customerEmail,
              firstName: firstName,
              lastName: lastName,
            },
          },
        });

        const createCustomerData = await createCustomerResponse.json();
        if (createCustomerData.data?.customerCreate?.customer) {
          customerId = createCustomerData.data.customerCreate.customer.id;
        } else {
          console.error("Error creating customer:", createCustomerData.data?.customerCreate?.userErrors);
        }
      }
    }

    // Prepare line items for order creation
    const lineItemsInput = data.lineItems.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
      originalUnitPrice: item.price.toString(),
    }));

    // Create draft order
    const createDraftOrderMutation = `#graphql
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            order {
              id
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const draftOrderInput: Record<string, unknown> = {
      lineItems: lineItemsInput,
      email: data.customerEmail,
      note: data.note || "Auto-generated from Razorpay subscription payment",
    };

    if (customerId) {
      draftOrderInput.customerId = customerId;
    }

    if (data.shippingAddress) {
      draftOrderInput.shippingAddress = data.shippingAddress;
    }

    if (data.billingAddress) {
      draftOrderInput.billingAddress = data.billingAddress;
    }

    const draftOrderResponse = await admin.graphql(createDraftOrderMutation, {
      variables: {
        input: draftOrderInput,
      },
    });

    const draftOrderData = await draftOrderResponse.json();

    if (draftOrderData.data?.draftOrderCreate?.userErrors?.length > 0) {
      console.error("Error creating draft order:", draftOrderData.data.draftOrderCreate.userErrors);
      return null;
    }

    const draftOrderId = draftOrderData.data?.draftOrderCreate?.draftOrder?.id;

    if (!draftOrderId) {
      console.error("Draft order ID not found in response");
      return null;
    }

    // Complete the draft order to create an actual order
    const completeDraftOrderMutation = `#graphql
      mutation draftOrderComplete($id: ID!) {
        draftOrderComplete(id: $id) {
          draftOrder {
            id
            order {
              id
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const completeResponse = await admin.graphql(completeDraftOrderMutation, {
      variables: {
        id: draftOrderId,
      },
    });

    const completeData = await completeResponse.json();

    if (completeData.data?.draftOrderComplete?.userErrors?.length > 0) {
      console.error("Error completing draft order:", completeData.data.draftOrderComplete.userErrors);
      return null;
    }

    const orderId = completeData.data?.draftOrderComplete?.draftOrder?.order?.id;

    if (!orderId) {
      console.error("Order ID not found after completing draft order");
      return null;
    }

    return orderId;
  } catch (error) {
    console.error("Error creating Shopify order:", error);
    return null;
  }
}

// Get order details by ID
export async function getShopifyOrder(
  admin: AdminApiContext | AdminApi,
  orderId: string
): Promise<any> {
  try {
    const query = `#graphql
      query getOrder($id: ID!) {
        order(id: $id) {
          id
          name
          email
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
                }
              }
            }
          }
        }
      }
    `;

    const response = await admin.graphql(query, {
      variables: {
        id: orderId,
      },
    });

    const data = await response.json() as { data?: { order?: unknown } };
    return data.data?.order;
  } catch (error) {
    console.error("Error fetching Shopify order:", error);
    return null;
  }
}

