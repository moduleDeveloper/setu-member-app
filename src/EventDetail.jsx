import React, { useEffect, useState } from 'react';
import { ArrowLeft, Calendar, Clock3, ExternalLink, FileText, MapPin, Paperclip, Tag } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppTheme } from './context/ThemeContext';
import { loadEventDetail } from './services/eventsStore';
import { formatEventDate, formatTimeRange } from './services/eventsService';

const Section = ({ icon, label, children, theme }) => {
  const IconComponent = icon;
  return (
    <div className="rounded-2xl p-4 shadow-sm border" style={{ background: 'var(--advertisement-card-bg)', borderColor: 'var(--advertisement-card-border)' }}>
      <div className="flex items-center gap-2 mb-2">
        <IconComponent className="h-4 w-4 shrink-0" style={{ color: theme.primary }} />
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: theme.primary }}>{label}</p>
      </div>
      <div className="text-sm leading-relaxed" style={{ color: 'var(--advertisement-description)' }}>{children}</div>
    </div>
  );
};

const isUrl = (v) => {
  try { new URL(String(v)); return true; } catch { return false; }
};

const getAttachmentUrl = (attachment) => {
  if (typeof attachment === 'string') return attachment.trim();
  if (!attachment || typeof attachment !== 'object') return '';
  return String(attachment.url || attachment.path || attachment.href || '').trim();
};

const getAttachmentLabel = (attachment, idx) => {
  if (typeof attachment === 'object' && attachment) {
    const label = String(attachment.name || attachment.title || '').trim();
    if (label) return label;
  }

  const url = getAttachmentUrl(attachment);
  if (!url) return `Attachment ${idx + 1}`;

  try {
    const parsed = new URL(url);
    const last = (parsed.pathname || '').split('/').filter(Boolean).pop();
    return decodeURIComponent(last || `Attachment ${idx + 1}`);
  } catch {
    return `Attachment ${idx + 1}`;
  }
};

const getAttachmentType = (url) => {
  const value = String(url || '').toLowerCase();
  const clean = value.split('?')[0].split('#')[0];
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(clean)) return 'image';
  if (/\.(pdf)$/.test(clean)) return 'pdf';
  return 'other';
};

