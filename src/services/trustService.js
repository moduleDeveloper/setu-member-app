import { supabase } from './supabaseClient';

export const fetchMemberTrusts = async (membersId) => {
  if (!membersId) return [];

  const { data: regMembershipsRaw, error: regError } = await supabase
    .from('reg_members')
    .select('id, trust_id, "Membership number", role, joined_date, is_active, members_id')
    .eq('members_id', membersId);

  if (regError) {
    console.warn('Error fetching from reg_members:', regError);
  }

  const regMemberships = Array.isArray(regMembershipsRaw) ? regMembershipsRaw : [];

  const trustIds = Array.from(new Set(regMemberships.map((m) => m.trust_id).filter(Boolean)));

  if (trustIds.length === 0) return [];

  // Fetch trust details for all trust IDs
  const { data: trusts, error: trustError } = await supabase
    .from('Trust')
    .select('id,name,icon_url,remark,created_at,version')
    .in('id', trustIds);

  if (trustError) {
    console.warn('Error fetching trust details:', trustError);
  }

  const trustById = (trusts || []).reduce((acc, t) => {
    acc[t.id] = t;
    return acc;
  }, {});

  const mappedTrusts = regMemberships.map((m) => {
    const t = trustById[m.trust_id] || {};
    return {
      id: m.trust_id || null,
      name: t.name || null,
      icon_url: t.icon_url || null,
      remark: t.remark || null,
      is_active: m.is_active,
      membership_number: m['Membership number'] || null,
      role: m.role || null,
      members_id: m.members_id || null,
      source: 'reg_members'
    };
  });

  return mappedTrusts;
};

const normalizeText = (value) => String(value || '').trim();

const mapMembershipRowsWithTrusts = (regMemberships = [], trustById = {}) =>
  regMemberships.map((m, index) => {
    const trustId = m?.trust_id || null;
    const trust = trustById[trustId] || {};
    return {
      id: m?.id || `membership-${index}`,
      trust_id: trustId,
      trust_name: trust?.name || null,
      trust_icon_url: trust?.icon_url || null,
      trust_remark: trust?.remark || null,
      is_active: m?.is_active,
      membership_number: m?.['Membership number'] || null,
      role: m?.role || null,
      members_id: m?.members_id || null,
      source: 'reg_members'
    };
  });

export const fetchMemberTrustMemberships = async ({ membersId = null, membershipNumber = '' } = {}) => {
  const normalizedMembersId = normalizeText(membersId);
  const normalizedMembershipNo = normalizeText(membershipNumber);

  if (!normalizedMembersId && !normalizedMembershipNo) return [];

  let regMemberships = [];

  if (normalizedMembersId) {
    const { data, error } = await supabase
      .from('reg_members')
      .select('id, trust_id, "Membership number", role, joined_date, is_active, members_id')
      .eq('members_id', normalizedMembersId);

    if (error) {
      console.warn('Error fetching member trusts by members_id:', error);
    } else if (Array.isArray(data)) {
      regMemberships = [...data];
    }
  }

  if (normalizedMembershipNo) {
    let membershipNoQuery = supabase
      .from('reg_members')
      .select('id, trust_id, "Membership number", role, joined_date, is_active, members_id')
      .eq('Membership number', normalizedMembershipNo);

    // Critical guard:
    // If members_id is known for selected account, never pull rows of another person
    // who happens to share/reuse the same membership number across trusts.
    if (normalizedMembersId) {
      membershipNoQuery = membershipNoQuery.eq('members_id', normalizedMembersId);
    }

    const { data, error } = await membershipNoQuery;

    if (error) {
      console.warn('Error fetching member trusts by membership number:', error);
    } else if (Array.isArray(data) && data.length > 0) {
      const seen = new Set(regMemberships.map((row) => String(row?.id || '')));
      data.forEach((row) => {
        const key = String(row?.id || '');
        if (!seen.has(key)) {
          seen.add(key);
          regMemberships.push(row);
        }
      });
    }
  }

  const trustIds = Array.from(new Set(regMemberships.map((m) => m?.trust_id).filter(Boolean)));
  if (trustIds.length === 0) return [];

  const { data: trusts, error: trustError } = await supabase
    .from('Trust')
    .select('id,name,icon_url,remark,created_at,version')
    .in('id', trustIds);

  if (trustError) {
    console.warn('Error fetching trust details for memberships:', trustError);
  }

  const trustById = (Array.isArray(trusts) ? trusts : []).reduce((acc, trust) => {
    acc[trust.id] = trust;
    return acc;
  }, {});

  const mapped = mapMembershipRowsWithTrusts(regMemberships, trustById);

  const deduped = [];
  const dedupeSet = new Set();
  mapped.forEach((membership) => {
    const dedupeKey = [
      normalizeText(membership?.trust_id).toLowerCase(),
      normalizeText(membership?.membership_number).toLowerCase(),
      normalizeText(membership?.members_id).toLowerCase()
    ].join('|');

    if (dedupeSet.has(dedupeKey)) return;
    dedupeSet.add(dedupeKey);
    deduped.push(membership);
  });

  deduped.sort((a, b) => {
    const activeDiff = Number(Boolean(b?.is_active)) - Number(Boolean(a?.is_active));
    if (activeDiff !== 0) return activeDiff;
    return String(a?.trust_name || '').localeCompare(String(b?.trust_name || ''));
  });

  return deduped;
};

