import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, withTransaction } from './db.js';
import { stripe } from './stripe.js';
import { sendOrderConfirmation } from './email.js';
import { requireAdmin } from './auth.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');
const PORT = process.env.PORT || 3000;
const SITE_URL = (process.env.SITE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

// Stripe requires the exact raw body for signature verification.
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).send('Stripe webhook is not configured.');

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Invalid webhook signature: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') await completeCheckout(event);
    if (event.type === 'checkout.session.expired') await releaseReservation(event.data.object.id);
    res.json({ received: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.post('/api/checkout', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe is not connected yet.' });
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'Database is not connected yet.' });
  if (req.body.productId !== 'outlier') return res.status(400).json({ error: 'Unknown product.' });

  let reservation;
  try {
    reservation = await withTransaction(async client => {
      const { rows } = await client.query('SELECT * FROM products WHERE id=$1 FOR UPDATE', ['outlier']);
      const product = rows[0];
      if (!product || !product.active) throw new Error('NOT_AVAILABLE');
      if (product.sold_count + product.reserved_count >= product.edition_size) throw new Error('SOLD_OUT');

      const publicId = `OD-${new Date().getUTCFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const order = await client.query(`
        INSERT INTO orders (public_id, product_id, amount_product_pence, amount_shipping_pence, amount_total_pence, currency)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [publicId, product.id, product.price_pence, product.shipping_pence, product.price_pence + product.shipping_pence, product.currency]
      );
      await client.query('UPDATE products SET reserved_count=reserved_count+1, updated_at=NOW() WHERE id=$1', [product.id]);
      return { order: order.rows[0], product };
    });
  } catch (err) {
    if (err.message === 'SOLD_OUT') return res.status(409).json({ error: 'The Outlier edition has sold out.' });
    if (err.message === 'NOT_AVAILABLE') return res.status(409).json({ error: 'The Outlier is not currently available.' });
    console.error(err); return res.status(500).json({ error: 'Could not reserve this piece.' });
  }

  const shippingCountries = (process.env.SHIPPING_COUNTRIES || 'GB').split(',').map(x => x.trim()).filter(Boolean);
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_creation: 'always',
      billing_address_collection: 'required',
      shipping_address_collection: { allowed_countries: shippingCountries },
      phone_number_collection: { enabled: true },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'gbp',
            unit_amount: 40000,
            product_data: {
              name: 'The Outlier',
              description: 'Limited edition of 30 · Made to order · Dispatches within 10–14 days'
            }
          }
        },
        {
          quantity: 1,
          price_data: {
            currency: 'gbp',
            unit_amount: 1500,
            product_data: { name: 'Shipping' }
          }
        }
      ],
      metadata: { order_id: String(reservation.order.id), public_id: reservation.order.public_id, product_id: 'outlier' },
      success_url: `${SITE_URL}/?paid=1&session_id={CHECKOUT_SESSION_ID}#shop`,
      cancel_url: `${SITE_URL}/#product-1`
    });

    await pool.query('UPDATE orders SET stripe_checkout_session_id=$1, updated_at=NOW() WHERE id=$2', [session.id, reservation.order.id]);
    res.json({ url: session.url });
  } catch (err) {
    await withTransaction(async client => {
      const { rowCount } = await client.query("UPDATE orders SET reservation_state='released', payment_status='failed', updated_at=NOW() WHERE id=$1 AND reservation_state='reserved'", [reservation.order.id]);
      if (rowCount) await client.query('UPDATE products SET reserved_count=GREATEST(reserved_count-1,0), updated_at=NOW() WHERE id=$1', ['outlier']);
    });
    console.error(err);
    res.status(500).json({ error: 'Could not open Stripe Checkout.' });
  }
});

app.get('/api/order/:sessionId', async (req, res) => {
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'Database not configured.' });
  const { rows } = await pool.query('SELECT public_id, payment_status, fulfilment_status FROM orders WHERE stripe_checkout_session_id=$1', [req.params.sessionId]);
  if (!rows[0]) return res.status(404).json({ error: 'Order not found.' });
  res.json(rows[0]);
});

