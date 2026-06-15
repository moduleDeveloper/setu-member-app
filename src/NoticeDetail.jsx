import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Calendar, FileText, Home as HomeIcon, Star, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppTheme } from './context/ThemeContext';
import { getNoticeboardSnapshot, loadNoticeDetail } from './services/noticeboardStore';

const AUTO_SWIPE_INTERVAL_MS = 5000;
const AUTO_SWIPE_PAUSE_AFTER_INTERACTION_MS = 3500;
const SWIPE_THRESHOLD_PX = 44;
const MAX_DRAG_TRANSLATE_PX = 72;
const getCurrentTimestamp = () => Date.now();

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

const NoticeDetail = ({ onNavigate }) => {
  const theme = useAppTheme();
  const navigate = useNavigate();
  const { noticeId } = useParams();
  const [notice, setNotice] = useState(null);
  const [noticeList, setNoticeList] = useState([]);
  const [currentNoticeIndex, setCurrentNoticeIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [previewImage, setPreviewImage] = useState(null);
  const [dragTranslateX, setDragTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartXRef = useRef(null);
  const touchEndXRef = useRef(null);
  const lastInteractionTsRef = useRef(0);
  const isTouchHoldingRef = useRef(false);
  const selectedTrustId = useMemo(() => localStorage.getItem('selected_trust_id') || '', []);

  useEffect(() => {
    const loadDetail = async () => {
      setError('');
      setLoading(true);
      const trustId = localStorage.getItem('selected_trust_id') || selectedTrustId || '';
      const trustName = localStorage.getItem('selected_trust_name') || null;
      if (!trustId || !noticeId) {
        setNotice(null);
        setLoading(false);
        setError('Notice not found');
        return;
      }

      const snapshot = getNoticeboardSnapshot(trustId);
      const listFromSnapshot = Array.isArray(snapshot?.notices) ? snapshot.notices : [];
      setNoticeList(listFromSnapshot);
      const idxFromSnapshot = listFromSnapshot.findIndex((item) => String(item?.id || '') === String(noticeId));
      if (idxFromSnapshot >= 0) setCurrentNoticeIndex(idxFromSnapshot);
      const fromList = snapshot?.noticesById?.[String(noticeId)] || null;
      if (fromList) setNotice(fromList);

      const detailRes = await loadNoticeDetail({
        trustId,
        trustName,
        noticeId: String(noticeId),
        forceRefresh: false
      });

      if (detailRes?.error) {
        setError(detailRes.error);
      } else if (detailRes?.notice) {
        setNotice(detailRes.notice);
        setNoticeList((prev) => {
          if (!Array.isArray(prev) || prev.length === 0) return prev;
          const targetId = String(detailRes.notice?.id || '');
          const idx = prev.findIndex((item) => String(item?.id || '') === targetId);
          if (idx < 0) return prev;
          const next = prev.slice();
          next[idx] = { ...next[idx], ...detailRes.notice };
          return next;
        });
      } else if (!fromList) {
        setError('Notice not found');
      }
      setPreviewImage(null);
      setLoading(false);
    };

    loadDetail();
  }, [noticeId, selectedTrustId]);

  useEffect(() => {
    if (loading || error || !Array.isArray(noticeList) || noticeList.length <= 1) return undefined;
    const timer = setInterval(() => {
      if (isTouchHoldingRef.current) return;
      if (getCurrentTimestamp() - lastInteractionTsRef.current < AUTO_SWIPE_PAUSE_AFTER_INTERACTION_MS) return;
      setCurrentNoticeIndex((prev) => (prev + 1) % noticeList.length);
    }, AUTO_SWIPE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loading, error, noticeList]);

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/notices', { replace: true });
  };

  const onCardTouchStart = (event) => {
    if (!Array.isArray(noticeList) || noticeList.length <= 1) return;
    isTouchHoldingRef.current = true;
    lastInteractionTsRef.current = getCurrentTimestamp();
    touchStartXRef.current = event.touches?.[0]?.clientX ?? null;
    touchEndXRef.current = touchStartXRef.current;
    setIsDragging(true);
    setDragTranslateX(0);
  };

  const onCardTouchMove = (event) => {
    if (!isDragging) return;
    const currentX = event.touches?.[0]?.clientX ?? null;
    touchEndXRef.current = currentX;
    const start = touchStartXRef.current;
    if (start == null || currentX == null) return;
    const rawDelta = currentX - start;
    const boundedDelta = Math.max(-MAX_DRAG_TRANSLATE_PX, Math.min(MAX_DRAG_TRANSLATE_PX, rawDelta));
    setDragTranslateX(boundedDelta);
  };

  const onCardTouchEnd = () => {
    if (!Array.isArray(noticeList) || noticeList.length <= 1) return;
    isTouchHoldingRef.current = false;
    lastInteractionTsRef.current = getCurrentTimestamp();
    setIsDragging(false);
    const start = touchStartXRef.current;
    const end = touchEndXRef.current;
    setDragTranslateX(0);
    if (start == null || end == null) return;
    const delta = end - start;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;
    if (delta < 0) setCurrentNoticeIndex((prev) => (prev + 1) % noticeList.length);
    else setCurrentNoticeIndex((prev) => (prev - 1 + noticeList.length) % noticeList.length);
  };

  const onCardPointerDown = () => {
    if (!Array.isArray(noticeList) || noticeList.length <= 1) return;
    isTouchHoldingRef.current = true;
    lastInteractionTsRef.current = getCurrentTimestamp();
  };

  const onCardPointerUp = () => {
    if (!Array.isArray(noticeList) || noticeList.length <= 1) return;
    isTouchHoldingRef.current = false;
    lastInteractionTsRef.current = getCurrentTimestamp();
  };

  const openImagePreview = (attachment) => {
    if (!attachment?.url) return;
    lastInteractionTsRef.current = getCurrentTimestamp();
    setPreviewImage(attachment);
  };

  const closeImagePreview = () => {
    lastInteractionTsRef.current = getCurrentTimestamp();
    setPreviewImage(null);
  };

  const hasCarousel = Array.isArray(noticeList) && noticeList.length > 0;
  const boundedNoticeIndex = hasCarousel
    ? ((currentNoticeIndex % noticeList.length) + noticeList.length) % noticeList.length
    : 0;
  const activeNotice = hasCarousel ? (noticeList[boundedNoticeIndex] || notice) : notice;

  const isVip = String(activeNotice?.type || '').toLowerCase() === 'vip';
  const dateLabel = formatDateRange(activeNotice?.start_date, activeNotice?.end_date);
  const attachments = Array.isArray(activeNotice?.attachments) ? activeNotice.attachments : [];
  const normalizedAttachments = attachments
    .map((attachment, idx) => {
      const url = getAttachmentUrl(attachment);
      if (!url || (!isLikelyUrl(url) && !isDataUrl(url))) return null;
      return {
        id: `${activeNotice?.id || 'notice'}_att_${idx}`,
        url,
        label: getAttachmentLabel(attachment, idx),
        type: getAttachmentType(url),
      };
    })
    .filter(Boolean);

  return (
    <div className="min-h-screen pb-8" style={{ background: 'var(--page-bg, var(--app-page-bg))' }}>
      <div className="theme-navbar border-b px-6 py-5 flex items-center justify-between sticky top-0 z-40 shadow-sm" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 20px)' }}>
        <button
          onClick={handleBack}
          className="p-2 rounded-xl transition-colors"
          aria-label="Back to notice board"
        >
          <ArrowLeft className="h-5 w-5" style={{ color: 'var(--navbar-text)' }} />
        </button>
        <h1 className="text-lg font-bold" style={{ color: 'var(--navbar-text)' }}>Notice Details</h1>
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
            <h3 className="font-bold" style={{ color: 'var(--brand-red-dark)' }}>Unable to load notice</h3>
            <p className="text-sm mt-1" style={{ color: 'var(--brand-red-dark)' }}>{error}</p>
            <button
              onClick={handleBack}
              className="mt-4 px-4 py-2 rounded-xl text-white text-sm font-semibold"
              style={{ background: 'var(--app-button-bg)', color: 'var(--app-button-text)' }}
            >
              Back to Notice Board
            </button>
          </div>
        )}

        {!loading && !error && activeNotice && (
          <div
            className="rounded-2xl border p-5 shadow-sm border-l-4"
            style={{
              borderLeftColor: isVip ? 'color-mix(in srgb, var(--brand-red) 45%, #d4af37)' : theme.primary,
              borderColor: isVip ? 'color-mix(in srgb, var(--brand-red) 22%, #f1e2a4)' : 'color-mix(in srgb, var(--brand-navy) 10%, transparent)',
              background: 'var(--advertisement-card-bg)',
              transform: `translate3d(${dragTranslateX}px, 0, 0)`,
              opacity: Math.max(0.9, 1 - Math.abs(dragTranslateX) / 280),
              transition: isDragging ? 'none' : 'transform 260ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 220ms ease'
            }}
            onTouchStart={onCardTouchStart}
            onTouchMove={onCardTouchMove}
            onTouchEnd={onCardTouchEnd}
            onTouchCancel={onCardTouchEnd}
            onPointerDown={onCardPointerDown}
            onPointerUp={onCardPointerUp}
            onPointerCancel={onCardPointerUp}
            onPointerLeave={onCardPointerUp}
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
                {isVip ? 'VIP NOTICE' : 'GEN'}
              </span>
              {dateLabel && (
                <div className="flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--advertisement-subtitle)' }}>
                  <Calendar className="h-3.5 w-3.5" />
                  {dateLabel}
                </div>
              )}
            </div>

            <h2 className="text-xl font-bold leading-tight" style={{ color: 'var(--advertisement-title)' }}>
              {activeNotice.name}
            </h2>

            <p className="mt-4 text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--advertisement-description)' }}>
              {activeNotice.description || 'No description provided.'}
            </p>

            {normalizedAttachments.length > 0 && (
              <div className="mt-6 border-t border-slate-100 pt-5">
                <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--advertisement-title)' }}>Attachments ({normalizedAttachments.length})</h3>
                <div className="space-y-3">
                  {normalizedAttachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="rounded-xl border overflow-hidden"
                      style={{ borderColor: 'color-mix(in srgb, var(--brand-navy) 12%, transparent)' }}
                    >
                      {attachment.type === 'image' && (
                        <button
                          type="button"
                          className="relative flex w-full items-center justify-center overflow-hidden bg-[color:var(--advertisement-card-bg)] px-3 py-3"
                          onClick={() => openImagePreview(attachment)}
                          aria-label={`Open ${attachment.label}`}
                        >
                          <img
                            src={attachment.url}
                            alt={attachment.label}
                            loading="lazy"
                            className="block max-h-[28rem] w-auto max-w-full rounded-xl object-contain shadow-sm"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const fallback = e.currentTarget.nextElementSibling;
                              if (fallback) fallback.style.display = 'flex';
                            }}
                          />
                          <div
                            className="hidden min-h-44 w-full items-center justify-center rounded-xl px-3 py-6 text-xs font-semibold text-slate-600"
                            style={{ background: 'color-mix(in srgb, var(--surface-color) 74%, var(--app-accent-bg))' }}
                          >
                            Image unavailable
                          </div>
                          <div className="absolute bottom-3 right-3 rounded-full px-3 py-1 text-[11px] font-semibold shadow-sm" style={{ background: 'rgba(15, 23, 42, 0.72)', color: '#fff' }}>
                            Tap to open
                          </div>
                        </button>
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
                          <span className="truncate flex-1">File attachment</span>
                        </div>
                      )}

                    </div>
                  ))}
                </div>
              </div>
            )}
            {noticeList.length > 1 && (
              <div className="pt-4 flex items-center justify-center gap-2">
                {noticeList.map((item, idx) => {
                  const active = idx === currentNoticeIndex;
                  return (
                    <button
                      key={item?.id || idx}
                      onClick={() => {
                        lastInteractionTsRef.current = getCurrentTimestamp();
                        setCurrentNoticeIndex(idx);
                      }}
                      className="rounded-full transition-all"
                      style={{
                        width: active ? 16 : 6,
                        height: 6,
                        background: active ? theme.primary : 'color-mix(in srgb, var(--body-text-color) 25%, transparent)',
                      }}
                      aria-label={`Go to notice ${idx + 1}`}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {!loading && !error && !notice && (
          <div className="text-center py-20">
            <div className="h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-4 border shadow-sm" style={{ background: 'var(--advertisement-card-bg)', borderColor: 'var(--advertisement-card-border)' }}>
              <FileText className="h-8 w-8" style={{ color: 'var(--advertisement-subtitle)' }} />
            </div>
            <h3 className="font-bold" style={{ color: 'var(--advertisement-title)' }}>Notice not found</h3>
            <p className="text-sm mt-1" style={{ color: 'var(--advertisement-subtitle)' }}>This notice may no longer be available.</p>
          </div>
        )}
      </div>

      {previewImage && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 px-4 py-6"
          onClick={closeImagePreview}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full p-2 text-white"
            onClick={closeImagePreview}
            aria-label="Close image preview"
          >
            <X className="h-6 w-6" />
          </button>
          <div
            className="flex max-h-full w-full max-w-5xl items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={previewImage.url}
              alt={previewImage.label}
              className="max-h-[88vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default NoticeDetail;
