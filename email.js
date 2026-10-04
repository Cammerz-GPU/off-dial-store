import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function sendOrderConfirmation(order) {
  if (!resend || !process.env.EMAIL_FROM || !order.customer_email) return;

  await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: order.customer_email,
    subject: `Off Dial order ${order.public_id}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#171917">
        <h1 style="font-family:Georgia,serif;font-weight:400">Your Outlier is in motion.</h1>
        <p>Thanks for your order. The Outlier is made to order and is expected to dispatch within 10–14 days.</p>
        <p><strong>Order:</strong> ${order.public_id}<br>
        <strong>Watch:</strong> £400<br>
        <strong>Shipping:</strong> £15<br>
        <strong>Total:</strong> £415</p>
        <p>International orders may be subject to import duties, taxes or handling fees charged by the destination country. These are the customer's responsibility.</p>
      </div>`
  });

  if (process.env.ADMIN_EMAIL) {
    await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: process.env.ADMIN_EMAIL,
      subject: `New Off Dial order ${order.public_id}`,
      html: `<p>New paid order <strong>${order.public_id}</strong> for The Outlier.</p><p>Customer: ${order.customer_email}</p>`
    });
  }
}
