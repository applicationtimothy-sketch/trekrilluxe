import React, { useEffect, useRef, useState } from 'react';
import logo from '../images/logo.png';
import heroImage from '../images/hero.jpeg';
import storyImage from '../images/image.jpg';
import AdminApp from './AdminApp.jsx';
import {
  apiFetchSiteContent,
  apiFetchSiteSettings,
  apiFetchReviews,
  apiFetchTours,
  apiInitiateMpesaPayment,
  apiFetchMpesaPaymentStatus,
  apiSubmitBooking,
  apiSubmitContact,
  apiSubmitReview,
  trackPageView
} from './api.js';
import { formatKsh } from './currency.js';

const pageDetails = {
  home: {
    title: 'Trekrilluxe Tours and Safaris | Authentic Kenyan & East African Safaris',
    description: 'Trekrilluxe Tours and Safaris crafts unforgettable wildlife safaris, mountain treks, beach escapes and cultural tours across Kenya and East Africa.'
  },
  about: {
    title: 'About Us | Trekrilluxe Tours and Safaris',
    description: 'Learn about Trekrilluxe Tours and Safaris — our story, mission, values and the team behind your East African adventures.'
  },
  tours: {
    title: 'Tour Packages | Trekrilluxe Tours and Safaris',
    description: 'Browse wildlife safaris, mountain treks, beach escapes and cultural tours offered by Trekrilluxe Tours and Safaris.'
  },
  contact: {
    title: 'Contact Us | Trekrilluxe Tours and Safaris',
    description: 'Get in touch with Trekrilluxe Tours and Safaris to plan your next East African adventure.'
  },
  booking: {
    title: 'Book a Safari | Trekrilluxe Tours and Safaris',
    description: 'Book your next wildlife safari, trek, beach escape or cultural tour with Trekrilluxe Tours and Safaris.'
  },
  admin: {
    title: 'Admin | Trekrilluxe Tours and Safaris',
    description: 'Private Trekrilluxe owner dashboard.'
  },
  notFound: {
    title: 'Page Not Found | Trekrilluxe Tours and Safaris',
    description: 'The page you are looking for could not be found.'
  }
};

function getCurrentPage() {
  const path = window.location.pathname.replace(/\/+$/, '');
  const filename = path.split('/').pop()?.replace(/\.html$/, '') || 'index';
  return filename === 'index' ? 'home' : filename;
}

function useTours() {
  const [tours, setTours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    apiFetchTours()
      .then((response) => {
        if (!response || !Array.isArray(response.data)) {
          throw new Error(response?.error || 'The tours response was invalid.');
        }
        if (active) setTours(response.data);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Unable to load tours right now. Please make sure the backend server is running.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return { tours, loading, error };
}

function useSiteContent(section) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    apiFetchSiteContent(section)
      .then((response) => {
        if (!Array.isArray(response.data)) throw new Error('The site content response was invalid.');
        if (active) setItems(response.data);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Unable to load site content.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [section]);

  return { items, loading, error };
}

function useSiteSettings() {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    apiFetchSiteSettings()
      .then((response) => {
        if (!response.data || typeof response.data !== 'object') throw new Error('The site settings response was invalid.');
        if (active) setSettings(response.data);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Unable to load contact details.');
      });
    return () => { active = false; };
  }, []);

  return { settings, error };
}

function ContentMessage({ loading, error }) {
  if (loading) return <p className="text-center" role="status">Loading content…</p>;
  if (error) return <p className="text-center" role="alert">{error}</p>;
  return null;
}

function Header({ page }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const links = [
    ['Home', '/', 'home'],
    ['About', '/about', 'about'],
    ['Tours', '/tours', 'tours'],
    ['Contact', '/contact', 'contact']
  ];

  return (
    <header className="site-header">
      <nav className="navbar">
        <a href="/" className="brand" onClick={() => setMenuOpen(false)}>
          <img src={logo} alt="Trekrilluxe Tours and Safaris logo" />
          <span className="brand-text">Trekrilluxe<span>TOURS &amp; SAFARIS</span></span>
        </a>
        <ul className={`nav-links${menuOpen ? ' open' : ''}`}>
          {links.map(([label, href, id]) => (
            <li key={id}><a href={href} className={page === id ? 'active' : ''} onClick={() => setMenuOpen(false)}>{label}</a></li>
          ))}
          <li><a href="/booking" className={`btn btn-primary nav-cta${page === 'booking' ? ' active' : ''}`} onClick={() => setMenuOpen(false)}>Book Now</a></li>
        </ul>
        <button
          className="nav-toggle"
          type="button"
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          Menu
        </button>
      </nav>
    </header>
  );
}

function Footer() {
  const { settings, error } = useSiteSettings();
  const whatsappUrl = getWhatsAppUrl(settings?.whatsapp) || 'https://whatsapp.com/channel/0029VbDLU1cHltYGQ4u57v3A';
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <div className="footer-brand">
              <img src={logo} alt="Trekrilluxe logo" />
              <strong>Trekrilluxe Tours &amp; Safaris</strong>
            </div>
            <p>{settings?.companyDescription || (error ? error : '')}</p>
            <SocialLinks links={settings?.socialLinks || []} />
          </div>
          <div>
            <h4>Explore</h4>
            <ul>
              <li><a href="/tours">Tour Packages</a></li>
              <li><a href="/about">About Us</a></li>
            </ul>
          </div>
          <div>
            <h4>Support</h4>
            <ul>
              <li><a href="/contact">Contact Us</a></li>
              <li><a href="/booking">Book a Trip</a></li>
            </ul>
          </div>
          <div>
            <h4>Stay Updated</h4>
            <p>Join our WhatsApp Channel for safari tips and seasonal offers.</p>
            <a className="btn btn-primary whatsapp-channel-link" href={whatsappUrl} target="_blank" rel="noreferrer">Join WhatsApp Channel</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>&copy; {new Date().getFullYear()} Trekrilluxe Tours and Safaris. All rights reserved.</span>
          <span>{settings?.location || ''}</span>
        </div>
      </div>
    </footer>
  );
}

