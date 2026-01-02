import {
  useLoaderData,
  useSubmit,
  useNavigation,
  useActionData,
} from "react-router";
import { authenticate } from "../shopify.server";
import { useState, useEffect } from "react";
import prisma from "../db.server";

export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);

  // Fetch existing selling plan groups from Shopify
  const plansResponse = await admin.graphql(
    `#graphql
      query getSellingPlanGroups {
        sellingPlanGroups(first: 10) {
          edges {
            node {
              id
              name
              merchantCode
              sellingPlans(first: 5) {
                edges {
                  node {
                    id
                    name
                    billingPolicy {
                      ... on SellingPlanRecurringBillingPolicy {
                        interval
                        intervalCount
                      }
                    }
                    pricingPolicies {
                      ... on SellingPlanFixedPricingPolicy {
                        adjustmentType
                        adjustmentValue {
                          ... on SellingPlanPricingPolicyPercentageValue {
                            percentage
                          }
                        }
                      }
                    }
                  }
                }
              }
              productVariants(first: 5) {
                edges {
                  node {
                    id
                  }
                }
              }
              products(first: 5) {
                edges {
                  node {
                    id
                    title
                  }
                }
              }
            }
          }
        }
      }
    `,
  );

  const plansData = await plansResponse.json();

  // Fetch status from database
  const dbPlans = await prisma.subscriptionPlan.findMany({
    where: {
      shop: session.shop,
    },
  });

  // Merge Shopify data with database status
  const plansWithStatus =
    plansData.data?.sellingPlanGroups?.edges.map((plan) => {
      const dbPlan = dbPlans.find((p) => p.sellingPlanGroupId === plan.node.id);
      return {
        ...plan,
        isActive: dbPlan?.isActive ?? true,
        dbId: dbPlan?.id,
      };
    }) || [];

  return {
    existingPlans: plansWithStatus,
    shop: session.shop,
  };
}

