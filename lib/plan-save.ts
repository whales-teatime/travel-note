/** Authentication must use the saved credentials, regardless of draft permissions. */
export function planAuthPayload(viewPassword: string, editPassword: string) {
  return {
    ...(viewPassword ? { passwordAuth: viewPassword } : {}),
    ...(editPassword ? { editPasswordAuth: editPassword } : {}),
  };
}

/** A slow save response must never roll back edits made after submission. */
export function reconcileSavedSettings<T extends { title: string }>(current: T, submitted: T, saved: T): T {
  if (current === submitted) return saved;
  if (saved.title !== submitted.title && current.title === submitted.title) return { ...current, title: saved.title };
  return current;
}

export function validTripDates(start: string, end: string) {
  const valid = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  return valid(start) && valid(end) && start <= end && Date.parse(end) - Date.parse(start) <= 366 * 86400000;
}