function getWhatsAppUrl(value) {
  const link = typeof value === 'string' ? value.trim() : '';
  if (!link) return '';
  if (/^https:\/\//i.test(link)) return link;
  let phone = link.replace(/\D/g, '');
  if (phone.startsWith('0')) phone = `254${phone.slice(1)}`;
  if (phone.startsWith('7') || phone.startsWith('1')) phone = `254${phone}`;
  return /^254[17]\d{8}$/.test(phone) ? `https://wa.me/${phone}` : '';
}

function hasValidTourId(tour) {
  const id = Number(tour?.id);
  return Number.isSafeInteger(id) && id > 0;
}

function getTourDate(tour) {
  const date = tour?.tourDate;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const parsedDate = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === date ? date : '';
}

function PageHero({ title, description, page, className = '', showBreadcrumb = true }) {
  return (
    <section className={`page-hero ${className}`.trim()}>
      <h1>{title}</h1>
      <p>{description}</p>
      {/* {showBreadcrumb && <div className="breadcrumb">Home / {page}</div>} */}
    </section>
  );
}

function TourCard({ tour, onViewDetails }) {
  const bookingUrl = hasValidTourId(tour) ? `/booking?tour=${encodeURIComponent(tour.id)}` : '/booking';
  return (
    <div className="tour-card reveal" data-category={tour.category}>
      <div className={`tour-media ${tour.theme}${tour.imageUrl ? ' has-image' : ''}`}>
        {tour.imageUrl && <img className="tour-image" src={tour.imageUrl} alt="" />}
        <span className="badge">{tour.badge}</span>
        <span className="price-tag">{formatKsh(tour.price)}</span>
      </div>
      <div className="tour-body">
        <h3>{tour.title}</h3>
        <div className="tour-meta"><span>Duration: {tour.duration}</span><span>Group: {tour.groupSize}</span></div>
        <p className="desc">{tour.shortDesc}</p>
        <div className="tour-footer">
          <button type="button" className="btn btn-dark" onClick={() => onViewDetails(tour)}>View Details</button>
          <a href={bookingUrl} className="btn btn-primary">Book This Tour</a>
        </div>
      </div>
    </div>
  );
}

function HeroShowcase() {
  const { tours } = useTours();
  const tourSlides = tours
    .filter((tour) => typeof tour.imageUrl === 'string' && tour.imageUrl.trim())
    .slice(0, 6)
    .map((tour) => ({
      image: tour.imageUrl,
      title: tour.title,
      category: tour.category,
      duration: tour.duration,
      price: tour.price
    }));
  const fallbackSlides = [
    { image: heroImage, title: 'The wild calls', category: 'Wildlife safari', duration: 'Kenya & East Africa' },
    { image: storyImage, title: 'Find your adventure', category: 'Guided experiences', duration: 'Made for you' }
  ];
  const slides = tourSlides.length
    ? [...tourSlides, ...(tourSlides.length === 1 ? fallbackSlides.slice(1) : [])]
    : fallbackSlides;
  const [activeSlide, setActiveSlide] = useState(0);
  const slideIndex = activeSlide % slides.length;
  const current = slides[slideIndex];

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = window.setInterval(() => {
      setActiveSlide((index) => (index + 1) % slides.length);
    }, 5500);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  return (
    <div className="hero-showcase" aria-label="Featured Trekrilluxe experiences">
      <div className="hero-showcase-main">
        <img key={current.image} src={current.image} alt="" aria-hidden="true" />
      </div>
      <div className="hero-showcase-controls" aria-label="Choose a featured experience">
        {slides.map((slide, index) => (
          <button
            key={`${slide.title}-${index}`}
            type="button"
            className={index === slideIndex ? 'active' : ''}
            aria-label={`Show ${slide.title}`}
            aria-pressed={index === slideIndex}
            onClick={() => setActiveSlide(index)}
          />
        ))}
      </div>
    </div>
  );
}

function TourList({ featured = false }) {
  const { tours, loading, error } = useTours();
  const [category, setCategory] = useState('all');
  const [detailsTour, setDetailsTour] = useState(null);
  const filteredTours = tours.filter((tour) => category === 'all' || tour.category === category);
  const visibleTours = featured ? tours.slice(0, 3) : filteredTours;

  if (loading) return <p className="text-center" role="status">Loading tours…</p>;
  if (error) return <p className="text-center" role="alert">{error}</p>;

  return (
    <>
      {!featured && (
        <div className="filter-bar">
          {[
            ['all', 'All Tours'],
            ['wildlife', 'Wildlife Safaris'],
            ['trekking', 'Mountain Trekking'],
            ['beach', 'Beach Escapes'],
            ['cultural', 'Cultural Tours']
          ].map(([value, label]) => (
            <button key={value} type="button" className={`filter-btn${category === value ? ' active' : ''}`} onClick={() => setCategory(value)}>
              {label}
            </button>
          ))}
        </div>
      )}
      {visibleTours.length
        ? <div className="card-grid">{visibleTours.map((tour) => <TourCard key={tour.id || tour.title} tour={tour} onViewDetails={setDetailsTour} />)}</div>
        : <p className="text-center">{tours.length ? 'No tours are available in this category right now.' : 'No tours are available right now.'}</p>}
      {detailsTour && <TourDetailsModal tour={detailsTour} onClose={() => setDetailsTour(null)} />}
    </>
  );
}

function TourDetailsModal({ tour, onClose }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const highlights = Array.isArray(tour.highlights) ? tour.highlights : [];
  const bookingUrl = hasValidTourId(tour) ? `/booking?tour=${encodeURIComponent(tour.id)}` : '/booking';
  return (
    <div className="tour-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="tour-dialog" role="dialog" aria-modal="true" aria-labelledby="tour-dialog-title">
        <button type="button" className="tour-dialog-close" onClick={onClose}>Close</button>
        <span className="section-tag">{tour.category}</span>
        <h2 id="tour-dialog-title">{tour.title}</h2>
        <p className="tour-dialog-price">{formatKsh(tour.price)} per person</p>
        <p className="tour-dialog-meta">Duration: {tour.duration} · Group size: {tour.groupSize}</p>
        {getTourDate(tour) && <p className="tour-dialog-meta">Scheduled date: <time dateTime={tour.tourDate}>{new Date(`${tour.tourDate}T00:00:00`).toLocaleDateString()}</time></p>}
        <p>{tour.longDesc || tour.shortDesc}</p>
        {highlights.length > 0 && (
          <div className="tour-dialog-highlights">
            <h3>Tour highlights</h3>
            <ul>{highlights.map((highlight, index) => <li key={`${highlight}-${index}`}>{highlight}</li>)}</ul>
          </div>
        )}
        <a className="btn btn-primary" href={bookingUrl}>Book This Tour</a>
      </section>
    </div>
  );
}

function HomePage() {
  const { items: testimonials, loading: testimonialsLoading, error: testimonialsError } = useSiteContent('testimonials');
  return (
    <>
      <section className="hero">
        <HeroShowcase />
        <div className="hero-content">
          <span className="section-tag">Kenya &amp; East Africa Safaris</span>
          <h1>Discover the Wild Heart of Africa with Trekrilluxe</h1>
          <p>From Big Five game drives in the Maasai Mara to summit treks on Mount Kenya and sunset beaches in Diani — we design unforgettable journeys tailored to you.</p>
          <div className="hero-actions">
            <a href="/tours" className="btn btn-primary">Explore Tours</a>
            <a href="/booking" className="btn btn-outline">Plan My Safari</a>
          </div>
        </div>
      </section>
      <section className="why-us">
        <div className="container">
          <div className="section-head reveal">
            <span className="section-tag">Why Travel With Us</span>
            <h2 className="section-title">The Trekrilluxe Difference</h2>
            <p className="section-sub">We combine deep local knowledge, genuine care for conservation, and meticulous planning to deliver safaris you'll remember for a lifetime.</p>
          </div>
          <div className="why-grid">
            <div className="why-card reveal"><h4>Expert Local Guides</h4><p>Our guides are born and raised in the regions we tour, bringing unmatched knowledge of wildlife and terrain.</p></div>
            <div className="why-card reveal"><h4>Custom Itineraries</h4><p>Every trip is tailored to your pace, budget and interests — from honeymoons to family adventures.</p></div>
            <div className="why-card reveal"><h4>Honest, Fair Pricing</h4><p>Transparent quotes with no hidden fees, and flexible packages for every budget.</p></div>
            <div className="why-card reveal"><h4>24/7 Support</h4><p>From the first enquiry to the moment you're home, our team is always reachable.</p></div>
          </div>
        </div>
      </section>
      <section className="tours-section">
        <div className="container">
          <div className="section-head reveal">
            <span className="section-tag">Featured Packages</span>
            <h2 className="section-title">Popular Safaris &amp; Adventures</h2>
            <p className="section-sub">Hand-picked experiences across Kenya's most iconic parks, mountains and beaches.</p>
          </div>
          <TourList featured />
          <div className="text-center" style={{ marginTop: 40 }}><a href="/tours" className="btn btn-dark">View All Tours</a></div>
        </div>
      </section>
      <section className="testimonials">
        <div className="container">
          <div className="section-head reveal"><span className="section-tag">Traveler Stories</span><h2 className="section-title">What Our Guests Say</h2></div>
          <ContentMessage loading={testimonialsLoading} error={testimonialsError} />
          {!testimonialsLoading && !testimonialsError && <div className="testi-grid">
            {testimonials.slice(0, 3).map((testimonial) => <Testimonial key={testimonial.id} testimonial={testimonial} />)}
          </div>}
        </div>
      </section>
      {/* <CtaBand title="Ready for Your Next Adventure?" text="Tell us your dream trip and we'll craft a tailor-made itinerary within 24 hours." href="/booking" button="Start Planning" /> */}
    </>
  );
}

function Testimonial({ testimonial }) {
  return (
    <div className="testi-card reveal">
      <p className="quote">"{testimonial.quote}"</p>
      <div className="testi-person">
        {testimonial.imageUrl
          ? <img className="testi-avatar" src={testimonial.imageUrl} alt="" />
          : <div className="testi-avatar">{testimonial.initial}</div>}
        <div><strong>{testimonial.name}</strong><span>{testimonial.location}</span></div>
      </div>
    </div>
  );
}

function CtaBand({ title, text, href, button }) {
  return <section className="cta-band"><div className="container"><h2>{title}</h2><p>{text}</p><a href={href} className="btn cta-button">{button}</a></div></section>;
}

function ToursPage() {
  return (
    <>
      <PageHero title="Tour Packages" description="Hand-crafted wildlife safaris, treks, beach escapes and cultural experiences." page="Tours" className="photo-page-hero" />
      <section className="tours-section"><div className="container"><TourList /></div></section>
      <ReviewSection />
      {/* <CtaBand title="Can't Decide? Let Us Help." text="Tell us your travel dates, budget and interests — we'll recommend the perfect itinerary." href="/booking" button="Request a Custom Itinerary" /> */}
    </>
  );
}

function ReviewSection() {
  const { tours, loading: toursLoading, error: toursError } = useTours();
  const rateableTours = tours.filter(hasValidTourId);
  const [selectedTour, setSelectedTour] = useState('');
  const [reviews, setReviews] = useState([]);
  const [summary, setSummary] = useState({ average: 0, count: 0 });
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [reviewsError, setReviewsError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState({ message: '', type: '' });

  useEffect(() => {
    const firstRateableTour = tours.find(hasValidTourId);
    if (!selectedTour && firstRateableTour) setSelectedTour(String(firstRateableTour.id));
  }, [selectedTour, tours]);

  useEffect(() => {
    if (!selectedTour) return undefined;
    let active = true;
    setLoadingReviews(true);
    setReviewsError('');
    apiFetchReviews(selectedTour)
      .then((response) => {
        if (!Array.isArray(response.data) || !response.summary) throw new Error('The review response was invalid.');
        if (active) {
          setReviews(response.data);
          setSummary(response.summary);
        }
      })
      .catch((error) => {
        if (active) setReviewsError(error.message || 'Unable to load reviews.');
      })
      .finally(() => {
        if (active) setLoadingReviews(false);
      });
    return () => { active = false; };
  }, [selectedTour]);

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setSubmitting(true);
    setStatus({ message: '', type: '' });
    try {
      const result = await apiSubmitReview({
        tourId: selectedTour,
        name: values.get('reviewerName'),
        rating: values.get('rating'),
        review: values.get('review')
      });
      setStatus({
        message: result.data?.message || result.data?.error || 'Something went wrong.',
        type: result.ok ? 'success' : 'error'
      });
      if (result.ok) {
        form.elements.namedItem('reviewerName').value = '';
        form.elements.namedItem('review').value = '';
        form.elements.namedItem('rating').value = '';
        await refreshReviews();
      }
    } catch (error) {
      setStatus({ message: error.message || 'Could not reach the server. Please try again later.', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  async function refreshReviews() {
    const response = await apiFetchReviews(selectedTour);
    if (!Array.isArray(response.data) || !response.summary) throw new Error('The review response was invalid.');
    setReviews(response.data);
    setSummary(response.summary);
  }

  return (
    <section className="reviews-section" id="rate-a-tour">
      <div className="container">
        <div className="section-head">
          <span className="section-tag">Traveler Reviews</span>
          <h2 className="section-title">Share Your Experience</h2>
          <p className="section-sub">Been on one of our trips? Rate your tour and help other travelers choose their next adventure.</p>
        </div>
        {toursLoading && <p className="text-center" role="status">Loading tours…</p>}
        {toursError && <p className="text-center" role="alert">{toursError}</p>}
        {!toursLoading && !toursError && !tours.length && <p className="text-center">There are no tours to review right now.</p>}
        {!toursLoading && !toursError && tours.length > 0 && !rateableTours.length && <p className="text-center" role="alert">Tour data is missing database IDs. Restart or redeploy the latest backend to enable ratings.</p>}
        {!toursLoading && !toursError && rateableTours.length > 0 && (
          <div className="reviews-layout">
            <form className="review-form-card" onSubmit={handleSubmit}>
              <h3>Rate a hike or tour</h3>
              <p>Your rating and name will appear publicly as soon as you submit.</p>
              <div className="form-group">
                <label htmlFor="reviewTour">Choose your experience</label>
                <select id="reviewTour" value={selectedTour} onChange={(event) => { setSelectedTour(event.target.value); setStatus({ message: '', type: '' }); }} required>
                  {rateableTours.map((tour) => <option key={tour.id} value={tour.id}>{tour.title}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="reviewerName">Your name</label>
                <input id="reviewerName" name="reviewerName" type="text" minLength="2" maxLength="80" autoComplete="name" required />
              </div>
              <fieldset className="review-rating-group">
                <legend>Your rating</legend>
                <div className="form-group">
                  <label htmlFor="reviewRating">Choose a rating from 1 to 5</label>
                  <select id="reviewRating" name="rating" defaultValue="" required>
                    <option value="" disabled>-- Select rating --</option>
                    {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} out of 5</option>)}
                  </select>
                </div>
              </fieldset>
              <div className="form-group">
                <label htmlFor="reviewText">Tell us about it <span>(optional)</span></label>
                <textarea id="reviewText" name="review" rows="4" maxLength="1000" placeholder="What did you enjoy about your experience?"></textarea>
              </div>
              <button type="submit" className="btn btn-primary btn-block" disabled={submitting || !selectedTour}>
                {submitting ? 'Posting…' : 'Post My Rating'}
              </button>
              {status.message && <p className={`review-status ${status.type}`} role="status">{status.message}</p>}
            </form>
            <div className="review-list-card">
              <div className="review-list-heading">
                <div>
                  <h3>Guest ratings</h3>
                  <p>{summary.count ? `${summary.average.toFixed(1)} out of 5 · ${summary.count} ${summary.count === 1 ? 'rating' : 'ratings'}` : 'Be the first to rate this trip.'}</p>
                </div>
                {summary.count > 0 && <span className="review-average" aria-label={`Average rating ${summary.average} out of 5`}>{summary.average.toFixed(1)} / 5</span>}
              </div>
              {loadingReviews && <p role="status">Loading reviews…</p>}
              {reviewsError && <p role="alert" className="review-error">{reviewsError}</p>}
              {!loadingReviews && !reviewsError && reviews.length === 0 && <p className="review-empty">No ratings yet for this experience. Be the first to share yours.</p>}
              {!loadingReviews && !reviewsError && reviews.map((review) => (
                <article className="review-item" key={review.id}>
                  <div className="review-item-heading">
                    <strong>{review.name}</strong>
                    <time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString()}</time>
                  </div>
                  <p className="review-item-rating">Rating: {review.rating} / 5</p>
                  {review.review && <p>{review.review}</p>}
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function AboutPage() {
  return (
    <>
      <PageHero
        title="About Trekrilluxe"
        description="Thoughtful safaris, treks, and cultural journeys across East Africa."
        page="About"
        className="about-page-hero"
        showBreadcrumb={false}
      />
      <section className="about-split container">
        <img className="about-illustration reveal" src={storyImage} alt="Trekrilluxe team enjoying an outdoor trip together" />
        <div className="about-text reveal">
          <h2>Built by Travelers, For Travelers</h2>
          <p>Trekrilluxe Tours and Safaris was founded on a simple belief: that East Africa's landscapes, wildlife and cultures deserve to be experienced thoughtfully, not rushed through. What began as a small team of passionate local guides has grown into a full-service safari company trusted by travelers from across the world.</p>
          <p>Today we design everything from classic Big Five game drives to challenging mountain treks, relaxing coastal escapes and immersive cultural encounters — always with a focus on safety, sustainability and genuine connection to the places we visit.</p>
          <p>We work closely with local communities and conservancies, ensuring that every trip you take with us also supports the people and ecosystems that make these destinations so special.</p>
        </div>
      </section>
      <section className="why-us" style={{ paddingTop: 10 }}>
        <div className="container">
          <div className="section-head reveal"><span className="section-tag">What Drives Us</span><h2 className="section-title">Our Core Values</h2></div>
          <div className="values-grid">
            <ValueCard title="Safety First" description="Vetted vehicles, trained guides and rigorous safety protocols on every trip." />
            <ValueCard title="Conservation Minded" description="We partner with conservancies and support community-led tourism." />
            <ValueCard title="Honest Partnership" description="Clear communication and transparent pricing from quote to return home." />
            <ValueCard title="Tailored Experiences" description="No two travelers are alike, so no two itineraries should be either." />
          </div>
        </div>
      </section>
    </>
  );
}

function ValueCard({ title, description }) {
  return <div className="value-card reveal"><h4>{title}</h4><p>{description}</p></div>;
}

function ContactPage() {
  const [status, setStatus] = useState({ message: '', type: '' });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setSubmitting(true);
    setStatus({ message: '', type: '' });
    try {
      const result = await apiSubmitContact({
        name: values.get('name'),
        email: values.get('email'),
        phone: values.get('phone'),
        subject: values.get('subject'),
        message: values.get('message')
      });
      setStatus({
        message: result.data?.message || result.data?.error || 'Something went wrong.',
        type: result.ok ? 'success' : 'error'
      });
      if (result.ok) form.reset();
    } catch {
      setStatus({ message: 'Could not reach the server. Please make sure the backend is running.', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHero title="Contact Us" description="Questions about a tour? Our travel consultants are here to help." page="Contact" className="photo-page-hero" />
      <section className="form-section"><div className="container"><div className="form-wrap">
        <div className="form-card reveal">
          <h3>Send Us a Message</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <FormField id="cName" name="name" label="Full Name" required />
              <FormField id="cEmail" name="email" label="Email Address" type="email" required />
            </div>
            <div className="form-row">
              <FormField id="cPhone" name="phone" label="Phone Number (optional)" type="tel" />
              <FormField id="cSubject" name="subject" label="Subject" required />
            </div>
            <div className="form-group"><label htmlFor="cMessage">Message</label><textarea id="cMessage" name="message" rows="5" required></textarea></div>
            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>{submitting ? 'Sending…' : 'Send Message'}</button>
            {status.message && <p id="formMsg" className={status.type} role="status">{status.message}</p>}
          </form>
        </div>
        <ContactInfo />
      </div></div></section>
    </>
  );
}

function FormField({ id, name, label, type = 'text', required = false }) {
  return <div className="form-group"><label htmlFor={id}>{label}</label><input id={id} name={name} type={type} required={required} /></div>;
}

function ContactInfo() {
  const { settings, error } = useSiteSettings();
  if (!settings) return <div className="contact-info-card reveal"><ContentMessage loading={!error} error={error} /></div>;
  return (
    <div className="contact-info-card reveal">
      <h3>Get In Touch</h3>
      <ContactRow title="Office Location" text={settings.location} />
      <ContactRow title="Phone" text={settings.phone} />
      <ContactRow title="Email" text={settings.email} />
      <ContactRow title="Office Hours" text={settings.officeHours} />
      <SocialLinks links={settings.socialLinks} />
    </div>
  );
}

function ContactRow({ title, text }) {
  return <div className="contact-row"><strong>{title}</strong><span>{text}</span></div>;
}

function SocialLinks({ links = [] }) {
  const activeLinks = links.filter((link) => link.url);
  if (!activeLinks.length) return null;
  return (
    <div className="social-row">
      {activeLinks.map((link) => (
        <a key={link.id} href={link.url} target="_blank" rel="noreferrer">{link.label}</a>
      ))}
    </div>
  );
}

function BookingPage() {
  const { tours, loading, error } = useTours();
  const { settings } = useSiteSettings();
  const [status, setStatus] = useState({ message: '', type: '' });
  const [submitting, setSubmitting] = useState(false);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [booking, setBooking] = useState(null);
  const [paymentPhone, setPaymentPhone] = useState('');
  const [payment, setPayment] = useState(null);
  const [paymentMessage, setPaymentMessage] = useState('');
  const preselectedTour = new URLSearchParams(window.location.search).get('tour') || '';
  const [selectedTour, setSelectedTour] = useState(preselectedTour);
  const [travelDate, setTravelDate] = useState('');
  const selectedTourDetails = tours.find((tour) => String(tour.id) === selectedTour);

  useEffect(() => {
    setTravelDate(getTourDate(selectedTourDetails));
  }, [selectedTourDetails]);

  useEffect(() => {
    if (!payment?.checkoutRequestId || payment.status !== 'pending') return undefined;
    let active = true;
    const timer = window.setInterval(async () => {
      try {
        const response = await apiFetchMpesaPaymentStatus(payment.checkoutRequestId);
        if (!active) return;
        if (response.data.status === 'success') {
          setPayment({ ...payment, status: 'success' });
          setPaymentMessage('Payment received. Your booking is now paid.');
        } else if (response.data.status === 'failed') {
          setPayment({ ...payment, status: 'failed' });
          setPaymentMessage(response.data.message || 'M-Pesa payment was not completed. You can try again.');
        }
      } catch (pollError) {
        if (active) {
          setPaymentMessage(pollError.message || 'Unable to check the payment status. Please try again.');
        }
      }
    }, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [payment]);

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setSubmitting(true);
    setStatus({ message: '', type: '' });
    try {
      const result = await apiSubmitBooking({
        name: values.get('name'),
        email: values.get('email'),
        phone: values.get('phone'),
        tourId: values.get('tourId'),
        travelDate: values.get('travelDate'),
        people: values.get('people'),
        notes: values.get('notes')
      });
      setStatus({
        message: result.data?.message || result.data?.error || 'Something went wrong.',
        type: result.ok ? 'success' : 'error'
      });
      if (result.ok && result.data?.data?.id) {
        setBooking(result.data.data);
        setPaymentPhone(String(values.get('phone') || ''));
        setPayment(null);
        setPaymentMessage('');
      }
    } catch (submitError) {
      setStatus({ message: submitError.message || 'Could not reach the server. Please make sure the backend is running.', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMpesaPayment(event) {
    event.preventDefault();
    setPaymentSubmitting(true);
    setPaymentMessage('');
    try {
      const response = await apiInitiateMpesaPayment(booking.id, paymentPhone);
      setPayment({
        checkoutRequestId: response.data.checkoutRequestId,
        status: 'pending'
      });
      setPaymentMessage(response.data.customerMessage || 'Check your phone and enter your M-Pesa PIN to complete payment.');
    } catch (paymentError) {
      setPaymentMessage(paymentError.message || 'Unable to start M-Pesa payment. Please try again.');
    } finally {
      setPaymentSubmitting(false);
    }
  }

  return (
    <>
      <PageHero title="Book Your Safari" description="Fill in the form below and our team will confirm availability within 24 hours." page="Booking" className="photo-page-hero" />
      <section className="form-section"><div className="container"><div className="form-wrap">
        <div className="form-card reveal">
          <h3>Booking Details</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <FormField id="bName" name="name" label="Full Name" required />
              <FormField id="bEmail" name="email" label="Email Address" type="email" required />
            </div>
            <div className="form-row">
              <FormField id="bPhone" name="phone" label="Phone Number" type="tel" required />
              <div className="form-group"><label htmlFor="bTour">Select Tour</label>
                <select id="bTour" name="tourId" required value={selectedTour} onChange={(event) => setSelectedTour(event.target.value)} disabled={loading || Boolean(error)}>
                  <option value="">{error ? 'Unable to load tours — is the backend running?' : loading ? 'Loading tours…' : '-- Choose a tour --'}</option>
                  {tours.map((tour) => <option key={tour.id} value={tour.id}>{tour.title} ({formatKsh(tour.price)})</option>)}
                </select>
                {selectedTourDetails && <p className="booking-tour-summary">{selectedTourDetails.shortDesc} Duration: {selectedTourDetails.duration}. Price: {formatKsh(selectedTourDetails.price)} per person.</p>}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group"><label htmlFor="bDate">Preferred Travel Date</label><input id="bDate" name="travelDate" type="date" value={travelDate} onChange={(event) => setTravelDate(event.target.value)} required /></div>
              <div className="form-group"><label htmlFor="bPeople">Number of Travelers</label><input id="bPeople" name="people" type="number" min="1" defaultValue="2" required /></div>
            </div>
            <div className="form-group"><label htmlFor="bNotes">Special Requests (optional)</label><textarea id="bNotes" name="notes" rows="4" placeholder="Dietary needs, accessibility requirements, honeymoon package, etc."></textarea></div>
            <button type="submit" className="btn btn-primary btn-block" disabled={submitting || loading || Boolean(error)}>{submitting ? 'Submitting…' : 'Submit Booking Request'}</button>
            {status.message && <p id="formMsg" className={status.type} role="status">{status.message}</p>}
            <p className="form-note">Submitting a booking request does not confirm availability. After submitting, you can pay the full tour total by M-Pesa STK Push while our team confirms your trip.</p>
          </form>
          {booking && (
            <div className="mpesa-payment-panel">
              <h3>Pay for your tour</h3>
              <p>{booking.tourTitle}: {booking.people} traveler(s) at {formatKsh(booking.tourPrice)} each.</p>
              <p className="mpesa-total">Full total: {formatKsh(booking.totalAmount)}</p>
              <form onSubmit={handleMpesaPayment}>
                <div className="form-group">
                  <label htmlFor="mpesaPhone">M-Pesa phone number</label>
                  <input id="mpesaPhone" type="tel" value={paymentPhone} onChange={(event) => setPaymentPhone(event.target.value)} placeholder="07XX XXX XXX" required />
                </div>
                <button type="submit" className="btn btn-primary btn-block" disabled={paymentSubmitting || payment?.status === 'pending' || payment?.status === 'success'}>
                  {paymentSubmitting ? 'Starting M-Pesa…' : payment?.status === 'pending' ? 'Waiting for M-Pesa confirmation…' : payment?.status === 'success' ? 'Payment received' : 'Pay with M-Pesa'}
                </button>
                {paymentMessage && <p className={`payment-status ${payment?.status || 'error'}`} role="status">{paymentMessage}</p>}
              </form>
            </div>
          )}
        </div>
        <div className="contact-info-card reveal">
          <h3>Need Help Deciding?</h3>
          <p className="booking-help-copy">Our travel consultants can recommend the best tour based on your travel dates, budget and interests.</p>
          {settings && <>
            <ContactRow title="Call Us" text={settings.bookingPhone} />
            <ContactRow title="Email Us" text={settings.bookingEmail} />
            {getWhatsAppUrl(settings.whatsapp) && <div className="contact-row"><strong>WhatsApp</strong><a href={getWhatsAppUrl(settings.whatsapp)} target="_blank" rel="noreferrer">Chat with our team</a></div>}
          </>}
          <a href="/tours" className="btn btn-outline booking-browse-link">Browse All Tours</a>
        </div>
      </div></div></section>
    </>
  );
}

function NotFoundPage() {
  return (
    <section className="hero not-found-hero">
      <div className="hero-sun"></div><div className="hero-hills"></div>
      <div className="hero-content not-found-content">
        <span className="section-tag">404</span>
        <h1>Looks Like You Wandered Off the Trail</h1>
        <p>The page you're looking for doesn't exist. Let's get you back to safety.</p>
        <div className="hero-actions not-found-actions">
          <a href="/" className="btn btn-primary">Back to Home</a>
          <a href="/tours" className="btn btn-outline">Browse Tours</a>
        </div>
      </div>
    </section>
  );
}

function Chatbot() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState([
    { sender: 'assistant', text: 'Hello! I can help with tours, bookings, prices, and M-Pesa payments. What would you like to know?' }
  ]);

  function replyTo(question) {
    const text = question.toLowerCase();
    if (/mpesa|m-pesa|payment|pay\b/.test(text)) {
      return 'After you submit a booking request, you can pay the full tour total with an M-Pesa STK Push. Availability is still confirmed by our team.';
    }
    if (/book|reserve|booking/.test(text)) {
      return 'Choose a tour and use its Book This Tour button to preselect it in the booking form. Add your travel date and traveler count to submit your request.';
    }
    if (/price|cost|rate|how much/.test(text)) {
      return 'Each tour card shows the per-person price. The booking form calculates the full total based on the number of travelers.';
    }
    if (/contact|team|help|human/.test(text)) {
      return 'Our travel team can help you plan a trip. Visit Contact Us to send a message or share your preferred dates and destination.';
    }
    if (/tour|safari|adventure|trip/.test(text)) {
      return 'We offer wildlife safaris, mountain treks, beach escapes, and cultural tours. Browse Tour Packages to see available trips and details.';
    }
    return 'I can help with tour options, prices, bookings, and M-Pesa payments. For a tailored question, please send us a message on the Contact Us page.';
  }

  function sendMessage(event) {
    event.preventDefault();
    const question = draft.trim();
    if (!question) return;
    setMessages((current) => [
      ...current,
      { sender: 'visitor', text: question },
      { sender: 'assistant', text: replyTo(question) }
    ]);
    setDraft('');
  }

  return (
    <aside className="chatbot" aria-label="Tour assistance chat">
      {open && (
        <section className="chatbot-panel" aria-label="Chat with Trekrilluxe">
          <div className="chatbot-heading">
            <div><strong>Trekrilluxe Assistant</strong><span>Ask about tours and bookings</span></div>
            <button type="button" className="chatbot-close" onClick={() => setOpen(false)}>Close</button>
          </div>
          <div className="chatbot-messages" aria-live="polite">
            {messages.map((message, index) => (
              <p className={`chatbot-message ${message.sender}`} key={`${message.sender}-${index}`}>{message.text}</p>
            ))}
          </div>
          <a className="chatbot-book-link" href="/tours">Browse tour packages</a>
          <form className="chatbot-form" onSubmit={sendMessage}>
            <label className="visually-hidden" htmlFor="chatbotMessage">Your question</label>
            <input id="chatbotMessage" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Type your question" maxLength="300" />
            <button type="submit" disabled={!draft.trim()}>Send</button>
          </form>
        </section>
      )}
      <button className="chatbot-toggle" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {open ? 'Close chat' : 'Chat with us'}
      </button>
    </aside>
  );
}

function App() {
  const page = getCurrentPage();
  const knownPages = ['home', 'about', 'tours', 'contact', 'booking', 'admin'];
  const activePage = knownPages.includes(page) ? page : 'notFound';
  const details = pageDetails[activePage];
  const trackedPaths = useRef(new Set());

  useEffect(() => {
    document.title = details.title;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.setAttribute('content', details.description);
  }, [details]);

  useEffect(() => {
    if (activePage === 'admin' || activePage === 'notFound') return;
    const pagePath = window.location.pathname;
    if (trackedPaths.current.has(pagePath)) return;
    trackedPaths.current.add(pagePath);
    trackPageView(pagePath).catch((error) => {
      console.error('Unable to record page view:', error);
    });
  }, [activePage]);

  useEffect(() => {
    const revealEls = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window) || revealEls.length === 0) return undefined;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    revealEls.forEach((element) => {
      element.style.opacity = '0';
      element.style.transform = 'translateY(24px)';
      element.style.transition = 'all 0.6s ease';
      observer.observe(element);
    });
    return () => observer.disconnect();
  }, [activePage]);

  let content;
  switch (activePage) {
    case 'home': content = <HomePage />; break;
    case 'about': content = <AboutPage />; break;
    case 'tours': content = <ToursPage />; break;
    case 'contact': content = <ContactPage />; break;
    case 'booking': content = <BookingPage />; break;
    default: content = <NotFoundPage />;
  }

  if (activePage === 'admin') return <AdminApp />;
  if (activePage === 'notFound') return <NotFoundPage />;
  return <><Header page={activePage} /><main>{content}</main><Footer /><Chatbot /></>;
}

export default App;
