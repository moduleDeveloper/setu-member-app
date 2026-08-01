import { api } from './api.js';
import { getUserHospitalMemberships } from '../utils/storageUtils.js';

const ORDER_HISTORY_STORAGE_KEYS = ['order_history_v1', 'order_history', 'orders_v1'];
const DEFAULT_TRUST_CACHE_KEY = 'default_trust_cache';
const SELECTED_TRUST_ID_KEY = 'selected_trust_id';
const SELECTED_TRUST_NAME_KEY = 'selected_trust_name';
const LAST_SELECTED_TRUST_ID_KEY = 'last_selected_trust_id';
const ALLOWED_PURCHASE_STATUSES = new Set([
  'order payment pending',
  'order payment done',
  'cancelled',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeText = (value) => {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  if (!text) return '';
  const lowered = text.toLowerCase();
  return ['null', 'undefined', 'nan'].includes(lowered) ? '' : text;
};

const normalizeStatusKey = (value = '') =>
  normalizeText(value)
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isUuid = (value) => UUID_RE.test(String(value || '').trim());

const safeParse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const clearOrderHistoryCache = () => {
  if (typeof window === 'undefined') return;

  ORDER_HISTORY_STORAGE_KEYS.forEach((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore storage failures
    }
  });
};

const readStoredTrustContext = (key, nameKey = null) => {
  if (typeof window === 'undefined') {
    return { id: '', name: '' };
  }

  const id = normalizeText(window.localStorage.getItem(key));
  const name = nameKey ? normalizeText(window.localStorage.getItem(nameKey)) : '';
  return { id, name };
};

const readDefaultTrustContext = () => {
  if (typeof window !== 'undefined') {
    const parsedDefault = safeParse(window.localStorage.getItem(DEFAULT_TRUST_CACHE_KEY) || '');
    const id = normalizeText(parsedDefault?.id);
    const name = normalizeText(parsedDefault?.name);
    if (id) {
      return { id, name: name || null };
    }
  }

  return {
    id: normalizeText(import.meta.env.VITE_DEFAULT_TRUST_ID || ''),
    name: normalizeText(import.meta.env.VITE_DEFAULT_TRUST_NAME || '') || null,
  };
};

export const resolveOrderHistoryTrustScope = () => {
  const defaultTrust = readDefaultTrustContext();
  const selectedTrust = readStoredTrustContext(SELECTED_TRUST_ID_KEY, SELECTED_TRUST_NAME_KEY);
  const persistedSelected = readStoredTrustContext(LAST_SELECTED_TRUST_ID_KEY);

  const selectedTrustId =
    selectedTrust.id
    || persistedSelected.id
    || defaultTrust.id
    || normalizeText(import.meta.env.VITE_DEFAULT_TRUST_ID || '');

  const defaultTrustId = defaultTrust.id || normalizeText(import.meta.env.VITE_DEFAULT_TRUST_ID || '');
  const isDefaultTrustSelected = Boolean(
    selectedTrustId
    && defaultTrustId
    && selectedTrustId.toLowerCase() === defaultTrustId.toLowerCase()
  );
  const selectedTrustName = selectedTrust.name || (isDefaultTrustSelected
    ? (defaultTrust.name || normalizeText(import.meta.env.VITE_DEFAULT_TRUST_NAME || '') || null)
    : null);

  return {
    selectedTrustId,
    selectedTrustName,
    defaultTrustId,
    defaultTrustName: defaultTrust.name || null,
    isDefaultTrustSelected,
  };
};

const readStoredUser = () => {
  if (typeof window === 'undefined') return {};

  const parsed = safeParse(window.localStorage.getItem('user') || '');
  return parsed && typeof parsed === 'object' ? parsed : {};
};

const extractOrderRows = (value) => {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];

  if (Array.isArray(value.orders)) return value.orders;
  if (Array.isArray(value.history)) return value.history;
  if (Array.isArray(value.items)) return value.items;
  if (Array.isArray(value.purchases)) return value.purchases;
  if (Array.isArray(value.rows)) return value.rows;
  if (Array.isArray(value.data)) return value.data;
  if (Array.isArray(value.result)) return value.result;

  return [];
};

const normalizeTrustContext = (trustId, trustName = null) => {
  const normalizedTrustId = normalizeText(trustId);
  if (!normalizedTrustId) return null;

  return {
    trustId: normalizedTrustId,
    trustName: normalizeText(trustName) || null,
  };
};

export const resolveOrderHistoryTrustContexts = (user = null, trustScope = resolveOrderHistoryTrustScope()) => {
  const resolvedUser = user && typeof user === 'object' ? user : {};
  const trustContexts = [];
  const seenTrustIds = new Set();
  const resolvedScope = trustScope && typeof trustScope === 'object'
    ? trustScope
    : resolveOrderHistoryTrustScope();
  const selectedTrustId = normalizeText(resolvedScope.selectedTrustId);

  const addTrust = (trustId, trustName = null) => {
    const context = normalizeTrustContext(trustId, trustName);
    if (!context) return;
    const key = context.trustId.toLowerCase();
    if (seenTrustIds.has(key)) return;
    seenTrustIds.add(key);
    trustContexts.push(context);
  };

  const memberships = getUserHospitalMemberships(resolvedUser);
  if (resolvedScope.isDefaultTrustSelected) {
    memberships.forEach((membership) => {
      addTrust(membership?.trust_id || membership?.trust?.id, membership?.trust_name || membership?.trust?.name);
    });

    addTrust(resolvedUser?.primary_trust?.id, resolvedUser?.primary_trust?.name);
    addTrust(resolvedUser?.trust?.id, resolvedUser?.trust?.name);
    addTrust(resolvedScope.selectedTrustId, resolvedScope.selectedTrustName);
  } else if (selectedTrustId) {
    const matchingMembership = memberships.find((membership) => {
      const membershipTrustId = normalizeText(membership?.trust_id || membership?.trust?.id);
      return membershipTrustId && membershipTrustId.toLowerCase() === selectedTrustId.toLowerCase();
    });

    addTrust(
      selectedTrustId,
      matchingMembership?.trust_name
      || matchingMembership?.trust?.name
      || resolvedScope.selectedTrustName
    );
  }

  return trustContexts;
};

