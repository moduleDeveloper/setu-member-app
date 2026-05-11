import React, { useEffect, useRef, useState } from 'react';
import { Calendar, CheckCircle2, ChevronRight, Clock3, FileText, Home as HomeIcon, MapPin, Menu, X, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import { useAppTheme } from './context/ThemeContext';
import { supabase } from './services/supabaseClient';
import {
  CATEGORIES,
  clearEventsCache,
  eventsConfig,
  getEventsCounts,
  getEventsSnapshot,
  loadEventsPage,
} from './services/eventsStore';
import { formatEventDate, formatTimeRange } from './services/eventsService';
import { applyOpacity } from './utils/colorUtils';

const EVENTS_SCROLL_KEY = 'events_scroll_y';
const EVENTS_ACTIVE_TAB_KEY = 'events_active_tab';

const CATEGORY_META = {
  current: { label: 'Current', icon: Zap },
  upcoming: { label: 'Upcoming', icon: Clock3 },
  past: { label: 'Past', icon: CheckCircle2 },
};

const isLikelyUrl = (value) => /^https?:\/\//i.test(String(value || '').trim());

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
  const clean = String(url || '').toLowerCase().split('?')[0].split('#')[0];
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(clean)) return 'image';
  if (/\.pdf$/.test(clean)) return 'pdf';
  return 'other';
};

