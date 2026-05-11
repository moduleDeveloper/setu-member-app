import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Home as HomeIcon, Menu, X, Star, ChevronRight, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import { useAppTheme } from './context/ThemeContext';
import {
  getNoticeboardSnapshot,
  loadNoticeboardPage,
  noticeboardConfig,
  readNoticeboardProgress,
  clearAllNoticeboardCache
} from './services/noticeboardStore';

const LEGACY_ATTACHMENT_SEPARATOR = '||::||';

const formatDateRange = (startDate, endDate) => {
  const toLabel = (value) => {
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

  const start = toLabel(startDate);
  const end = toLabel(endDate);

  if (start && end) return `${start} - ${end}`;
  if (start) return `From ${start}`;
  if (end) return `Till ${end}`;
  return '';
};

const isLikelyUrl = (value) => /^https?:\/\//i.test(String(value || '').trim());
const isDataUrl = (value) => /^data:/i.test(String(value || '').trim());

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

  const url = getAttachmentUrl(attachment);
  if (!url) return `Attachment ${idx + 1}`;
  if (isDataUrl(url)) return `Attachment ${idx + 1}`;

  try {
    const parsed = new URL(url);
    const last = (parsed.pathname || '').split('/').filter(Boolean).pop();
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

const getDayStart = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const getNoticePriority = (notice, todayStartTs) => {
  const startTs = getDayStart(notice?.start_date);
  const endTs = getDayStart(notice?.end_date);
  const effectiveStart = startTs ?? endTs;
  const effectiveEnd = endTs ?? startTs;

  if (effectiveStart != null && todayStartTs < effectiveStart) return 'upcoming';
  if (effectiveEnd != null && todayStartTs > effectiveEnd) return 'past';
  if (effectiveStart != null || effectiveEnd != null) return 'live';
  return 'unknown';
};

const sortNoticesByTimeline = (input) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStartTs = today.getTime();
  const priorityWeight = { live: 0, upcoming: 1, past: 2, unknown: 3 };
  const list = Array.isArray(input) ? [...input] : [];

  return list.sort((a, b) => {
    const aPriority = getNoticePriority(a, todayStartTs);
    const bPriority = getNoticePriority(b, todayStartTs);
    const weightDiff = (priorityWeight[aPriority] ?? 99) - (priorityWeight[bPriority] ?? 99);
    if (weightDiff !== 0) return weightDiff;

    const aStart = getDayStart(a?.start_date);
    const bStart = getDayStart(b?.start_date);
    const aEnd = getDayStart(a?.end_date);
    const bEnd = getDayStart(b?.end_date);

    // For upcoming, nearest start date first so users can see what's coming next.
    if (aPriority === 'upcoming') {
      const byStartAsc = (aStart ?? Number.MAX_SAFE_INTEGER) - (bStart ?? Number.MAX_SAFE_INTEGER);
      if (byStartAsc !== 0) return byStartAsc;
    }

    // For live and past, latest notice first.
    const byStartDesc = (bStart ?? Number.MIN_SAFE_INTEGER) - (aStart ?? Number.MIN_SAFE_INTEGER);
    if (byStartDesc !== 0) return byStartDesc;
    const byEndDesc = (bEnd ?? Number.MIN_SAFE_INTEGER) - (aEnd ?? Number.MIN_SAFE_INTEGER);
    if (byEndDesc !== 0) return byEndDesc;

    const byUpdatedDesc = new Date(b?.updated_at || b?.created_at || 0).getTime() - new Date(a?.updated_at || a?.created_at || 0).getTime();
    if (byUpdatedDesc !== 0) return byUpdatedDesc;

    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });
};

const resolveTrustContextForNotices = () => {
  const selectedTrustId = String(localStorage.getItem('selected_trust_id') || '').trim();
  const selectedTrustName = String(localStorage.getItem('selected_trust_name') || '').trim();
  if (selectedTrustId) {
    return { trustId: selectedTrustId, trustName: selectedTrustName || null };
  }

  try {
    const rawUser = localStorage.getItem('user');
    const parsedUser = rawUser ? JSON.parse(rawUser) : null;
    const memberships = Array.isArray(parsedUser?.hospital_memberships) ? parsedUser.hospital_memberships : [];
    const preferredMembership =
      memberships.find((m) => m?.is_active && m?.trust_id) ||
      memberships.find((m) => m?.trust_id) ||
      null;

    const fallbackTrustId = String(
      preferredMembership?.trust_id ||
      parsedUser?.primary_trust?.id ||
      parsedUser?.trust?.id ||
      ''
    ).trim();
    const fallbackTrustName = String(
      preferredMembership?.trust_name ||
      parsedUser?.primary_trust?.name ||
      parsedUser?.trust?.name ||
      ''
    ).trim();

    if (fallbackTrustId) {
      localStorage.setItem('selected_trust_id', fallbackTrustId);
      if (fallbackTrustName) localStorage.setItem('selected_trust_name', fallbackTrustName);
      return { trustId: fallbackTrustId, trustName: fallbackTrustName || null };
    }
  } catch {
    // ignore malformed user cache
  }

  return { trustId: null, trustName: null };
};

const Notices = ({ onNavigate }) => {
  const navigate = useNavigate();
  const theme = useAppTheme();
  const NOTICE_SCROLL_KEY = 'noticeboard_scroll_y';
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTrustId, setSelectedTrustId] = useState(() => localStorage.getItem('selected_trust_id') || '');
  const [hasMoreNotices, setHasMoreNotices] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const latestLoadRequestRef = useRef(0);
  const missingTrustRetryRef = useRef(0);
  const missingTrustTimerRef = useRef(null);
  const sortedNotices = useMemo(() => sortNoticesByTimeline(notices), [notices]);

  const syncFromStore = (trustId) => {
    const snapshot = getNoticeboardSnapshot(trustId);
    setNotices(Array.isArray(snapshot.notices) ? snapshot.notices : []);
    setHasMoreNotices(Boolean(snapshot.hasMoreNotices));
  };

  const loadPage = async ({ trustId, page, forceRefresh = false, trustName = null, canApplyState = () => true }) => {
    if (!trustId) {
      setNotices([]);
      setHasMoreNotices(false);
      return;
    }
    const res = await loadNoticeboardPage({
      trustId,
      trustName,
      page,
      pageSize: noticeboardConfig.PAGE_SIZE,
      forceRefresh
    });
    if (canApplyState()) syncFromStore(trustId);
    const progress = readNoticeboardProgress(trustId);
    console.log(
      '[Noticeboard][Debug] page=',
      page,
      'hasMoreNotices=',
      Boolean(progress.hasMoreNotices),
      'returned_ids=',
      Array.isArray(res?.notices) ? res.notices.map((n) => n?.id).filter(Boolean) : [],
      'returned_types=',
      Array.isArray(res?.notices) ? res.notices.map((n) => n?.type).filter(Boolean) : []
    );
    if (res?.debug) {
      console.log(
        '[Noticeboard][Debug] trust=',
        res.debug.trustId,
        'member=',
        res.debug.memberId,
        'vipEligible=',
        res.debug.vipEligible,
        'regMemberMatch=',
        res.debug.regMemberMatch?.id || null
      );
    }
    if (res?.error && canApplyState()) setError(res.error);
    return res;
  };

  useEffect(() => {
    if (isMenuOpen) {
      const scrollY = window.scrollY;
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.touchAction = 'none';
    } else {
      const scrollY = parseInt(document.body.style.top || '0', 10) * -1;
      document.documentElement.style.overflow = 'unset';
      document.body.style.overflow = 'unset';
      document.body.style.position = 'unset';
      document.body.style.width = 'unset';
      document.body.style.top = 'unset';
      document.body.style.touchAction = 'auto';
      window.scrollTo(0, scrollY);
    }

    return () => {
      document.documentElement.style.overflow = 'unset';
      document.body.style.overflow = 'unset';
      document.body.style.position = 'unset';
      document.body.style.width = 'unset';
      document.body.style.top = 'unset';
      document.body.style.touchAction = 'auto';
    };
  }, [isMenuOpen]);

  const loadNotices = async ({ forceRefresh = false } = {}) => {
    const requestId = Date.now();
    latestLoadRequestRef.current = requestId;
    const isStale = () => latestLoadRequestRef.current !== requestId;
    try {
      if (!isStale()) setError('');
      const { trustId, trustName } = resolveTrustContextForNotices();
      if (!isStale()) setSelectedTrustId(trustId || '');

      if (!trustId) {
        if (missingTrustTimerRef.current) {
          clearTimeout(missingTrustTimerRef.current);
          missingTrustTimerRef.current = null;
        }
        // selected_trust_id can arrive a bit late after route mount; auto-retry a few times.
        if (!forceRefresh && missingTrustRetryRef.current < 4) {
          missingTrustRetryRef.current += 1;
          if (!isStale()) setLoading(true);
          missingTrustTimerRef.current = setTimeout(() => {
            loadNotices({ forceRefresh: false });
          }, 450);
        }
        const isRetryScheduled = !forceRefresh && missingTrustRetryRef.current > 0 && missingTrustRetryRef.current <= 4;
        if (!isStale() && notices.length === 0 && !isRetryScheduled) {
          setNotices([]);
          setHasMoreNotices(false);
          setLoading(false);
        }
        return;
      }
      missingTrustRetryRef.current = 0;
      if (missingTrustTimerRef.current) {
        clearTimeout(missingTrustTimerRef.current);
        missingTrustTimerRef.current = null;
      }

      // Show cached notices immediately if available (avoids blank flash)
      const snapshot = getNoticeboardSnapshot(trustId);
      if (!forceRefresh && snapshot.hasCachedData && Array.isArray(snapshot.notices) && snapshot.notices.length > 0) {
        if (!isStale()) {
          setNotices(snapshot.notices);
          setHasMoreNotices(Boolean(snapshot.hasMoreNotices));
          setLoading(false);
        }
      } else {
        // No valid cache or forceRefresh → show spinner
        if (!isStale()) setLoading(true);
      }

      const pageRes = await loadPage({ trustId, trustName, page: 1, forceRefresh, canApplyState: () => !isStale() });
      if (isStale()) return;

      // Always sync from store after fetch to pick up latest data
      syncFromStore(trustId);
      const postSyncSnapshot = getNoticeboardSnapshot(trustId);
      const postSyncNotices = Array.isArray(postSyncSnapshot?.notices) ? postSyncSnapshot.notices : [];
      if (postSyncNotices.length === 0 && Array.isArray(pageRes?.notices) && pageRes.notices.length > 0) {
        // Fallback: if cache/store is unavailable, hydrate UI directly from API response.
        setNotices(pageRes.notices);
        setHasMoreNotices(Boolean(pageRes.hasMore));
      }

      // If still empty after first fetch, bust cache and retry once
      if (!forceRefresh) {
        const afterSnapshot = getNoticeboardSnapshot(trustId);
        if (!Array.isArray(afterSnapshot.notices) || afterSnapshot.notices.length === 0) {
          console.log('[Noticeboard] Empty result after first fetch, retrying with forceRefresh=true');
          const retryRes = await loadPage({ trustId, trustName, page: 1, forceRefresh: true, canApplyState: () => !isStale() });
          if (isStale()) return;
          syncFromStore(trustId);
          const retrySnapshot = getNoticeboardSnapshot(trustId);
          const retryNotices = Array.isArray(retrySnapshot?.notices) ? retrySnapshot.notices : [];
          if (retryNotices.length === 0 && Array.isArray(retryRes?.notices) && retryRes.notices.length > 0) {
            setNotices(retryRes.notices);
            setHasMoreNotices(Boolean(retryRes.hasMore));
          }
        }
      }
    } catch (err) {
      if (!isStale()) {
        setError(err?.message || 'Failed to fetch notices');
        setNotices([]);
      }
    } finally {
      if (!isStale()) setLoading(false);
    }
  };

  useEffect(() => {
    const savedScrollY = Number(sessionStorage.getItem(NOTICE_SCROLL_KEY) || 0);
    if (savedScrollY > 0) {
      window.requestAnimationFrame(() => {
        window.scrollTo(0, savedScrollY);
      });
    }
    loadNotices({ forceRefresh: false });
    const handleTrustChanged = () => {
      sessionStorage.removeItem(NOTICE_SCROLL_KEY);
      loadNotices({ forceRefresh: false });
    };
    const handleStorage = (event) => {
      if (event?.key === 'selected_trust_id') {
        sessionStorage.removeItem(NOTICE_SCROLL_KEY);
        loadNotices({ forceRefresh: false });
      }
    };
    window.addEventListener('trust-changed', handleTrustChanged);
    window.addEventListener('storage', handleStorage);
    return () => {
      if (missingTrustTimerRef.current) {
        clearTimeout(missingTrustTimerRef.current);
        missingTrustTimerRef.current = null;
      }
      window.removeEventListener('trust-changed', handleTrustChanged);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const handleLoadMore = async () => {
    if (loadingMore || loading || !hasMoreNotices || !selectedTrustId) return;
    try {
      setLoadingMore(true);
      const progress = readNoticeboardProgress(selectedTrustId);
      const nextPage = Number(progress?.nextPage) > 0 ? Number(progress.nextPage) : 2;
      const moreRes = await loadPage({ trustId: selectedTrustId, page: nextPage, forceRefresh: false, trustName: localStorage.getItem('selected_trust_name') || null });
      const snapshot = getNoticeboardSnapshot(selectedTrustId);
      const snapshotNotices = Array.isArray(snapshot?.notices) ? snapshot.notices : [];
      if (snapshotNotices.length === 0 && Array.isArray(moreRes?.notices) && moreRes.notices.length > 0) {
        setNotices((prev) => {
          const prevList = Array.isArray(prev) ? prev : [];
          const byId = new Map(prevList.map((n) => [String(n?.id || ''), n]));
          for (const n of moreRes.notices) byId.set(String(n?.id || ''), n);
          return [...byId.values()].filter(Boolean);
        });
        setHasMoreNotices(Boolean(moreRes.hasMore));
      }
    } finally {
      setLoadingMore(false);
    }
  };

  const openNoticeDetail = (noticeId) => {
    const id = String(noticeId || '').trim();
    if (!id) return;
    sessionStorage.setItem(NOTICE_SCROLL_KEY, String(window.scrollY || 0));
    navigate(`/notices/${encodeURIComponent(id)}`);
  };

  return (
    <div className={`min-h-screen pb-10 relative${isMenuOpen ? ' overflow-hidden max-h-screen' : ''}`} style={{ background: 'var(--page-bg, var(--app-page-bg))' }}>
      <div className="theme-navbar border-b px-6 py-5 flex items-center justify-between sticky top-0 z-50 shadow-sm pointer-events-auto" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 20px)' }}>
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="p-2 rounded-xl transition-colors pointer-events-auto"
        >
          {isMenuOpen ? <X className="h-6 w-6" style={{ color: 'var(--navbar-text)' }} /> : <Menu className="h-6 w-6" style={{ color: 'var(--navbar-text)' }} />}
        </button>
        <h1 className="text-lg font-bold" style={{ color: 'var(--navbar-text)' }}>Notice Board</h1>
        <button
          onClick={() => onNavigate('home')}
          className="p-2 rounded-xl transition-colors flex items-center justify-center"
          style={{ color: 'var(--navbar-text)' }}
        >
          <HomeIcon className="h-5 w-5" />
        </button>
      </div>

      {isMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-0 z-25 lg:hidden"
          onClick={() => setIsMenuOpen(false)}
          style={{ pointerEvents: 'auto' }}
        />
      )}

      <Sidebar
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        onNavigate={onNavigate}
        currentPage="notices"
      />

      {!loading && !error && sortedNotices.length > 0 && (
        <div className="px-6 pb-2">
          <p className="text-[11px] font-semibold" style={{ color: 'var(--advertisement-subtitle)' }}>
            {sortedNotices.length} notice{sortedNotices.length === 1 ? '' : 's'}
          </p>
        </div>
      )}

      {loading && (
        <div className="px-6 py-4 space-y-4 animate-pulse">
          {[1, 2, 3].map((item) => (
            <div key={item} className="rounded-2xl p-5 border shadow-sm" style={{ background: 'var(--advertisement-card-bg)', borderColor: 'var(--advertisement-card-border)' }}>
              <div className="h-3 rounded w-1/3 mb-3" style={{ background: 'color-mix(in srgb, var(--advertisement-card-bg) 62%, var(--app-accent-bg))' }} />
              <div className="h-4 rounded w-2/3 mb-2" style={{ background: 'color-mix(in srgb, var(--advertisement-card-bg) 62%, var(--app-accent-bg))' }} />
              <div className="h-3 rounded w-full" style={{ background: 'color-mix(in srgb, var(--advertisement-card-bg) 62%, var(--app-accent-bg))' }} />
            </div>
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="px-6 py-10">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
            <h3 className="font-bold text-red-800">Unable to load notices</h3>
            <p className="text-sm text-red-600 mt-1">{error}</p>
            <button
              onClick={() => loadNotices({ forceRefresh: true })}
              className="mt-4 px-4 py-2 rounded-xl text-white text-sm font-semibold"
              style={{ background: 'var(--app-button-bg)', color: 'var(--app-button-text)' }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {!loading && !error && (
        <div className="px-6 py-4 space-y-4">
          {sortedNotices.map((notice) => {
            const dateLabel = formatDateRange(notice.start_date, notice.end_date);
            const isVip = String(notice?.type || '').toLowerCase() === 'vip';
            const rawAttachments = Array.isArray(notice.attachments) ? notice.attachments : [];
            const normalizedAttachments = rawAttachments
              .map((attachment, idx) => {
                const url = getAttachmentUrl(attachment);
                if (!url || (!isLikelyUrl(url) && !isDataUrl(url))) return null;
                return {
                  id: `${notice.id}_att_${idx}`,
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
              key={notice.id}
              onClick={() => openNoticeDetail(notice.id)}
              className="w-full text-left rounded-2xl p-4 sm:p-5 border transition-all hover:shadow-md active:scale-[0.995] border-l-4 shadow-sm"
              style={{
                borderLeftColor: isVip ? 'color-mix(in srgb, var(--brand-red) 45%, #d4af37)' : theme.primary,
                borderColor: isVip ? 'color-mix(in srgb, var(--brand-red) 20%, #f1e2a4)' : 'var(--advertisement-card-border)',
                background: 'var(--advertisement-card-bg)'
              }}
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                <span
                  className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full inline-flex items-center gap-1"
                style={
                  isVip
                    ? { color: 'color-mix(in srgb, var(--brand-red-dark) 50%, #8A6A00)', background: 'color-mix(in srgb, var(--brand-red-light) 48%, #FDF3C7)' }
                    : { color: theme.primary, background: `color-mix(in srgb, ${theme.primary} 12%, white)` }
                }
              >
                  {isVip ? <Star className="h-3 w-3" fill="color-mix(in srgb, var(--brand-red) 45%, #d4af37)" color="color-mix(in srgb, var(--brand-red) 45%, #d4af37)" /> : null}
                  {isVip ? 'VIP Notice' : 'GEN'}
                </span>
                {dateLabel && (
                  <div className="flex items-center gap-1.5 text-[10px] font-bold whitespace-nowrap" style={{ color: 'var(--advertisement-subtitle)' }}>
                    <Calendar className="h-3 w-3" />
                    {dateLabel}
                  </div>
                )}
              </div>

              <h3 className="font-bold text-lg mb-2 leading-tight" style={{ color: 'var(--advertisement-title)' }}>
                {notice.name}
              </h3>

              {notice.description && (
                <div className="mb-4">
                  <p className="text-sm leading-relaxed line-clamp-3" style={{ color: 'var(--advertisement-description)' }}>
                    {notice.description}
                  </p>
                </div>
              )}

              {firstAttachment && (
                <div
                  className="mb-3 rounded-xl overflow-hidden border"
                  style={{ borderColor: 'color-mix(in srgb, var(--brand-navy) 12%, transparent)' }}
                >
                  {firstAttachment.type === 'image' ? (
                    <div className="relative w-full h-36 bg-slate-100">
                      <img
                        src={firstAttachment.url}
                        alt={firstAttachment.label}
                        loading="lazy"
                        className="w-full h-36 object-cover bg-slate-100"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const fallback = e.currentTarget.nextElementSibling;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                      <div
                        className="hidden absolute inset-0 items-center justify-center px-3 text-xs font-semibold text-slate-600"
                        style={{ background: 'color-mix(in srgb, var(--surface-color) 74%, var(--app-accent-bg))' }}
                      >
                        Image unavailable
                      </div>
                    </div>
                  ) : (
                    <div
                      className="h-16 px-3 flex items-center gap-2 text-xs font-semibold"
                      style={{ background: 'color-mix(in srgb, var(--surface-color) 70%, var(--app-accent-bg))', color: 'var(--body-text-color)' }}
                    >
                      <FileText className="h-4 w-4 shrink-0" />
                      <span>{firstAttachment.type === 'pdf' ? 'PDF Preview Available' : 'File Attachment'}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                <div className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: theme.primary }}>
                  Tap to view details
                  <ChevronRight className="h-3.5 w-3.5" />
                </div>
              </div>
            </button>
            );
          })}

          {sortedNotices.length === 0 && (
            <div className="text-center py-20">
              <div className="h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-4 border shadow-sm" style={{ background: 'var(--advertisement-card-bg)', borderColor: 'var(--advertisement-card-border)' }}>
                <FileText className="h-8 w-8" style={{ color: 'var(--advertisement-subtitle)' }} />
              </div>
              <h3 className="font-bold" style={{ color: 'var(--advertisement-title)' }}>No active notices right now</h3>
              <p className="text-sm mt-1" style={{ color: 'var(--advertisement-subtitle)' }}>You're all caught up.</p>
              <button
                onClick={() => {
                  clearAllNoticeboardCache();
                  loadNotices({ forceRefresh: true });
                }}
                className="mt-5 px-5 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95"
                style={{ background: 'var(--app-accent-bg)', color: 'var(--brand-navy, #1e3a5f)' }}
              >
                🔄 Refresh Notices
              </button>
            </div>
          )}

          {sortedNotices.length > 0 && hasMoreNotices && (
            <div className="pt-2">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="w-full py-3 rounded-xl border text-sm font-semibold disabled:opacity-60"
                style={{ color: theme.primary, background: 'var(--advertisement-card-bg)', borderColor: 'var(--advertisement-card-border)' }}
              >
                {loadingMore ? 'Loading more notices...' : 'Load more notices'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Notices;

