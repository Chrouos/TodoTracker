export function createToast(element, {
  duration = 1500,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  let hideTimer = null;

  return (message) => {
    if (!element || !message) return;
    if (hideTimer) clearTimer(hideTimer);
    element.textContent = message;
    element.classList?.add('is-visible');
    hideTimer = setTimer(() => {
      element.classList?.remove('is-visible');
      element.textContent = '';
      hideTimer = null;
    }, duration);
  };
}
