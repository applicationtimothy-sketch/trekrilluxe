/* =========================================================================
   Trekrilluxe Tours and Safaris — Backend Server
   ---------------------------------------------------------------------
   A lightweight Node.js server that:
     1. Optionally serves the built React frontend from ../frontend/dist
     2. Exposes a JSON REST API under /api/*
     3. Persists tours, bookings, messages, and subscribers in PostgreSQL

   Configure DATABASE_URL, then run with: node server.js
   Then open: http://localhost:4000  in any browser.
   ========================================================================= */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { sql, initializeDatabase } = require('./database');

const PORT = process.env.PORT || 4000;
const ROOT_DIR = __dirname;
const FRONTEND_DIR = path.join(ROOT_DIR, '..', 'frontend', 'dist');
/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

function sendJSON(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': process.env.FRONTEND_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function collectBody(req, maxBytes = 1e6) {
  return new Promise((resolve, reject) => {
    let data = '';
    let tooLarge = false;
    req.on('data', (chunk) => {
      if (tooLarge) return;
      data += chunk;
      if (data.length > maxBytes) {
        tooLarge = true;
        data = '';
      }
    });
    req.on('end', () => {
      if (tooLarge) return reject(new Error('Payload too large'));
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getMpesaConfigError() {
  const required = ['MPESA_CONSUMER_KEY', 'MPESA_CONSUMER_SECRET', 'MPESA_SHORTCODE', 'MPESA_PASSKEY', 'MPESA_CALLBACK_URL', 'MPESA_CALLBACK_TOKEN'];
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length) return `M-Pesa is not configured. Set ${missing.join(', ')} on the backend.`;
  if (process.env.MPESA_CALLBACK_TOKEN.length < 32) return 'MPESA_CALLBACK_TOKEN must be at least 32 characters.';
  try {
    const callbackUrl = new URL(process.env.MPESA_CALLBACK_URL);
    if (callbackUrl.protocol !== 'https:') return 'MPESA_CALLBACK_URL must be a public HTTPS URL.';
    if (callbackUrl.searchParams.get('token') !== process.env.MPESA_CALLBACK_TOKEN) {
      return 'MPESA_CALLBACK_URL must include the configured callback token as the token query parameter.';
    }
  } catch {
    return 'MPESA_CALLBACK_URL must be a valid public HTTPS URL.';
  }
  if (!['sandbox', 'production'].includes((process.env.MPESA_ENVIRONMENT || 'sandbox').toLowerCase())) {
    return 'MPESA_ENVIRONMENT must be sandbox or production.';
  }
  return '';
}

function getMpesaApiBase() {
  return (process.env.MPESA_ENVIRONMENT || 'sandbox').toLowerCase() === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
}

async function fetchMpesa(requestUrl, options) {
  try {
    return await fetch(requestUrl, options);
  } catch (error) {
    const host = new URL(requestUrl).hostname;
    const causeCode = error.cause?.code;
    if (error.name === 'TimeoutError' || causeCode === 'UND_ERR_CONNECT_TIMEOUT') {
      throw new Error(`Connection to ${host} timed out. Check the backend's outbound HTTPS access and network availability.`);
    }
    throw new Error(`Could not connect to ${host}${causeCode ? ` (${causeCode})` : ''}. Check the backend's outbound HTTPS, DNS, and TLS connectivity.`);
  }
}

function normalizeMpesaPhone(value) {
  if (typeof value !== 'string') return '';
  let phone = value.replace(/[^\d+]/g, '');
  if (phone.startsWith('+')) phone = phone.slice(1);
  if (phone.startsWith('0')) phone = `254${phone.slice(1)}`;
  if (phone.startsWith('7') || phone.startsWith('1')) phone = `254${phone}`;
  return /^254[17]\d{8}$/.test(phone) ? phone : '';
}

function mpesaTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}${values.month}${values.day}${values.hour}${values.minute}${values.second}`;
}

async function getMpesaAccessToken() {
  const credentials = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
  const response = await fetchMpesa(`${getMpesaApiBase()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
    signal: AbortSignal.timeout(20000)
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error('M-Pesa authentication returned an invalid response.');
  }
  if (!response.ok || typeof body.access_token !== 'string') {
    throw new Error(`M-Pesa authentication failed (HTTP ${response.status}).`);
  }
  return body.access_token;
}

async function requestMpesaStkPush({ phone, amount, bookingId }) {
  const accessToken = await getMpesaAccessToken();
  const timestamp = mpesaTimestamp();
  const shortcode = process.env.MPESA_SHORTCODE.trim();
  const password = Buffer.from(`${shortcode}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64');
  const response = await fetchMpesa(`${getMpesaApiBase()}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: process.env.MPESA_TRANSACTION_TYPE || 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: phone,
      PartyB: shortcode,
      PhoneNumber: phone,
      CallBackURL: process.env.MPESA_CALLBACK_URL.trim(),
      AccountReference: `T${bookingId}`,
      TransactionDesc: `T${bookingId}`
    })
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error('M-Pesa returned an invalid STK Push response.');
  }
  if (!response.ok || body.ResponseCode !== '0' || !body.CheckoutRequestID) {
    throw new Error(body.errorMessage || body.CustomerMessage || `M-Pesa rejected the STK Push request (HTTP ${response.status}).`);
  }
  return body;
}

