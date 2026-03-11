## Email Notifications: Home Service Requests

Goal: when a **Home Service Request** is created, email your field technician at `afsalhomeservices@gmail.com`.

### Important note about "custom SMTP"
Supabase lets you configure SMTP for **Auth emails** (OTP, password reset, etc.). That SMTP is **not** automatically usable for sending arbitrary app emails from your React app.

For app notifications, you typically use one of these:

1) **Email API provider (Recommended)**: Resend / Postmark / SendGrid
2) **Your own server function** (Vercel/Render/etc.) that sends via SMTP (Nodemailer)

Direct SMTP from Supabase Edge Functions is often blocked (many serverless platforms do not allow outbound SMTP ports).

---

## Option A (Recommended): Email API + Supabase Edge Function

### Step 1: Pick an email API provider
Example: Resend (simple) or Postmark (more deliverable).

### Step 2: Create an API key
Save it in Supabase:
- Project Settings -> Functions -> Secrets
- Add a secret like `RESEND_API_KEY`

### Step 3: Create an Edge Function
Create a function (example name: `notify-home-service`) that:
- receives request details (customer name, phone, address, request_number)
- calls the email API to send to `afsalhomeservices@gmail.com`

### Step 4: Call the function when a request is created
Two choices:
- Client call (easy): after `.insert()` succeeds in `HomeServiceForm`, call the Edge Function.
- DB-trigger call (best): create a DB trigger that makes an HTTP call (requires `pg_net` and careful security).

---

## Option B: Vercel Serverless Function + Gmail SMTP (What you asked for)

This uses your Gmail SMTP (`lyfonthrottle@gmail.com`) to send emails.

### Step 1: Create a Gmail "App Password"
In Google Account -> Security:
- Enable 2-step verification
- Create an "App password" (mail)

You will get a 16-character password. Save it.

### Step 2: Store SMTP secrets (Never in frontend code)
If hosting on Vercel:
- Project Settings -> Environment Variables
  - `SMTP_HOST=smtp.gmail.com`
  - `SMTP_PORT=587`
  - `SMTP_USER=lyfonthrottle@gmail.com`
  - `SMTP_PASS=YOUR_APP_PASSWORD`
  - `NOTIFY_TO=afsalhomeservices@gmail.com`

### Step 3: Create a server endpoint that sends mail
Create `/api/notify-home-service` (Node runtime) using Nodemailer.

### Step 4: Call your API endpoint after request creation
After `.insert()` succeeds in the React app, do a `fetch('/api/notify-home-service', { ... })`.

---

## What to verify
- The email sender account can send to your technician (check spam)
- Rate limits / deliverability (Gmail SMTP can be throttled)
- Secrets are NOT exposed in the browser