export const fetchAllTrusts = async () => {
  const { data, error } = await supabase
    .from('Trust')
    .select('id,name,icon_url,remark,template_id,created_at,version')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
};

export const fetchDefaultTrust = async (preferredTrustId) => {
  let query = supabase
    .from('Trust')
    .select('id,name,icon_url,remark,legal_name,terms_content,privacy_content,template_id,created_at,version')
    .limit(1);

  if (preferredTrustId) {
    query = query.eq('id', preferredTrustId);
  } else {
    query = query.order('created_at', { ascending: false });
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  if (Array.isArray(data)) {
    return data[0] || null;
  }

  return data || null;
};

export const fetchTrustByName = async (name) => {
  if (!name) return null;
  const { data, error } = await supabase
    .from('Trust')
    .select('id,name,icon_url,remark,legal_name,terms_content,privacy_content,template_id,created_at,version')
    .eq('name', name)
    .limit(1);

  if (error) {
    throw error;
  }

  if (Array.isArray(data)) {
    return data[0] || null;
  }

  return data || null;
};

export const fetchTrustById = async (id) => {
  if (!id) return null;
  const { data, error } = await supabase
    .from('Trust')
    .select('id,name,icon_url,remark,legal_name,terms_content,privacy_content,template_id,created_at,version')
    .eq('id', id)
    .limit(1);

  if (error) {
    throw error;
  }

  if (Array.isArray(data)) {
    return data[0] || null;
  }

  return data || null;
};

export const fetchShareAppLinksByTrustId = async (trustId) => {
  const normalizedTrustId = String(trustId || '').trim();
  if (!normalizedTrustId) return null;

  const { data, error } = await supabase
    .from('shareApp_links')
    .select('trust_id, play_store_link, app_store_link, instagram_link, facebook_link, whatsapp_link, linkedin_link, version')
    .eq('trust_id', normalizedTrustId)
    .maybeSingle();

  if (error) {
    console.warn('Error fetching share app links:', error);
    return null;
  }

  return data || null;
};

export const fetchTemplatesForTrust = async (trustId) => {
  if (!trustId) return [];

  const query = supabase
    .from('app_templates')
    .select('id, trust_id, name, template_key, updated_at')
    .eq('trust_id', trustId)
    .order('updated_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  return Array.isArray(data) ? data : [];
};

export const updateTrustTemplateLink = async ({ trustId, templateId }) => {
  if (!trustId) throw new Error('trustId is required');
  if (!templateId) throw new Error('templateId is required');

  const { data, error } = await supabase
    .from('Trust')
    .update({ template_id: templateId })
    .eq('id', trustId)
    .select('id, name, template_id')
    .maybeSingle();

  if (error) throw error;
  return data || null;
};