const EventDetail = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const theme = useAppTheme();

  const trustId = localStorage.getItem('selected_trust_id') || '';

  const hasRouteEventId = Boolean(eventId);
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(() => hasRouteEventId);
  const [error, setError] = useState(() => (hasRouteEventId ? '' : 'Event not found.'));

  useEffect(() => {
    if (!eventId) return;

    let active = true;
    Promise.resolve().then(() => {
      if (active) setLoading(true);
    });

    loadEventDetail({ eventId: decodeURIComponent(eventId), trustId, forceRefresh: false })
      .then((ev) => {
        if (!active) return;
        if (ev) { setEvent(ev); }
        else { setError('Event details not available.'); }
      })
      .catch((err) => { if (active) setError(err?.message || 'Failed to load event.'); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [eventId, trustId]);

  const dateLabel = event ? formatEventDate(event.startEventDate, event.endEventDate) : '';
  const timeLabel = event ? formatTimeRange(event.startTime, event.endTime) : '';
  const attachments = Array.isArray(event?.attachments) ? event.attachments : [];
  const normalizedAttachments = attachments
    .map((att, idx) => {
      const url = getAttachmentUrl(att);
      if (!url || !isUrl(url)) return null;
      return {
        id: `${idx}-${url}`,
        url,
        label: getAttachmentLabel(att, idx),
        type: getAttachmentType(url)
      };
    })
    .filter(Boolean);

  return (
    <div className="min-h-screen pb-10" style={{ background: 'var(--page-bg, var(--app-page-bg))' }}>
      {/* Navbar */}
      <div className="theme-navbar border-b px-5 py-4 flex items-center gap-3 sticky top-0 z-50 shadow-sm" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)' }}>
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl transition-colors" style={{ background: 'color-mix(in srgb, var(--app-accent-bg) 40%, transparent)' }}>
          <ArrowLeft className="h-5 w-5" style={{ color: 'var(--navbar-text)' }} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold truncate" style={{ color: 'var(--navbar-text)' }}>
            {loading ? 'Event Details' : (event?.title || 'Event Details')}
          </h1>
          {dateLabel && <p className="text-[11px] font-medium truncate" style={{ color: 'var(--advertisement-subtitle)' }}>{dateLabel}</p>}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="px-6 py-4 space-y-4 animate-pulse">
          <div className="rounded-2xl p-5 border shadow-sm" style={{ background: 'var(--advertisement-card-bg)', borderColor: 'var(--advertisement-card-border)' }}>
            <div className="h-3 rounded w-1/4 mb-3" style={{ background: 'color-mix(in srgb, var(--advertisement-card-bg) 62%, var(--app-accent-bg))' }} />
            <div className="h-5 rounded w-3/4 mb-2" style={{ background: 'color-mix(in srgb, var(--advertisement-card-bg) 62%, var(--app-accent-bg))' }} />
            <div className="h-3 rounded w-full mb-1" style={{ background: 'color-mix(in srgb, var(--advertisement-card-bg) 62%, var(--app-accent-bg))' }} />
            <div className="h-3 rounded w-5/6" style={{ background: 'color-mix(in srgb, var(--advertisement-card-bg) 62%, var(--app-accent-bg))' }} />
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl p-4 border shadow-sm" style={{ background: 'var(--advertisement-card-bg)', borderColor: 'var(--advertisement-card-border)' }}>
              <div className="h-3 rounded w-1/3 mb-2" style={{ background: 'color-mix(in srgb, var(--advertisement-card-bg) 62%, var(--app-accent-bg))' }} />
              <div className="h-4 rounded w-2/3" style={{ background: 'color-mix(in srgb, var(--advertisement-card-bg) 62%, var(--app-accent-bg))' }} />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="px-6 py-10">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
            <h3 className="font-bold text-red-800">Unable to load event</h3>
            <p className="text-sm text-red-600 mt-1">{error}</p>
            <button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: 'var(--app-button-bg)', color: 'var(--app-button-text)' }}>Go Back</button>
          </div>
        </div>
      )}

      {/* Content */}
      {!loading && !error && event && (
        <div className="px-6 pt-6 space-y-4">
          {/* Hero card */}
          <div className="rounded-2xl p-5 shadow-sm border-l-4" style={{ background: 'var(--advertisement-card-bg)', borderLeftColor: theme.primary, borderColor: 'var(--advertisement-card-border)' }}>
            {event.type && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full inline-flex items-center gap-1 mb-3" style={{ color: theme.primary, background: `color-mix(in srgb, ${theme.primary} 12%, white)` }}>
                <Tag className="h-3 w-3" />{event.type}
              </span>
            )}
            <h2 className="text-xl font-extrabold leading-tight mb-2" style={{ color: 'var(--advertisement-title)' }}>{event.title}</h2>
            {event.description && (
              <p className="text-sm leading-relaxed" style={{ color: 'var(--advertisement-description)' }}>{event.description}</p>
            )}
          </div>

          {/* Date */}
          {dateLabel && (
            <Section icon={Calendar} label="Date" theme={theme}>
              <span className="font-semibold">{dateLabel}</span>
            </Section>
          )}

          {/* Time */}
          {timeLabel && (
            <Section icon={Clock3} label="Time" theme={theme}>
              <span className="font-semibold">{timeLabel}</span>
            </Section>
          )}

          {/* Location */}
          {event.location && (
            <Section icon={MapPin} label="Location" theme={theme}>
              {event.location}
            </Section>
          )}

          {/* Attachments */}
          {normalizedAttachments.length > 0 && (
            <Section icon={Paperclip} label={`Attachments (${normalizedAttachments.length})`} theme={theme}>
              <div className="space-y-3">
                {normalizedAttachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="rounded-xl border overflow-hidden"
                    style={{ borderColor: 'color-mix(in srgb, var(--brand-navy) 12%, transparent)' }}
                  >
                    {attachment.type === 'image' && (
                      <div className="w-full bg-slate-100">
                        <img
                          src={attachment.url}
                          alt={attachment.label}
                          loading="lazy"
                          className="w-full max-h-[70vh] object-contain bg-slate-100"
                        />
                      </div>
                    )}

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
            </Section>
          )}
        </div>
      )}
    </div>
  );
};

export default EventDetail;
