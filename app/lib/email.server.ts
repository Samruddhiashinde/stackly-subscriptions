import nodemailer from "nodemailer";

// Create email transporter
function getEmailTransporter() {
  // For now, using a simple SMTP setup
  // You can configure this with your email service (Gmail, SendGrid, etc.)
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  return transporter;
}

// Send email notification for subscription payment
export async function sendSubscriptionPaymentEmail(
  customerName: string,
  customerEmail: string,
  subscriptionPlanName: string,
  amount: number,
  currency: string = "INR",
  orderId?: string
) {
  // Skip email if SMTP is not configured
  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    console.log("Email not configured - skipping email notification");
    console.log(`Would send email: Subscription payment - ${customerName} - ${subscriptionPlanName} - ${currency} ${amount.toFixed(2)}`);
    return;
  }

  const recipientEmail = process.env.NOTIFICATION_EMAIL || "samruddhi@sorted.agency";

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: recipientEmail,
    subject: `New Subscription Payment - ${subscriptionPlanName}`,
    html: `
      <h2>New Subscription Payment Received</h2>
      <p><strong>Customer Name:</strong> ${customerName}</p>
      <p><strong>Customer Email:</strong> ${customerEmail}</p>
      <p><strong>Subscription Plan:</strong> ${subscriptionPlanName}</p>
      <p><strong>Amount:</strong> ${currency} ${amount.toFixed(2)}</p>
      ${orderId ? `<p><strong>Shopify Order ID:</strong> ${orderId}</p>` : ""}
      <p><strong>Payment Date:</strong> ${new Date().toLocaleString()}</p>
    `,
    text: `
      New Subscription Payment Received

      Customer Name: ${customerName}
      Customer Email: ${customerEmail}
      Subscription Plan: ${subscriptionPlanName}
      Amount: ${currency} ${amount.toFixed(2)}
      ${orderId ? `Shopify Order ID: ${orderId}` : ""}
      Payment Date: ${new Date().toLocaleString()}
    `,
  };

  try {
    const transporter = getEmailTransporter();
    await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully to ${recipientEmail}`);
  } catch (error) {
    console.error("Error sending email:", error);
    // Don't throw - email failures shouldn't break the flow
  }
}

// Send email for first-time subscription setup
export async function sendSubscriptionSetupEmail(
  customerName: string,
  customerEmail: string,
  subscriptionPlanName: string,
  razorpaySubscriptionId: string
) {
  // Skip email if SMTP is not configured
  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    console.log("Email not configured - skipping email notification");
    console.log(`Would send email: Subscription setup - ${customerName} - ${subscriptionPlanName} - ${razorpaySubscriptionId}`);
    return;
  }

  const recipientEmail = process.env.NOTIFICATION_EMAIL || "samruddhi@sorted.agency";

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: recipientEmail,
    subject: `New Subscription Setup - ${subscriptionPlanName}`,
    html: `
      <h2>New Subscription Setup</h2>
      <p><strong>Customer Name:</strong> ${customerName}</p>
      <p><strong>Customer Email:</strong> ${customerEmail}</p>
      <p><strong>Subscription Plan:</strong> ${subscriptionPlanName}</p>
      <p><strong>Razorpay Subscription ID:</strong> ${razorpaySubscriptionId}</p>
      <p><strong>Setup Date:</strong> ${new Date().toLocaleString()}</p>
    `,
    text: `
      New Subscription Setup

      Customer Name: ${customerName}
      Customer Email: ${customerEmail}
      Subscription Plan: ${subscriptionPlanName}
      Razorpay Subscription ID: ${razorpaySubscriptionId}
      Setup Date: ${new Date().toLocaleString()}
    `,
  };

  try {
    const transporter = getEmailTransporter();
    await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully to ${recipientEmail}`);
  } catch (error) {
    console.error("Error sending email:", error);
    // Don't throw - email failures shouldn't break the flow
  }
}

