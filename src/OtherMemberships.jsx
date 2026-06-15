import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Users, Plus, X, CheckCircle, Menu, Home as HomeIcon,
  AlertCircle, Building2, Hash, Tag, FileText, Loader2, Save
} from 'lucide-react';
import Sidebar from './components/Sidebar';
import { useAppTheme } from './context/ThemeContext';
import { applyOpacity } from './utils/colorUtils';
import { getNavbarThemeStyles, getThemeToken } from './utils/themeUtils';

// ─── Supabase helpers ──────────────────────────────────────────────────────

const getSupabase = async () => {
  const { supabase } = await import('./services/supabaseClient.js');
  return supabase;
};

// Fetch existing other_memberships for a member
const fetchOtherMemberships = async (memberId) => {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('other_memberships')
    .select(`
      id,
      member_id,
      member_name,
      member_phone,
      trust_id,
      organisation_name,
      membership_no,
      membership_type,
      is_active,
      remark,
      created_at,
      Trust:trust_id ( id, name, icon_url )
    `)
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};



// Insert a new other_membership record
const addOtherMembership = async (payload) => {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('other_memberships')
    .insert([payload])
    .select('*, Trust:trust_id ( id, name, icon_url )')
    .single();
  if (error) throw error;
  return data;
};

// Delete an other_membership record
const deleteOtherMembership = async (id) => {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from('other_memberships')
    .delete()
    .eq('id', id);
  if (error) throw error;
};

// ─── Small reusable components ─────────────────────────────────────────────

const Label = ({ children }) => (
  <p style={{
    fontSize: '11px', fontWeight: 700, color: 'var(--advertisement-description)',
    textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 5px'
  }}>{children}</p>
);

const inputStyle = {
  width: '100%',
  padding: '11px 14px',
  border: '1.5px solid var(--advertisement-card-border)',
  borderRadius: '12px',
  fontSize: '14px',
  fontFamily: "var(--font-family, 'Inter', sans-serif)",
  color: 'var(--advertisement-description)',
  background: 'color-mix(in srgb, var(--advertisement-card-bg) 80%, var(--app-accent-bg))',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s',
};

// ─── Main Component ────────────────────────────────────────────────────────

const EMPTY_FORM = {
  trust_id: '',
  organisation_name: '',
  membership_no: '',
  membership_type: '',
  remark: '',
};

const normalizeText = (value) => String(value || '').trim();

const normalizeId = (value) => normalizeText(value).toLowerCase();

const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
};

const TRUST_LINKS_CACHE_KEY_PREFIX = 'other_memberships_trust_links_v1_';
const TRUST_LINKS_LAST_CACHE_KEY = 'other_memberships_trust_links_v1_last';

const getTrustLinksCacheKey = (memberId) => `${TRUST_LINKS_CACHE_KEY_PREFIX}${normalizeText(memberId || 'anonymous')}`;