export const resolveOrderHistoryMemberId = (user = null) => {
  const resolvedUser = user && typeof user === 'object' ? user : {};
  const candidates = [];

  const pushCandidate = (value) => {
    const text = normalizeText(value);
    if (text) candidates.push(text);
  };

  pushCandidate(resolvedUser?.member_uuid);
  pushCandidate(resolvedUser?.members_uuid);
  pushCandidate(resolvedUser?.members_id);
  pushCandidate(resolvedUser?.member_id);

  if (Array.isArray(resolvedUser?.member_ids)) {
    resolvedUser.member_ids.forEach(pushCandidate);
  }

  const memberships = getUserHospitalMemberships(resolvedUser);
  memberships.forEach((membership) => {
    pushCandidate(membership?.member_uuid);
    pushCandidate(membership?.members_uuid);
    pushCandidate(membership?.members_id);
    pushCandidate(membership?.member_id);
  });

  pushCandidate(resolvedUser?.id);

  return candidates.find(isUuid) || '';
};

export const shouldIncludePurchaseRow = (row = {}) => {
  if (!row || typeof row !== 'object') return false;

  const statusKey = normalizeStatusKey(
    row.status
    || row.order_status
    || row.state
    || row.payment_status
    || row.type
  );

  if (!statusKey) return false;
  return ALLOWED_PURCHASE_STATUSES.has(statusKey);
};

const getOrderIdentityKey = (row = {}) => {
  const trustId = normalizeText(
    row?.trust_id
    || row?.trustId
    || row?.source_trust_id
    || row?.sourceTrustId
  );
  const orderId = normalizeText(
    row?.order_id
    || row?.orderId
    || row?.invoice_no
    || row?.invoice_number
    || row?.reference
    || row?.id
  );

  return `${trustId.toLowerCase() || 'global'}::${orderId.toLowerCase() || 'unknown'}`;
};

const dedupeOrderRows = (rows = []) => {
  const seen = new Set();
  const deduped = [];

  rows.forEach((row) => {
    if (!row || typeof row !== 'object') return;
    const key = getOrderIdentityKey(row);
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(row);
  });

  return deduped;
};

const extractRpcPayloadRows = (data) => {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];

  if (data.success === false) return extractOrderRows(data);

  return extractOrderRows(data);
};

export const fetchOrdersForTrust = async ({ memberId, trustId, trustName = null }) => {
  const normalizedMemberId = normalizeText(memberId);
  const normalizedTrustId = normalizeText(trustId);
  if (!normalizedMemberId || !normalizedTrustId) return [];

  const response = await api.post('/order-history/purchases', {
    p_member_id: normalizedMemberId,
    p_trust_id: normalizedTrustId,
    p_action: 'get',
    p_payload: {},
  });

  const data = response?.data || {};
  if (data && typeof data === 'object' && data.success === false) {
    throw new Error(normalizeText(data.message) || `Failed to load order history for trust ${normalizedTrustId}`);
  }

  const rows = extractRpcPayloadRows(data);
  return rows
    .filter(shouldIncludePurchaseRow)
    .map((row) => {
      const resolvedTrustId = normalizeText(row?.trust_id || row?.trustId) || normalizedTrustId;
      const resolvedTrustName = normalizeText(row?.trust_name || row?.trustName || trustName) || null;

      return {
        ...row,
        trust_id: resolvedTrustId,
        trust_name: resolvedTrustName,
        source: normalizeText(row?.source || row?.sourceType || row?.source_type) || 'backend',
        source_trust_id: normalizedTrustId,
        source_trust_name: resolvedTrustName,
      };
    });
};

export const loadOrderHistorySnapshot = async ({ user = null } = {}) => {
  clearOrderHistoryCache();
  const resolvedUser = user && typeof user === 'object' ? user : readStoredUser();
  const trustScope = resolveOrderHistoryTrustScope();
  const memberId = resolveOrderHistoryMemberId(resolvedUser);
  const trustContexts = resolveOrderHistoryTrustContexts(resolvedUser, trustScope);

  if (!memberId || trustContexts.length === 0) {
    return {
      rows: [],
      localRows: [],
      remoteRows: [],
      trustContexts,
      trustErrors: memberId ? [] : [{
        trustId: null,
        trustName: null,
        message: 'Missing member identifier for remote order history',
      }],
      memberId,
      hasRemoteOrders: false,
    };
  }

  const settledResults = await Promise.allSettled(
    trustContexts.map((trustContext) =>
      fetchOrdersForTrust({
        memberId,
        trustId: trustContext.trustId,
        trustName: trustContext.trustName,
      })
    )
  );

  const remoteRows = [];
  const trustErrors = [];

  settledResults.forEach((result, index) => {
    const trustContext = trustContexts[index] || {};
    if (result.status === 'fulfilled') {
      remoteRows.push(...result.value);
      return;
    }

    trustErrors.push({
      trustId: trustContext.trustId || null,
      trustName: trustContext.trustName || trustContext.trustId || null,
      message: normalizeText(result.reason?.message) || 'Failed to load order history for one trust',
    });
  });

  return {
    rows: dedupeOrderRows(remoteRows),
    localRows: [],
    remoteRows,
    trustContexts,
    trustErrors,
    memberId,
    hasRemoteOrders: remoteRows.length > 0,
  };
};
