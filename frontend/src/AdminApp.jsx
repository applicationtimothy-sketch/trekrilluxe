import React, { useEffect, useMemo, useState } from 'react';
import {
  adminDeleteTour,
  adminDeleteSiteContent,
  adminFetchSession,
  adminFetchAnalytics,
  adminFetchBookings,
  adminFetchReports,
  adminFetchSiteContent,
  adminFetchSiteSettings,
  adminFetchTours,
  adminSaveTour,
  adminSaveSiteContent,
  adminSaveSiteSettings,
  adminLogin,
  adminLogout,
  adminUploadImage,
  adminUpdateBookingStatus
} from './api.js';
import { formatKsh } from './currency.js';

const emptyTour = {
  title: '',
  category: 'wildlife',
  theme: 'theme-mara',
  duration: '',
  tourDate: '',
  groupSize: '',
  price: '',
  badge: '',
  shortDesc: '',
  longDesc: '',
  highlights: [],
  imageUrl: '',
  isPublished: true
};

const tourCategories = ['wildlife', 'trekking', 'beach', 'cultural'];
const tourThemes = ['theme-mara', 'theme-amboseli', 'theme-serengeti', 'theme-mtkenya', 'theme-diani', 'theme-nakuru', 'theme-cultural'];
const bookingStatuses = ['pending', 'confirmed', 'cancelled', 'completed'];

function getDefaultDates() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10)
  };
}