const readTrustLinksCache = (memberId) => {
  try {
    const raw = localStorage.getItem(getTrustLinksCacheKey(memberId));
    if (!raw) {
      const fallback = localStorage.getItem(TRUST_LINKS_LAST_CACHE_KEY);
      if (!fallback) return [];
      const parsedFallback = JSON.parse(fallback);
      return Array.isArray(parsedFallback) ? parsedFallback : [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeTrustLinksCache = (memberId, links) => {
  try {
    const safeLinks = JSON.stringify(Array.isArray(links) ? links : []);
    localStorage.setItem(getTrustLinksCacheKey(memberId), safeLinks);
    localStorage.setItem(TRUST_LINKS_LAST_CACHE_KEY, safeLinks);
  } catch {
    // Ignore cache write failures (quota/private mode)
  }
};

const buildTrustLinksFromUserPayload = (parsedUser = {}) => {
  const selectedTrustId = normalizeText(localStorage.getItem('selected_trust_id'));
  const selectedTrustName = normalizeText(localStorage.getItem('selected_trust_name'));
  const selectedTrustMembershipNo = normalizeText(
    parsedUser?.['Membership number']
    || parsedUser?.membership_number
    || parsedUser?.membershipNumber
  );

  const hospitalMemberships = Array.isArray(parsedUser?.hospital_memberships)
    ? parsedUser.hospital_memberships
    : [];

  const normalizedSelectedTrustId = normalizeId(selectedTrustId);
  const merged = hospitalMemberships.map((hm, idx) => {
    const trustId = normalizeText(hm?.trust_id);
    const isCurrentTrust = normalizedSelectedTrustId && normalizeId(trustId) === normalizedSelectedTrustId;
    const membershipNo = normalizeText(hm?.membership_number) || (isCurrentTrust ? selectedTrustMembershipNo : '');

    return {
      _key: hm.trust_id || `hm-${idx}`,
      id: hm?.reg_id || hm?.id || hm?.trust_id || `hm-${idx}`,
      trust_id: hm.trust_id || null,
      Trust: {
        id: hm.trust_id,
        name: hm.trust_name,
        icon_url: hm.trust_icon_url,
      },
      membership_no: membershipNo || '-',
      location: null,
      remark1: hm.trust_remark || null,
      remark2: null,
      is_active: hm.is_active !== false,
      role: hm.role || null,
      source: 'reg_members',
      is_vip: true,
      is_current_trust: isCurrentTrust,
    };
  });

  const hasSelectedTrustCard = merged.some((item) => normalizeId(item?.trust_id) === normalizedSelectedTrustId);
  if (!hasSelectedTrustCard && (selectedTrustId || selectedTrustName) && selectedTrustMembershipNo) {
    merged.unshift({
      _key: `selected-${selectedTrustId || selectedTrustName}`,
      id: `selected-${selectedTrustId || selectedTrustName}`,
      trust_id: selectedTrustId || null,
      Trust: {
        id: selectedTrustId || null,
        name: selectedTrustName || 'Current Trust',
        icon_url: null,
      },
      membership_no: selectedTrustMembershipNo,
      location: null,
      remark1: null,
      remark2: null,
      is_active: true,
      role: null,
      source: 'reg_members',
      is_vip: true,
      is_current_trust: true,
    });
  }

  merged.sort((a, b) => Number(Boolean(b.is_current_trust)) - Number(Boolean(a.is_current_trust)));
  return merged;
};

const areMembershipCollectionsEqual = (left = [], right = []) => {
  if (left === right) return true;
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;

  return JSON.stringify(left) === JSON.stringify(right);
};



const OtherMemberships = ({ onNavigate }) => {
  const navigate = useNavigate();
  const theme = useAppTheme();
  const navbarTheme = getNavbarThemeStyles(theme);
  const bootUser = getStoredUser();
  const bootMemberId = bootUser?.members_id || bootUser?.id || 'anonymous';
  const bootTrustLinksFromUser = buildTrustLinksFromUserPayload(bootUser);
  const bootTrustLinks = readTrustLinksCache(bootMemberId);
  const initialTrustLinks = bootTrustLinksFromUser.length > 0 ? bootTrustLinksFromUser : bootTrustLinks;

  const colors = {
    primary: theme.primary || 'var(--brand-red)',
    secondary: theme.secondary || 'var(--brand-navy)',
    accent: theme.accent || 'var(--app-accent)',
    accentBg: theme.accentBg || 'var(--app-accent-bg)',
    bg: getThemeToken(theme, 'page_bg.background_color', 'var(--app-page-bg)'),
    surface: 'var(--surface-color)',
    card: `linear-gradient(180deg, ${applyOpacity('var(--surface-color)', 0.96)} 0%, ${applyOpacity(theme.accentBg || 'var(--app-accent-bg)', 0.72)} 100%)`,
    cardInner: applyOpacity(theme.accentBg || 'var(--app-accent-bg)', 0.42),
    border: applyOpacity(theme.secondary || 'var(--brand-navy)', 0.13),
    muted: 'var(--body-text-color)',
    success: 'color-mix(in srgb, #16a34a 82%, var(--brand-red) 18%)',
    successBg: 'color-mix(in srgb, var(--app-accent-bg) 58%, #DCFCE7)',
    error: 'var(--brand-red-dark)',
    errorBg: 'var(--brand-red-light)',
    vipText: '#8A5A00',
    vipBg: 'linear-gradient(135deg, #FFE7A3 0%, #FFD36A 52%, #F5B700 100%)',
    vipBorder: '#E0A11B',
  };

  // ── state ──
  const [trustLinks, setTrustLinks] = useState(initialTrustLinks); // from reg_members-backed user payload
  const [otherMems, setOtherMems] = useState([]);        // from other_memberships table
  const [loading, setLoading] = useState(initialTrustLinks.length === 0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [memberName, setMemberName] = useState('');
  const [memberPhone, setMemberPhone] = useState('');

  // Add-form state
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Delete state
  const [deletingId, setDeletingId] = useState(null);

  // ── derived ──
  const user = getStoredUser();

  // ── fetch data ──
  const loadData = useCallback(async (opts = {}) => {
    const { silent = false } = opts;
    if (!silent) setLoading(true);
    if (silent) setIsRefreshing(true);
    setError('');
    try {
      const parsedUser = getStoredUser();
      const id = normalizeText(parsedUser?.members_id);
      if (!id) {
        setError('Member ID not found. Please re-login.');
        setLoading(false);
        setIsRefreshing(false);
        return;
      }
      const name = parsedUser?.Name || parsedUser?.name || parsedUser?.full_name || '';
      setMemberName(name);
      setMemberPhone('');

      const merged = buildTrustLinksFromUserPayload(parsedUser);

      setTrustLinks((prev) => (areMembershipCollectionsEqual(prev, merged) ? prev : merged));
      writeTrustLinksCache(id || 'anonymous', merged);

      // ── other_memberships table ──
      try {
        const otherMemsData = await fetchOtherMemberships(id);
        setOtherMems((prev) => {
          const next = otherMemsData || [];
          return areMembershipCollectionsEqual(prev, next) ? prev : next;
        });
      } catch (e) {
        console.warn('other_memberships fetch failed:', e);
      }
    } catch (err) {
      console.error('OtherMemberships load error:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      if (!silent) setLoading(false);
      setIsRefreshing(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear any temporary global scroll-lock styles left by previous screens.
  useEffect(() => {
    document.documentElement.style.overflow = '';
    document.documentElement.style.position = '';
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.top = '';
    document.body.style.touchAction = '';
  }, []);

  useEffect(() => {
    const hasCachedTrustLinks = initialTrustLinks.length > 0;
    loadData({ silent: hasCachedTrustLinks });
  }, [loadData, initialTrustLinks.length]);

  useEffect(() => {
    if (isMenuOpen) {
      const y = window.scrollY;
      Object.assign(document.body.style, { overflow: 'hidden', position: 'fixed', width: '100%', top: `-${y}px` });
    } else {
      const y = parseInt(document.body.style.top || '0', 10) * -1;
      Object.assign(document.body.style, { overflow: '', position: '', width: '', top: '' });
      window.scrollTo(0, Number.isFinite(y) ? y : 0);
    }
    return () => Object.assign(document.body.style, { overflow: '', position: '', width: '', top: '' });
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isMenuOpen) return undefined;
    const handleOutside = (event) => {
      if (!event.target.closest('[data-sidebar="true"]') && !event.target.closest('[data-sidebar-overlay="true"]')) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('click', handleOutside, true);
    return () => document.removeEventListener('click', handleOutside, true);
  }, [isMenuOpen]);

  // ── handlers ──
  const handleFormChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitSuccess('');

    if (!form.membership_no.trim()) {
      setSubmitError('Membership number is required.');
      return;
    }
    if (!form.organisation_name.trim()) {
      setSubmitError('Please enter the Trust / Organisation name.');
      return;
    }

    setSubmitting(true);
    try {
      const id = normalizeText(user?.members_id);
      const payload = {
        member_id: id || null,
        member_name: memberName || null,
        member_phone: null,
        trust_id: null,
        organisation_name: form.organisation_name.trim() || null,
        membership_no: form.membership_no.trim(),
        membership_type: form.membership_type.trim() || null,
        remark: form.remark.trim() || null,
        is_active: true,
      };
      const newRecord = await addOtherMembership(payload);
      setOtherMems(prev => [newRecord, ...prev]);
      setForm(EMPTY_FORM);
      setShowForm(false);
      setSubmitSuccess('Membership added successfully!');
      setTimeout(() => setSubmitSuccess(''), 4000);
    } catch (err) {
      console.error('Add other membership error:', err);
      setSubmitError(err?.message || 'Failed to add membership. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this membership record?')) return;
    setDeletingId(id);
    try {
      await deleteOtherMembership(id);
      setOtherMems(prev => prev.filter(m => m.id !== id));
    } catch (err) {
      alert('Failed to delete: ' + (err?.message || 'Unknown error'));
    } finally {
      setDeletingId(null);
    }
  };

  // ── render helpers ──
  const TrustAvatar = ({ trust, size = 44 }) => {
    const name = (typeof trust === 'string' ? trust : trust?.name) || 'T';
    const iconUrl = typeof trust === 'object' ? trust?.icon_url : null;
    return iconUrl ? (
      <img src={iconUrl} alt={name}
        style={{ width: size, height: size, borderRadius: size * 0.3, objectFit: 'contain', border: `2px solid ${colors.border}`, background: '#F8F9FF', flexShrink: 0 }}
        onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
      />
    ) : (
      <div style={{ width: size, height: size, borderRadius: size * 0.3, background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.42, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
        {name.charAt(0).toUpperCase()}
      </div>
    );
  };

  const MembershipCard = ({ m, index, showGoldenMembershipBadge = false }) => {
    const trustName = m.Trust?.name || m.organisation_name || '—';
    const isVip = m.source === 'reg_members' || m.is_vip;
    const showDelete = !isVip;
    const membershipLabel = 'Membership No.';
    const membershipNoText = normalizeText(m.membership_no) || '-';
    const membershipTypeText = normalizeText(m.membership_type || m.role).toUpperCase();
    const shouldShowMembershipRow = !showGoldenMembershipBadge;
    const shouldShowOrganisationRow = Boolean(m.organisation_name && m.organisation_name !== trustName);
    const shouldShowRemarkRow = Boolean(m.remark);
    const showDetailsPanel = shouldShowMembershipRow || shouldShowOrganisationRow || shouldShowRemarkRow;

    return (
      <div key={m.id} style={{ background: colors.card, borderRadius: '24px', border: `1.5px solid ${colors.border}`, boxShadow: `0 14px 34px ${applyOpacity(colors.secondary, 0.1)}`, overflow: 'hidden' }}>
        <div style={{ height: '3px', background: isVip ? colors.vipBg : `linear-gradient(90deg, ${colors.primary}, ${colors.accent})` }} />
        <div style={{ padding: '16px 16px 14px' }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
            <TrustAvatar trust={m.Trust || { name: trustName, icon_url: null }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--heading-color)', margin: '0 0 5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {trustName}
              </h3>
              {showGoldenMembershipBadge && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', marginTop: '2px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '10px', fontWeight: 800, color: '#FFF8E1', background: 'linear-gradient(135deg, #6E5300 0%, #B8860B 45%, #D4AF37 100%)', border: '1px solid #E2C66C', padding: '3px 10px', borderRadius: '999px', letterSpacing: '0.08em' }}>
                    {membershipNoText}
                  </span>
                  {membershipTypeText && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '10px', fontWeight: 800, color: '#FFF8E1', background: 'linear-gradient(135deg, #6E5300 0%, #B8860B 45%, #D4AF37 100%)', border: '1px solid #E2C66C', padding: '3px 10px', borderRadius: '999px', letterSpacing: '0.08em' }}>
                      {membershipTypeText}
                    </span>
                  )}
                </div>
              )}
            </div>
            {/* Delete button */}
            {showDelete && (
              <button
                onClick={() => handleDelete(m.id)}
                disabled={deletingId === m.id}
                style={{ width: 32, height: 32, borderRadius: '10px', border: 'none', background: '#FEF2F2', color: colors.error, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                title="Remove"
              >
                {deletingId === m.id ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <X size={14} />}
              </button>
            )}
          </div>

          {/* Details grid */}
          {showDetailsPanel && (
            <div style={{ background: `linear-gradient(160deg, ${colors.cardInner} 0%, ${applyOpacity(colors.accentBg, 0.24)} 100%)`, borderRadius: '16px', padding: '13px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', border: `1px solid ${applyOpacity(colors.secondary, 0.06)}` }}>
            {shouldShowMembershipRow && (
              <div style={{ gridColumn: '1/-1' }}>
                <Label>{membershipLabel}</Label>
                <p style={{ fontSize: '15px', fontWeight: 800, color: colors.primary, margin: 0, letterSpacing: '0.05em' }}>{m.membership_no}</p>
              </div>
            )}
            {shouldShowOrganisationRow && (
              <div style={{ gridColumn: '1/-1' }}>
                <Label>Organisation</Label>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--heading-color)', margin: 0 }}>{m.organisation_name}</p>
              </div>
            )}
            {shouldShowRemarkRow && (
              <div style={{ gridColumn: '1/-1', background: '#FFFBEB', borderRadius: '10px', padding: '10px 12px', border: '1px solid #FDE68A', marginTop: 2 }}>
                <Label>Remark</Label>
                <p style={{ fontSize: '12px', color: '#92400e', margin: 0, lineHeight: 1.5, fontWeight: 500 }}>{m.remark}</p>
              </div>
            )}
          </div>
          )}
        </div>
      </div>
    );
  };

  // ── render ──
  return (
    <div
      style={{
        width: '100%',
        maxWidth: '430px',
        margin: '0 auto',
        minHeight: '100dvh',
        overflow: 'visible',
        background: `radial-gradient(circle at top, ${applyOpacity(colors.accentBg, 0.9)} 0%, ${applyOpacity(colors.bg, 0.96)} 28%, ${colors.bg} 100%)`,
        fontFamily: "var(--font-family, 'Inter', sans-serif)",
        boxSizing: 'border-box',
      }}
    >
      {/* ── Header ── */}
      <div
        className="px-4 py-4 flex items-center justify-between sticky top-0 z-50 shadow-md"
        style={{
          background: navbarTheme?.backgroundStyle || 'var(--navbar-bg, var(--app-navbar-bg))',
          backdropFilter: `blur(${navbarTheme?.blurPx || '12px'})`,
          WebkitBackdropFilter: `blur(${navbarTheme?.blurPx || '12px'})`,
          borderBottom: '1px solid var(--navbar-border)',
          paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)',
          color: navbarTheme?.textColor || 'var(--navbar-text)',
        }}
      >
        <button
          onClick={() => (showForm ? setShowForm(false) : setIsMenuOpen((prev) => !prev))}
          className="p-2 rounded-xl transition-colors"
          style={{ color: navbarTheme?.textColor || 'var(--navbar-text)', background: 'transparent' }}
        >
          {showForm ? <ArrowLeft className="h-6 w-6" /> : (isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />)}
        </button>
        <h1 className="text-base font-bold tracking-wide" style={{ color: navbarTheme?.textColor || 'var(--navbar-text)' }}>
          Other Memberships
        </h1>
        <button
          onClick={() => (onNavigate ? onNavigate('home') : navigate('/'))}
          className="p-2 rounded-xl transition-colors"
          style={{ color: navbarTheme?.textColor || 'var(--navbar-text)', background: 'transparent' }}
        >
          <HomeIcon className="h-5 w-5" />
        </button>
      </div>

      <Sidebar isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} onNavigate={onNavigate} currentPage="other-memberships" />

      {/* ── Content ── */}
      <div style={{ width: '100%', margin: '0 auto', padding: '20px 16px 40px', boxSizing: 'border-box' }}>

        {/* Success banner */}
        {submitSuccess && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: colors.successBg, border: `1.5px solid #BBF7D0`, borderRadius: '14px', padding: '12px 16px', marginBottom: '16px', animation: 'fadeUp 0.3s ease-out' }}>
            <CheckCircle size={18} color={colors.success} />
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#15803d', margin: 0 }}>{submitSuccess}</p>
          </div>
        )}

        {/* Loading spinner */}
        {loading && trustLinks.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0' }}>
            <div style={{ width: 48, height: 48, border: `3px solid #E0E7FF`, borderTop: `3px solid ${colors.primary}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '16px' }} />
            <p style={{ fontSize: '14px', color: colors.muted, fontWeight: 500 }}>Loading memberships...</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div style={{ background: colors.errorBg, border: `1.5px solid #FECACA`, borderRadius: '16px', padding: '20px', textAlign: 'center', marginBottom: '16px' }}>
            <AlertCircle size={24} color={colors.error} style={{ margin: '0 auto 8px', display: 'block' }} />
            <p style={{ color: colors.error, fontSize: '14px', fontWeight: 600, margin: '0 0 12px' }}>{error}</p>
            <button onClick={loadData} style={{ padding: '8px 20px', background: colors.primary, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>Retry</button>
          </div>
        )}

        {!error && (
          <>
            {/* ── ADD MEMBERSHIP BUTTON ── */}
            {!showForm && (
              <button
                onClick={() => { setShowForm(true); setSubmitError(''); setSubmitSuccess(''); }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '14px 20px', background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`, color: '#fff', border: 'none', borderRadius: '16px', fontSize: '15px', fontWeight: 700, cursor: 'pointer', marginBottom: '20px', boxShadow: `0 8px 18px ${applyOpacity(colors.primary, 0.26)}`, letterSpacing: '-0.2px', animation: 'fadeUp 0.3s ease-out' }}
              >
                <Plus size={20} />
                Add New Membership
              </button>
            )}

            {/* ── ADD MEMBERSHIP FORM ── */}
            {showForm && (
              <div style={{ background: 'var(--advertisement-card-bg)', borderRadius: '20px', border: '2px solid var(--advertisement-card-border)', boxShadow: '0 12px 32px color-mix(in srgb, var(--advertisement-card-shadow) 26%, transparent)', marginBottom: '24px', overflow: 'hidden', animation: 'fadeUp 0.35s ease-out' }}>
                <div style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Plus size={18} color="#fff" />
                    </div>
                    <div>
                      <h2 style={{ color: '#fff', fontSize: '15px', fontWeight: 800, margin: 0 }}>Add New Membership</h2>
                      <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '11px', margin: 0 }}>Fill in the trust membership details</p>
                    </div>
                  </div>
                  <button onClick={() => { setShowForm(false); setSubmitError(''); setForm(EMPTY_FORM); }}
                    style={{ width: 32, height: 32, borderRadius: '10px', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <X size={16} />
                  </button>
                </div>

                <form onSubmit={handleSubmit} style={{ padding: '20px' }}>

                  {/* Trust / Organisation — plain text input */}
                  <div style={{ marginBottom: '16px' }}>
                    <Label><Building2 size={10} style={{ display: 'inline', marginRight: 5 }} />Trust / Organisation *</Label>
                    <input
                      type="text"
                      placeholder="Enter trust or organisation name"
                      value={form.organisation_name}
                      onChange={e => handleFormChange('organisation_name', e.target.value)}
                      style={inputStyle}
                    />
                  </div>

                  {/* Membership Number */}
                  <div style={{ marginBottom: '16px' }}>
                    <Label><Hash size={10} style={{ display: 'inline', marginRight: 5 }} />Membership Number *</Label>
                    <input
                      type="text"
                      placeholder="e.g. MBR-2024-001"
                      value={form.membership_no}
                      onChange={e => handleFormChange('membership_no', e.target.value)}
                      required
                      style={inputStyle}
                    />
                  </div>

                  {/* Membership Type — free text, optional */}
                  <div style={{ marginBottom: '16px' }}>
                    <Label><Tag size={10} style={{ display: 'inline', marginRight: 5 }} />Membership Type (optional)</Label>
                    <input
                      type="text"
                      placeholder="e.g. Life Member, Annual Member..."
                      value={form.membership_type}
                      onChange={e => handleFormChange('membership_type', e.target.value)}
                      style={inputStyle}
                    />
                  </div>

                  {/* Remark */}
                  <div style={{ marginBottom: '20px' }}>
                    <Label><FileText size={10} style={{ display: 'inline', marginRight: 5 }} />Remark (optional)</Label>
                    <textarea
                      placeholder="Any notes or remarks..."
                      value={form.remark}
                      onChange={e => handleFormChange('remark', e.target.value)}
                      rows={3}
                      style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                    />
                  </div>

                  {/* Submit error */}
                  {submitError && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: colors.errorBg, border: `1px solid #FECACA`, borderRadius: '10px', padding: '10px 14px', marginBottom: '14px' }}>
                      <AlertCircle size={16} color={colors.error} />
                      <p style={{ fontSize: '13px', color: colors.error, margin: 0, fontWeight: 600 }}>{submitError}</p>
                    </div>
                  )}

                  {/* Submit buttons */}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button type="button"
                      onClick={() => { setShowForm(false); setSubmitError(''); setForm(EMPTY_FORM); }}
                      style={{ flex: 1, padding: '12px', background: 'color-mix(in srgb, var(--advertisement-card-bg) 82%, var(--app-accent-bg))', color: 'var(--advertisement-description)', border: '1px solid var(--advertisement-card-border)', borderRadius: '12px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
                      Cancel
                    </button>
                    <button type="submit" disabled={submitting}
                      style={{ flex: 2, padding: '12px', background: submitting ? 'var(--body-text-color)' : `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`, color: '#fff', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: submitting ? 'none' : `0 8px 16px ${applyOpacity(colors.primary, 0.22)}` }}>
                      {submitting
                        ? <><Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> Saving…</>
                        : <><Save size={16} /> Save Membership</>}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* ── SECTION: Other Memberships (from other_memberships table) ── */}
            {otherMems.length > 0 && (
              <div style={{ marginBottom: '28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '8px', background: `linear-gradient(135deg, ${colors.accent}, #e05c53)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Building2 size={14} color="#fff" />
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: colors.accent }}>
                    {otherMems.length} Added Membership{otherMems.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {otherMems.map((m, idx) => (
                    <MembershipCard key={m.id} m={m} index={idx} showGoldenMembershipBadge={false} />
                  ))}
                </div>
              </div>
            )}

            {/* ── SECTION: Trust Links (from reg_members-backed user payload) ── */}
            {trustLinks.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '8px', background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Users size={14} color="#fff" />
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: colors.primary }}>
                    {trustLinks.length} Trust{trustLinks.length !== 1 ? 's' : ''} Linked
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {trustLinks.map((link, index) => (
                    <MembershipCard key={link.id || index} m={link} index={index} showGoldenMembershipBadge />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {otherMems.length === 0 && trustLinks.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '60px 24px',
                  background: 'var(--advertisement-card-bg)',
                  borderRadius: '20px',
                  border: '1.5px solid var(--advertisement-card-border)',
                  boxShadow: '0 10px 28px color-mix(in srgb, var(--advertisement-card-shadow) 32%, transparent)'
                }}
              >
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: '20px',
                    background: 'color-mix(in srgb, var(--advertisement-card-bg) 78%, var(--app-accent-bg))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px'
                  }}
                >
                  <Building2 size={32} color={'var(--advertisement-title)'} />
                </div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--advertisement-description)', margin: '0 0 8px' }}>No Memberships Yet</h3>
                <p style={{ fontSize: '13px', color: 'var(--advertisement-subtitle)', margin: 0, lineHeight: 1.5 }}>
                  Tap <strong>"Add New Membership"</strong> to add your first trust membership.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        input::placeholder, textarea::placeholder {
          color: var(--advertisement-subtitle);
          opacity: 0.9;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default OtherMemberships;