function validateTour(tour) {
  const requiredText = ['title', 'category', 'theme', 'duration', 'groupSize', 'badge', 'shortDesc', 'longDesc'];
  if (!tour || typeof tour !== 'object' || Array.isArray(tour)) return 'Tour data must be an object.';
  if (requiredText.some((field) => typeof tour[field] !== 'string' || !tour[field].trim())) {
    return 'Complete all required tour fields.';
  }
  if (!Number.isFinite(Number(tour.price)) || Number(tour.price) < 0) return 'Price must be a non-negative number.';
  if (!Array.isArray(tour.highlights) || tour.highlights.some((item) => typeof item !== 'string')) {
    return 'Highlights must be an array of text values.';
  }
  if (tour.imageUrl !== undefined && typeof tour.imageUrl !== 'string') return 'Image URL must be text.';
  if (tour.isPublished !== undefined && typeof tour.isPublished !== 'boolean') return 'Published must be true or false.';
  return '';
}

function validateSiteContent(section, item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return 'Content must be an object.';
  if (section !== 'testimonials') return 'Unknown site content section.';
  const requiredText = ['name', 'location', 'quote', 'initial'];
  if (requiredText.some((field) => typeof item[field] !== 'string' || !item[field].trim())) {
    return 'Complete all required content fields.';
  }
  if (item.imageUrl !== undefined && (typeof item.imageUrl !== 'string' || (item.imageUrl && !/^https?:\/\//i.test(item.imageUrl)))) {
    return 'Image URL must be an HTTP or HTTPS URL.';
  }
  if (item.sortOrder !== undefined && (!Number.isSafeInteger(Number(item.sortOrder)) || Number(item.sortOrder) < 0)) {
    return 'Sort order must be a non-negative whole number.';
  }
  return '';
}

function validateSiteSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return 'Site settings must be an object.';
  const requiredText = ['companyDescription', 'location', 'phone', 'email', 'officeHours', 'bookingEmail', 'bookingPhone', 'whatsapp'];
  if (requiredText.some((field) => typeof settings[field] !== 'string')) return 'Complete all contact and footer settings.';
  if (!isValidEmail(settings.email) || !isValidEmail(settings.bookingEmail)) return 'Provide valid contact email addresses.';
  if (!Array.isArray(settings.socialLinks)) return 'Social links must be a list.';
  for (const link of settings.socialLinks) {
    if (!link || typeof link !== 'object' || ['id', 'label', 'url'].some((field) => typeof link[field] !== 'string')) {
      return 'Each social link must include an id, label, and URL.';
    }
    if (link.url && !/^(https?:\/\/|mailto:|tel:)/i.test(link.url)) return 'Social links must use HTTP, HTTPS, mailto, or tel URLs.';
  }
  return '';
}

function constantTimeEqual(left, right) {
  const leftDigest = crypto.createHash('sha256').update(left).digest();
  const rightDigest = crypto.createHash('sha256').update(right).digest();
  return crypto.timingSafeEqual(leftDigest, rightDigest);
}

function createAdminToken(email) {
  const payload = Buffer.from(JSON.stringify({
    email,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', process.env.ADMIN_TOKEN_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function getAdminTokenUser(token) {
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined) return null;

  const expected = crypto.createHmac('sha256', process.env.ADMIN_TOKEN_SECRET).update(payload).digest('base64url');
  if (!constantTimeEqual(signature, expected)) return null;

  try {
    const user = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof user.email !== 'string' || user.email.toLowerCase() !== process.env.ADMIN_EMAIL.toLowerCase()) return null;
    if (!Number.isSafeInteger(user.exp) || user.exp <= Math.floor(Date.now() / 1000)) return null;
    return user;
  } catch {
    return null;
  }
}

function adminAuthConfigured() {
  const adminEmail = process.env.ADMIN_EMAIL;
  return Boolean(adminEmail && process.env.ADMIN_PASSWORD?.length >= 12 && process.env.ADMIN_TOKEN_SECRET?.length >= 32);
}

function authenticateAdmin(req, res) {
  if (!adminAuthConfigured()) {
    sendJSON(res, 503, { success: false, error: 'Set ADMIN_EMAIL and configure ADMIN_PASSWORD (12+ characters) and ADMIN_TOKEN_SECRET (32+ characters) on the backend.' });
    return null;
  }
  const authorization = req.headers.authorization || '';
  if (!authorization.startsWith('Bearer ')) {
    sendJSON(res, 401, { success: false, error: 'Sign in is required.' });
    return null;
  }

  const user = getAdminTokenUser(authorization.slice('Bearer '.length));
  if (!user) {
    sendJSON(res, 401, { success: false, error: 'Your admin session is invalid or expired. Please sign in again.' });
    return null;
  }
  return user;
}

const adminLoginAttempts = new Map();
const reviewSubmissionAttempts = new Map();
const mpesaSubmissionAttempts = new Map();
function isAdminLoginRateLimited(ip) {
  const now = Date.now();
  const attempts = (adminLoginAttempts.get(ip) || []).filter((timestamp) => now - timestamp < 15 * 60 * 1000);
  if (attempts.length >= 5) {
    adminLoginAttempts.set(ip, attempts);
    return true;
  }
  attempts.push(now);
  adminLoginAttempts.set(ip, attempts);
  return false;
}

function isReviewSubmissionRateLimited(ip) {
  const now = Date.now();
  const attempts = (reviewSubmissionAttempts.get(ip) || []).filter((timestamp) => now - timestamp < 15 * 60 * 1000);
  if (attempts.length >= 5) {
    reviewSubmissionAttempts.set(ip, attempts);
    return true;
  }
  attempts.push(now);
  reviewSubmissionAttempts.set(ip, attempts);
  return false;
}

function isMpesaSubmissionRateLimited(ip) {
  const now = Date.now();
  const attempts = (mpesaSubmissionAttempts.get(ip) || []).filter((timestamp) => now - timestamp < 15 * 60 * 1000);
  if (attempts.length >= 5) {
    mpesaSubmissionAttempts.set(ip, attempts);
    return true;
  }
  attempts.push(now);
  mpesaSubmissionAttempts.set(ip, attempts);
  return false;
}

const imageContentTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp']
]);

