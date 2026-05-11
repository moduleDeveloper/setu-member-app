import React, { useEffect, useMemo, useState } from 'react';
import { Award, Home as HomeIcon, Link as LinkIcon, Menu, X } from 'lucide-react';
import { supabase } from './services/supabaseClient';
import Sidebar from './components/Sidebar';

const normalizeText = (value) => String(value || '').trim();

const formatDateTime = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(value);
  }
};

const getAttachmentUrl = (attachment) => {
  if (typeof attachment === 'string') return attachment.trim();
  if (!attachment || typeof attachment !== 'object') return '';
  return String(attachment.url || attachment.path || attachment.href || '').trim();
};

const getAttachmentLabel = (attachment, idx) => {
  if (typeof attachment === 'object' && attachment) {
    const name = normalizeText(attachment.name || attachment.title);
    if (name) return name;
  }
  const url = getAttachmentUrl(attachment);
  if (!url) return `Attachment ${idx + 1}`;
  try {
    const parsed = new URL(url);
    const part = parsed.pathname.split('/').filter(Boolean).pop();
    return decodeURIComponent(part || `Attachment ${idx + 1}`);
  } catch {
    return `Attachment ${idx + 1}`;
  }
};

const isImageUrl = (url) => {
  const clean = String(url || '').trim().toLowerCase().split('?')[0].split('#')[0];
  return /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/.test(clean);
};

const CACHE_KEY = 'achievements_cache_v1';
const CACHE_TTL_MS = 3 * 60 * 1000;

