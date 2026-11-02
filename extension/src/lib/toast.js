export function createToast(element, {
  duration = 1500,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  actionDuration = 6000,
  doc = globalThis.document,
} = {}) {
  let hideTimer = null;

  const hide = () => {
    if (hideTimer) clearTimer(hideTimer);
    hideTimer = null;
    element.classList?.remove('is-visible');
    element.classList?.remove('has-action');
    element.textContent = '';
  };

  return (message, { action = null } = {}) => {
    if (!element || !message) return;
    if (hideTimer) clearTimer(hideTimer);
    element.textContent = message;
    element.classList?.add('is-visible');
    element.classList?.[action ? 'add' : 'remove']('has-action');
    if (action) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'app-toast-action';
      button.textContent = action.label;
      button.addEventListener('click', () => { hide(); action.onClick(); });
      element.append(button);
    }
    hideTimer = setTimer(hide, action ? actionDuration : duration);
  };
}