function AdminApp() {
  const [session, setSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [activeTab, setActiveTab] = useState('tours');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    adminFetchSession()
      .then((currentSession) => {
        if (active) setSession(currentSession);
      })
      .catch((sessionError) => {
        if (active) setError(sessionError.message || 'Unable to check your sign-in session.');
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function signOut() {
    setError('');
    adminLogout();
    setSession(null);
  }

  if (checkingSession) return <AdminMessage text="Checking admin session…" />;
  if (!session) return <AdminLogin error={error} setError={setError} onLogin={setSession} />;

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <a href="/" className="admin-brand">Trekrilluxe <span>Admin</span></a>
        <div className="admin-account">
          <span>{session.user.email}</span>
          <button type="button" className="admin-secondary-button" onClick={signOut}>Sign out</button>
        </div>
      </header>
      <main className="admin-main">
        <div className="admin-heading">
          <div><span className="section-tag">Owner dashboard</span><h1>Manage your tours and bookings</h1></div>
        </div>
        <nav className="admin-tabs" aria-label="Admin sections">
          {[
            ['tours', 'Tours & hikes'],
            ['siteContent', 'Site content'],
            ['bookings', 'Bookings'],
            ['reports', 'Reports'],
            ['analytics', 'Page analytics']
          ].map(([tab, label]) => (
            <button type="button" key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => { setActiveTab(tab); setError(''); setNotice(''); }}>
              {label}
            </button>
          ))}
        </nav>
        {error && <p className="admin-alert error" role="alert">{error}</p>}
        {notice && <p className="admin-alert success" role="status">{notice}</p>}
        {activeTab === 'tours' && <ToursPanel setLoading={setLoading} setError={setError} setNotice={setNotice} />}
        {activeTab === 'siteContent' && <SiteContentPanel setLoading={setLoading} setError={setError} setNotice={setNotice} />}
        {activeTab === 'bookings' && <BookingsPanel setLoading={setLoading} setError={setError} setNotice={setNotice} />}
        {activeTab === 'reports' && <ReportsPanel setLoading={setLoading} setError={setError} />}
        {activeTab === 'analytics' && <AnalyticsPanel setLoading={setLoading} setError={setError} />}
        {loading && <div className="admin-loading" role="status">Saving changes…</div>}
      </main>
    </div>
  );
}

function AdminMessage({ text }) {
  return <main className="admin-login-page"><div className="admin-login-card"><p>{text}</p></div></main>;
}

function AdminLogin({ error, setError, onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setLocalError('');
    setError('');

    if (!email.trim() || !password) {
      const message = 'Email and password are required.';
      console.error(message);
      setLocalError(message);
      return;
    }

    setSubmitting(true);
    try {
      const session = await adminLogin(email.trim(), password);
      onLogin(session);
    } catch (signInError) {
      const message = signInError instanceof Error ? signInError.message : 'Unable to sign in.';
      console.error('Login error:', message);
      setLocalError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="admin-login-page">
      <form className="admin-login-card" onSubmit={handleSubmit}>
        <a href="/" className="admin-back-link">Back to website</a>
        <span className="section-tag">Owner access</span>
        <h1>Admin sign in</h1>
        <p>Sign in with the admin credentials configured on the backend.</p>
        {(localError || error) && <p className="admin-alert error" role="alert">{localError || error}</p>}
        <div className="form-group"><label htmlFor="adminEmail">Email</label><input id="adminEmail" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
        <div className="form-group"><label htmlFor="adminPassword">Password</label><input id="adminPassword" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}

function getEmptyTestimonial(sortOrder = 0) {
  return { sortOrder, name: '', location: '', quote: '', initial: '', imageUrl: '' };
}

function SiteContentPanel({ setLoading, setError, setNotice }) {
  const [items, setItems] = useState([]);
  const [item, setItem] = useState(getEmptyTestimonial());
  const [loadingItems, setLoadingItems] = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [settings, setSettings] = useState(null);

  async function refreshItems() {
    setLoadingItems(true);
    try {
      setItems(await adminFetchSiteContent('testimonials'));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoadingItems(false);
    }
  }

  useEffect(() => { refreshItems(); }, []);

  useEffect(() => {
    adminFetchSiteSettings()
      .then(setSettings)
      .catch((loadError) => setError(loadError.message));
  }, []);

  function changeField(event) {
    const { name, value, checked, type } = event.target;
    setItem((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
  }

  async function saveItem(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');
    try {
      await adminSaveSiteContent('testimonials', { ...item, sortOrder: Number(item.sortOrder) });
      setNotice('Testimonials saved.');
      setItem(getEmptyTestimonial(items.length + 1));
      await refreshItems();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteItem(existing) {
    if (!window.confirm(`Delete "${existing.name}"?`)) return;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      await adminDeleteSiteContent('testimonials', existing.id);
      setNotice('Testimonial deleted.');
      if (item.id === existing.id) setItem(getEmptyTestimonial());
      await refreshItems();
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setLoading(false);
    }
  }

  async function uploadImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPG, PNG, or WebP image.');
      event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be 5 MB or smaller.');
      event.target.value = '';
      return;
    }
    setUploadingImage(true);
    setError('');
    try {
      const { url } = await adminUploadImage(file, 'testimonials');
      setItem((current) => ({ ...current, imageUrl: url }));
      setNotice('Image uploaded. Save the content item to publish it.');
    } catch (uploadError) {
      setError(uploadError.message || 'Image upload failed.');
    } finally {
      setUploadingImage(false);
      event.target.value = '';
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');
    try {
      setSettings(await adminSaveSiteSettings(settings));
      setNotice('Contact and social settings saved.');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setLoading(false);
    }
  }

  function updateSettingsField(event) {
    const { name, value } = event.target;
    setSettings((current) => ({ ...current, [name]: value }));
  }

  function updateSocialLink(id, url) {
    setSettings((current) => ({
      ...current,
      socialLinks: current.socialLinks.map((link) => link.id === id ? { ...link, url } : link)
    }));
  }

  const textFields = [['name', 'Traveler name'], ['location', 'Location'], ['quote', 'Testimonial', 'textarea'], ['initial', 'Avatar initial']];

  return (
    <section className="admin-panel">
      <div className="admin-columns">
          <form className="admin-card admin-tour-form" onSubmit={saveItem}>
            <div className="admin-card-heading">
              <h2>{item.id ? 'Edit testimonial' : 'Add testimonial'}</h2>
              {item.id && <button type="button" className="admin-text-button" onClick={() => setItem(getEmptyTestimonial(items.length + 1))}>New item</button>}
            </div>
            {textFields.map(([name, label, type]) => (
              <div className="form-group" key={name}>
                <label htmlFor={`site-${name}`}>{label}</label>
                {type === 'textarea'
                  ? <textarea id={`site-${name}`} name={name} rows={name === 'quote' ? 4 : 2} value={item[name] || ''} onChange={changeField} required />
                  : <input id={`site-${name}`} name={name} value={item[name] || ''} onChange={changeField} required />}
              </div>
            ))}
            <AdminInput label="Display order" name="sortOrder" type="number" min="0" value={item.sortOrder} onChange={changeField} required />
            <div className="form-group">
              <label htmlFor="siteImageUrl">Image URL</label>
              <input id="siteImageUrl" name="imageUrl" type="url" value={item.imageUrl || ''} onChange={changeField} placeholder="Upload an image or paste a public image URL" />
            </div>
            <div className="admin-upload-row">
              <label className="admin-secondary-button" htmlFor="siteImageFile">{uploadingImage ? 'Uploading…' : 'Upload image (max 5 MB)'}</label>
              <input id="siteImageFile" type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadImage} disabled={uploadingImage} />
            </div>
            {item.imageUrl && <img className="admin-image-preview" src={item.imageUrl} alt="Site content preview" />}
            <button type="submit" className="btn btn-primary btn-block" disabled={uploadingImage}>{item.id ? 'Save changes' : 'Create item'}</button>
          </form>

          <div className="admin-card">
            <div className="admin-card-heading">
              <h2>Testimonials</h2>
              <button type="button" className="admin-text-button" onClick={refreshItems}>Refresh</button>
            </div>
            {loadingItems ? <p>Loading testimonials…</p> : items.length === 0 ? <p>No testimonials yet.</p> : (
              <div className="admin-list">
                {items.map((existing) => (
                  <article className="admin-list-item" key={existing.id}>
                    <div className="admin-list-main">
                      {existing.imageUrl && <img src={existing.imageUrl} alt="" />}
                      <div><strong>{existing.name}</strong><span>Order {existing.sortOrder}</span></div>
                    </div>
                    <div className="admin-list-actions">
                      <button type="button" className="admin-text-button" onClick={() => { setItem({ ...existing }); setError(''); setNotice(''); }}>Edit</button>
                      <button type="button" className="admin-text-button danger" onClick={() => deleteItem(existing)}>Delete</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
        </div>
      </div>

      <form className="admin-card" onSubmit={saveSettings}>
        <h2>Contact, footer, and social links</h2>
        {!settings ? <p>Loading site settings…</p> : <>
          <div className="form-row">
            <AdminInput label="Office location" name="location" value={settings.location} onChange={updateSettingsField} required />
            <AdminInput label="Main phone" name="phone" value={settings.phone} onChange={updateSettingsField} required />
          </div>
          <div className="form-row">
            <AdminInput label="Main email" name="email" type="email" value={settings.email} onChange={updateSettingsField} required />
            <AdminInput label="Office hours" name="officeHours" value={settings.officeHours} onChange={updateSettingsField} required />
          </div>
          <div className="form-row">
            <AdminInput label="Booking phone" name="bookingPhone" value={settings.bookingPhone} onChange={updateSettingsField} required />
            <AdminInput label="Booking email" name="bookingEmail" type="email" value={settings.bookingEmail} onChange={updateSettingsField} required />
          </div>
          <div className="form-row">
            <AdminInput label="WhatsApp Channel invite link (or phone number)" name="whatsapp" value={settings.whatsapp} onChange={updateSettingsField} />
            <AdminInput label="Footer description" name="companyDescription" value={settings.companyDescription} onChange={updateSettingsField} required />
          </div>
          <h3>Social profiles</h3>
          {settings.socialLinks.map((link) => (
            <AdminInput key={link.id} label={`${link.label} URL (blank hides the link)`} name={`social-${link.id}`} value={link.url} onChange={(event) => updateSocialLink(link.id, event.target.value)} />
          ))}
          <button type="submit" className="btn btn-primary">Save contact settings</button>
        </>}
      </form>
      <p className="admin-help">Testimonials and contact settings are stored in PostgreSQL. Uploaded images use the existing public Supabase Storage bucket.</p>
    </section>
  );
}

function ToursPanel({ setLoading, setError, setNotice }) {
  const [tours, setTours] = useState([]);
  const [tour, setTour] = useState({ ...emptyTour });
  const [loadingTours, setLoadingTours] = useState(true);
  const [uploading, setUploading] = useState(false);

  async function refreshTours() {
    setLoadingTours(true);
    try {
      setTours(await adminFetchTours());
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoadingTours(false);
    }
  }

  useEffect(() => { refreshTours(); }, []);

  function editTour(item) {
    setTour({ ...emptyTour, ...item, highlights: item.highlights || [], imageUrl: item.imageUrl || '', isPublished: item.isPublished !== false });
    setError('');
    setNotice('');
  }

  function updateField(event) {
    const { name, value, checked, type } = event.target;
    setTour((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
  }

  async function uploadImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPG, PNG, or WebP image.');
      event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be 5 MB or smaller.');
      event.target.value = '';
      return;
    }
    setUploading(true);
    setError('');
    try {
      const { url } = await adminUploadImage(file, 'tours');
      setTour((current) => ({ ...current, imageUrl: url }));
      setNotice('Image uploaded. Save the tour to publish the image.');
    } catch (uploadError) {
      setError(uploadError.message || 'Image upload failed.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  async function saveTour(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        ...tour,
        price: Number(tour.price),
        highlights: typeof tour.highlights === 'string'
          ? tour.highlights.split('\n').map((item) => item.trim()).filter(Boolean)
          : tour.highlights
      };
      await adminSaveTour(payload);
      setTour({ ...emptyTour });
      setNotice('Tour saved successfully.');
      await refreshTours();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteTour(item) {
    if (!window.confirm(`Delete "${item.title}"? Existing bookings will remain in the database.`)) return;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      await adminDeleteTour(item.id);
      setNotice('Tour deleted.');
      if (tour.id === item.id) setTour({ ...emptyTour });
      await refreshTours();
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setLoading(false);
    }
  }

  async function togglePublished(item) {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      await adminSaveTour({ ...item, isPublished: item.isPublished === false });
      setNotice(item.isPublished === false ? 'Tour published.' : 'Tour unpublished.');
      await refreshTours();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setLoading(false);
    }
  }

  const highlightText = Array.isArray(tour.highlights) ? tour.highlights.join('\n') : tour.highlights;

  return (
    <section className="admin-panel">
      <div className="admin-columns">
        <form className="admin-card admin-tour-form" onSubmit={saveTour}>
          <div className="admin-card-heading"><h2>{tour.id ? 'Edit tour or hike' : 'Add a tour or hike'}</h2>{tour.id && <button type="button" className="admin-text-button" onClick={() => setTour({ ...emptyTour })}>New listing</button>}</div>
          <div className="form-row">
            <AdminInput label="Title" name="title" value={tour.title} onChange={updateField} required />
            <div className="form-group"><label htmlFor="tourCategory">Category</label><select id="tourCategory" name="category" value={tour.category} onChange={updateField}>{tourCategories.map((category) => <option key={category}>{category}</option>)}</select></div>
          </div>
          <div className="form-group"><label htmlFor="tourTheme">Card theme</label><select id="tourTheme" name="theme" value={tour.theme} onChange={updateField}>{tourThemes.map((theme) => <option key={theme}>{theme}</option>)}</select></div>
          <div className="form-row">
            <AdminInput label="Duration" name="duration" value={tour.duration} onChange={updateField} placeholder="e.g. 5 Days / 4 Nights" required />
            <AdminInput label="Group size" name="groupSize" value={tour.groupSize} onChange={updateField} placeholder="e.g. 2 - 8 people" required />
          </div>
          <AdminInput label="Scheduled tour date (optional)" name="tourDate" type="date" value={tour.tourDate || ''} onChange={updateField} />
          <div className="form-row">
            <AdminInput label="Price (KSh)" name="price" type="number" min="0" step="0.01" value={tour.price} onChange={updateField} required />
            <AdminInput label="Badge" name="badge" value={tour.badge} onChange={updateField} placeholder="e.g. Best Seller" required />
          </div>
          <div className="form-group"><label htmlFor="tourShortDesc">Short description</label><textarea id="tourShortDesc" name="shortDesc" rows="2" value={tour.shortDesc} onChange={updateField} required /></div>
          <div className="form-group"><label htmlFor="tourLongDesc">Full description</label><textarea id="tourLongDesc" name="longDesc" rows="4" value={tour.longDesc} onChange={updateField} required /></div>
          <div className="form-group"><label htmlFor="tourHighlights">Highlights (one per line)</label><textarea id="tourHighlights" rows="4" value={highlightText} onChange={(event) => setTour((current) => ({ ...current, highlights: event.target.value }))} /></div>
          <div className="form-group"><label htmlFor="tourImage">Tour image URL</label><input id="tourImage" name="imageUrl" type="url" value={tour.imageUrl} onChange={updateField} placeholder="Upload an image or paste a public image URL" /></div>
          <div className="admin-upload-row"><label className="admin-secondary-button" htmlFor="tourImageFile">{uploading ? 'Uploading…' : 'Upload image (max 5 MB)'}</label><input id="tourImageFile" type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadImage} disabled={uploading} /></div>
          {tour.imageUrl && <img className="admin-image-preview" src={tour.imageUrl} alt="Tour image preview" />}
          <label className="admin-checkbox"><input type="checkbox" name="isPublished" checked={tour.isPublished !== false} onChange={updateField} /> Published on the public website</label>
          <button type="submit" className="btn btn-primary btn-block" disabled={uploading}>{tour.id ? 'Save changes' : 'Create listing'}</button>
        </form>
        <div className="admin-card">
          <div className="admin-card-heading"><h2>Tour and hike listings</h2><button type="button" className="admin-text-button" onClick={refreshTours}>Refresh</button></div>
          {loadingTours ? <p>Loading listings…</p> : tours.length === 0 ? <p>No listings found.</p> : (
            <div className="admin-list">
              {tours.map((item) => (
                <article className="admin-list-item" key={item.id}>
                  <div className="admin-list-main">
                    {item.imageUrl && <img src={item.imageUrl} alt="" />}
                    <div><strong>{item.title}</strong><span>{item.category} · {formatKsh(item.price)} · {item.isPublished === false ? 'Draft' : 'Published'}</span></div>
                  </div>
                  <div className="admin-list-actions">
                    <button type="button" className="admin-text-button" onClick={() => editTour(item)}>Edit</button>
                    <button type="button" className="admin-text-button" onClick={() => togglePublished(item)}>{item.isPublished === false ? 'Publish' : 'Unpublish'}</button>
                    <button type="button" className="admin-text-button danger" onClick={() => deleteTour(item)}>Delete</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="admin-help">Images upload to the public Supabase Storage bucket named <code>tour-images</code>. Create that bucket and allow authenticated owner uploads using Storage policies before using uploads.</p>
    </section>
  );
}

function AdminInput({ label, name, value, onChange, type = 'text', ...props }) {
  const id = `tour-${name}`;
  return <div className="form-group"><label htmlFor={id}>{label}</label><input id={id} name={name} type={type} value={value} onChange={onChange} {...props} /></div>;
}

function BookingsPanel({ setLoading, setError, setNotice }) {
  const [bookings, setBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(true);

  async function refreshBookings() {
    setLoadingBookings(true);
    try {
      setBookings(await adminFetchBookings());
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoadingBookings(false);
    }
  }

  useEffect(() => { refreshBookings(); }, []);

  async function changeStatus(id, status) {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      await adminUpdateBookingStatus(id, status);
      setNotice('Booking status updated.');
      await refreshBookings();
    } catch (updateError) {
      setError(updateError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="admin-card">
      <div className="admin-card-heading"><h2>Booking requests</h2><button type="button" className="admin-text-button" onClick={refreshBookings}>Refresh</button></div>
      {loadingBookings ? <p>Loading bookings…</p> : bookings.length === 0 ? <p>No booking requests yet.</p> : (
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>Guest</th><th>Tour</th><th>Travel date</th><th>Travelers</th><th>Payment</th><th>Received</th><th>Status</th></tr></thead>
          <tbody>{bookings.map((booking) => (
            <tr key={booking.id}>
              <td><strong>{booking.name}</strong><span>{booking.email}</span><span>{booking.phone}</span>{booking.notes && <small>Note: {booking.notes}</small>}</td>
              <td>{booking.tourTitle}</td>
              <td>{booking.travelDate}</td>
              <td>{booking.people}</td>
              <td>{booking.paymentStatus ? `${booking.paymentStatus} · ${formatKsh(booking.paymentAmount)}` : 'Not paid'}{booking.mpesaReceiptNumber && <small>Receipt: {booking.mpesaReceiptNumber}</small>}</td>
              <td>{new Date(booking.createdAt).toLocaleDateString()}</td>
              <td><select aria-label={`Status for booking ${booking.id}`} value={booking.status} onChange={(event) => changeStatus(booking.id, event.target.value)}>{bookingStatuses.map((status) => <option key={status}>{status}</option>)}</select></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </section>
  );
}

function ReportsPanel({ setLoading, setError }) {
  const dates = useMemo(getDefaultDates, []);
  const [from, setFrom] = useState(dates.from);
  const [to, setTo] = useState(dates.to);
  const [report, setReport] = useState(null);

  async function loadReport(event) {
    event?.preventDefault();
    setLoading(true);
    setError('');
    try {
      setReport(await adminFetchReports(from, to));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadReport(); }, []);

  const rows = useMemo(() => {
    if (!report) return [];
    const counts = new Map(report.tours.map((row) => [Number(row.tourId), row]));
    return report.listings.map((tour) => ({
      tourTitle: tour.title,
      bookingCount: counts.get(Number(tour.id))?.bookingCount || 0,
      travelerCount: counts.get(Number(tour.id))?.travelerCount || 0
    })).sort((a, b) => b.bookingCount - a.bookingCount || a.tourTitle.localeCompare(b.tourTitle));
  }, [report]);

  function downloadCsv() {
    const escapeCell = (value) => {
      const text = String(value ?? '');
      const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const csv = [
      ['Tour or hike', 'Bookings', 'Travelers'],
      ...rows.map((row) => [row.tourTitle, row.bookingCount, row.travelerCount])
    ].map((line) => line.map(escapeCell).join(',')).join('\r\n');
    const file = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = `trekrilluxe-booking-report-${from}-to-${to}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <section className="admin-panel">
      <form className="admin-card admin-filters" onSubmit={loadReport}>
        <div className="form-group"><label htmlFor="reportFrom">From</label><input id="reportFrom" type="date" value={from} onChange={(event) => setFrom(event.target.value)} required /></div>
        <div className="form-group"><label htmlFor="reportTo">To</label><input id="reportTo" type="date" value={to} onChange={(event) => setTo(event.target.value)} required /></div>
        <button type="submit" className="btn btn-primary">Run report</button>
        <button type="button" className="admin-secondary-button" onClick={downloadCsv} disabled={!report}>Download CSV</button>
      </form>
      {report && <>
        <div className="admin-stat-grid">
          <StatCard label="Bookings in period" value={report.totalBookings} />
          <StatCard label="Travelers in period" value={report.totalTravelers} />
        </div>
        <div className="admin-card admin-table-wrap"><table className="admin-table">
          <thead><tr><th>Tour or hike</th><th>Bookings</th><th>Travelers</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.tourTitle}><td>{row.tourTitle}</td><td>{row.bookingCount}</td><td>{row.travelerCount}</td></tr>)}</tbody>
        </table></div>
        <p className="admin-help">The report period filters by booking submission date.</p>
      </>}
    </section>
  );
}

function AnalyticsPanel({ setLoading, setError }) {
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    adminFetchAnalytics()
      .then((result) => { if (active) setAnalytics(result); })
      .catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (!analytics) return <AdminMessage text="Loading page analytics…" />;
  return (
    <section className="admin-panel">
      <div className="admin-stat-grid"><StatCard label="Page views · last 30 days" value={analytics.totalViews} /></div>
      <div className="admin-card">
        <h2>Most viewed pages</h2>
        {analytics.topPages.length === 0 ? <p>No page views have been recorded yet.</p> : (
          <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Page</th><th>Views</th></tr></thead><tbody>
            {analytics.topPages.map((row) => <tr key={row.path}><td>{row.path}</td><td>{row.views}</td></tr>)}
          </tbody></table></div>
        )}
      </div>
      <p className="admin-help">Counts are page views, not unique visitors. The site stores page paths and timestamps only; it does not collect visitor names or email addresses.</p>
    </section>
  );
}

function StatCard({ label, value }) {
  return <div className="admin-stat-card"><span>{label}</span><strong>{value}</strong></div>;
}

export default AdminApp;
