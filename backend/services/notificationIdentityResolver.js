const toDigits = (value) => String(value || '').replace(/\D/g, '');

const isUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());

export const buildRegMemberLookupPairs = (userId) => {
  const raw = String(userId || '').trim();
  const pairs = [];
  if (!raw) return pairs;

  if (isUuid(raw)) {
    pairs.push(['members_id', raw]);
  }

  pairs.push(['Membership number', raw]);

  const digits = toDigits(raw);
  if (digits) {
    pairs.push(['mobile', digits]);
    if (digits.length > 10) pairs.push(['mobile', digits.slice(-10)]);
    if (digits.length === 10) pairs.push(['mobile', `91${digits}`]);
  }

  return pairs;
};
