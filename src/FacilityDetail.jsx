import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Calendar, FileText, Home as HomeIcon, Star } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppTheme } from './context/ThemeContext';
import { getFacilitiesSnapshot, loadFacilityDetail } from './services/facilitiesStore';
import ImageSlider from './components/ImageSlider';

const formatTimestamp = (createdAt, updatedAt) => {
  const value = updatedAt || createdAt;
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(value);
  }
};

const isLikelyUrl = (value) => /^https?:\/\//i.test(String(value || '').trim());
const isDataUrl = (value) => /^data:/i.test(String(value || '').trim());
const LEGACY_ATTACHMENT_SEPARATOR = '||::||';

const getAttachmentUrl = (attachment) => {
  if (typeof attachment === 'string') {
    const value = attachment.trim();
    if (!value) return '';
    if (value.includes(LEGACY_ATTACHMENT_SEPARATOR)) {
      const [, payload = ''] = value.split(LEGACY_ATTACHMENT_SEPARATOR);
      return String(payload || '').trim();
    }
    return value;
  }
  if (!attachment || typeof attachment !== 'object') return '';
  const value = String(attachment.url || attachment.path || attachment.href || '').trim();
  if (!value) return '';
  if (value.includes(LEGACY_ATTACHMENT_SEPARATOR)) {
    const [, payload = ''] = value.split(LEGACY_ATTACHMENT_SEPARATOR);
    return String(payload || '').trim();
  }
  return value;
};

const getAttachmentLabel = (attachment, idx) => {
  if (typeof attachment === 'object' && attachment) {
    const label = String(attachment.name || attachment.title || '').trim();
    if (label) return label;
  }

  if (typeof attachment === 'string' && attachment.includes(LEGACY_ATTACHMENT_SEPARATOR)) {
    const [name = ''] = attachment.split(LEGACY_ATTACHMENT_SEPARATOR);
    const cleanName = String(name || '').trim();
    if (cleanName) return cleanName;
  }

  const value = getAttachmentUrl(attachment);
  if (!value) return `Attachment ${idx + 1}`;
  if (isDataUrl(value)) return `Attachment ${idx + 1}`;
  if (!isLikelyUrl(value)) return value;

  try {
    const url = new URL(value);
    const last = (url.pathname || '').split('/').filter(Boolean).pop();
    return decodeURIComponent(last || `Attachment ${idx + 1}`);
  } catch {
    return `Attachment ${idx + 1}`;
  }
};

const getAttachmentType = (url) => {
  const value = String(url || '').trim().toLowerCase();
  if (!value) return 'other';
  if (value.startsWith('data:image/')) return 'image';
  if (value.startsWith('data:application/pdf')) return 'pdf';

  const clean = value.split('?')[0].split('#')[0];
  if (/\.(png|jpe?g|jfif|gif|webp|bmp|svg)$/.test(clean)) return 'image';
  if (/\.pdf$/.test(clean)) return 'pdf';
  return 'other';
};

