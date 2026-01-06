import { redirect, useNavigate, useNavigation, useSubmit } from "react-router";
import { useState, useEffect } from "react";
import type { Route } from "./+types/app._index";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  InlineStack,
  Badge,
  Modal,
  TextField,
  Select,
  Banner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const loader = async ({ request }: Route.LoaderArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const plans = await prisma.subscriptionPlan.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });

  // Fetch selling plan IDs from Shopify for each plan
  const plansWithSellingPlanIds = await Promise.all(
    plans.map(async (plan) => {
      try {
        const response = await admin.graphql(`
          query getSellingPlanGroup($id: ID!) {
            sellingPlanGroup(id: $id) {
              id
              sellingPlans(first: 1) {
                edges {
                  node {
                    id
                    name
                    pricingPolicies {
                      ... on SellingPlanFixedPricingPolicy {
                        adjustmentType
                        adjustmentValue {
                          ... on MoneyV2 {
                            amount
                            currencyCode
                          }
                          ... on SellingPlanPricingPolicyPercentageValue {
                            percentage
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        `, {
          variables: {
            id: plan.sellingPlanGroupId,
          },
        });

        const data = await response.json();
        const sellingPlan = data.data?.sellingPlanGroup?.sellingPlans?.edges?.[0]?.node;

        return {
          ...plan,
          sellingPlanId: sellingPlan?.id || null,
          sellingPlanPricingPolicy: sellingPlan?.pricingPolicies?.[0] || null,
        };
      } catch (error) {
        console.error(`Error fetching selling plan for ${plan.id}:`, error);
        return {
          ...plan,
          sellingPlanId: null,
          sellingPlanPricingPolicy: null,
        };
      }
    })
  );

  const productsResponse = await admin.graphql(`
    query {
      products(first: 100) {
        edges {
          node {
            id
            title
          }
        }
      }
    }
  `);

  const productsData = await productsResponse.json();
  const products = productsData.data.products.edges.map((edge: { node: { id: string; title: string } }) => ({
    value: edge.node.id,
    label: edge.node.title,
  }));

  // Get shop currency
  const shopResponse = await admin.graphql(`
    query {
      shop {
        currencyCode
      }
    }
  `);

  const shopData = await shopResponse.json();
  const currencyCode = shopData.data?.shop?.currencyCode || "USD";

  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const success = url.searchParams.get("success");
  const planId = url.searchParams.get("planId");

  return { plans: plansWithSellingPlanIds, products, shop, currencyCode, error: error || null, success: success || null, planId: planId || null };
};

