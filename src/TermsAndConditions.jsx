import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBackNavigation } from './hooks';
import { fetchTrustById } from './services/trustService';

const TRUST_ID = import.meta.env.VITE_DEFAULT_TRUST_ID || '';
const LOGIN_TRUST_CACHE_KEY = 'cached_base_trust_info';

const getCachedTrust = () => {
  try {
    const raw = localStorage.getItem(LOGIN_TRUST_CACHE_KEY);
    if (!raw) return null;

    const { data, ts, trustId } = JSON.parse(raw);
    if (trustId && trustId !== TRUST_ID) {
      localStorage.removeItem(LOGIN_TRUST_CACHE_KEY);
      return null;
    }

    if (Date.now() - ts > 24 * 60 * 60 * 1000) return null;
    return data;
  } catch {
    return null;
  }
};

const parseSections = (rawText) => {
  if (!rawText) return [];

  if (/<[a-z][\s\S]*>/i.test(rawText)) {
    return [{ title: '', body: rawText, isHtml: true }];
  }

  return rawText
    .split(/(?=\d+\.\s)/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(\d+)\.\s+(.+?)(?:\n|$)([\s\S]*)/);
      if (!match) {
        return { num: null, title: null, body: part, isHtml: false };
      }

      return {
        num: match[1],
        title: match[2].trim(),
        body: match[3].trim(),
        isHtml: false,
      };
    });
};

const TermsAndConditions = () => {
  const navigate = useNavigate();
  useBackNavigation();

  const [trustInfo, setTrustInfo] = useState(() => getCachedTrust());
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const cached = getCachedTrust();
        if (cached) {
          setTrustInfo(cached);
          setContent(cached.terms_content || '');
          setLoading(false);
        }

        const trust = await fetchTrustById(TRUST_ID);
        if (!active || !trust) return;

        setTrustInfo(trust);
        setContent(trust.terms_content || '');

        try {
          localStorage.setItem(
            LOGIN_TRUST_CACHE_KEY,
            JSON.stringify({ data: trust, ts: Date.now(), trustId: TRUST_ID })
          );
        } catch {
          // no-op
        }
      } catch (err) {
        console.warn('[Terms] Load error:', err);
        if (active) setError('Failed to load Terms & Conditions. Please try again.');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  const sections = parseSections(content);
  const trustName = trustInfo?.name || '';

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.headerRow}>
          <button onClick={() => navigate(-1)} style={styles.backButton} aria-label="Go back">
            &#8592;
          </button>
          <div>
            <h1 style={styles.title}>Terms &amp; Conditions</h1>
            {trustName ? <p style={styles.subtitle}>{trustName}</p> : null}
          </div>
        </div>

        {loading ? <p style={styles.message}>Loading terms...</p> : null}
        {!loading && error ? <p style={styles.error}>{error}</p> : null}
        {!loading && !error && !content ? (
          <p style={styles.message}>Terms & Conditions not available yet.</p>
        ) : null}

        {!loading && !error && content ? (
          <div style={styles.contentWrap}>
            {sections.map((sec, idx) => (
              <section key={idx} style={styles.section}>
                {sec.isHtml ? (
                  <div style={styles.sectionBody} dangerouslySetInnerHTML={{ __html: sec.body }} />
                ) : sec.num ? (
                  <>
                    <h2 style={styles.sectionTitle}>
                      {sec.num}. {sec.title}
                    </h2>
                    {sec.body ? <p style={styles.sectionBody}>{sec.body}</p> : null}
                  </>
                ) : (
                  <p style={styles.sectionBody}>{sec.body}</p>
                )}
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#f8fafc',
    padding: '16px',
    boxSizing: 'border-box',
  },
  container: {
    maxWidth: '900px',
    margin: '0 auto',
    backgroundColor: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    padding: '20px',
  },
  headerRow: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
    marginBottom: '16px',
  },
  backButton: {
    border: '1px solid #cbd5e1',
    backgroundColor: '#ffffff',
    color: '#1e293b',
    borderRadius: '6px',
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  title: {
    margin: 0,
    fontSize: '24px',
    color: '#0f172a',
  },
  subtitle: {
    margin: '4px 0 0 0',
    color: '#475569',
    fontSize: '14px',
  },
  message: {
    color: '#334155',
    fontSize: '15px',
  },
  error: {
    color: '#b91c1c',
    fontSize: '15px',
  },
  contentWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  section: {
    borderTop: '1px solid #e2e8f0',
    paddingTop: '14px',
  },
  sectionTitle: {
    margin: '0 0 8px 0',
    fontSize: '18px',
    color: '#0f172a',
  },
  sectionBody: {
    margin: 0,
    color: '#334155',
    lineHeight: 1.7,
    whiteSpace: 'pre-wrap',
  },
};

export default TermsAndConditions;
