# Trekrilluxe Tours and Safaris

The website uses a React frontend, a Node.js REST API, and PostgreSQL. The frontend and API can be deployed separately; Supabase can host the PostgreSQL database.

## Project layout

- `frontend/` — React application, Vite build setup, shared stylesheet, and brand images.
- `backend/` — Node.js API and PostgreSQL connection/schema initialization.

## Local development

Requirements: Node.js 18 or newer, npm, and a reachable PostgreSQL database.

1. Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL` to your PostgreSQL connection string. Never commit or share the real `.env` file.
2. Copy `frontend/.env.example` to `frontend/.env.local`. Set the Supabase project URL and public anon/publishable key from your Supabase project's API settings. These frontend values are public; do not put a database password or service-role key in the frontend.

3. In one terminal, install and start the API:

   ```powershell
   cd backend
   npm install
   npm start
   ```

   The API listens on `http://localhost:4000`. Keep the connection string private.

4. In a second terminal, install and start the React development server:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

5. Open the Vite URL printed in the terminal (normally `http://localhost:5173`). In development, the frontend sends API requests to `http://localhost:4000` by default.

The backend creates the application tables and indexes on startup. On the first initialization, it seeds testimonials and site settings from `backend/data/site-content.json`; a database migration marker ensures this seed runs only once. Later starts do not re-seed or overwrite admin edits. Existing database records are left unchanged. Tours, bookings, messages, and subscribers are not imported from hardcoded data; manage tours and site content in the owner admin dashboard.

To use a different API URL, set `VITE_API_BASE_URL` in `frontend/.env.local` to the backend origin. A trailing `/api` is also accepted:

```text
VITE_API_BASE_URL=https://your-api-service.onrender.com
```

The API base URL is public frontend configuration; never put database credentials or private keys in a `VITE_*` variable. The frontend removes a trailing `/api` automatically, so requests use the right API path either way.

## Deployment

### React frontend on Render Static Site

- Root directory: `frontend`
- Build command: `npm install && npm run build`
- Publish directory: `dist`
- Set `VITE_API_BASE_URL` to the public HTTPS URL of the backend before building.

The `public/_redirects` file routes direct visits to extensionless pages such as `/contact`, `/tours`, and `/booking` back through the React app. Existing `.html` URLs remain supported for older links.

### Node API on Render Web Service

The root `render.yaml` defines the backend as a Render Web Service. To deploy the backend first:

1. Push this project to a Git provider connected to Render, then create a new **Blueprint** in Render using that repository.
2. Provide `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `FRONTEND_ORIGIN`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM_EMAIL` when prompted. Render generates `ADMIN_TOKEN_SECRET` automatically and defaults `SMTP_PORT` to `587`. Use an admin password of at least 12 characters and set `FRONTEND_ORIGIN` to the exact React site origin (scheme and hostname, without a path or trailing slash). If you deploy the backend first, update `FRONTEND_ORIGIN` to the deployed site origin when it becomes available; do not use `*` in production.
3. Wait for the service to deploy and copy its `https://…onrender.com` URL. Set that URL as `VITE_API_BASE_URL` when you build/deploy the frontend.

The Blueprint uses `backend/`, `npm install`, and `npm start`; Render supplies the port. Keep the database URL, password, and Supabase secret key in Render's private environment settings, never in the frontend or source control. Add the optional M-Pesa variables from the setup section below when you are ready to enable payments.

The contact form saves each message in PostgreSQL and emails a notification to `trekrilluxesafaris@proton.me`. Configure the backend SMTP settings above with credentials for a verified sender mailbox. The visitor's email is set as `Reply-To`; it must not be used as the sender address because SMTP providers reject unauthenticated sender addresses. Use your mail provider's SMTP credentials or token (not a normal account password where SMTP tokens are required). Port `587` uses STARTTLS; port `465` uses TLS.

