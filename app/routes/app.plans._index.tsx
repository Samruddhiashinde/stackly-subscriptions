import { redirect, useNavigate, useNavigation, useSubmit } from "react-router";
import { useState, useEffect } from "react";
import type { Route } from "./+types/app.plans._index";
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

  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const success = url.searchParams.get("success");

  return { plans, products, shop, error: error || null, success: success || null };
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
    const discountValue = formData.get("discountValue");

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
      pricingPolicies: [
        {
          fixed: {
            adjustmentType: "PERCENTAGE",
            adjustmentValue: {
              percentage: parseFloat(discountValue?.toString() || "0"),
            },
          },
        },
      ],
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
          discountValue: parseFloat(discountValue?.toString() || "0"),
          isActive: true,
        },
      });

      // Return success
      const url = new URL(request.url);
      return redirect(`${url.pathname}?success=true`);
    } else {
      const url = new URL(request.url);
      return redirect(`${url.pathname}?error=${encodeURIComponent("Failed to create selling plan group. Please try again.")}`);
    }
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
  const { plans, error: loaderError, success } = loaderData;
  const navigate = useNavigate();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [modalActive, setModalActive] = useState(false);
  const [planName, setPlanName] = useState("");
  const [billingInterval, setBillingInterval] = useState("MONTH");
  const [intervalCount, setIntervalCount] = useState("1");
  const [discountValue, setDiscountValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isSubmitting = navigation.state === "submitting";

  // Handle success - close modal and reset form
  useEffect(() => {
    if (success === "true") {
      setModalActive(false);
      setPlanName("");
      setBillingInterval("MONTH");
      setIntervalCount("1");
      setDiscountValue("");
      setError(null);

      // Clear success param from URL
      navigate("/app/plans", { replace: true });
    }
  }, [success, navigate]);

  // Handle errors
  useEffect(() => {
    if (loaderError) {
      setError(loaderError);
      setModalActive(true);
    }
  }, [loaderError]);

  const handleCreatePlan = () => {
    if (!planName || !discountValue) {
      setError("Please fill in all required fields");
      return;
    }

    setError(null);

    const formData = new FormData();
    formData.append("actionType", "create");
    formData.append("planName", planName);
    formData.append("billingInterval", billingInterval);
    formData.append("intervalCount", intervalCount);
    formData.append("discountValue", discountValue);

    submit(formData, { method: "post" });
  };

  const handleOpenModal = () => {
    // Reset form when opening modal
    setPlanName("");
    setBillingInterval("MONTH");
    setIntervalCount("1");
    setDiscountValue("");
    setError(null);
    setModalActive(true);
  };

  const handleCloseModal = () => {
    setModalActive(false);
    setPlanName("");
    setBillingInterval("MONTH");
    setIntervalCount("1");
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
                            {plan.intervalCount > 1 ? "s" : ""} • {plan.discountValue}% off
                          </Text>
                        </BlockStack>
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
                      </InlineStack>
                    </Card>
                  ))}
                </BlockStack>
              )}
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
      </Layout>

      <Modal
        open={modalActive}
        onClose={handleCloseModal}
        title="Create Subscription Plan"
        primaryAction={{
          content: isSubmitting ? "Creating..." : "Create Plan",
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

            <TextField
              label="Discount Percentage"
              type="number"
              value={discountValue}
              onChange={setDiscountValue}
              placeholder="10"
              suffix="%"
              autoComplete="off"
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