const FacilityDetail = ({ onNavigate }) => {
  const theme = useAppTheme();
  const navigate = useNavigate();
  const { facilityId } = useParams();
  const [facility, setFacility] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [carouselFacilities, setCarouselFacilities] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [currentFacilityId, setCurrentFacilityId] = useState(() => String(facilityId || '').trim());
  const touchStartXRef = useRef(0);
  const touchEndXRef = useRef(0);
  const selectedTrustId = useMemo(() => localStorage.getItem('selected_trust_id') || '', []);

  useEffect(() => {
    setCurrentFacilityId(String(facilityId || '').trim());
  }, [facilityId]);

  useEffect(() => {
    const loadDetail = async () => {
      setError('');
      setLoading(true);
      const trustId = localStorage.getItem('selected_trust_id') || selectedTrustId || '';
      const trustName = localStorage.getItem('selected_trust_name') || null;
      if (!trustId || !currentFacilityId) {
        setFacility(null);
        setLoading(false);
        setError('Facility not found');
        return;
      }

      const snapshot = getFacilitiesSnapshot(trustId);
      const snapshotList = Array.isArray(snapshot?.facilities) ? snapshot.facilities : [];
      setCarouselFacilities(snapshotList);
      const idxFromSnapshot = snapshotList.findIndex((item) => String(item?.id || '') === String(currentFacilityId));
      if (idxFromSnapshot >= 0) setActiveIndex(idxFromSnapshot);

      const fromList = snapshot?.facilitiesById?.[String(currentFacilityId)] || null;
      if (fromList) setFacility(fromList);

      const detailRes = await loadFacilityDetail({
        trustId,
        trustName,
        facilityId: String(currentFacilityId),
        forceRefresh: false
      });

      if (detailRes?.error) {
        setError(detailRes.error);
      } else if (detailRes?.facility) {
        setFacility(detailRes.facility);
      } else {
        setFacility(null);
        setError('Facility not found');
      }
      setLoading(false);
    };

    loadDetail();
  }, [currentFacilityId, selectedTrustId]);

  useEffect(() => {
    if (carouselFacilities.length <= 1) return undefined;
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % carouselFacilities.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [carouselFacilities]);

  useEffect(() => {
    if (!Array.isArray(carouselFacilities) || carouselFacilities.length === 0) return;
    const next = carouselFacilities[activeIndex];
    const nextId = String(next?.id || '').trim();
    if (!nextId || nextId === currentFacilityId) return;
    setCurrentFacilityId(nextId);
  }, [activeIndex, carouselFacilities, currentFacilityId]);

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/facilities', { replace: true });
  };

  const isVip = String(facility?.type || '').toLowerCase() === 'vip';
  const dateLabel = formatTimestamp(facility?.created_at, facility?.updated_at);
  const attachments = Array.isArray(facility?.attachments) ? facility.attachments : [];
  const normalizedAttachments = attachments
    .map((attachment, idx) => {
      const url = getAttachmentUrl(attachment);
      if (!url || (!isLikelyUrl(url) && !isDataUrl(url))) return null;
      return {
        id: `${facility?.id || 'facility'}_att_${idx}`,
        url,
        label: getAttachmentLabel(attachment, idx),
        type: getAttachmentType(url),
      };
    })
    .filter(Boolean);

  const handleTouchStart = (event) => {
    touchStartXRef.current = Number(event?.touches?.[0]?.clientX || 0);
  };

  const handleTouchMove = (event) => {
    touchEndXRef.current = Number(event?.touches?.[0]?.clientX || 0);
  };

  const handleTouchEnd = () => {
    if (carouselFacilities.length <= 1) return;
    const delta = touchStartXRef.current - touchEndXRef.current;
    if (Math.abs(delta) < 45) return;
    if (delta > 0) {
      setActiveIndex((prev) => (prev + 1) % carouselFacilities.length);
    } else {
      setActiveIndex((prev) => (prev - 1 + carouselFacilities.length) % carouselFacilities.length);
    }
    touchStartXRef.current = 0;
    touchEndXRef.current = 0;
  };

  return (
    <div className="min-h-screen pb-8" style={{ background: 'var(--page-bg, var(--app-page-bg))' }}>
      <div className="theme-navbar border-b px-6 py-5 flex items-center justify-between sticky top-0 z-40 shadow-sm" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 20px)' }}>
        <button
          onClick={handleBack}
          className="p-2 rounded-xl transition-colors"
          aria-label="Back to facilities"
        >
          <ArrowLeft className="h-5 w-5" style={{ color: 'var(--navbar-text)' }} />
        </button>
        <h1 className="text-lg font-bold" style={{ color: 'var(--navbar-text)' }}>Facility Details</h1>
        <button
          onClick={() => onNavigate('home')}
          className="p-2 rounded-xl transition-colors flex items-center justify-center"
          style={{ color: 'var(--navbar-text)' }}
          aria-label="Go to home"
        >
          <HomeIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="px-6 pt-6 pb-10">
        {loading && (
          <div className="rounded-2xl border p-5 shadow-sm animate-pulse" style={{ borderColor: 'var(--advertisement-card-border)', background: 'var(--advertisement-card-bg)' }}>
            <div className="h-4 w-24 rounded mb-4" style={{ background: 'color-mix(in srgb, var(--advertisement-card-bg) 62%, var(--app-accent-bg))' }} />
            <div className="h-6 w-3/4 rounded mb-3" style={{ background: 'color-mix(in srgb, var(--advertisement-card-bg) 62%, var(--app-accent-bg))' }} />
            <div className="h-4 w-1/2 rounded mb-4" style={{ background: 'color-mix(in srgb, var(--advertisement-card-bg) 62%, var(--app-accent-bg))' }} />
            <div className="h-4 w-full rounded mb-2" style={{ background: 'color-mix(in srgb, var(--advertisement-card-bg) 62%, var(--app-accent-bg))' }} />
            <div className="h-4 w-11/12 rounded" style={{ background: 'color-mix(in srgb, var(--advertisement-card-bg) 62%, var(--app-accent-bg))' }} />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl p-6 text-center" style={{ background: 'var(--brand-red-light)', border: '1px solid color-mix(in srgb, var(--brand-red) 25%, transparent)' }}>
            <h3 className="font-bold" style={{ color: 'var(--brand-red-dark)' }}>Unable to load facility</h3>
            <p className="text-sm mt-1" style={{ color: 'var(--brand-red-dark)' }}>{error}</p>
            <button
              onClick={handleBack}
              className="mt-4 px-4 py-2 rounded-xl text-white text-sm font-semibold"
              style={{ background: 'var(--app-button-bg)', color: 'var(--app-button-text)' }}
            >
              Back to Facilities
            </button>
          </div>
        )}

        {!loading && !error && facility && (
          <div
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="rounded-2xl border p-5 shadow-sm border-l-4"
            style={{
              borderLeftColor: isVip ? 'color-mix(in srgb, var(--brand-red) 45%, #d4af37)' : theme.primary,
              borderColor: isVip ? 'color-mix(in srgb, var(--brand-red) 22%, #f1e2a4)' : 'color-mix(in srgb, var(--brand-navy) 10%, transparent)',
              background: 'var(--advertisement-card-bg)'
            }}
          >
            <div className="flex items-center justify-between gap-3 mb-4">
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full inline-flex items-center gap-1"
                style={
                  isVip
                    ? { color: 'color-mix(in srgb, var(--brand-red-dark) 50%, #8A6A00)', background: 'color-mix(in srgb, var(--brand-red-light) 48%, #FDF3C7)' }
                    : { color: theme.primary, background: `color-mix(in srgb, ${theme.primary} 12%, white)` }
                }
              >
                {isVip ? <Star className="h-3 w-3" fill="color-mix(in srgb, var(--brand-red) 45%, #d4af37)" color="color-mix(in srgb, var(--brand-red) 45%, #d4af37)" /> : null}
                {isVip ? 'VIP Facility' : 'GEN'}
              </span>
              {dateLabel && (
                <div className="flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--advertisement-subtitle)' }}>
                  <Calendar className="h-3.5 w-3.5" />
                  {dateLabel}
                </div>
              )}
            </div>

            <h2 className="text-xl font-bold leading-tight" style={{ color: 'var(--advertisement-title)' }}>
              {facility.name}
            </h2>
            {carouselFacilities.length > 1 && (
              <div className="mt-2">
                <p className="text-[11px] font-semibold" style={{ color: 'var(--advertisement-subtitle)' }}>
                  Swipe to explore other facilities
                </p>
                <div className="mt-2 flex items-center gap-1.5">
                  {carouselFacilities.map((item, idx) => (
                    <button
                      key={String(item?.id || idx)}
                      type="button"
                      onClick={() => setActiveIndex(idx)}
                      className="h-1.5 rounded-full transition-all"
                      style={{
                        width: idx === activeIndex ? 18 : 8,
                        background: idx === activeIndex ? theme.primary : 'color-mix(in srgb, var(--body-text-color) 25%, transparent)'
                      }}
                      aria-label={`View facility ${idx + 1}`}
                    />
                  ))}
                </div>
              </div>
            )}

            <p className="mt-4 text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--advertisement-description)' }}>
              {facility.description || 'No description provided.'}
            </p>

            {normalizedAttachments.length > 0 && (
              <div className="mt-6 border-t border-slate-100 pt-5">
                <div className="space-y-3">
                  {/* Image Carousel */}
                  {normalizedAttachments.filter(a => a.type === 'image').length > 0 && (
                    <ImageSlider 
                      images={normalizedAttachments.filter(a => a.type === 'image')}
                      autoPlayInterval={5000}
                    />
                  )}

                  {/* PDF and other attachments */}
                  {normalizedAttachments.filter(a => a.type !== 'image').map((attachment) => (
                    <div
                      key={attachment.id}
                      className="rounded-xl border overflow-hidden"
                      style={{ borderColor: 'color-mix(in srgb, var(--brand-navy) 12%, transparent)' }}
                    >
                      {attachment.type === 'pdf' && (
                        <div className="w-full h-56 bg-slate-50">
                          <iframe
                            title={attachment.label}
                            src={attachment.url}
                            className="w-full h-full border-0"
                          />
                        </div>
                      )}

                      {attachment.type === 'other' && (
                        <div className="flex items-center gap-2 p-3 bg-slate-50 text-slate-700">
                          <FileText className="h-4 w-4 shrink-0" />
                          <span className="truncate flex-1">{attachment.label}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && !error && !facility && (
          <div className="text-center py-20">
            <div className="h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-4 border shadow-sm" style={{ background: 'var(--advertisement-card-bg)', borderColor: 'var(--advertisement-card-border)' }}>
              <FileText className="h-8 w-8" style={{ color: 'var(--advertisement-subtitle)' }} />
            </div>
            <h3 className="font-bold" style={{ color: 'var(--advertisement-title)' }}>Facility not found</h3>
            <p className="text-sm mt-1" style={{ color: 'var(--advertisement-subtitle)' }}>This facility may no longer be available for your access.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FacilityDetail;
