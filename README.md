# Off Dial Watches — lightweight ecommerce base

A minimal ecommerce backend wrapped around the supplied Off Dial HTML/CSS frontend.

## Current product

- **The Outlier**
- **£400**
- **£15 shipping**
- **GBP**
- **Made to order**
- **Dispatches within 10–14 days**
- **Fixed edition of 30**
- No customer-facing inventory counter

The backend internally reserves and counts edition slots so the edition cannot intentionally continue beyond 30.

## What is included

- Existing Off Dial HTML/CSS frontend
- One-product bag/cart UI
- Stripe Checkout session creation
- £400 item + £15 shipping line item
- Stripe webhook signature verification
- Idempotent paid-order handling
- PostgreSQL orders database
- Internal edition reservation/sold counter
- Automatic release when Stripe Checkout expires
- Optional Resend customer/admin emails
- Password-protected `/admin` orders page
- Order statuses: `PAID`, `MAKING`, `READY TO SHIP`, `SHIPPED`, `COMPLETED`
- Configurable international shipping-country list
- Environment variables for all secrets

## 1. Install

Requires Node.js 20+ and PostgreSQL.

```bash
npm install
cp .env.example .env
```

## 2. Connect a database

Create a PostgreSQL database (for example Neon, Supabase, Railway or Render) and put its connection string in:

```env
DATABASE_URL=postgresql://...
```

Then initialise it:

```bash
npm run db:init
```

## 3. Connect Stripe

After creating/logging into Stripe, add:

```env
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Set the webhook endpoint in Stripe to:

```text
https://YOUR-DOMAIN/api/stripe/webhook
```

Subscribe to:

- `checkout.session.completed`
- `checkout.session.expired`

For local webhook testing, Stripe CLI can forward events to:

```text
http://localhost:3000/api/stripe/webhook
```

## 4. Site URL

For local development:

```env
SITE_URL=http://localhost:3000
```

For production:

```env
SITE_URL=https://yourdomain.com
```

## 5. Admin

Set a strong username/password in `.env`:

```env
ADMIN_USER=admin
ADMIN_PASSWORD=a-long-random-password
```

Open `/admin` and the browser will request those credentials.

## 6. Email (optional)

The shop works without email configured. When the domain/email is ready, create a Resend account, verify the sending domain and set:

```env
RESEND_API_KEY=re_...
EMAIL_FROM=Off Dial Watches <orders@yourdomain.com>
ADMIN_EMAIL=you@yourdomain.com
```

Stripe can also be configured separately to issue its own payment receipts.

## 7. International import taxes

This starter uses a DAP-style customer notice: the £15 shipping charge does **not** include destination-country import duty, import VAT, brokerage or handling charges. The site tells international customers that these may be charged separately and are their responsibility.

Before launch, review this wording and your actual shipping/courier setup for the countries you serve.

## 8. Hosting

This is a normal Node/Express app. Hosts that support Node + environment variables + a persistent/external PostgreSQL database are suitable.

Typical deployment flow:

1. Upload/push the folder to your host.
2. Set the environment variables from `.env.example` in the host dashboard.
3. Run `npm install` and `npm run db:init` once.
4. Start with `npm start`.
5. Point your domain to the host.
6. Add the production webhook URL in Stripe.
7. Make a Stripe test-mode purchase before enabling live mode.

## Before taking live money

- Replace the placeholder contact email in `public/index.html` when your real address is ready.
- Confirm the product description/specifications on The Outlier page.
- Add/refine Terms, Returns, Privacy and Shipping pages.
- Decide exactly which countries you ship to and edit `SHIPPING_COUNTRIES`.
- Confirm the 10–14 day wording means dispatch time, not delivery transit time.
- Test successful payment, cancelled checkout and expired checkout.
- Change the default admin password.
- Use Stripe **test mode** first.


## GitHub-ready image structure

The embedded base64 images have been extracted to `public/images/`. The HTML now references those files normally, which keeps `public/index.html` well below GitHub's browser upload size limit. Upload the entire project folder contents to GitHub.
