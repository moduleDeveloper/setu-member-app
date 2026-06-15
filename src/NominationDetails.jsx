import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, FileText, ShieldCheck, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppTheme } from './context/ThemeContext';
import { applyOpacity } from './utils/colorUtils';
import { getFamilyMembers } from './services/api';
import { supabase } from './services/supabaseClient';

const resolveInitialMemberships = () => {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.hospital_memberships) ? parsed.hospital_memberships : [];
  } catch {
    return [];
  }
};

const normalizeId = (value) => String(value || '').trim();
const NominationDetails = ({ onNavigateBack }) => {
  const theme = useAppTheme();
  const navigate = useNavigate();
  const [memberships, setMemberships] = useState(() => resolveInitialMemberships());
  const [selectedTrustId, setSelectedTrustId] = useState(() => normalizeId(localStorage.getItem('selected_trust_id')));
  const [familyMembers, setFamilyMembers] = useState([]);
  const [nominations, setNominations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [nominationForm, setNominationForm] = useState({ family_member_id: '' });
  const [message, setMessage] = useState({ type: '', text: '' });
  const [contextIds, setContextIds] = useState({ memberId: '', regId: '' });
  const [replaceDialog, setReplaceDialog] = useState({
    open: false,
    familyMemberId: '',
    currentNomineeName: '',
    nextNomineeName: '',
  });

  const nominatedFamilyIds = useMemo(
    () => new Set(nominations.map((row) => normalizeId(row?.family_member_id)).filter(Boolean)),
    [nominations]
  );

  const selectedNominee = useMemo(
    () => familyMembers.find((member) => normalizeId(member?.id) === normalizeId(nominationForm.family_member_id)) || null,
    [familyMembers, nominationForm.family_member_id]
  );

  const resolveMemberContext = async (trustId, membershipRows = memberships) => {
    let memberId = '';
    let regId = '';

    try {
      const raw = localStorage.getItem('user');
      const parsed = raw ? JSON.parse(raw) : null;
      const memberFromUser = normalizeId(parsed?.members_id || parsed?.member_id || parsed?.id);
      const match = (membershipRows || []).find((item) => normalizeId(item?.trust_id) === trustId);

      memberId = normalizeId(match?.members_id || memberFromUser);
      regId = normalizeId(match?.id || '');

      if (!regId && trustId && memberId) {
        const { data } = await supabase
          .from('reg_members')
          .select('id')
          .eq('trust_id', trustId)
          .eq('members_id', memberId)
          .limit(1);
        regId = normalizeId(data?.[0]?.id || '');
      }
    } catch {
      memberId = '';
      regId = '';
    }

    return { memberId, regId };
  };

  const loadAll = async (trustId) => {
    const normalizedTrustId = normalizeId(trustId);
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const nextMemberships = resolveInitialMemberships();
      setMemberships(nextMemberships);

      const [{ members }, ids] = await Promise.all([
        getFamilyMembers(),
        resolveMemberContext(normalizedTrustId, nextMemberships),
      ]);

      setContextIds(ids);
      const family = Array.isArray(members) ? members : [];
      setFamilyMembers(family);

      if (!normalizedTrustId || !ids.memberId) {
        setNominations([]);
        return;
      }

      if (!ids.regId) {
        setNominations([]);
        return;
      }

      const { data, error } = await supabase
        .from('member_nominations')
        .select('id, family_member_id, reg_id')
        .eq('reg_id', ids.regId);

      if (error) throw error;
      setNominations(Array.isArray(data) ? data : []);
    } catch (error) {
      setNominations([]);
      setFamilyMembers([]);
      setMessage({ type: 'error', text: error?.message || 'Unable to load nomination details.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedTrustId) return;
    loadAll(selectedTrustId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrustId]);

  useEffect(() => {
    const syncSelectedTrust = () => {
      const nextTrustId = normalizeId(localStorage.getItem('selected_trust_id'));
      if (nextTrustId && nextTrustId !== selectedTrustId) {
        setSelectedTrustId(nextTrustId);
      }
    };

    window.addEventListener('storage', syncSelectedTrust);
    window.addEventListener('trust-changed', syncSelectedTrust);
    return () => {
      window.removeEventListener('storage', syncSelectedTrust);
      window.removeEventListener('trust-changed', syncSelectedTrust);
    };
  }, [selectedTrustId]);

  const refreshNominations = async () => {
    if (!selectedTrustId || !contextIds.regId) return;
    const { data, error } = await supabase
      .from('member_nominations')
      .select('id, family_member_id, reg_id')
      .eq('reg_id', contextIds.regId);
    if (error) throw error;
    setNominations(Array.isArray(data) ? data : []);
  };

  const assignNominee = async (familyMemberId) => {
    if (!selectedTrustId || !contextIds.regId) {
      setMessage({ type: 'error', text: 'Member context missing for selected trust.' });
      return;
    }
    const lockKey = `${familyMemberId}:assign`;
    setSavingKey(lockKey);
    setMessage({ type: '', text: '' });
    try {
      const alreadyNominated = nominations.some(
        (row) => normalizeId(row?.family_member_id) === normalizeId(familyMemberId)
      );
      if (alreadyNominated) {
        setMessage({ type: 'success', text: 'This member is already nominated.' });
        return;
      }

      const payload = {
        reg_id: contextIds.regId,
        family_member_id: familyMemberId,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('member_nominations').insert(payload);
      if (error) throw error;
      await refreshNominations();
      setNominationForm({ family_member_id: '' });
      setMessage({ type: 'success', text: 'Nominee saved successfully.' });
    } catch (error) {
      setMessage({ type: 'error', text: error?.message || 'Unable to update nominee.' });
    } finally {
      setSavingKey('');
    }
  };

  const handleSaveNominee = async () => {
    const familyId = normalizeId(nominationForm.family_member_id);
    if (!familyId) {
      setMessage({ type: 'error', text: 'Please select a family member for nomination.' });
      return;
    }

    const currentNomination = nominations[0] || null;
    const currentNomineeId = normalizeId(currentNomination?.family_member_id);

    if (!currentNomineeId) {
      await assignNominee(familyId);
      return;
    }

    if (currentNomineeId === familyId) {
      setMessage({ type: 'success', text: 'This member is already nominated.' });
      return;
    }

    const currentNominee = familyMembers.find((member) => normalizeId(member?.id) === currentNomineeId);
    const nextNominee = familyMembers.find((member) => normalizeId(member?.id) === familyId);
    setReplaceDialog({
      open: true,
      familyMemberId: familyId,
      currentNomineeName: currentNominee?.name || 'Current nominee',
      nextNomineeName: nextNominee?.name || 'Selected member',
    });
  };

  const confirmReplaceNominee = async () => {
    const familyId = normalizeId(replaceDialog.familyMemberId);
    if (!familyId) return;

    setReplaceDialog((prev) => ({ ...prev, open: false }));
    const currentNomination = nominations[0] || null;
    const currentNominationId = normalizeId(currentNomination?.id);
    if (currentNominationId) {
      await revokeNominee(currentNomination.family_member_id);
    }
    await assignNominee(familyId);
    setNominationForm({ family_member_id: '' });
  };

  const revokeNominee = async (familyMemberId) => {
    if (!selectedTrustId || !contextIds.regId) return;
    const lockKey = `${familyMemberId}:revoke`;
    setSavingKey(lockKey);
    setMessage({ type: '', text: '' });
    try {
      const targetIds = nominations
        .filter((row) => normalizeId(row?.family_member_id) === normalizeId(familyMemberId))
        .map((row) => row.id)
        .filter(Boolean);

      if (targetIds.length === 0) {
        setMessage({ type: 'error', text: 'Selected member is not a nominee.' });
        return;
      }

      const { error } = await supabase
        .from('member_nominations')
        .delete()
        .in('id', targetIds);
      if (error) throw error;
      await refreshNominations();
      setMessage({ type: 'success', text: 'Nomination removed.' });
    } catch (error) {
      setMessage({ type: 'error', text: error?.message || 'Unable to remove nomination.' });
    } finally {
      setSavingKey('');
    }
  };

  const submitNominationForm = async () => {
    await handleSaveNominee();
  };

  return (
    <div
      className="min-h-screen pb-8"
      style={{
        background: 'var(--page-bg, var(--app-page-bg))',
        color: 'var(--body-text-color)',
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
              Nomination
            </p>
            <h1 className="text-lg font-extrabold truncate" style={{ color: 'var(--navbar-text)' }}>
              Nomination Details
            </h1>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 space-y-4">
        <div
          className="rounded-2xl p-4 space-y-3"
          style={{
            background: 'color-mix(in srgb, var(--surface-color) 90%, var(--app-page-bg))',
            border: `1px solid ${applyOpacity(theme.primary, 0.1)}`,
          }}
        >
          <p className="text-sm font-extrabold tracking-wide" style={{ color: 'var(--heading-color)' }}>
            Assign Nominee
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <select
              value={nominationForm.family_member_id}
              onChange={(e) => {
                const nextValue = normalizeId(e.target.value);
                if (nextValue === '__add_family_member__') {
                  navigate('/my-family', { state: { returnTo: '/nomination-details' } });
                  return;
                }
                setNominationForm((prev) => ({ ...prev, family_member_id: nextValue }));
              }}
              className="sm:col-span-2 h-10 rounded-xl px-3 border bg-transparent min-w-0"
              style={{ borderColor: applyOpacity(theme.primary, 0.16) }}
            >
              <option value="">Select Family Member</option>
              <option value="__add_family_member__">+ Add Family Member</option>
              {familyMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name || 'Unnamed Member'}
                </option>
              ))}
            </select>
          </div>
          {selectedNominee ? (
            <div
              className="rounded-2xl p-4"
              style={{
                background: 'var(--surface-color)',
                border: `1px solid ${applyOpacity(theme.primary, 0.1)}`,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-base truncate" style={{ color: 'var(--heading-color)' }}>
                    {selectedNominee?.name || 'Unnamed Member'}
                  </p>
                  <p className="text-sm mt-0.5" style={{ color: 'color-mix(in srgb, var(--body-text-color) 60%, var(--surface-color))' }}>
                    {[selectedNominee?.relation, selectedNominee?.gender].filter(Boolean).join(' | ') || 'Family Member'}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'color-mix(in srgb, var(--body-text-color) 58%, var(--surface-color))' }}>
                    {[selectedNominee?.age ? `Age ${selectedNominee.age}` : '', selectedNominee?.blood_group ? `Blood ${selectedNominee.blood_group}` : ''].filter(Boolean).join(' | ')}
                  </p>
                  <p className="text-xs mt-1 break-words" style={{ color: 'color-mix(in srgb, var(--body-text-color) 58%, var(--surface-color))' }}>
                    {[selectedNominee?.contact_no || '', selectedNominee?.email || '', selectedNominee?.address || ''].filter(Boolean).join(' | ')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={Boolean(savingKey)}
                onClick={submitNominationForm}
                className="mt-3 w-full h-10 rounded-xl text-sm font-bold active:scale-95 transition-all disabled:opacity-60"
                style={{ color: 'var(--surface-color)', background: 'linear-gradient(135deg, var(--brand-red) 0%, var(--brand-red-dark) 45%, var(--brand-navy) 100%)' }}
              >
                Save Nominee
              </button>
            </div>
          ) : null}
        </div>

        {message.text ? (
          <div
            className="rounded-xl px-3 py-2 text-sm font-medium"
            style={{
              background: message.type === 'error'
                ? 'color-mix(in srgb, var(--brand-red) 14%, var(--surface-color))'
                : 'color-mix(in srgb, var(--brand-navy) 16%, var(--surface-color))',
              color: message.type === 'error' ? 'var(--brand-red-dark)' : 'var(--brand-navy)',
            }}
          >
            {message.text}
          </div>
        ) : null}

        {replaceDialog.open ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
            <div
              className="absolute inset-0"
              style={{ background: 'rgba(15, 23, 42, 0.45)' }}
              onClick={() => setReplaceDialog({ open: false, familyMemberId: '', currentNomineeName: '', nextNomineeName: '' })}
            />
            <div
              className="relative w-full max-w-sm rounded-2xl p-5 shadow-2xl"
              style={{ background: 'var(--surface-color)', border: `1px solid ${applyOpacity(theme.primary, 0.12)}` }}
            >
              <p className="text-sm font-bold uppercase tracking-[0.18em]" style={{ color: theme.primary }}>
                Nominee Limit
              </p>
              <h3 className="mt-2 text-lg font-extrabold" style={{ color: 'var(--heading-color)' }}>
                You can create only one nominee
              </h3>
              <p className="mt-2 text-sm" style={{ color: 'var(--body-text-color)' }}>
                Replace <strong>{replaceDialog.currentNomineeName}</strong> with <strong>{replaceDialog.nextNomineeName}</strong>?
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setReplaceDialog({ open: false, familyMemberId: '', currentNomineeName: '', nextNomineeName: '' })}
                  className="h-10 rounded-xl text-sm font-bold"
                  style={{ background: 'color-mix(in srgb, var(--body-text-color) 8%, var(--surface-color))', color: 'var(--body-text-color)' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmReplaceNominee}
                  className="h-10 rounded-xl text-sm font-bold"
                  style={{ background: 'linear-gradient(135deg, var(--brand-red) 0%, var(--brand-red-dark) 45%, var(--brand-navy) 100%)', color: 'var(--surface-color)' }}
                >
                  Replace
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="py-16 text-center">
            <div
              className="w-10 h-10 mx-auto rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: theme.primary, borderTopColor: 'transparent' }}
            />
            <p className="mt-3 text-sm font-semibold">Loading nominations...</p>
          </div>
        ) : nominations.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{
              background: 'color-mix(in srgb, var(--surface-color) 90%, var(--app-page-bg))',
              border: `1px solid ${applyOpacity(theme.primary, 0.1)}`,
            }}
          >
            <FileText className="h-8 w-8 mx-auto mb-2" style={{ color: theme.primary }} />
            <p className="font-semibold">No nominees selected.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {familyMembers.filter((member) => nominatedFamilyIds.has(normalizeId(member?.id))).map((member) => {
              const familyId = normalizeId(member?.id);

              return (
                <div
                  key={familyId}
                  className="relative rounded-2xl p-4 pr-12"
                  style={{
                    background: 'var(--surface-color)',
                    border: `1px solid ${applyOpacity(theme.primary, 0.1)}`,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      const confirmed = window.confirm('Do you want to remove this nominee?');
                      if (confirmed) revokeNominee(familyId);
                    }}
                    disabled={Boolean(savingKey)}
                    className="absolute top-3 right-3 w-7 h-7 rounded-full inline-flex items-center justify-center disabled:opacity-60"
                    style={{
                      color: 'var(--brand-red-dark)',
                      background: 'color-mix(in srgb, var(--brand-red) 12%, var(--surface-color))',
                    }}
                    aria-label="Remove nominee"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <div className="min-w-0">
                    <p className="font-semibold text-base truncate" style={{ color: 'var(--heading-color)' }}>
                      {member?.name || 'Unnamed Member'}
                    </p>
                    <p className="text-sm mt-0.5" style={{ color: 'color-mix(in srgb, var(--body-text-color) 60%, var(--surface-color))' }}>
                      {[member?.relation, member?.gender].filter(Boolean).join(' | ') || 'Family Member'}
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'color-mix(in srgb, var(--body-text-color) 58%, var(--surface-color))' }}>
                      {[member?.age ? `Age ${member.age}` : '', member?.blood_group ? `Blood ${member.blood_group}` : ''].filter(Boolean).join(' | ')}
                    </p>
                    <p className="text-xs mt-1 break-words" style={{ color: 'color-mix(in srgb, var(--body-text-color) 58%, var(--surface-color))' }}>
                      {[member?.contact_no || '', member?.email || '', member?.address || ''].filter(Boolean).join(' | ')}
                    </p>
                  </div>
                  <div className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full"
                    style={{ color: 'var(--brand-navy)', background: applyOpacity(theme.primary, 0.12) }}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Nominee
                  </div>

                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
};

export default NominationDetails;