app.get('/admin', requireAdmin, async (req, res) => {
  const { rows } = await pool.query(`SELECT public_id, customer_email, customer_name, payment_status, fulfilment_status, amount_total_pence, created_at, paid_at FROM orders ORDER BY created_at DESC LIMIT 200`);
  const table = rows.map(o => `<tr><td>${escapeHtml(o.public_id)}</td><td>${escapeHtml(o.customer_email || '—')}</td><td>${escapeHtml(o.payment_status)}</td><td>
    <form method="post" action="/admin/orders/${encodeURIComponent(o.public_id)}/status"><select name="status">${['PAID','MAKING','READY TO SHIP','SHIPPED','COMPLETED'].map(s => `<option ${o.fulfilment_status===s?'selected':''}>${s}</option>`).join('')}</select><button>Save</button></form>
    </td><td>£${(o.amount_total_pence/100).toFixed(2)}</td><td>${new Date(o.created_at).toLocaleString('en-GB')}</td></tr>`).join('');
  res.send(`<!doctype html><meta name="viewport" content="width=device-width"><title>Off Dial Orders</title><style>body{font-family:Arial;padding:24px;color:#171917}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:12px;border-bottom:1px solid #ddd}select,button{padding:7px}h1{font-family:Georgia,serif;font-weight:400}</style><h1>Off Dial orders</h1><table><thead><tr><th>Order</th><th>Customer</th><th>Payment</th><th>Status</th><th>Total</th><th>Created</th></tr></thead><tbody>${table || '<tr><td colspan="6">No orders yet.</td></tr>'}</tbody></table>`);
});

app.post('/admin/orders/:publicId/status', requireAdmin, async (req, res) => {
  const allowed = new Set(['PAID','MAKING','READY TO SHIP','SHIPPED','COMPLETED']);
  if (!allowed.has(req.body.status)) return res.status(400).send('Invalid status');
  await pool.query("UPDATE orders SET fulfilment_status=$1, shipped_at=CASE WHEN $1='SHIPPED' AND shipped_at IS NULL THEN NOW() ELSE shipped_at END, updated_at=NOW() WHERE public_id=$2", [req.body.status, req.params.publicId]);
  res.redirect('/admin');
});

app.use(express.static(publicDir));
app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

async function completeCheckout(event) {
  const session = event.data.object;
  const orderId = session.metadata?.order_id;
  if (!orderId) return;

  const order = await withTransaction(async client => {
    const existing = await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [orderId]);
    if (!existing.rows[0]) return null;
    const current = existing.rows[0];
    if (current.payment_status === 'paid') return current;

    const product = await client.query('SELECT * FROM products WHERE id=$1 FOR UPDATE', [current.product_id]);
    if (!product.rows[0]) throw new Error('Product not found');

    await client.query(`UPDATE orders SET stripe_event_id=$1, stripe_payment_intent_id=$2, customer_email=$3, customer_name=$4,
      shipping_name=$5, shipping_address=$6, payment_status='paid', fulfilment_status='PAID', reservation_state='sold', paid_at=NOW(), updated_at=NOW() WHERE id=$7`, [
      event.id,
      typeof session.payment_intent === 'string' ? session.payment_intent : null,
      session.customer_details?.email || session.customer_email || null,
      session.customer_details?.name || null,
      session.shipping_details?.name || null,
      JSON.stringify(session.shipping_details?.address || null),
      orderId
    ]);
    await client.query('UPDATE products SET reserved_count=GREATEST(reserved_count-1,0), sold_count=sold_count+1, active=(sold_count+1 < edition_size), updated_at=NOW() WHERE id=$1', [current.product_id]);
    const updated = await client.query('SELECT * FROM orders WHERE id=$1', [orderId]);
    return updated.rows[0];
  });

  if (order) {
    try { await sendOrderConfirmation(order); } catch (err) { console.error('Email failed:', err); }
  }
}

async function releaseReservation(sessionId) {
  await withTransaction(async client => {
    const { rows } = await client.query('SELECT * FROM orders WHERE stripe_checkout_session_id=$1 FOR UPDATE', [sessionId]);
    const order = rows[0];
    if (!order || order.reservation_state !== 'reserved') return;
    await client.query("UPDATE orders SET reservation_state='released', payment_status='expired', updated_at=NOW() WHERE id=$1", [order.id]);
    await client.query('UPDATE products SET reserved_count=GREATEST(reserved_count-1,0), updated_at=NOW() WHERE id=$1', [order.product_id]);
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

app.listen(PORT, () => console.log(`Off Dial running at ${SITE_URL}`));
