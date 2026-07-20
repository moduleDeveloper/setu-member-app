import { Capacitor } from '@capacitor/core';

const trimTrailingSlash = (value) => String(value || '').trim().replace(/\/$/, '');
const stripAuthSuffix = (value) => trimTrailingSlash(value).replace(/\/auth$/i, '');

const translateLocalhostForAndroid = (value) => {
  const base = trimTrailingSlash(value);
  if (!base) return '';

  if (Capacitor.getPlatform() !== 'android') {
    return base;
  }

  try {
    const url = new URL(base);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      url.hostname = '10.0.2.2';
      if (url.protocol !== 'http:') {
        url.protocol = 'http:';
      }
      return trimTrailingSlash(url.toString());
    }
  } catch {
    return base.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, 'http://10.0.2.2$2');
  }

  return base;
};

const DEFAULT_LOCAL_API_BASE_URL = 'http://localhost:5005/api';
const DEFAULT_REMOTE_API_BASE_URL = 'https://test-mahila-mandal.vercel.app/api';

export const resolveApiBaseUrl = () => {
  const configured = stripAuthSuffix(import.meta.env.VITE_API_BASE_URL || '');
  const fallback = import.meta.env.DEV ? DEFAULT_LOCAL_API_BASE_URL : DEFAULT_REMOTE_API_BASE_URL;
  return translateLocalhostForAndroid(configured || fallback);
};

export const resolveAuthApiUrl = () => {
  const configured = trimTrailingSlash(import.meta.env.VITE_AUTH_API_URL || '');
  const fallback = `${resolveApiBaseUrl().replace(/\/$/, '')}/auth`;
  return translateLocalhostForAndroid(configured || fallback);
};