const readAchievementsCache = (trustId) => {
  const normalizedTrustId = normalizeText(trustId);
  if (!normalizedTrustId) return null;
  try {
    const raw = sessionStorage.getItem(`${CACHE_KEY}:${normalizedTrustId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || !Array.isArray(parsed?.items)) return null;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed.items;
  } catch {
    return null;
  }
};

const writeAchievementsCache = (trustId, nextItems) => {
  const normalizedTrustId = normalizeText(trustId);
  if (!normalizedTrustId) return;
  try {
    sessionStorage.setItem(
      `${CACHE_KEY}:${normalizedTrustId}`,
      JSON.stringify({ ts: Date.now(), items: Array.isArray(nextItems) ? nextItems : [] })
    );
  } catch {
    // ignore cache errors
  }
};

const resolveTrustContext = () => {
  const selectedTrustId = normalizeText(localStorage.getItem('selected_trust_id'));
  const selectedTrustName = normalizeText(localStorage.getItem('selected_trust_name'));
  if (selectedTrustId) return { trustId: selectedTrustId, trustName: selectedTrustName || null };

  try {
    const parsed = JSON.parse(localStorage.getItem('user') || '{}');
    const memberships = Array.isArray(parsed?.hospital_memberships) ? parsed.hospital_memberships : [];
    const preferred = memberships.find((m) => m?.is_active && m?.trust_id) || memberships.find((m) => m?.trust_id) || null;
    const trustId = normalizeText(preferred?.trust_id || parsed?.primary_trust?.id || parsed?.trust?.id);
    const trustName = normalizeText(preferred?.trust_name || parsed?.primary_trust?.name || parsed?.trust?.name);
    if (!trustId) return { trustId: null, trustName: null };
    localStorage.setItem('selected_trust_id', trustId);
    if (trustName) localStorage.setItem('selected_trust_name', trustName);
    return { trustId, trustName: trustName || null };
  } catch {
    return { trustId: null, trustName: null };
  }
};

const Achievements = ({ onNavigate }) => {
  const initialTrust = resolveTrustContext();
  const [selectedTrustId, setSelectedTrustId] = useState(() => initialTrust.trustId || '');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const fetchAchievements = async (trustId, { silent = false } = {}) => {
    const normalizedTrustId = normalizeText(trustId);
    if (!normalizedTrustId) {
      setItems([]);
      setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    setError('');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const { data, error: fetchError } = await supabase
      .from('achievements')
      .select('id, trust_id, type, name, description, attachments, status, created_by, created_at, updated_at, size')
      .eq('trust_id', normalizedTrustId)
      .eq('status', 'active')
      .abortSignal(controller.signal)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false, nullsFirst: false });
    clearTimeout(timeout);

    if (fetchError) {
      setError(fetchError.name === 'AbortError' ? 'Loading is taking too long. Please retry.' : (fetchError.message || 'Failed to load achievements'));
      if (!silent) {
        const cached = readAchievementsCache(normalizedTrustId);
        setItems(Array.isArray(cached) ? cached : []);
      }
      setLoading(false);
      return;
    }

    const nextItems = Array.isArray(data) ? data : [];
    setItems(nextItems);
    writeAchievementsCache(normalizedTrustId, nextItems);
    setLoading(false);
  };

  useEffect(() => {
    const cached = readAchievementsCache(selectedTrustId);
    if (Array.isArray(cached)) {
      setItems(cached);
      setLoading(false);
    }
    const load = async () => {
      await fetchAchievements(selectedTrustId, { silent: Array.isArray(cached) });
    };
    load();
  }, [selectedTrustId]);

  useEffect(() => {
    const syncTrust = () => {
      const trust = resolveTrustContext();
      setSelectedTrustId(trust.trustId || '');
    };
    const handleStorage = (event) => {
      if (!event || event.key === 'selected_trust_id' || event.key === 'selected_trust_name') syncTrust();
    };
    window.addEventListener('trust-changed', syncTrust);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('trust-changed', syncTrust);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!selectedTrustId) return () => {};
    const channel = supabase
      .channel(`achievements-live-${selectedTrustId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'achievements', filter: `trust_id=eq.${selectedTrustId}` },
        async () => {
          await fetchAchievements(selectedTrustId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [selectedTrustId]);

  const spotlight = useMemo(() => items[0] || null, [items]);
  const timeline = useMemo(() => items.slice(1), [items]);

  return (
    <div className={`min-h-screen pb-8 relative${isMenuOpen ? ' overflow-hidden max-h-screen' : ''}`} style={{ background: 'var(--page-bg, var(--app-page-bg))', color: 'var(--body-text-color)' }}>
      <div className="theme-navbar border-b px-6 py-5 flex items-center justify-between sticky top-0 z-50 shadow-sm" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 20px)' }}>
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="p-2 rounded-xl transition-colors"
          aria-label="Toggle menu"
        >
          {isMenuOpen ? <X className="h-5 w-5" style={{ color: 'var(--navbar-text)' }} /> : <Menu className="h-5 w-5" style={{ color: 'var(--navbar-text)' }} />}
        </button>
        <h1 className="text-lg font-bold" style={{ color: 'var(--navbar-text)' }}>Achievements</h1>
        <button
          onClick={() => onNavigate?.('home')}
          className="p-2 rounded-xl transition-colors"
          style={{ color: 'var(--navbar-text)' }}
          aria-label="Go to home"
        >
          <HomeIcon className="h-5 w-5" />
        </button>
      </div>

      {isMenuOpen && <div className="fixed inset-0 z-25" style={{ background: 'rgba(0,0,0,0.02)' }} onClick={() => setIsMenuOpen(false)} />}
      <Sidebar isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} onNavigate={onNavigate} currentPage="achievements" />

      <div className="px-4 py-5">
        {loading ? (
          <div className="py-16 text-center text-sm" style={{ color: 'var(--advertisement-subtitle)' }}>Loading achievements...</div>
        ) : error ? (
          <div className="py-12 text-center">
            <p className="text-sm font-semibold" style={{ color: 'var(--advertisement-title)' }}>Could not load achievements</p>
            <p className="text-xs mt-1" style={{ color: 'var(--advertisement-subtitle)' }}>{error}</p>
            <button
              type="button"
              onClick={() => fetchAchievements(selectedTrustId)}
              className="mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: 'var(--app-button-bg)', color: 'var(--app-button-text)' }}
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto mb-3 h-12 w-12 rounded-full grid place-items-center" style={{ background: 'var(--advertisement-card-bg)', color: 'var(--app-accent-bg)', border: '1px solid var(--advertisement-card-border)' }}>
              <Award size={22} />
            </div>
            <p className="text-sm font-semibold" style={{ color: 'var(--advertisement-title)' }}>No achievements yet</p>
            <p className="text-xs mt-1" style={{ color: 'var(--advertisement-subtitle)' }}>New milestones will appear here automatically.</p>
          </div>
        ) : (
          <>
            {spotlight && (
              <section className="mb-7">
                <p className="text-[10px] uppercase tracking-[0.16em] mb-2" style={{ color: 'var(--advertisement-subtitle)' }}>Latest Highlight</p>
                <div className="relative overflow-hidden rounded-2xl border px-4 py-4" style={{ borderColor: 'var(--advertisement-card-border)', background: 'var(--advertisement-card-bg)' }}>
                  <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full" style={{ background: 'color-mix(in srgb, var(--app-accent-bg) 16%, transparent)' }} />
                  <h2 className="text-lg font-extrabold leading-tight pr-8" style={{ color: 'var(--advertisement-title)' }}>{spotlight.name}</h2>
                  <p className="text-xs mt-1" style={{ color: 'var(--advertisement-subtitle)' }}>{formatDateTime(spotlight.updated_at || spotlight.created_at)}</p>
                  {spotlight.description ? <p className="text-sm mt-3 leading-relaxed" style={{ color: 'var(--advertisement-description)' }}>{spotlight.description}</p> : null}
                  {Array.isArray(spotlight.attachments) && spotlight.attachments.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {spotlight.attachments.map((attachment, idx) => {
                        const url = getAttachmentUrl(attachment);
                        if (!url) return null;
                        if (isImageUrl(url)) {
                          return (
                            <div
                              key={`spotlight-${spotlight.id}-image-${idx}`}
                              className="block overflow-hidden rounded-xl border"
                            style={{ borderColor: 'var(--advertisement-card-border)' }}
                          >
                              <img src={url} alt={getAttachmentLabel(attachment, idx)} className="w-full h-auto max-h-56 object-cover" loading="lazy" />
                            </div>
                          );
                        }
                        return (
                          <a
                            key={`spotlight-${spotlight.id}-attachment-${idx}`}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border transition-colors"
                            style={{ borderColor: 'var(--advertisement-card-border)', color: 'var(--advertisement-title)', background: 'color-mix(in srgb, var(--advertisement-card-bg) 88%, var(--page-bg))' }}
                          >
                            <LinkIcon size={12} />
                            <span>{getAttachmentLabel(attachment, idx)}</span>
                          </a>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </section>
            )}

            {timeline.length > 0 ? (
              <section>
                <p className="text-[10px] uppercase tracking-[0.16em] mb-2" style={{ color: 'var(--advertisement-subtitle)' }}>Achievement Trail</p>
                <div className="relative pl-5">
                  <div className="absolute left-[7px] top-1 bottom-1 w-[2px]" style={{ background: 'linear-gradient(to bottom, color-mix(in srgb, var(--app-accent-bg) 65%, transparent), color-mix(in srgb, var(--app-accent-bg) 15%, transparent))' }} />
                  <div className="space-y-6">
                    {timeline.map((item) => (
                      <article key={item.id} className="relative rounded-2xl border p-3.5" style={{ borderColor: 'var(--advertisement-card-border)', background: 'var(--advertisement-card-bg)' }}>
                        <div className="absolute -left-[22px] top-1.5 h-4 w-4 rounded-full border-2" style={{ borderColor: 'var(--app-accent-bg)', background: 'var(--surface-color)' }} />
                        <p className="text-[11px] font-semibold" style={{ color: 'var(--advertisement-subtitle)' }}>{formatDateTime(item.updated_at || item.created_at)}</p>
                        <h3 className="text-[15px] font-bold mt-0.5" style={{ color: 'var(--advertisement-title)' }}>{item.name}</h3>
                        {item.description ? (
                          <p className="text-sm leading-relaxed mt-1" style={{ color: 'var(--advertisement-description)' }}>{item.description}</p>
                        ) : null}
                        {Array.isArray(item.attachments) && item.attachments.length > 0 ? (
                          <div className="mt-2.5 space-y-2">
                            {item.attachments.map((attachment, idx) => {
                              const url = getAttachmentUrl(attachment);
                              if (!url) return null;
                              if (isImageUrl(url)) {
                                return (
                                  <div
                                    key={`${item.id}-image-${idx}`}
                                    className="block overflow-hidden rounded-lg border"
                                    style={{ borderColor: 'var(--advertisement-card-border)' }}
                                  >
                                    <img src={url} alt={getAttachmentLabel(attachment, idx)} className="w-full h-auto max-h-52 object-cover" loading="lazy" />
                                  </div>
                                );
                              }
                              return (
                                <a
                                  key={`${item.id}-attachment-${idx}`}
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 text-[11px] underline underline-offset-2"
                                  style={{ color: 'var(--app-accent-bg)' }}
                                >
                                  <LinkIcon size={11} />
                                  <span>{getAttachmentLabel(attachment, idx)}</span>
                                </a>
                              );
                            })}
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
};

export default Achievements;