export const action = async ({ request }: Route.ActionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  if (actionType === "create") {
    const planName = formData.get("planName");
    const billingInterval = formData.get("billingInterval");
    const intervalCount = formData.get("intervalCount");
    const discountType = formData.get("discountType");
    const discountValue = formData.get("discountValue");

    // Build pricing policy based on discount type
    let pricingPolicy;
    if (discountType === "FIXED_AMOUNT") {
      // PRICE sets the actual price the product will be sold for
      pricingPolicy = {
        fixed: {
          adjustmentType: "PRICE",
          adjustmentValue: {
            fixedValue: parseFloat(discountValue?.toString() || "0").toFixed(2),
          },
        },
      };
    } else {
      pricingPolicy = {
        fixed: {
          adjustmentType: "PERCENTAGE",
          adjustmentValue: {
            percentage: parseFloat(discountValue?.toString() || "0"),
          },
        },
      };
    }

    const sellingPlanInput = {
      name: planName,
      options: ["Subscription"],
      position: 1,
      billingPolicy: {
        recurring: {
          interval: billingInterval?.toString().toUpperCase(),
          intervalCount: parseInt(intervalCount?.toString() || "1"),
        },
      },
      deliveryPolicy: {
        recurring: {
          interval: billingInterval?.toString().toUpperCase(),
          intervalCount: parseInt(intervalCount?.toString() || "1"),
        },
      },
      pricingPolicies: [pricingPolicy],
      category: "SUBSCRIPTION",
    };

    const mutation = `
      mutation sellingPlanGroupCreate($input: SellingPlanGroupInput!) {
        sellingPlanGroupCreate(input: $input) {
          sellingPlanGroup {
            id
            name
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const response = await admin.graphql(mutation, {
      variables: {
        input: {
          name: planName,
          options: ["Subscription"],
          merchantCode: planName,
          sellingPlansToCreate: [sellingPlanInput],
        },
      },
    });

    const result = await response.json();

    if (result.data?.sellingPlanGroupCreate?.userErrors?.length > 0) {
      const errors = result.data.sellingPlanGroupCreate.userErrors;
      const url = new URL(request.url);
      return redirect(`${url.pathname}?error=${encodeURIComponent(errors.map((e: { message: string }) => e.message).join(", "))}`);
    }

    if (result.data?.sellingPlanGroupCreate?.sellingPlanGroup) {
      const sellingPlanGroupId = result.data.sellingPlanGroupCreate.sellingPlanGroup.id;

      await prisma.subscriptionPlan.create({
        data: {
          shop,
          sellingPlanGroupId,
          name: planName?.toString() || "",
          billingInterval: billingInterval?.toString() || "MONTH",
          intervalCount: parseInt(intervalCount?.toString() || "1"),
          discountType: discountType?.toString() || "PERCENTAGE",
          discountValue: parseFloat(discountValue?.toString() || "0"),
          isActive: true,
        } as Parameters<typeof prisma.subscriptionPlan.create>[0]["data"],
      });

      // Return success
      const url = new URL(request.url);
      return redirect(`${url.pathname}?success=true`);
    } else {
      const url = new URL(request.url);
      return redirect(`${url.pathname}?error=${encodeURIComponent("Failed to create selling plan group. Please try again.")}`);
    }
  } else if (actionType === "update") {
    const planId = formData.get("planId");
    const planName = formData.get("planName");
    const billingInterval = formData.get("billingInterval");
    const intervalCount = formData.get("intervalCount");
    const discountType = formData.get("discountType");
    const discountValue = formData.get("discountValue");

    if (!planId) {
      const url = new URL(request.url);
      return redirect(`${url.pathname}?error=${encodeURIComponent("Plan ID is required for update.")}`);
    }

    // Get the existing plan to find selling plan group and selling plan IDs
    const existingPlan = await prisma.subscriptionPlan.findUnique({
      where: { id: planId.toString() },
    });

    if (!existingPlan) {
      const url = new URL(request.url);
      return redirect(`${url.pathname}?error=${encodeURIComponent("Plan not found.")}`);
    }

    // Fetch the selling plan ID from Shopify
    const sellingPlanResponse = await admin.graphql(`
      query getSellingPlanGroup($id: ID!) {
        sellingPlanGroup(id: $id) {
          id
          sellingPlans(first: 1) {
            edges {
              node {
                id
              }
            }
          }
        }
      }
    `, {
      variables: {
        id: existingPlan.sellingPlanGroupId,
      },
    });

    const sellingPlanData = await sellingPlanResponse.json();
    const sellingPlanId = sellingPlanData.data?.sellingPlanGroup?.sellingPlans?.edges?.[0]?.node?.id;

    if (!sellingPlanId) {
      const url = new URL(request.url);
      return redirect(`${url.pathname}?error=${encodeURIComponent("Selling plan not found in Shopify.")}`);
    }

    // Build pricing policy based on discount type
    let pricingPolicy;
    if (discountType === "FIXED_AMOUNT") {
      pricingPolicy = {
        fixed: {
          adjustmentType: "PRICE",
          adjustmentValue: {
            fixedValue: parseFloat(discountValue?.toString() || "0").toFixed(2),
          },
        },
      };
    } else {
      pricingPolicy = {
        fixed: {
          adjustmentType: "PERCENTAGE",
          adjustmentValue: {
            percentage: parseFloat(discountValue?.toString() || "0"),
          },
        },
      };
    }

    const sellingPlanInput = {
      id: sellingPlanId,
      name: planName,
      options: ["Subscription"],
      position: 1,
      billingPolicy: {
        recurring: {
          interval: billingInterval?.toString().toUpperCase(),
          intervalCount: parseInt(intervalCount?.toString() || "1"),
        },
      },
      deliveryPolicy: {
        recurring: {
          interval: billingInterval?.toString().toUpperCase(),
          intervalCount: parseInt(intervalCount?.toString() || "1"),
        },
      },
      pricingPolicies: [pricingPolicy],
      category: "SUBSCRIPTION",
    };

    const mutation = `
      mutation sellingPlanGroupUpdate($id: ID!, $input: SellingPlanGroupInput!) {
        sellingPlanGroupUpdate(id: $id, input: $input) {
          sellingPlanGroup {
            id
            name
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const response = await admin.graphql(mutation, {
      variables: {
        id: existingPlan.sellingPlanGroupId,
        input: {
          name: planName,
          options: ["Subscription"],
          merchantCode: planName,
          sellingPlansToUpdate: [sellingPlanInput],
        },
      },
    });

    const result = await response.json();

    if (result.data?.sellingPlanGroupUpdate?.userErrors?.length > 0) {
      const errors = result.data.sellingPlanGroupUpdate.userErrors;
      const url = new URL(request.url);
      return redirect(`${url.pathname}?error=${encodeURIComponent(errors.map((e: { message: string }) => e.message).join(", "))}`);
    }

    // Update the plan in the database
    await prisma.subscriptionPlan.update({
      where: { id: planId.toString() },
      data: {
        name: planName?.toString() || "",
        billingInterval: billingInterval?.toString() || "MONTH",
        intervalCount: parseInt(intervalCount?.toString() || "1"),
        discountType: discountType?.toString() || "PERCENTAGE",
        discountValue: parseFloat(discountValue?.toString() || "0"),
      } as { name: string; billingInterval: string; intervalCount: number; discountType: string; discountValue: number }
    });

    const url = new URL(request.url);
    return redirect(`${url.pathname}?success=true`);
  } else if (actionType === "delete") {
    const planId = formData.get("planId");
    const sellingPlanGroupId = formData.get("sellingPlanGroupId");

    if (sellingPlanGroupId) {
      const mutation = `
        mutation sellingPlanGroupDelete($id: ID!) {
          sellingPlanGroupDelete(id: $id) {
            deletedSellingPlanGroupId
            userErrors {
              field
              message
            }
          }
        }
      `;

      await admin.graphql(mutation, {
        variables: {
          id: sellingPlanGroupId,
        },
      });
    }

    if (planId) {
      await prisma.subscriptionPlan.delete({
        where: { id: planId.toString() },
      });
    }
  } else if (actionType === "toggle") {
    const planId = formData.get("planId");
    const isActive = formData.get("isActive") === "true";

    if (planId) {
      await prisma.subscriptionPlan.update({
        where: { id: planId.toString() },
        data: { isActive: !isActive },
      });
    }
  }

  const url = new URL(request.url);
  return redirect(url.pathname);
};

export default function Index({ loaderData }: Route.ComponentProps) {
  const { plans, error: loaderError, success, currencyCode, planId } = loaderData;
  const navigate = useNavigate();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [modalActive, setModalActive] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [planName, setPlanName] = useState("");
  const [billingInterval, setBillingInterval] = useState("MONTH");
  const [intervalCount, setIntervalCount] = useState("1");
  const [discountType, setDiscountType] = useState("PERCENTAGE");
  const [discountValue, setDiscountValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isSubmitting = navigation.state === "submitting";

  // Handle success - close modal and reset form
  useEffect(() => {
    if (success === "true") {
      setModalActive(false);
      setEditingPlanId(null);
      setPlanName("");
      setBillingInterval("MONTH");
      setIntervalCount("1");
      setDiscountType("PERCENTAGE");
      setDiscountValue("");
      setError(null);

      // Clear success param from URL
      navigate("/app", { replace: true });
    }
  }, [success, navigate]);

  // Handle errors
  useEffect(() => {
    if (loaderError) {
      setError(loaderError);
      setModalActive(true);
    }
  }, [loaderError]);

  // Handle planId from URL - open edit modal for specific plan
  useEffect(() => {
    if (planId && plans.length > 0) {
      // Try to find plan by ID first
      let plan = plans.find((p) => p.id === planId);

      // If not found by ID, try to find by sellingPlanGroupId
      if (!plan) {
        plan = plans.find((p) => p.sellingPlanGroupId === planId);
      }

      if (plan) {
        setEditingPlanId(plan.id);
        setPlanName(plan.name);
        setBillingInterval(plan.billingInterval);
        setIntervalCount(plan.intervalCount.toString());
        setDiscountType((plan as { discountType?: string }).discountType || "PERCENTAGE");
        setDiscountValue(plan.discountValue.toString());
        setError(null);
        setModalActive(true);
        // Clear planId from URL
        const url = new URL(window.location.href);
        url.searchParams.delete("planId");
        navigate(url.pathname + url.search, { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, plans.length]);

  const handleCreatePlan = () => {
    if (!planName || !discountValue) {
      setError("Please fill in all required fields");
      return;
    }

    setError(null);

    const formData = new FormData();
    formData.append("actionType", editingPlanId ? "update" : "create");
    if (editingPlanId) {
      formData.append("planId", editingPlanId);
    }
    formData.append("planName", planName);
    formData.append("billingInterval", billingInterval);
    formData.append("intervalCount", intervalCount);
    formData.append("discountType", discountType);
    formData.append("discountValue", discountValue);

    submit(formData, { method: "post" });
  };

  const handleEditPlan = (plan: { id: string; name: string; billingInterval: string; intervalCount: number; discountType?: string; discountValue: number }) => {
    setEditingPlanId(plan.id);
    setPlanName(plan.name);
    setBillingInterval(plan.billingInterval);
    setIntervalCount(plan.intervalCount.toString());
    setDiscountType((plan as { discountType?: string }).discountType || "PERCENTAGE");
    setDiscountValue(plan.discountValue.toString());
    setError(null);
    setModalActive(true);
  };

  const handleOpenModal = () => {
    // Reset form when opening modal for create
    setEditingPlanId(null);
    setPlanName("");
    setBillingInterval("MONTH");
    setIntervalCount("1");
    setDiscountType("PERCENTAGE");
    setDiscountValue("");
    setError(null);
    setModalActive(true);
  };

  const handleCloseModal = () => {
    setModalActive(false);
    setEditingPlanId(null);
    setPlanName("");
    setBillingInterval("MONTH");
    setIntervalCount("1");
    setDiscountType("PERCENTAGE");
    setDiscountValue("");
    setError(null);
  };

  const handleDeletePlan = (planId: string, sellingPlanGroupId: string) => {
    if (confirm("Are you sure you want to delete this plan?")) {
      const formData = new FormData();
      formData.append("actionType", "delete");
      formData.append("planId", planId);
      formData.append("sellingPlanGroupId", sellingPlanGroupId);

      submit(formData, { method: "post" });
    }
  };

  const handleTogglePlan = (planId: string, isActive: boolean) => {
    const formData = new FormData();
    formData.append("actionType", "toggle");
    formData.append("planId", planId);
    formData.append("isActive", isActive.toString());

    submit(formData, { method: "post" });
  };

  return (
    <Page
      title="Stackly Subscriptions"
      primaryAction={{
        content: "Create Subscription Plan",
        onAction: handleOpenModal,
      }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Welcome to Stackly Subscriptions! 🎉
              </Text>
              <Text variant="bodyMd" as="p">
                Manage your subscription plans and turn one-time purchases into recurring revenue.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">
                Quick Stats
              </Text>
              <InlineStack gap="400">
                <BlockStack gap="100">
                  <Text variant="headingLg" as="p">
                    {plans.length}
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Total Plans
                  </Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text variant="headingLg" as="p">
                    {plans.filter((p) => p.isActive).length}
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Active Plans
                  </Text>
                </BlockStack>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text variant="headingMd" as="h2">
                  Your Subscription Plans
                </Text>
              </InlineStack>

              {plans.length === 0 ? (
                <BlockStack gap="300" inlineAlign="center">
                  <Text variant="bodyMd" as="p" tone="subdued">
                    No subscription plans created yet.
                  </Text>
                  <Button variant="primary" onClick={handleOpenModal}>
                    Create Your First Plan
                  </Button>
                </BlockStack>
              ) : (
                <BlockStack gap="300">
                  {plans.map((plan) => (
                    <Card key={plan.id}>
                      <div
                        onClick={() => handleEditPlan(plan)}
                        onKeyDown={(e: React.KeyboardEvent) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleEditPlan(plan);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        style={{ cursor: "pointer" }}
                      >
                        <InlineStack align="space-between" blockAlign="center">
                          <BlockStack gap="200">
                            <InlineStack gap="200" blockAlign="center">
                              <Text variant="headingSm" as="h3">
                                {plan.name}
                              </Text>
                              {plan.isActive ? (
                                <Badge tone="success">Active</Badge>
                              ) : (
                                <Badge tone="critical">Inactive</Badge>
                              )}
                            </InlineStack>
                            <Text variant="bodySm" as="p" tone="subdued">
                              Every {plan.intervalCount} {plan.billingInterval.toLowerCase()}
                              {plan.intervalCount > 1 ? "s" : ""} • {((plan as { discountType?: string }).discountType === "FIXED_AMOUNT"
                              ? `Price: ${new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode || "USD" }).format(plan.discountValue)}`
                              : `${plan.discountValue}% off`)}
                            </Text>
                          </BlockStack>
                          <div
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                            role="presentation"
                          >
                            <InlineStack gap="200">
                              <Button
                                variant="plain"
                                onClick={() => handleTogglePlan(plan.id, plan.isActive)}
                              >
                                {plan.isActive ? "Deactivate" : "Activate"}
                              </Button>
                              <Button
                                variant="primary"
                                tone="critical"
                                onClick={() => handleDeletePlan(plan.id, plan.sellingPlanGroupId)}
                              >
                                Delete
                              </Button>
                            </InlineStack>
                          </div>
                        </InlineStack>
                      </div>
                    </Card>
                  ))}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={modalActive}
        onClose={handleCloseModal}
        title={editingPlanId ? "Edit Subscription Plan" : "Create Subscription Plan"}
        primaryAction={{
          content: isSubmitting
            ? (editingPlanId ? "Updating..." : "Creating...")
            : (editingPlanId ? "Update Plan" : "Create Plan"),
          onAction: handleCreatePlan,
          disabled: !planName || !discountValue || isSubmitting,
          loading: isSubmitting,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: handleCloseModal,
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {error && (
              <Banner tone="critical" onDismiss={() => setError(null)}>
                <p>{error}</p>
              </Banner>
            )}

            <TextField
              label="Plan Name"
              value={planName}
              onChange={setPlanName}
              placeholder="e.g., Monthly Subscription"
              autoComplete="off"
            />

            <Select
              label="Billing Interval"
              options={[
                { label: "Day", value: "DAY" },
                { label: "Week", value: "WEEK" },
                { label: "Month", value: "MONTH" },
                { label: "Year", value: "YEAR" },
              ]}
              value={billingInterval}
              onChange={setBillingInterval}
            />

            <TextField
              label="Interval Count"
              type="number"
              value={intervalCount}
              onChange={setIntervalCount}
              placeholder="1"
              autoComplete="off"
              helpText="Deliver every X intervals (e.g., every 2 months)"
            />

            <Select
              label="Pricing Type"
              options={[
                { label: "Percentage Discount", value: "PERCENTAGE" },
                { label: "Fixed Price", value: "FIXED_AMOUNT" },
              ]}
              value={discountType}
              onChange={setDiscountType}
            />

            <TextField
              label={discountType === "PERCENTAGE" ? "Discount Percentage" : "Fixed Price"}
              type="number"
              value={discountValue}
              onChange={setDiscountValue}
              placeholder={discountType === "PERCENTAGE" ? "10" : "5.00"}
              suffix={discountType === "PERCENTAGE" ? "%" : (loaderData.currencyCode ? new Intl.NumberFormat("en-US", { style: "currency", currency: loaderData.currencyCode, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(0).replace(/[\d.,\s]/g, "") : "$")}
              autoComplete="off"
              helpText={discountType === "PERCENTAGE" ? "Percentage discount off the product price" : "The final price the product will be sold for"}
            />

            <Banner tone="info">
              <p>After creating the plan, attach it to products in your Shopify admin.</p>
            </Banner>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