async function uploadAdminImage(req, res) {
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!serviceRoleKey || !supabaseUrl) {
    sendJSON(res, 503, { success: false, error: 'Image uploads require SUPABASE_URL and SUPABASE_SECRET_KEY on the backend.' });
    return;
  }
  const isSecretApiKey = serviceRoleKey.startsWith('sb_secret_');
  const isLegacyServiceRoleJwt = serviceRoleKey.startsWith('eyJ') && serviceRoleKey.split('.').length === 3;
  if (!isSecretApiKey && !isLegacyServiceRoleJwt) {
    sendJSON(res, 503, { success: false, error: 'The backend upload key is not a Supabase secret key (sb_secret_...) or legacy service_role JWT.' });
    return;
  }

  const body = await collectBody(req, 8 * 1024 * 1024);
  const extension = imageContentTypes.get(body.contentType);
  const validSections = new Set(['tours', 'testimonials']);
  if (!extension || !validSections.has(body.section) || typeof body.fileBase64 !== 'string' ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.fileBase64)) {
    sendJSON(res, 400, { success: false, error: 'Choose a valid JPG, PNG, or WebP image.' });
    return;
  }

  const file = Buffer.from(body.fileBase64, 'base64');
  if (!file.length || file.length > 5 * 1024 * 1024) {
    sendJSON(res, 400, { success: false, error: 'Image must be larger than 0 bytes and 5 MB or smaller.' });
    return;
  }

  const storagePath = `${body.section}/${crypto.randomUUID()}.${extension}`;
  let response;
  try {
    const headers = {
      apikey: serviceRoleKey,
      'Content-Type': body.contentType,
      'Cache-Control': 'max-age=3600',
      'x-upsert': 'false'
    };
    if (isLegacyServiceRoleJwt) headers.Authorization = `Bearer ${serviceRoleKey}`;
    response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/tour-images/${storagePath}`, {
      method: 'POST',
      headers,
      body: file
    });
  } catch {
    sendJSON(res, 502, { success: false, error: 'Unable to reach Supabase Storage.' });
    return;
  }

  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    sendJSON(res, 502, { success: false, error: details.message || details.error || 'Supabase Storage rejected the image upload.' });
    return;
  }

  const url = `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/tour-images/${storagePath}`;
  sendJSON(res, 201, { success: true, data: { url } });
}

function isValidDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

/* ------------------------------------------------------------------ *
 * Static file serving
 * ------------------------------------------------------------------ */

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function serveStatic(req, res, pathname) {
  let safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  if (pathname === '/' || safePath === path.sep || safePath === '') safePath = 'index.html';

  const filePath = path.join(FRONTEND_DIR, safePath);

  // Prevent path traversal outside the frontend directory
  if (!filePath.startsWith(FRONTEND_DIR)) {
    sendPlainText(res, 403, 'Forbidden');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        if (path.extname(safePath) && path.extname(safePath) !== '.html') {
          sendPlainText(res, 404, '404 Not Found');
          return;
        }
        fs.readFile(path.join(FRONTEND_DIR, 'index.html'), (indexError, indexContent) => {
          if (indexError) {
            sendPlainText(res, 404, 'Frontend build not found. Run npm run build in the frontend directory.');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(indexContent);
        });
        return;
      }
      sendPlainText(res, 500, 'Server Error: ' + err.code);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

function sendPlainText(res, statusCode, text) {
  res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

/* ------------------------------------------------------------------ *
 * API route handlers
 * ------------------------------------------------------------------ */

async function handleApi(req, res, pathname) {
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': process.env.FRONTEND_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  if (pathname === '/api/admin/login' && method === 'POST') {
    if (!adminAuthConfigured()) {
      sendJSON(res, 503, { success: false, error: 'Set ADMIN_EMAIL and configure ADMIN_PASSWORD (12+ characters) and ADMIN_TOKEN_SECRET (32+ characters) on the backend.' });
      return;
    }

    const ip = req.socket.remoteAddress || 'unknown';
    if (isAdminLoginRateLimited(ip)) {
      sendJSON(res, 429, { success: false, error: 'Too many sign-in attempts. Try again in 15 minutes.' });
      return;
    }

    const body = await collectBody(req);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const emailMatches = constantTimeEqual(email, process.env.ADMIN_EMAIL.trim().toLowerCase());
    const passwordMatches = constantTimeEqual(password, process.env.ADMIN_PASSWORD);
    if (!emailMatches || !passwordMatches) {
      sendJSON(res, 401, { success: false, error: 'Invalid email or password.' });
      return;
    }

    sendJSON(res, 200, {
      success: true,
      data: {
        token: createAdminToken(process.env.ADMIN_EMAIL.trim()),
        user: { email: process.env.ADMIN_EMAIL.trim() }
      }
    });
    return;
  }

  const publicContentMatch = pathname.match(/^\/api\/site-content\/testimonials$/);
  if (publicContentMatch && method === 'GET') {
    const items = await sql`
      SELECT id, sort_order AS "sortOrder", data
      FROM site_content WHERE section = 'testimonials'
      ORDER BY sort_order, id
    `;
    sendJSON(res, 200, { success: true, count: items.length, data: items.map((item) => item.data) });
    return;
  }

  if (pathname === '/api/site-settings' && method === 'GET') {
    const [settings] = await sql`SELECT data FROM site_settings WHERE id = 1`;
    sendJSON(res, 200, { success: true, data: settings?.data || {} });
    return;
  }

  if (pathname === '/api/reviews' && method === 'GET') {
    const tourIdValue = new URL(req.url, 'http://localhost').searchParams.get('tourId');
    let tourId = null;
    if (tourIdValue !== null) {
      tourId = Number(tourIdValue);
      if (!Number.isSafeInteger(tourId) || tourId < 1) {
        return sendJSON(res, 400, { success: false, error: 'Select a valid tour.' });
      }
      const [tour] = await sql`
        SELECT id FROM tours
        WHERE id = ${tourId} AND COALESCE(data->>'isPublished', 'true') <> 'false'
      `;
      if (!tour) return sendJSON(res, 404, { success: false, error: 'Tour not found.' });
    }

    const reviews = await sql`
      SELECT r.id, r.tour_id AS "tourId", t.data->>'title' AS "tourTitle",
        r.reviewer_name AS name, r.rating, r.review, r.created_at AS "createdAt"
      FROM tour_reviews r
      JOIN tours t ON t.id = r.tour_id
      WHERE COALESCE(t.data->>'isPublished', 'true') <> 'false'
        AND (${tourId}::integer IS NULL OR r.tour_id = ${tourId})
      ORDER BY r.created_at DESC
      LIMIT 12
    `;
    const [summary] = await sql`
      SELECT COUNT(*)::integer AS count, COALESCE(ROUND(AVG(rating)::numeric, 1), 0) AS average
      FROM tour_reviews r
      JOIN tours t ON t.id = r.tour_id
      WHERE COALESCE(t.data->>'isPublished', 'true') <> 'false'
        AND (${tourId}::integer IS NULL OR r.tour_id = ${tourId})
    `;
    sendJSON(res, 200, {
      success: true,
      count: reviews.length,
      data: reviews,
      summary: { count: summary.count, average: Number(summary.average) }
    });
    return;
  }

  if (pathname === '/api/reviews' && method === 'POST') {
    const ip = req.socket.remoteAddress || 'unknown';
    if (isReviewSubmissionRateLimited(ip)) {
      return sendJSON(res, 429, { success: false, error: 'Too many review submissions. Please try again in 15 minutes.' });
    }

    const body = await collectBody(req);
    const tourId = Number(body.tourId);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const review = typeof body.review === 'string' ? body.review.trim() : '';
    const rating = Number(body.rating);
    if (!Number.isSafeInteger(tourId) || tourId < 1) {
      return sendJSON(res, 400, { success: false, error: 'Select a valid tour.' });
    }
    if (name.length < 2 || name.length > 80) {
      return sendJSON(res, 400, { success: false, error: 'Name must be between 2 and 80 characters.' });
    }
    if (body.review !== undefined && typeof body.review !== 'string') {
      return sendJSON(res, 400, { success: false, error: 'Your review must be text.' });
    }
    if (!Number.isSafeInteger(rating) || rating < 1 || rating > 5) {
      return sendJSON(res, 400, { success: false, error: 'Choose a rating from 1 to 5 stars.' });
    }
    if (review.length > 1000) {
      return sendJSON(res, 400, { success: false, error: 'Your review must be 1,000 characters or fewer.' });
    }

    const [tour] = await sql`
      SELECT id FROM tours
      WHERE id = ${tourId} AND COALESCE(data->>'isPublished', 'true') <> 'false'
    `;
    if (!tour) return sendJSON(res, 404, { success: false, error: 'Tour not found.' });

    const [savedReview] = await sql`
      INSERT INTO tour_reviews (tour_id, reviewer_name, rating, review)
      VALUES (${tourId}, ${name}, ${rating}, ${review})
      RETURNING id, tour_id AS "tourId", reviewer_name AS name, rating, review, created_at AS "createdAt"
    `;
    sendJSON(res, 201, { success: true, message: 'Thank you! Your rating is now live.', data: savedReview });
    return;
  }

  if (pathname === '/api/payments/mpesa/stk-push' && method === 'POST') {
    const configError = getMpesaConfigError();
    if (configError) return sendJSON(res, 503, { success: false, error: configError });
    const ip = req.socket.remoteAddress || 'unknown';
    if (isMpesaSubmissionRateLimited(ip)) {
      return sendJSON(res, 429, { success: false, error: 'Too many M-Pesa prompts. Please wait 15 minutes before trying again.' });
    }

    const body = await collectBody(req);
    const bookingId = Number(body.bookingId);
    const phone = normalizeMpesaPhone(body.phone);
    if (!Number.isSafeInteger(bookingId) || bookingId < 1) {
      return sendJSON(res, 400, { success: false, error: 'Select a valid booking before starting M-Pesa payment.' });
    }
    if (!phone) {
      return sendJSON(res, 400, { success: false, error: 'Enter a valid Kenyan M-Pesa phone number.' });
    }

    const [booking] = await sql`
      SELECT b.id, b.people, b.phone, b.tour_title AS "tourTitle", t.data AS tour
      FROM bookings b
      JOIN tours t ON t.id = b.tour_id
      WHERE b.id = ${bookingId}
    `;
    if (!booking) return sendJSON(res, 404, { success: false, error: 'Booking not found.' });
    if (normalizeMpesaPhone(booking.phone) !== phone) {
      return sendJSON(res, 400, { success: false, error: 'Use the same phone number entered on the booking request for M-Pesa payment.' });
    }

    const amount = Math.round(Number(booking.tour.price) * Number(booking.people));
    if (!Number.isSafeInteger(amount) || amount < 1) {
      return sendJSON(res, 400, { success: false, error: 'The full tour total must be at least KSh 1 and a whole number for M-Pesa STK Push.' });
    }
    const [existingPayment] = await sql`
      SELECT id FROM mpesa_payments
      WHERE booking_id = ${bookingId}
        AND status IN ('initiating', 'pending')
        AND created_at > NOW() - INTERVAL '15 minutes'
      ORDER BY created_at DESC LIMIT 1
    `;
    if (existingPayment) {
      return sendJSON(res, 409, { success: false, error: 'An M-Pesa prompt is already in progress for this booking. Complete it or wait 15 minutes before trying again.' });
    }

    const [payment] = await sql`
      INSERT INTO mpesa_payments (booking_id, phone, amount)
      VALUES (${bookingId}, ${phone}, ${amount})
      RETURNING id
    `;
    try {
      const stkResponse = await requestMpesaStkPush({ phone, amount, bookingId });
      await sql`
        UPDATE mpesa_payments
        SET merchant_request_id = ${stkResponse.MerchantRequestID || ''},
            checkout_request_id = ${stkResponse.CheckoutRequestID},
            status = 'pending',
            result_description = ${stkResponse.CustomerMessage || 'STK Push sent.'},
            updated_at = NOW()
        WHERE id = ${payment.id}
      `;
      sendJSON(res, 200, {
        success: true,
        message: 'M-Pesa prompt sent.',
        data: {
          checkoutRequestId: stkResponse.CheckoutRequestID,
          amount,
          customerMessage: stkResponse.CustomerMessage || 'Check your phone and enter your M-Pesa PIN.'
        }
      });
    } catch (error) {
      await sql`
        UPDATE mpesa_payments
        SET status = 'failed', result_description = 'Unable to start M-Pesa payment.', updated_at = NOW()
        WHERE id = ${payment.id}
      `;
      console.error('M-Pesa STK Push request failed:', error.message);
      sendJSON(res, 502, { success: false, error: error.message || 'M-Pesa could not start the payment. Please try again.' });
    }
    return;
  }

  if (pathname === '/api/payments/mpesa/status' && method === 'GET') {
    const checkoutRequestId = new URL(req.url, 'http://localhost').searchParams.get('checkoutRequestId') || '';
    if (!checkoutRequestId || checkoutRequestId.length > 200) {
      return sendJSON(res, 400, { success: false, error: 'A valid payment reference is required.' });
    }
    const [payment] = await sql`
      SELECT status, result_description AS message, amount
      FROM mpesa_payments
      WHERE checkout_request_id = ${checkoutRequestId}
    `;
    if (!payment) return sendJSON(res, 404, { success: false, error: 'Payment reference not found.' });
    sendJSON(res, 200, { success: true, data: payment });
    return;
  }

  if (pathname === '/api/payments/mpesa/callback' && method === 'POST') {
    const callbackToken = new URL(req.url, 'http://localhost').searchParams.get('token') || '';
    if (!callbackToken || !constantTimeEqual(callbackToken, process.env.MPESA_CALLBACK_TOKEN || '')) {
      return sendJSON(res, 401, { success: false, error: 'Invalid M-Pesa callback token.' });
    }
    const body = await collectBody(req);
    const callback = body?.Body?.stkCallback;
    if (!callback || typeof callback.CheckoutRequestID !== 'string' || !Number.isInteger(Number(callback.ResultCode))) {
      return sendJSON(res, 400, { success: false, error: 'Invalid M-Pesa callback.' });
    }
    const resultCode = Number(callback.ResultCode);
    const [payment] = await sql`
      SELECT amount, phone FROM mpesa_payments
      WHERE checkout_request_id = ${callback.CheckoutRequestID}
    `;
    if (!payment) {
      sendJSON(res, 200, { ResultCode: 0, ResultDesc: 'Accepted' });
      return;
    }

    let status = resultCode === 0 ? 'success' : 'failed';
    let description = typeof callback.ResultDesc === 'string' ? callback.ResultDesc.slice(0, 500) : '';
    let receiptNumber = null;
    if (resultCode === 0) {
      const metadata = Array.isArray(callback.CallbackMetadata?.Item) ? callback.CallbackMetadata.Item : [];
      const itemValue = (name) => metadata.find((item) => item.Name === name)?.Value;
      const callbackAmount = Number(itemValue('Amount'));
      const callbackPhone = normalizeMpesaPhone(String(itemValue('PhoneNumber') || ''));
      const callbackReceipt = itemValue('MpesaReceiptNumber');
      if (callbackAmount !== Number(payment.amount) || callbackPhone !== payment.phone || typeof callbackReceipt !== 'string' || !callbackReceipt) {
        status = 'failed';
        description = 'M-Pesa callback details did not match the booking amount and phone number.';
      } else {
        receiptNumber = callbackReceipt.slice(0, 40);
      }
    }
    await sql`
      UPDATE mpesa_payments
      SET status = ${status}, result_code = ${String(resultCode)},
          result_description = ${description}, mpesa_receipt_number = ${receiptNumber}, updated_at = NOW()
      WHERE checkout_request_id = ${callback.CheckoutRequestID}
        AND status IN ('initiating', 'pending')
    `;
    sendJSON(res, 200, { ResultCode: 0, ResultDesc: 'Accepted' });
    return;
  }

  if (pathname.startsWith('/api/admin/')) {
    const adminUser = authenticateAdmin(req, res);
    if (!adminUser) return;

    if (pathname === '/api/admin/session' && method === 'GET') {
      sendJSON(res, 200, { success: true, data: { email: adminUser.email } });
      return;
    }

    if (pathname === '/api/admin/uploads' && method === 'POST') {
      await uploadAdminImage(req, res);
      return;
    }

    const adminContentCollection = pathname.match(/^\/api\/admin\/site-content\/testimonials$/);
    if (adminContentCollection && method === 'GET') {
      const items = await sql`
        SELECT id, sort_order AS "sortOrder", data
        FROM site_content WHERE section = 'testimonials'
        ORDER BY sort_order, id
      `;
      sendJSON(res, 200, { success: true, count: items.length, data: items.map((item) => item.data) });
      return;
    }

    if (adminContentCollection && method === 'POST') {
      const section = 'testimonials';
      const body = await collectBody(req);
      const validationError = validateSiteContent(section, body);
      if (validationError) return sendJSON(res, 400, { success: false, error: validationError });

      const id = crypto.randomUUID();
      const sortOrder = Number(body.sortOrder || 0);
      const item = { ...body, id, sortOrder };
      await sql`
        INSERT INTO site_content (section, id, sort_order, data)
        VALUES (${section}, ${id}, ${sortOrder}, ${sql.json(item)})
      `;
      sendJSON(res, 201, { success: true, data: item });
      return;
    }

    const adminContentItem = pathname.match(/^\/api\/admin\/site-content\/testimonials\/([a-zA-Z0-9-]+)$/);
    if (adminContentItem && method === 'PUT') {
      const [, id] = adminContentItem;
      const section = 'testimonials';
      const body = await collectBody(req);
      const validationError = validateSiteContent(section, body);
      if (validationError) return sendJSON(res, 400, { success: false, error: validationError });

      const sortOrder = Number(body.sortOrder || 0);
      const item = { ...body, id, sortOrder };
      const result = await sql`
        UPDATE site_content
        SET sort_order = ${sortOrder}, data = ${sql.json(item)}
        WHERE section = ${section} AND id = ${id}
        RETURNING id
      `;
      if (!result.length) return sendJSON(res, 404, { success: false, error: 'Site content item not found.' });
      sendJSON(res, 200, { success: true, data: item });
      return;
    }

    if (adminContentItem && method === 'DELETE') {
      const [, id] = adminContentItem;
      const result = await sql`
        DELETE FROM site_content WHERE section = 'testimonials' AND id = ${id} RETURNING id
      `;
      if (!result.length) return sendJSON(res, 404, { success: false, error: 'Site content item not found.' });
      sendJSON(res, 200, { success: true, data: { id } });
      return;
    }

    if (pathname === '/api/admin/site-settings' && method === 'PUT') {
      const settings = await collectBody(req);
      const validationError = validateSiteSettings(settings);
      if (validationError) return sendJSON(res, 400, { success: false, error: validationError });
      await sql`
        INSERT INTO site_settings (id, data)
        VALUES (1, ${sql.json(settings)})
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
      `;
      sendJSON(res, 200, { success: true, data: settings });
      return;
    }

    if (pathname === '/api/admin/site-settings' && method === 'GET') {
      const [settings] = await sql`SELECT data FROM site_settings WHERE id = 1`;
      sendJSON(res, 200, { success: true, data: settings?.data || {} });
      return;
    }

    if (pathname === '/api/admin/tours' && method === 'GET') {
      const tours = await sql`SELECT id, data FROM tours ORDER BY id`;
      sendJSON(res, 200, { success: true, count: tours.length, data: tours.map((row) => ({ ...row.data, id: row.id })) });
      return;
    }

    if (pathname === '/api/admin/tours' && method === 'POST') {
      const body = await collectBody(req);
      const validationError = validateTour(body);
      if (validationError) return sendJSON(res, 400, { success: false, error: validationError });

      const [inserted] = await sql`
        INSERT INTO tours (data)
        VALUES (${sql.json({ ...body, price: Number(body.price) })})
        RETURNING id
      `;
      const tour = { ...body, id: inserted.id, price: Number(body.price) };
      sendJSON(res, 201, { success: true, data: tour });
      return;
    }

    const adminTourMatch = pathname.match(/^\/api\/admin\/tours\/(\d+)$/);
    if (adminTourMatch && method === 'PUT') {
      const id = Number(adminTourMatch[1]);
      const body = await collectBody(req);
      const validationError = validateTour(body);
      if (validationError) return sendJSON(res, 400, { success: false, error: validationError });

      const tour = { ...body, id, price: Number(body.price) };
      const result = await sql`
        UPDATE tours SET data = ${sql.json(tour)} WHERE id = ${id}
        RETURNING id
      `;
      if (!result.length) return sendJSON(res, 404, { success: false, error: 'Tour not found.' });
      sendJSON(res, 200, { success: true, data: tour });
      return;
    }

    if (adminTourMatch && method === 'DELETE') {
      const result = await sql`DELETE FROM tours WHERE id = ${Number(adminTourMatch[1])} RETURNING id`;
      if (!result.length) return sendJSON(res, 404, { success: false, error: 'Tour not found.' });
      sendJSON(res, 200, { success: true, message: 'Tour deleted.' });
      return;
    }

    if (pathname === '/api/admin/bookings' && method === 'GET') {
      const bookings = await sql`
        SELECT id, name, email, phone, tour_id AS "tourId", tour_title AS "tourTitle",
          travel_date AS "travelDate", people, notes, status, created_at AS "createdAt",
          payment.status AS "paymentStatus", payment.amount AS "paymentAmount",
          payment.mpesa_receipt_number AS "mpesaReceiptNumber"
        FROM bookings
        LEFT JOIN LATERAL (
          SELECT status, amount, mpesa_receipt_number
          FROM mpesa_payments WHERE booking_id = bookings.id
          ORDER BY created_at DESC LIMIT 1
        ) payment ON TRUE
        ORDER BY created_at DESC
      `;
      sendJSON(res, 200, { success: true, count: bookings.length, data: bookings });
      return;
    }

    const adminBookingMatch = pathname.match(/^\/api\/admin\/bookings\/(\d+)$/);
    if (adminBookingMatch && method === 'PATCH') {
      const body = await collectBody(req);
      const statuses = ['pending', 'confirmed', 'cancelled', 'completed'];
      if (!statuses.includes(body.status)) {
        return sendJSON(res, 400, { success: false, error: 'Status must be pending, confirmed, cancelled, or completed.' });
      }
      const [booking] = await sql`
        UPDATE bookings SET status = ${body.status} WHERE id = ${Number(adminBookingMatch[1])}
        RETURNING id, status
      `;
      if (!booking) return sendJSON(res, 404, { success: false, error: 'Booking not found.' });
      sendJSON(res, 200, { success: true, data: booking });
      return;
    }

    if (pathname === '/api/admin/reports' && method === 'GET') {
      const query = new URL(req.url, 'http://localhost').searchParams;
      const from = query.get('from');
      const to = query.get('to');
      if ((from && !isValidDate(from)) || (to && !isValidDate(to)) || (from && to && from > to)) {
        return sendJSON(res, 400, { success: false, error: 'Provide a valid date range.' });
      }
      const tours = await sql`SELECT id, data FROM tours ORDER BY id`;
      const report = await sql`
        SELECT tour_id AS "tourId", tour_title AS "tourTitle",
          COUNT(*)::integer AS "bookingCount",
          COALESCE(SUM(people), 0)::integer AS "travelerCount"
        FROM bookings
        WHERE (${from}::date IS NULL OR created_at >= ${from}::date)
          AND (${to}::date IS NULL OR created_at < (${to}::date + INTERVAL '1 day'))
        GROUP BY tour_id, tour_title
        ORDER BY "bookingCount" DESC, tour_title
      `;
      sendJSON(res, 200, {
        success: true,
        data: {
          from,
          to,
          tours: report,
          totalBookings: report.reduce((total, row) => total + row.bookingCount, 0),
          totalTravelers: report.reduce((total, row) => total + row.travelerCount, 0),
          listings: tours.map((row) => ({ ...row.data, id: row.id }))
        }
      });
      return;
    }

    if (pathname === '/api/admin/analytics' && method === 'GET') {
      const analytics = await sql`
        SELECT path, COUNT(*)::integer AS views
        FROM page_views
        WHERE viewed_at >= NOW() - INTERVAL '30 days'
        GROUP BY path ORDER BY views DESC, path
      `;
      const daily = await sql`
        SELECT TO_CHAR(viewed_at::date, 'YYYY-MM-DD') AS date, COUNT(*)::integer AS views
        FROM page_views
        WHERE viewed_at >= NOW() - INTERVAL '30 days'
        GROUP BY viewed_at::date ORDER BY viewed_at::date
      `;
      sendJSON(res, 200, {
        success: true,
        data: {
          totalViews: analytics.reduce((total, row) => total + row.views, 0),
          topPages: analytics,
          daily
        }
      });
      return;
    }

    sendJSON(res, 404, { success: false, error: 'Admin API route not found.' });
    return;
  }

  if (pathname === '/api/analytics/page-view' && method === 'POST') {
    try {
      const body = await collectBody(req);
      const validPaths = ['/', '/index.html', '/about', '/about.html', '/tours', '/tours.html', '/contact', '/contact.html', '/booking', '/booking.html'];
      if (!validPaths.includes(body.path)) {
        return sendJSON(res, 400, { success: false, error: 'Invalid page path.' });
      }
      await sql`INSERT INTO page_views (path) VALUES (${body.path})`;
      sendJSON(res, 202, { success: true });
    } catch (err) {
      sendJSON(res, 400, { success: false, error: err.message });
    }
    return;
  }

  // GET /api/tours
  if (pathname === '/api/tours' && method === 'GET') {
    const tours = await sql`
      SELECT id, data FROM tours
      WHERE COALESCE(data->>'isPublished', 'true') <> 'false'
      ORDER BY id
    `;
    sendJSON(res, 200, { success: true, count: tours.length, data: tours.map((row) => ({ ...row.data, id: row.id })) });
    return;
  }

  // GET /api/tours/:id
  const tourMatch = pathname.match(/^\/api\/tours\/(\d+)$/);
  if (tourMatch && method === 'GET') {
    const [result] = await sql`
      SELECT id, data FROM tours
      WHERE id = ${Number(tourMatch[1])}
        AND COALESCE(data->>'isPublished', 'true') <> 'false'
    `;
    const tour = result && { ...result.data, id: result.id };
    if (!tour) return sendJSON(res, 404, { success: false, error: 'Tour not found' });
    sendJSON(res, 200, { success: true, data: tour });
    return;
  }

  // POST /api/bookings
  if (pathname === '/api/bookings' && method === 'POST') {
    try {
      const body = await collectBody(req);
      const required = ['name', 'email', 'phone', 'tourId', 'travelDate', 'people'];
      const missing = required.filter((f) => !body[f] && body[f] !== 0);
      if (missing.length) {
        return sendJSON(res, 400, { success: false, error: 'Missing fields: ' + missing.join(', ') });
      }
      if (['name', 'phone', 'travelDate'].some((field) => typeof body[field] !== 'string')) {
        return sendJSON(res, 400, { success: false, error: 'Name, phone, and travel date must be text values.' });
      }
      if (!isValidEmail(body.email)) {
        return sendJSON(res, 400, { success: false, error: 'Invalid email address' });
      }
      const tourId = Number(body.tourId);
      const people = Number(body.people);
      if (!Number.isSafeInteger(tourId) || tourId < 1) {
        return sendJSON(res, 400, { success: false, error: 'Select a valid tour.' });
      }
      if (!Number.isSafeInteger(people) || people < 1) {
        return sendJSON(res, 400, { success: false, error: 'Traveler count must be a positive whole number.' });
      }
      if (!isValidDate(body.travelDate)) {
        return sendJSON(res, 400, { success: false, error: 'Provide a valid travel date.' });
      }
      const [tourResult] = await sql`
        SELECT data FROM tours
        WHERE id = ${tourId} AND COALESCE(data->>'isPublished', 'true') <> 'false'
      `;
      const tour = tourResult && tourResult.data;
      if (!tour) return sendJSON(res, 404, { success: false, error: 'The selected tour is not available.' });
      const [booking] = await sql`
        INSERT INTO bookings
          (name, email, phone, tour_id, tour_title, travel_date, people, notes)
        VALUES (
          ${body.name}, ${body.email}, ${body.phone}, ${tourId},
          ${tour.title}, ${body.travelDate}, ${people}, ${body.notes || ''}
        )
        RETURNING id, name, email, phone, tour_id AS "tourId", tour_title AS "tourTitle",
          travel_date AS "travelDate", people, notes, status, created_at AS "createdAt"
      `;
      const tourPrice = Number(tour.price);
      sendJSON(res, 201, {
        success: true,
        message: 'Booking received. Our team will contact you shortly.',
        data: { ...booking, tourPrice, totalAmount: Math.round(tourPrice * people) }
      });
    } catch (err) {
      sendJSON(res, 400, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/contact
  if (pathname === '/api/contact' && method === 'POST') {
    try {
      const body = await collectBody(req);
      const required = ['name', 'email', 'subject', 'message'];
      const missing = required.filter((f) => !body[f]);
      if (missing.length) {
        return sendJSON(res, 400, { success: false, error: 'Missing fields: ' + missing.join(', ') });
      }
      if (!isValidEmail(body.email)) {
        return sendJSON(res, 400, { success: false, error: 'Invalid email address' });
      }
      const [message] = await sql`
        INSERT INTO messages (name, email, phone, subject, message)
        VALUES (${body.name}, ${body.email}, ${body.phone || ''}, ${body.subject}, ${body.message})
        RETURNING id, name, email, phone, subject, message, created_at AS "createdAt"
      `;
      sendJSON(res, 201, { success: true, message: 'Thank you! Your message has been received.', data: message });
    } catch (err) {
      sendJSON(res, 400, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/newsletter
  if (pathname === '/api/newsletter' && method === 'POST') {
    try {
      const body = await collectBody(req);
      if (!isValidEmail(body.email)) {
        return sendJSON(res, 400, { success: false, error: 'Invalid email address' });
      }
      const result = await sql`
        INSERT INTO subscribers (email)
        VALUES (${body.email})
        ON CONFLICT (LOWER(email)) DO NOTHING
        RETURNING id
      `;
      if (result.length === 0) {
        return sendJSON(res, 200, { success: true, message: 'You are already subscribed.' });
      }
      sendJSON(res, 201, { success: true, message: 'Subscribed successfully!' });
    } catch (err) {
      sendJSON(res, 400, { success: false, error: err.message });
    }
    return;
  }

  sendJSON(res, 404, { success: false, error: 'API route not found' });
}

/* ------------------------------------------------------------------ *
 * Main request router
 * ------------------------------------------------------------------ */

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  const pathname = decodeURIComponent(parsed.pathname);

  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname).catch((err) => {
      const status = err.message === 'Payload too large' ? 413 : err.message === 'Invalid JSON body' ? 400 : 500;
      sendJSON(res, status, { success: false, error: err.message });
    });
  } else {
    serveStatic(req, res, pathname);
  }
});

initializeDatabase().then(() => {
  server.listen(PORT, () => {
    console.log('==========================================================');
    console.log('  Trekrilluxe Tours and Safaris — server running');
    console.log('  Open in your browser:  http://localhost:' + PORT);
    console.log('  API base:              http://localhost:' + PORT + '/api');
    console.log('==========================================================');
  });
}).catch((err) => {
  console.error('Failed to initialize PostgreSQL:', err.message);
  sql.end().finally(() => {
    process.exitCode = 1;
  });
});