export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  // Handle Toggle Active/Inactive
  if (actionType === "toggle") {
    const sellingPlanGroupId = formData.get("sellingPlanGroupId");
    const currentStatus = formData.get("currentStatus") === "true";
    const planName = formData.get("planName");

    try {
      // Check if plan exists in DB
      const existingPlan = await prisma.subscriptionPlan.findUnique({
        where: {
          sellingPlanGroupId: sellingPlanGroupId,
        },
      });

      if (existingPlan) {
        // Update existing record
        await prisma.subscriptionPlan.update({
          where: { id: existingPlan.id },
          data: { isActive: !currentStatus },
        });
      } else {
        // Create new record
        await prisma.subscriptionPlan.create({
          data: {
            shop: session.shop,
            sellingPlanGroupId: sellingPlanGroupId,
            name: planName,
            isActive: !currentStatus,
            billingInterval: "MONTH",
            intervalCount: 1,
            discountValue: 0,
          },
        });
      }

      return {
        success: true,
        message: `Plan ${!currentStatus ? "enabled" : "disabled"} successfully!`,
      };
    } catch (error) {
      return {
        success: false,
        errors: [{ message: error.message }],
      };
    }
  }

  // Handle Delete
  if (actionType === "delete") {
    const planId = formData.get("planId");
    const sellingPlanGroupId = formData.get("sellingPlanGroupId");

    try {
      // Delete from Shopify
      const deleteMutation = `#graphql
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

      const response = await admin.graphql(deleteMutation, {
        variables: { id: planId },
      });

      const data = await response.json();

      if (data.data?.sellingPlanGroupDelete?.userErrors?.length > 0) {
        return {
          success: false,
          errors: data.data.sellingPlanGroupDelete.userErrors,
        };
      }

      // Delete from database
      await prisma.subscriptionPlan.deleteMany({
        where: {
          sellingPlanGroupId: sellingPlanGroupId,
        },
      });

      return {
        success: true,
        message: "Plan deleted successfully!",
        action: "delete",
      };
    } catch (error) {
      return {
        success: false,
        errors: [{ message: error.message }],
      };
    }
  }

  // Handle Create/Update
  const planName = formData.get("planName");
  const billingInterval = formData.get("billingInterval");
  const intervalCount = formData.get("intervalCount");
  const discountValue = formData.get("discountValue");
  const editingPlanId = formData.get("editingPlanId");

  try {
    let sellingPlanGroupId;

    // If editing, delete old plan first
    if (editingPlanId) {
      const deleteMutation = `#graphql
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

      await admin.graphql(deleteMutation, {
        variables: { id: editingPlanId },
      });

      // Delete from database
      await prisma.subscriptionPlan.deleteMany({
        where: {
          sellingPlanGroupId: editingPlanId,
        },
      });
    }

    // Create the selling plan group (without specific products - applies to all)
    const createMutation = `#graphql
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

    const createVariables = {
      input: {
        name: planName,
        merchantCode: planName.toLowerCase().replace(/\s+/g, "-"),
        options: ["Subscription"],
        position: 1,
        sellingPlansToCreate: [
          {
            name: `${planName}`,
            options: "Subscription",
            position: 1,
            category: "SUBSCRIPTION",
            billingPolicy: {
              recurring: {
                interval: billingInterval,
                intervalCount: parseInt(intervalCount),
              },
            },
            deliveryPolicy: {
              recurring: {
                interval: billingInterval,
                intervalCount: parseInt(intervalCount),
              },
            },
            pricingPolicies: [
              {
                fixed: {
                  adjustmentType: "PERCENTAGE",
                  adjustmentValue: {
                    percentage: parseFloat(discountValue),
                  },
                },
              },
            ],
          },
        ],
      },
    };

    console.log("Creating selling plan:", createVariables);

    const createResponse = await admin.graphql(createMutation, {
      variables: createVariables,
    });
    const createData = await createResponse.json();

    console.log("Create response:", JSON.stringify(createData, null, 2));

    if (createData.data?.sellingPlanGroupCreate?.userErrors?.length > 0) {
      return {
        success: false,
        errors: createData.data.sellingPlanGroupCreate.userErrors,
      };
    }

    if (createData.errors) {
      return {
        success: false,
        errors: createData.errors,
      };
    }

    sellingPlanGroupId =
      createData.data.sellingPlanGroupCreate.sellingPlanGroup.id;

    console.log(`Selling plan created: ${sellingPlanGroupId}`);

    // Save to database
    await prisma.subscriptionPlan.create({
      data: {
        shop: session.shop,
        sellingPlanGroupId: sellingPlanGroupId,
        name: planName,
        isActive: true,
        billingInterval: billingInterval,
        intervalCount: parseInt(intervalCount),
        discountValue: parseFloat(discountValue),
      },
    });

    return {
      success: true,
      message: editingPlanId
        ? "Plan updated successfully!"
        : "Subscription plan created successfully!",
      sellingPlanGroup: createData.data.sellingPlanGroupCreate.sellingPlanGroup,
    };
  } catch (error) {
    console.error("Caught error:", error);
    return {
      success: false,
      errors: [{ message: error.message }],
    };
  }
}

export default function PlansPage() {
  const { existingPlans, shop } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const actionData = useActionData();
  const isSubmitting = navigation.state === "submitting";

  const [showForm, setShowForm] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [formData, setFormData] = useState({
    planName: "",
    billingInterval: "MONTH",
    intervalCount: "1",
    discountValue: "10",
  });

  useEffect(() => {
    if (actionData?.success) {
      alert(actionData.message || "Success!");
      setShowForm(false);
      setEditingPlan(null);
      setFormData({
        planName: "",
        billingInterval: "MONTH",
        intervalCount: "1",
        discountValue: "10",
      });
      window.location.reload();
    } else if (actionData?.errors) {
      alert("Error: " + JSON.stringify(actionData.errors));
    }
  }, [actionData]);

  const handleToggleActive = (plan) => {
    const submitData = new FormData();
    submitData.append("actionType", "toggle");
    submitData.append("planId", plan.node.id);
    submitData.append("sellingPlanGroupId", plan.node.id);
    submitData.append("currentStatus", plan.isActive.toString());
    submitData.append("planName", plan.node.name);
    submit(submitData, { method: "post" });
  };

  const handleEdit = (plan) => {
    const sellingPlan = plan.node.sellingPlans.edges[0]?.node;
    const pricingPolicy = sellingPlan?.pricingPolicies?.[0];
    const discount = pricingPolicy?.adjustmentValue?.percentage || 0;

    setEditingPlan(plan.node.id);
    setFormData({
      planName: plan.node.name,
      billingInterval: sellingPlan?.billingPolicy?.interval || "MONTH",
      intervalCount:
        sellingPlan?.billingPolicy?.intervalCount?.toString() || "1",
      discountValue: discount.toString(),
    });
    setShowForm(true);
  };

  const handleDelete = (plan) => {
    if (
      confirm(
        `Are you sure you want to delete "${plan.node.name}"? This cannot be undone.`,
      )
    ) {
      const submitData = new FormData();
      submitData.append("actionType", "delete");
      submitData.append("planId", plan.node.id);
      submitData.append("sellingPlanGroupId", plan.node.id);
      submit(submitData, { method: "post" });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!formData.planName) {
      alert("Please enter a plan name");
      return;
    }

    const submitData = new FormData();
    submitData.append("actionType", "create");
    submitData.append("planName", formData.planName);
    submitData.append("billingInterval", formData.billingInterval);
    submitData.append("intervalCount", formData.intervalCount);
    submitData.append("discountValue", formData.discountValue);
    if (editingPlan) {
      submitData.append("editingPlanId", editingPlan);
    }

    submit(submitData, { method: "post" });
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingPlan(null);
    setFormData({
      planName: "",
      billingInterval: "MONTH",
      intervalCount: "1",
      discountValue: "10",
    });
  };

  return (
    <div style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
      <div
        style={{
          marginBottom: "2rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1 style={{ fontSize: "2rem" }}>Subscription Plans</h1>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            style={{
              backgroundColor: "#008060",
              color: "white",
              padding: "0.75rem 1.5rem",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "500",
            }}
          >
            Create New Plan
          </button>
        )}
      </div>

      {actionData?.errors && (
        <div
          style={{
            backgroundColor: "#fef2f2",
            border: "1px solid #fca5a5",
            borderRadius: "8px",
            padding: "1rem",
            marginBottom: "1rem",
          }}
        >
          <h3 style={{ color: "#dc2626", marginBottom: "0.5rem" }}>Error:</h3>
          <ul style={{ color: "#dc2626", paddingLeft: "1.5rem" }}>
            {actionData.errors.map((error, index) => (
              <li key={index}>{error.message || error.field}</li>
            ))}
          </ul>
        </div>
      )}

      {existingPlans.length > 0 && !showForm && (
        <div style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>
            Your Plans ({existingPlans.length})
          </h2>
          <div style={{ display: "grid", gap: "1rem" }}>
            {existingPlans.map((plan) => {
              const sellingPlan = plan.node.sellingPlans.edges[0]?.node;
              const pricingPolicy = sellingPlan?.pricingPolicies?.[0];
              const discount = pricingPolicy?.adjustmentValue?.percentage || 0;

              return (
                <div
                  key={plan.node.id}
                  style={{
                    backgroundColor: "white",
                    border: "1px solid #e1e3e5",
                    borderRadius: "8px",
                    padding: "1.5rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "1rem",
                          marginBottom: "1rem",
                        }}
                      >
                        <h3 style={{ fontSize: "1.25rem", margin: 0 }}>
                          {plan.node.name}
                        </h3>

                        <label
                          style={{
                            position: "relative",
                            display: "inline-block",
                            width: "52px",
                            height: "28px",
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={plan.isActive}
                            onChange={() => handleToggleActive(plan)}
                            style={{ opacity: 0, width: 0, height: 0 }}
                          />
                          <span
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              right: 0,
                              bottom: 0,
                              backgroundColor: plan.isActive
                                ? "#10b981"
                                : "#d1d5db",
                              borderRadius: "28px",
                              transition: "0.3s",
                            }}
                          >
                            <span
                              style={{
                                position: "absolute",
                                height: "22px",
                                width: "22px",
                                left: plan.isActive ? "26px" : "3px",
                                bottom: "3px",
                                backgroundColor: "white",
                                borderRadius: "50%",
                                transition: "0.3s",
                              }}
                            ></span>
                          </span>
                        </label>

                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            padding: "0.25rem 0.75rem",
                            backgroundColor: plan.isActive
                              ? "#f0fdf4"
                              : "#f3f4f6",
                            border: `1px solid ${plan.isActive ? "#86efac" : "#d1d5db"}`,
                            borderRadius: "9999px",
                          }}
                        >
                          <div
                            style={{
                              width: "8px",
                              height: "8px",
                              borderRadius: "50%",
                              backgroundColor: plan.isActive
                                ? "#22c55e"
                                : "#9ca3af",
                            }}
                          ></div>
                          <span
                            style={{
                              color: plan.isActive ? "#166534" : "#6b7280",
                              fontSize: "0.875rem",
                              fontWeight: "500",
                            }}
                          >
                            {plan.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </div>
                      <p
                        style={{
                          color: "#666",
                          marginBottom: "0.5rem",
                          fontSize: "0.9375rem",
                        }}
                      >
                        Billing: Every{" "}
                        {sellingPlan?.billingPolicy?.intervalCount}{" "}
                        {sellingPlan?.billingPolicy?.interval.toLowerCase()}(s)
                      </p>
                      {discount > 0 && (
                        <p
                          style={{
                            color: "#008060",
                            marginBottom: "0.5rem",
                            fontSize: "0.9375rem",
                          }}
                        >
                          Discount: {discount}%
                        </p>
                      )}
                      <p
                        style={{
                          color: "#666",
                          marginBottom: "0",
                          fontSize: "0.9375rem",
                        }}
                      >
                        Available for all products
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        onClick={() => handleEdit(plan)}
                        style={{
                          backgroundColor: "white",
                          color: "#202223",
                          padding: "0.5rem 1rem",
                          border: "1px solid #c9cccf",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontWeight: "500",
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(plan)}
                        style={{
                          backgroundColor: "#d82c0d",
                          color: "white",
                          padding: "0.5rem 1rem",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontWeight: "500",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit}>
          <div
            style={{
              backgroundColor: "white",
              border: "1px solid #e1e3e5",
              borderRadius: "8px",
              padding: "2rem",
              marginBottom: "2rem",
            }}
          >
            <h2 style={{ fontSize: "1.5rem", marginBottom: "1.5rem" }}>
              {editingPlan
                ? "Edit Subscription Plan"
                : "Create Subscription Plan"}
            </h2>

            <div style={{ marginBottom: "1.5rem" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "0.5rem",
                  fontWeight: "500",
                }}
              >
                Plan Name *
              </label>
              <input
                type="text"
                value={formData.planName}
                onChange={(e) =>
                  setFormData({ ...formData, planName: e.target.value })
                }
                placeholder="e.g., Monthly Subscription"
                required
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  border: "1px solid #c9cccf",
                  borderRadius: "4px",
                  fontSize: "1rem",
                }}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr",
                gap: "1rem",
                marginBottom: "1.5rem",
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "0.5rem",
                    fontWeight: "500",
                  }}
                >
                  Billing Interval *
                </label>
                <select
                  value={formData.billingInterval}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      billingInterval: e.target.value,
                    })
                  }
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: "1px solid #c9cccf",
                    borderRadius: "4px",
                    fontSize: "1rem",
                  }}
                >
                  <option value="DAY">Daily</option>
                  <option value="WEEK">Weekly</option>
                  <option value="MONTH">Monthly</option>
                  <option value="YEAR">Yearly</option>
                </select>
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "0.5rem",
                    fontWeight: "500",
                  }}
                >
                  Every *
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.intervalCount}
                  onChange={(e) =>
                    setFormData({ ...formData, intervalCount: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: "1px solid #c9cccf",
                    borderRadius: "4px",
                    fontSize: "1rem",
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "0.5rem",
                  fontWeight: "500",
                }}
              >
                Discount Percentage (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={formData.discountValue}
                onChange={(e) =>
                  setFormData({ ...formData, discountValue: e.target.value })
                }
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  border: "1px solid #c9cccf",
                  borderRadius: "4px",
                  fontSize: "1rem",
                }}
              />
            </div>

            <div
              style={{
                backgroundColor: "#f0fdf4",
                border: "1px solid #86efac",
                borderRadius: "6px",
                padding: "1rem",
                marginBottom: "1.5rem",
              }}
            >
              <p style={{ margin: 0, color: "#166534", fontSize: "0.9375rem" }}>
                📦 This subscription plan will be available for all products in
                your store. Customers can choose to subscribe when viewing any
                product.
              </p>
            </div>

            <div style={{ marginTop: "2rem", display: "flex", gap: "1rem" }}>
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  backgroundColor: isSubmitting ? "#c9cccf" : "#008060",
                  color: "white",
                  padding: "0.75rem 2rem",
                  border: "none",
                  borderRadius: "4px",
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                  fontSize: "1rem",
                  fontWeight: "500",
                }}
              >
                {isSubmitting
                  ? editingPlan
                    ? "Updating..."
                    : "Creating..."
                  : editingPlan
                    ? "Update Plan"
                    : "Create Subscription Plan"}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={isSubmitting}
                style={{
                  backgroundColor: "white",
                  color: "#202223",
                  padding: "0.75rem 2rem",
                  border: "1px solid #c9cccf",
                  borderRadius: "4px",
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                  fontSize: "1rem",
                  fontWeight: "500",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {existingPlans.length === 0 && !showForm && (
        <div
          style={{
            backgroundColor: "#f6f6f7",
            padding: "3rem",
            borderRadius: "8px",
            textAlign: "center",
          }}
        >
          <h2 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>
            Create your first subscription plan
          </h2>
          <p style={{ marginBottom: "1.5rem", color: "#666" }}>
            Start offering subscriptions to your customers. Create flexible
            plans with different billing frequencies and discounts.
          </p>
          <button
            onClick={() => setShowForm(true)}
            style={{
              backgroundColor: "#008060",
              color: "white",
              padding: "0.75rem 1.5rem",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "1rem",
              fontWeight: "500",
            }}
          >
            Create Your First Plan
          </button>
        </div>
      )}
    </div>
  );
}