The API preserves the existing public routes:

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/tours` | List tour packages |
| GET | `/api/tours/:id` | Get a tour package |
| GET | `/api/reviews?tourId=:id` | List public ratings for a tour (latest 12, with average and count) |
| POST | `/api/reviews` | Publish a visitor rating for a published tour |
| POST | `/api/bookings` | Submit a booking request |
| POST | `/api/payments/mpesa/stk-push` | Start an M-Pesa STK Push for a saved booking |
| GET | `/api/payments/mpesa/status?checkoutRequestId=:id` | Check an M-Pesa payment result |
| POST | `/api/payments/mpesa/callback` | Receive Safaricom payment results |
| POST | `/api/contact` | Submit a contact message |

Tours, bookings, visitor ratings, contact messages, page analytics, site content, settings, and M-Pesa payment results are stored in PostgreSQL using the `postgres` client. Visitors can rate a published hike or tour from the Tour Packages page; their ratings appear publicly as soon as submitted. The admin API reads and writes tours, bookings, and site content in the same database. Keep the database connection string only on the backend host. The `/api/tours` response contains tour objects from PostgreSQL, not database row wrappers or static frontend data.

### M-Pesa STK Push setup

Create a Daraja app and set the following as private backend environment variables (never use `VITE_*` variables for payment credentials):

- `MPESA_ENVIRONMENT`: `sandbox` for testing or `production` for live payments.
- `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, and `MPESA_PASSKEY`: values issued for the matching Daraja environment.
- `MPESA_TRANSACTION_TYPE`: usually `CustomerPayBillOnline`; use the transaction type issued for your Paybill or Till.
- `MPESA_CALLBACK_TOKEN`: a long random secret used to authenticate callbacks.
- `MPESA_CALLBACK_URL`: the public HTTPS URL ending in `/api/payments/mpesa/callback?token=...`, using the same token value. Local testing needs a public HTTPS tunnel to the backend.

After a booking request is saved, the customer can explicitly request an STK Push. The backend calculates the full amount from the saved tour price and traveler count; it does not trust a browser-supplied amount. The customer enters their M-Pesa phone number, and the backend updates payment status from Safaricom's callback. A booking remains subject to staff confirming availability even after payment. Configure working credentials and a reachable callback URL before enabling live payments.

## Owner admin

Visit `/admin` on the React site. Sign in with the `ADMIN_EMAIL` and `ADMIN_PASSWORD` configured as private backend environment variables. These fixed admin credentials do not depend on Supabase Auth. The backend issues a signed session token that expires after 12 hours and verifies it for every admin API request. Use a long, unique password and keep `ADMIN_TOKEN_SECRET` private; neither the password nor signing secret is included in the frontend bundle.

The admin supports creating, editing, publishing/unpublishing, and deleting tour/hike listings; reviewing bookings and changing their status; viewing per-tour booking and traveler totals for a date range; downloading CSV reports; and viewing page-view counts from the last 30 days.

Tour prices are stored as numbers in PostgreSQL and displayed as Kenyan shillings (KSh) on the website, booking form, and admin dashboard. Enter tour prices in KSh; existing stored price amounts are not converted.

The **Site content** admin section manages testimonials: owners can add, edit, reorder, and delete entries. The **Settings** editor manages the company description, contact and booking details, office hours, WhatsApp Channel invite link, and social links used around the site. Public pages read these settings and testimonials from the API, so updates saved in admin are reflected on the site.

For the frontend build, set `VITE_API_BASE_URL` to the backend URL. Admin credentials are configured only on the backend, never as `VITE_*` variables.

Tour and site-content image uploads use a public Supabase Storage bucket named `tour-images`. Create this bucket in the Supabase dashboard with public access enabled, a 5 MB file-size limit, and JPEG, PNG, and WebP allowed. The admin sends uploads through the authenticated backend; the backend uses `SUPABASE_SECRET_KEY` (a key beginning with `sb_secret_`), which must remain private, to write the files. A legacy JWT `service_role` key can alternatively be provided as `SUPABASE_SERVICE_ROLE_KEY`. No user-email Storage policy or Supabase Auth sign-in is needed. The returned public URL is saved with the tour or site-content record in PostgreSQL.

For local development, set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_TOKEN_SECRET`, and `SUPABASE_SECRET_KEY` in the ignored `backend/.env` file. Generate a signing secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and use a long, unique password. Set the same variable names as private environment variables on the backend host (use a different signing secret and password in production). Never commit `.env` or put these values in `frontend/.env.local`.

## Frontend behavior

The React app retains its Home, About, Tours, Contact, and Booking pages, tour category filters, tour detail dialogs, booking links with `?tour=ID`, contact and booking forms, numeric visitor tour ratings, M-Pesa STK Push checkout, and a local tour-help chatbot. The footer links to a WhatsApp Channel; the invite URL can be edited in Admin settings. The home hero rotates through published tour images when available and uses the built-in safari and travel photos as a fallback. Destination and Gallery pages and their admin content management have been removed. The API client is in `frontend/src/api.js`; the site styles remain in `frontend/css/style.css`.

If ratings or tour preselection fail, deploy/restart the latest backend and rebuild the frontend with `VITE_API_BASE_URL` pointing to that API. The API must return each tour's database `id`; without it, rating requests cannot select a tour and booking links cannot preselect one. The default local setting targets `http://localhost:4000`.

For production, keep admin credentials private, configure CORS to the deployed frontend origin, and use separate development and production databases.
