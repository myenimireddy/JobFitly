export const FILL_MODES = Object.freeze({
  REQUIRED_ONLY: 'required-only',
  ALL: 'all',
});

export function requiredStatusOf(field = {}) {
  if (['required', 'optional', 'unknown'].includes(field.requiredStatus)) {
    return field.requiredStatus;
  }
  if (field.required === true) return 'required';
  return 'unknown';
}

export function selectFieldsForMode(fields = [], mode = FILL_MODES.REQUIRED_ONLY) {
  const normalized = fields.map((field) => {
    const requiredStatus = requiredStatusOf(field);
    return {
      ...field,
      required: requiredStatus === 'required',
      requiredStatus,
      requiredEvidence: Array.isArray(field.requiredEvidence) ? field.requiredEvidence : [],
    };
  });
  const optionalSkipped = mode === FILL_MODES.REQUIRED_ONLY
    ? normalized.filter((field) => field.requiredStatus === 'optional').length
    : 0;
  const selected = mode === FILL_MODES.REQUIRED_ONLY
    ? normalized.filter((field) => field.requiredStatus !== 'optional')
    : normalized;
  return {
    fields: selected,
    stats: {
      detected: normalized.length,
      required: normalized.filter((field) => field.requiredStatus === 'required').length,
      optional: normalized.filter((field) => field.requiredStatus === 'optional').length,
      unknown: normalized.filter((field) => field.requiredStatus === 'unknown').length,
      optionalSkipped,
    },
  };
}
