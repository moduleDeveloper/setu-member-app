import React, { useEffect, useState } from 'react';
import { ChevronLeft, Mail, PhoneCall, UserRound } from 'lucide-react';
import { useAppTheme } from './context/ThemeContext';
import { applyOpacity } from './utils/colorUtils';
import { clearContactTrustCache, fetchContactTrustRows } from './services/contactTrustService';
import { fetchTrustById } from './services/trustService';

const ContactUs = ({ onNavigateBack }) => {
  const theme = useAppTheme();
  const [trustName, setTrustName] = useState(localStorage.getItem('selected_trust_name') || 'Trust');
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const load = async (force = false) => {
      const trustId = localStorage.getItem('selected_trust_id') || '';
      const fallbackName = localStorage.getItem('selected_trust_name') || 'Trust';
      if (!active) return;

      if (!trustId) {
        setTrustName(fallbackName);
        setContacts([]);
        setError('Selected trust not found.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');

        const [trust, rows] = await Promise.all([
          fetchTrustById(trustId).catch(() => null),
          fetchContactTrustRows(trustId, { force }),
        ]);

        if (!active) return;
        setTrustName(trust?.name || fallbackName);
        setContacts(rows);
      } catch (err) {
        if (!active) return;
        console.error('[ContactUs] Failed to load trust contacts:', err);
        setContacts([]);
        setError('Unable to load contact details.');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();

    const handleTrustChange = (event) => {
      const nextTrustId = event?.detail?.trustId || localStorage.getItem('selected_trust_id') || null;
      const nextName = event?.detail?.trustName || localStorage.getItem('selected_trust_name') || 'Trust';
      if (nextTrustId) clearContactTrustCache(nextTrustId);
      setTrustName(nextName);
      load(true);
    };
    const handleWindowFocus = () => load(true);

    window.addEventListener('trust-changed', handleTrustChange);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      active = false;
      window.removeEventListener('trust-changed', handleTrustChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, []);

  return (
    <div
      className="min-h-screen pb-8"
      style={{
        background: 'var(--page-bg, var(--app-page-bg))',
        color: 'var(--advertisement-description)',
      }}
    >
      <div
        className="theme-navbar border-b px-6 py-5 flex items-center sticky top-0 z-40 shadow-sm"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 20px)' }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={onNavigateBack}
            className="w-10 h-10 rounded-2xl flex items-center justify-center active:scale-95 transition-all"
            style={{ background: `linear-gradient(135deg, ${applyOpacity(theme.accent, 0.65)}, ${theme.accentBg})` }}
          >
            <ChevronLeft className="h-5 w-5" style={{ color: theme.primary }} />
          </button>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em]" style={{ color: theme.primary }}>
              Contact Us
            </p>
            <h1 className="text-lg font-extrabold truncate" style={{ color: 'var(--navbar-text)' }}>
              {trustName}
            </h1>
          </div>
        </div>
      </div>

      <div className="px-6 py-6">
        {loading ? (
          <div
            className="rounded-3xl px-5 py-8 text-center"
            style={{
              background: 'var(--advertisement-card-bg)',
              border: `1px solid ${applyOpacity(theme.primary, 0.08)}`,
            }}
          >
            <div
              className="w-9 h-9 mx-auto rounded-full border-2 border-t-transparent animate-spin mb-3"
              style={{ borderColor: theme.primary, borderTopColor: 'transparent' }}
            />
            <p className="text-sm font-semibold" style={{ color: 'var(--advertisement-description)' }}>Loading contact details...</p>
          </div>
        ) : error ? (
          <div
            className="rounded-3xl px-5 py-6"
            style={{
              background: `linear-gradient(135deg, ${applyOpacity('#ef4444', 0.08)}, ${applyOpacity(theme.accentBg, 0.9)})`,
              border: `1px solid ${applyOpacity('#ef4444', 0.18)}`,
            }}
          >
            <p className="text-sm font-bold" style={{ color: 'var(--advertisement-description)' }}>{error}</p>
          </div>
        ) : contacts.length === 0 ? (
          <div
            className="rounded-3xl px-5 py-8 text-center"
            style={{
              background: 'var(--advertisement-card-bg)',
              border: `1px solid ${applyOpacity(theme.primary, 0.08)}`,
            }}
          >
            <p className="text-base font-bold" style={{ color: 'var(--advertisement-description)' }}>
              No contact details found
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {contacts.map((contact) => (
              <div
                key={contact.id}
                className="rounded-[28px] p-5"
                style={{
                  background: 'var(--advertisement-card-bg)',
                  border: '1px solid var(--advertisement-card-border)',
                  boxShadow: `0 10px 28px ${applyOpacity(theme.secondary, 0.08)}`,
                }}
              >
                <div className="mb-4">
                  <p className="text-lg font-extrabold" style={{ color: 'var(--advertisement-title)' }}>
                    {contact.facility_name}
                  </p>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: theme.primary }}>
                    Contact Point
                  </p>
                </div>

                <div className="space-y-3">
                  {contact.contact_person && (
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: applyOpacity(theme.primary, 0.1) }}>
                        <UserRound className="h-5 w-5" style={{ color: theme.primary }} />
                      </div>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: theme.primary }}>Contact Person</p>
                        <p className="text-sm font-semibold" style={{ color: 'var(--advertisement-description)' }}>{contact.contact_person}</p>
                      </div>
                    </div>
                  )}

                  {contact.contact_number && (
                    <a
                      href={`tel:${contact.contact_number}`}
                      className="flex items-start gap-3 rounded-2xl p-3 transition-all"
                      style={{ background: 'color-mix(in srgb, var(--advertisement-card-bg) 78%, var(--app-page-bg))' }}
                    >
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: applyOpacity(theme.primary, 0.1) }}>
                        <PhoneCall className="h-5 w-5" style={{ color: theme.primary }} />
                      </div>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: theme.primary }}>Phone</p>
                        <p className="text-sm font-semibold" style={{ color: 'var(--advertisement-description)' }}>{contact.contact_number}</p>
                      </div>
                    </a>
                  )}

                  {contact.email_id && (
                    <a
                      href={`mailto:${contact.email_id}`}
                      className="flex items-start gap-3 rounded-2xl p-3 transition-all"
                      style={{ background: 'color-mix(in srgb, var(--advertisement-card-bg) 78%, var(--app-page-bg))' }}
                    >
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: applyOpacity(theme.primary, 0.1) }}>
                        <Mail className="h-5 w-5" style={{ color: theme.primary }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: theme.primary }}>Email</p>
                        <p className="text-sm font-semibold break-all" style={{ color: 'var(--advertisement-description)' }}>{contact.email_id}</p>
                      </div>
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ContactUs;
