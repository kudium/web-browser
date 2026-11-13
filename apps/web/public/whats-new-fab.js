(() => {
  const button = document.querySelector('.whats-new-fab');
  if (!button) return;
  let idleTimer;
  window.addEventListener('scroll', () => {
    button.setAttribute('data-scrolling', '');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => button.removeAttribute('data-scrolling'), 900);
  }, { passive: true });
})();
