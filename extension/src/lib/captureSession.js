/**
 * When Application details is open.
 * A job-tab change must not reopen it. Save, Later, and Clear close it.
 */
export function nextShowCapture(event, { captureComplete = false, showCapture = false } = {}) {
  switch (event) {
    case 'profile-loaded':
      return !captureComplete;
    case 'resume-uploaded':
      return true;
    case 'saved':
    case 'later':
    case 'cleared':
      return false;
    case 'edit':
      return true;
    case 'tab-changed':
      return showCapture;
    default:
      return showCapture;
  }
}
