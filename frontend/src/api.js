const configuredApiBase = import.meta.env.VITE_API_BASE_URL?.trim();
const API_BASE = configuredApiBase
  ? configuredApiBase.replace(/\/+$/, '').replace(/\/api$/i, '')
  : import.meta.env.DEV
    ? 'http://localhost:4000'
    : '';
const ADMIN_TOKEN_KEY = 'trekrilluxe_admin_token';

async function getJSON(path, options) {
  const response = await fetch(`${API_BASE}${path}`, options);
  const body = await readJSON(response);
  if (!response.ok) throw new Error(body.error || 'The request failed.');
  return body;
}

async function readJSON(response) {
  try {
    return await response.json();
  } catch {
    throw new Error('The server returned an invalid response.');
  }
}

export async function adminLogin(email, password) {
  const response = await fetch(`${API_BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const body = await readJSON(response);
  if (!response.ok) throw new Error(body.error || 'Unable to sign in.');
  if (typeof body.data?.token !== 'string' || typeof body.data?.user?.email !== 'string') {
    throw new Error('The server returned an invalid sign-in response.');
  }
  localStorage.setItem(ADMIN_TOKEN_KEY, body.data.token);
  return { user: body.data.user };
}

export function adminLogout() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export async function adminFetchSession() {
  if (!localStorage.getItem(ADMIN_TOKEN_KEY)) return null;
  const session = await adminRequest('/api/admin/session');
  return { user: session };
}

export function apiFetchTours() {
  return getJSON('/api/tours');
}

export function apiFetchReviews(tourId) {
  const query = tourId ? `?tourId=${encodeURIComponent(tourId)}` : '';
  return getJSON(`/api/reviews${query}`).catch((error) => {
    if (/api route not found/i.test(error.message)) {
      throw new Error('The backend does not have the ratings route yet. Redeploy or restart the latest backend to enable ratings.');
    }
    throw error;
  });
}

export function apiFetchTour(id) {
  return getJSON(`/api/tours/${encodeURIComponent(id)}`);
}

export function apiFetchSiteContent(section) {
  return getJSON(`/api/site-content/${encodeURIComponent(section)}`);
}

export function apiFetchSiteSettings() {
  return getJSON('/api/site-settings');
}

async function submit(path, payload) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return {
    ok: response.ok,
    status: response.status,
    data: await readJSON(response)
  };
}

export function apiSubmitBooking(payload) {
  return submit('/api/bookings', payload);
}

export function apiInitiateMpesaPayment(bookingId, phone) {
  return submit('/api/payments/mpesa/stk-push', { bookingId, phone }).then((result) => {
    if (!result.ok) throw new Error(result.data?.error || 'Unable to start M-Pesa payment.');
    return result;
  });
}

export function apiFetchMpesaPaymentStatus(checkoutRequestId) {
  return getJSON(`/api/payments/mpesa/status?checkoutRequestId=${encodeURIComponent(checkoutRequestId)}`);
}

export function apiSubmitReview(payload) {
  return submit('/api/reviews', payload).then((result) => {
    if (result.status === 404 && /api route not found/i.test(result.data.error || '')) {
      return {
        ...result,
        data: { ...result.data, error: 'The backend does not have the ratings route yet. Redeploy or restart the latest backend to enable ratings.' }
      };
    }
    return result;
  });
}

export function apiSubmitContact(payload) {
  return submit('/api/contact', payload);
}

async function adminRequest(path, options = {}) {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  if (!token) throw new Error('Your admin session has expired. Please sign in again.');

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers
    }
  });
  const body = await readJSON(response);
  if (!response.ok) {
    if (response.status === 401) adminLogout();
    throw new Error(body.error || 'The admin request failed.');
  }
  return body.data;
}

export async function adminUploadImage(file, section) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return adminRequest('/api/admin/uploads', {
    method: 'POST',
    body: JSON.stringify({ contentType: file.type, section, fileBase64: btoa(binary) })
  });
}

export function adminFetchTours() {
  return adminRequest('/api/admin/tours');
}

export function adminFetchSiteContent(section) {
  return adminRequest(`/api/admin/site-content/${encodeURIComponent(section)}`);
}

export function adminFetchSiteSettings() {
  return adminRequest('/api/admin/site-settings');
}

export function adminSaveSiteContent(section, item) {
  const method = item.id ? 'PUT' : 'POST';
  const path = item.id
    ? `/api/admin/site-content/${encodeURIComponent(section)}/${encodeURIComponent(item.id)}`
    : `/api/admin/site-content/${encodeURIComponent(section)}`;
  return adminRequest(path, { method, body: JSON.stringify(item) });
}

export function adminDeleteSiteContent(section, id) {
  return adminRequest(`/api/admin/site-content/${encodeURIComponent(section)}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function adminSaveSiteSettings(settings) {
  return adminRequest('/api/admin/site-settings', { method: 'PUT', body: JSON.stringify(settings) });
}

export function adminSaveTour(tour) {
  const method = tour.id ? 'PUT' : 'POST';
  const path = tour.id ? `/api/admin/tours/${encodeURIComponent(tour.id)}` : '/api/admin/tours';
  return adminRequest(path, { method, body: JSON.stringify(tour) });
}

export function adminDeleteTour(id) {
  return adminRequest(`/api/admin/tours/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function adminFetchBookings() {
  return adminRequest('/api/admin/bookings');
}

export function adminUpdateBookingStatus(id, status) {
  return adminRequest(`/api/admin/bookings/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });
}

export function adminFetchReports(from, to) {
  const query = new URLSearchParams({ from, to });
  return adminRequest(`/api/admin/reports?${query}`);
}

export function adminFetchAnalytics() {
  return adminRequest('/api/admin/analytics');
}

export function trackPageView(path) {
  return fetch(`${API_BASE}/api/analytics/page-view`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  });
}