const Events = ({ onNavigate }) => {
  const navigate = useNavigate();
  const theme = useAppTheme();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(() => {
    const saved = String(sessionStorage.getItem(EVENTS_ACTIVE_TAB_KEY) || '').toLowerCase();
    return CATEGORIES.includes(saved) ? saved : 'current';
  });
  const [events, setEvents] = useState([]);
  const [pageByCategory, setPageByCategory] = useState({ current: 1, upcoming: 1, past: 1 });
  const [hasMore, setHasMore] = useState(false);
  const [counts, setCounts] = useState({ current: 0, upcoming: 0, past: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [selectedTrustId, setSelectedTrustId] = useState(() => localStorage.getItem('selected_trust_id') || '');

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  useEffect(() => {
    if (isMenuOpen) {
      const y = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${y}px`;
    } else {
      const y = parseInt(document.body.style.top || '0', 10) * -1;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
      window.scrollTo(0, y);
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
    };
  }, [isMenuOpen]);

  const syncFromStore = (trustId, category, pageNo) => {
    const snap = getEventsSnapshot(trustId, category, pageNo);
    setEvents(snap.events);
    setHasMore(snap.hasMore);
    setCounts(getEventsCounts(trustId));
    console.log(`[Events][Debug] tab=${category} page=${pageNo} showing=${snap.events.length} total=${snap.totalCount} hasMore=${snap.hasMore}`);
  };

  const loadCategoryPage = async ({ trustId, category, pageNo, forceRefresh = false, forLoadMore = false }) => {
    const normalizedTrustId = trustId || localStorage.getItem('selected_trust_id') || '';
    const normalizedCategory = CATEGORIES.includes(category) ? category : 'current';
    const safePage = Number(pageNo) > 0 ? Number(pageNo) : 1;

    setSelectedTrustId(normalizedTrustId);
    setError('');

    if (!normalizedTrustId) {
      setEvents([]);
      setHasMore(false);
      setLoading(false);
      return;
    }

    const cachedSnap = getEventsSnapshot(normalizedTrustId, normalizedCategory, safePage);
    const hasCachedData = Array.isArray(cachedSnap?.events) && cachedSnap.events.length > 0;
    const cachedCounts = getEventsCounts(normalizedTrustId);
    const hasAnyCachedData = Object.values(cachedCounts || {}).some((n) => Number(n) > 0);

    if (!forLoadMore && hasCachedData) {
      setEvents(cachedSnap.events);
      setHasMore(Boolean(cachedSnap.hasMore));
      setCounts(cachedCounts);
      setLoading(false);
    } else if (!forLoadMore && hasAnyCachedData) {
      // Keep UI responsive: reuse cached counts/list shell and refresh in background.
      setCounts(cachedCounts);
      setLoading(false);
    }

    if (forLoadMore) setLoadingMore(true);
    else if (!hasCachedData && !hasAnyCachedData) setLoading(true);

    try {
      const res = await loadEventsPage({
        trustId: normalizedTrustId,
        category: normalizedCategory,
        page: safePage,
        forceRefresh
      });

      const fallbackSnap = getEventsSnapshot(normalizedTrustId, normalizedCategory, safePage);
      let resolvedEvents = Array.isArray(res?.events) && res.events.length > 0
        ? res.events
        : (Array.isArray(fallbackSnap?.events) ? fallbackSnap.events : []);
      let resolvedHasMore = typeof res?.hasMore === 'boolean'
        ? res.hasMore
        : Boolean(fallbackSnap?.hasMore);
      let resolvedTotalCount = Number(res?.totalCount);

      const latestCounts = getEventsCounts(normalizedTrustId);
      let expectedCount = Number(latestCounts?.[normalizedCategory]) || 0;
      const pageSize = Number(eventsConfig?.PAGE_SIZE) > 0 ? Number(eventsConfig.PAGE_SIZE) : 10;
      const expectedVisible = Math.min(expectedCount, safePage * pageSize);
      const hasListCountMismatch = expectedVisible > 0 && resolvedEvents.length < expectedVisible;

      if (!forceRefresh && hasListCountMismatch) {
        console.warn('[Events][Recovery] count/list mismatch. Clearing cache and retrying forced reload.', {
          trustId: normalizedTrustId,
          category: normalizedCategory,
          page: safePage,
          expectedCount,
          expectedVisible,
          resolvedLength: resolvedEvents.length
        });
        clearEventsCache(normalizedTrustId);
        const retry = await loadEventsPage({
          trustId: normalizedTrustId,
          category: normalizedCategory,
          page: safePage,
          forceRefresh: true
        });
        const retrySnap = getEventsSnapshot(normalizedTrustId, normalizedCategory, safePage);
        resolvedEvents = Array.isArray(retry?.events) && retry.events.length > 0
          ? retry.events
          : (Array.isArray(retrySnap?.events) ? retrySnap.events : []);
        resolvedHasMore = typeof retry?.hasMore === 'boolean'
          ? retry.hasMore
          : Boolean(retrySnap?.hasMore);
        resolvedTotalCount = Number(retry?.totalCount);
        const retryCounts = getEventsCounts(normalizedTrustId);
        expectedCount = Number(retryCounts?.[normalizedCategory]) || 0;
      }

      setPageByCategory((prev) => ({ ...prev, [normalizedCategory]: safePage }));
      if (activeTabRef.current === normalizedCategory) {
        setEvents(resolvedEvents);
        setHasMore(resolvedHasMore);
      }
      setCounts((prev) => {
        const storeCounts = getEventsCounts(normalizedTrustId);
        const resolvedTotal = Number(resolvedTotalCount);
        if (Number.isFinite(resolvedTotal) && resolvedTotal >= 0) {
          return { ...storeCounts, [normalizedCategory]: resolvedTotal };
        }
        return { ...prev, ...storeCounts };
      });
    } catch (err) {
      setError(err?.message || 'Failed to load events');
    } finally {
      if (forLoadMore) setLoadingMore(false);
      else setLoading(false);
    }
  };

  useEffect(() => {
    const savedY = Number(sessionStorage.getItem(EVENTS_SCROLL_KEY) || 0);
    if (savedY > 0) requestAnimationFrame(() => window.scrollTo(0, savedY));

    const trustId = localStorage.getItem('selected_trust_id') || '';
    const initialTab = CATEGORIES.includes(activeTabRef.current) ? activeTabRef.current : 'current';
    syncFromStore(trustId, initialTab, 1);
    loadCategoryPage({ trustId, category: initialTab, pageNo: 1, forceRefresh: false });

    const onTrustChanged = () => {
      sessionStorage.removeItem(EVENTS_SCROLL_KEY);
      sessionStorage.setItem(EVENTS_ACTIVE_TAB_KEY, 'current');
      window.scrollTo(0, 0);
      setPageByCategory({ current: 1, upcoming: 1, past: 1 });
      setActiveTab('current');
      const nextTrustId = localStorage.getItem('selected_trust_id') || '';
      syncFromStore(nextTrustId, 'current', 1);
      loadCategoryPage({ trustId: nextTrustId, category: 'current', pageNo: 1, forceRefresh: false });
    };

    window.addEventListener('trust-changed', onTrustChanged);
    return () => window.removeEventListener('trust-changed', onTrustChanged);
  }, []);

  useEffect(() => {
    if (!selectedTrustId) return undefined;

    const channel = supabase
      .channel(`events-realtime-${selectedTrustId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events', filter: `trust_id=eq.${selectedTrustId}` },
        () => {
          const pageNo = Number(pageByCategory[activeTabRef.current]) > 0
            ? Number(pageByCategory[activeTabRef.current])
            : 1;
          loadCategoryPage({
            trustId: selectedTrustId,
            category: activeTabRef.current,
            pageNo,
            forceRefresh: true
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedTrustId, pageByCategory]);

  const handleTabSwitch = (category) => {
    if (category === activeTab) return;
    setActiveTab(category);
    sessionStorage.setItem(EVENTS_ACTIVE_TAB_KEY, category);
    const pageNo = Number(pageByCategory[category]) > 0 ? Number(pageByCategory[category]) : 1;
    syncFromStore(selectedTrustId, category, pageNo);
    loadCategoryPage({ trustId: selectedTrustId, category, pageNo, forceRefresh: false });
  };

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore || !selectedTrustId) return;
    const currentPage = Number(pageByCategory[activeTab]) > 0 ? Number(pageByCategory[activeTab]) : 1;
    await loadCategoryPage({
      trustId: selectedTrustId,
      category: activeTab,
      pageNo: currentPage + 1,
      forceRefresh: false,
      forLoadMore: true
    });
  };

  const openEventDetail = (eventId) => {
    sessionStorage.setItem(EVENTS_SCROLL_KEY, String(window.scrollY || 0));
    sessionStorage.setItem(EVENTS_ACTIVE_TAB_KEY, activeTab);
    navigate(`/events/${encodeURIComponent(eventId)}`);
  };

  const meta = CATEGORY_META[activeTab];
  const TabIcon = meta.icon;

  return (
    <div className={`min-h-screen pb-10 relative${isMenuOpen ? ' overflow-hidden max-h-screen' : ''}`} style={{ background: 'var(--page-bg, var(--app-page-bg))' }}>
      <div className="theme-navbar border-b px-6 py-5 flex items-center justify-between sticky top-0 z-50 shadow-sm" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 20px)' }}>
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all active:scale-95"
          style={{
            background: isMenuOpen
              ? 'var(--app-button-bg)'
              : 'color-mix(in srgb, var(--navbar-bg) 72%, var(--surface-color))',
            boxShadow: isMenuOpen ? `0 4px 12px ${applyOpacity(theme.primary, 0.25)}` : 'none',
          }}
        >
          {isMenuOpen ? <X className="h-5 w-5" style={{ color: 'var(--app-button-text)' }} /> : <Menu className="h-[22px] w-[22px]" style={{ color: 'var(--navbar-text)' }} />}
        </button>
        <h1 className="text-lg font-bold" style={{ color: 'var(--navbar-text)' }}>Events</h1>
        <button
          onClick={() => onNavigate('home')}
          className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all active:scale-95"
          style={{
            color: 'var(--navbar-text)',
            background: 'color-mix(in srgb, var(--navbar-bg) 72%, var(--surface-color))'
          }}
        >
          <HomeIcon className="h-[22px] w-[22px]" />
        </button>
      </div>

      {isMenuOpen && <div className="fixed inset-0 z-25" style={{ background: applyOpacity('var(--brand-navy-dark)', 0.01) }} onClick={() => setIsMenuOpen(false)} />}
      <Sidebar isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} onNavigate={onNavigate} currentPage="events" />

      <div className="px-4 pb-4 pt-3">
        <div
          className="relative flex items-center p-1 rounded-2xl gap-1"
          style={{
            background: 'color-mix(in srgb, var(--advertisement-card-bg) 82%, var(--page-bg))',
            border: '1.5px solid var(--advertisement-card-border)',
            boxShadow: 'inset 0 1px 3px color-mix(in srgb, var(--brand-navy) 8%, transparent)',
          }}
        >
          {CATEGORIES.map((cat) => {
            const m = CATEGORY_META[cat];
            const isActive = activeTab === cat;
            const count = counts[cat];
            return (
              <button
                key={cat}
                onClick={() => handleTabSwitch(cat)}
                className="relative flex-1 flex items-center justify-center gap-1.5 py-2.5 px-1 rounded-xl text-[11px] font-bold transition-all duration-250 z-10"
                style={isActive ? {
                  background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.secondary} 100%)`,
                  color: '#fff',
                  boxShadow: `0 4px 16px color-mix(in srgb, ${theme.primary} 35%, transparent), 0 1px 0 rgba(255,255,255,0.15) inset`,
                  transform: 'scale(1.03)',
                } : {
                  color: 'var(--advertisement-subtitle)',
                  background: 'transparent',
                }}
              >
                <m.icon
                  className="shrink-0"
                  style={{
                    width: 13,
                    height: 13,
                    opacity: isActive ? 1 : 0.65,
                  }}
                />
                <span className="tracking-wide">{m.label}</span>
                {count > 0 && (
                  <span
                    className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none"
                    style={isActive
                      ? {
                          background: 'rgba(255,255,255,0.25)',
                          color: '#fff',
                          border: '1px solid rgba(255,255,255,0.3)',
                        }
                      : {
                          background: `color-mix(in srgb, ${theme.primary} 12%, var(--surface-color))`,
                          color: theme.primary,
                          border: `1px solid color-mix(in srgb, ${theme.primary} 22%, transparent)`,
                        }
                    }
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>


      {!loading && !error && events.length > 0 && (
        <div className="px-6 pb-2">
          <p className="text-[11px] font-semibold" style={{ color: 'var(--advertisement-subtitle)' }}>
            {events.length} of {counts[activeTab]} {activeTab} event{counts[activeTab] === 1 ? '' : 's'}
          </p>
        </div>
      )}

      {loading && (
        <div className="px-6 py-4 space-y-4 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl p-5 border shadow-sm" style={{ background: 'var(--advertisement-card-bg)', borderColor: 'var(--advertisement-card-border)' }}>
              <div className="h-3 rounded w-1/4 mb-3" style={{ background: 'color-mix(in srgb, var(--advertisement-card-bg) 62%, var(--app-accent-bg))' }} />
              <div className="h-4 rounded w-2/3 mb-2" style={{ background: 'color-mix(in srgb, var(--advertisement-card-bg) 62%, var(--app-accent-bg))' }} />
              <div className="h-3 rounded w-full" style={{ background: 'color-mix(in srgb, var(--advertisement-card-bg) 62%, var(--app-accent-bg))' }} />
            </div>
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="px-6 py-10">
          <div className="rounded-2xl p-6 text-center" style={{ background: 'color-mix(in srgb, var(--brand-red-light) 72%, var(--surface-color))', border: '1px solid color-mix(in srgb, var(--brand-red) 25%, transparent)' }}>
            <h3 className="font-bold" style={{ color: 'var(--brand-red-dark)' }}>Unable to load events</h3>
            <p className="text-sm mt-1" style={{ color: 'var(--brand-red)' }}>{error}</p>
            <button
              onClick={() => loadCategoryPage({ trustId: selectedTrustId, category: activeTabRef.current, pageNo: 1, forceRefresh: true })}
              className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ background: 'var(--app-button-bg)', color: 'var(--app-button-text)' }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {!loading && !error && (
        <div className="px-6 py-4 space-y-4">
          {events.map((event) => {
            const dateLabel = formatEventDate(event.startEventDate, event.endEventDate);
            const timeLabel = formatTimeRange(event.startTime, event.endTime);
            const isOngoing = activeTab === 'current';
            const isPast = activeTab === 'past';
            const rawAttachments = Array.isArray(event.attachments) ? event.attachments : [];
            const normalizedAttachments = rawAttachments
              .map((attachment, idx) => {
                const url = getAttachmentUrl(attachment);
                if (!isLikelyUrl(url)) return null;
                return {
                  id: `${event.id}_att_${idx}`,
                  url,
                  label: getAttachmentLabel(attachment, idx),
                  type: getAttachmentType(url),
                };
              })
              .filter(Boolean);
            const attachCount = normalizedAttachments.length;
            const firstAttachment = attachCount > 0 ? normalizedAttachments[0] : null;
            const extraAttachmentCount = attachCount > 1 ? attachCount - 1 : 0;

            return (
              <button
                key={event.id}
                onClick={() => openEventDetail(event.id)}
                className="w-full text-left rounded-2xl overflow-hidden transition-all active:scale-[0.995] shadow-sm"
                style={{
                  background: 'var(--advertisement-card-bg)',
                  border: '1px solid var(--advertisement-card-border)',
                  opacity: isPast ? 0.9 : 1,
                }}
              >
                {/* ── Image / Attachment Hero ── */}
                {firstAttachment && firstAttachment.type === 'image' ? (
                  <div className="relative w-full overflow-hidden aspect-[16/9]" style={{ background: 'color-mix(in srgb, var(--brand-navy) 10%, var(--surface-color))' }}>
                    <img
                      src={firstAttachment.url}
                      alt={firstAttachment.label}
                      loading="lazy"
                      onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        objectPosition: 'center',
                        display: 'block',
                      }}
                    />
                    {/* Status badge overlaid on image */}
                    <span
                      className="absolute top-2.5 left-2.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full inline-flex items-center gap-1 backdrop-blur-sm"
                      style={isPast
                        ? { color: '#fff', background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.15)' }
                        : isOngoing
                          ? { color: '#fff', background: 'rgba(20, 24, 38, 0.72)', border: '1px solid rgba(255,255,255,0.24)' }
                          : { color: '#fff', background: `${theme.primary}cc`, border: '1px solid rgba(255,255,255,0.2)' }
                      }
                    >
                      <TabIcon style={{ width: 10, height: 10 }} />
                      {isPast ? 'Completed' : isOngoing ? 'Ongoing' : event.type || 'Upcoming'}
                    </span>
                  </div>
                ) : null}

                {/* ── Card Content ── */}
                <div
                  className="p-4"
                  style={{
                    borderTop: firstAttachment?.type === 'image'
                      ? `2px solid ${isPast ? applyOpacity(theme.secondary, 0.4) : theme.primary}`
                      : 'none',
                  }}
                >
                  {/* Status badge (when no image) + Date row */}
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    {!(firstAttachment?.type === 'image') && (
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full inline-flex items-center gap-1"
                        style={isPast
                          ? { color: 'var(--body-text-color)', background: 'color-mix(in srgb, var(--surface-color) 70%, var(--app-accent-bg))' }
                          : isOngoing
                            ? { color: theme.secondary, background: `color-mix(in srgb, ${theme.secondary} 14%, var(--surface-color))` }
                            : { color: theme.primary, background: `color-mix(in srgb, ${theme.primary} 12%, var(--surface-color))` }
                        }
                      >
                        <TabIcon style={{ width: 10, height: 10 }} />
                        {isPast ? 'Completed' : isOngoing ? 'Ongoing' : event.type || 'Upcoming'}
                      </span>
                    )}
                    {dateLabel && (
                      <div
                        className="flex items-center gap-1 text-[10px] font-semibold ml-auto"
                        style={{ color: 'color-mix(in srgb, var(--body-text-color) 72%, var(--surface-color))' }}
                      >
                        <Calendar style={{ width: 11, height: 11 }} />
                        {dateLabel}
                      </div>
                    )}
                  </div>

                  {/* Title */}
                  <h3 className="font-bold text-base leading-snug mb-1.5" style={{ color: 'var(--advertisement-title)' }}>
                    {event.title}
                  </h3>

                  {/* Description */}
                  {event.description && (
                    <p className="text-xs leading-relaxed line-clamp-2 mb-2.5" style={{ color: 'var(--advertisement-description)' }}>
                      {event.description}
                    </p>
                  )}

                  {/* Time & Location */}
                  {(timeLabel || event.location) && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium mb-3" style={{ color: 'var(--advertisement-description)' }}>
                      {timeLabel && (
                        <div className="flex items-center gap-1">
                          <Clock3 style={{ width: 11, height: 11, color: theme.primary }} />
                          {timeLabel}
                        </div>
                      )}
                      {event.location && (
                        <div className="flex items-center gap-1">
                          <MapPin style={{ width: 11, height: 11, color: theme.primary }} />
                          {event.location}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Footer */}
                  <div
                    className="pt-2.5 flex items-center justify-end"
                    style={{ borderTop: '1px solid color-mix(in srgb, var(--brand-navy) 8%, transparent)' }}
                  >
                    <div className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: theme.primary }}>
                      Tap to view details <ChevronRight style={{ width: 13, height: 13 }} />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}

          {events.length === 0 && (
            <div className="text-center py-20">
              <div className="h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-4 border shadow-sm" style={{ background: 'var(--advertisement-card-bg)', borderColor: 'var(--advertisement-card-border)' }}>
                <Calendar className="h-8 w-8" style={{ color: 'var(--advertisement-subtitle)' }} />
              </div>
              <h3 className="font-bold" style={{ color: 'var(--advertisement-title)' }}>
                {activeTab === 'current' ? 'No current events right now.' : activeTab === 'upcoming' ? 'No upcoming events.' : 'No past events available.'}
              </h3>
              <p className="text-sm mt-1" style={{ color: 'var(--advertisement-subtitle)' }}>Check back later.</p>
            </div>
          )}

          {events.length > 0 && hasMore && (
            <div className="pt-2">
              <button onClick={handleLoadMore} disabled={loadingMore} className="w-full py-3 rounded-xl border text-sm font-semibold disabled:opacity-60" style={{ color: theme.primary, background: 'var(--surface-color)', borderColor: 'color-mix(in srgb, var(--brand-navy) 12%, transparent)' }}>
                {loadingMore ? 'Loading more events...' : 'Load more events'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Events;
