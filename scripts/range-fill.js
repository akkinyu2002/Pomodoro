document.addEventListener('DOMContentLoaded', () => {
  const range = document.querySelector('#volumeControl');
  if (!range) return;

  function update() {
    const val = Number(range.value || 0);
    range.style.setProperty('--range-percent', val + '%');
  }

  range.addEventListener('input', update, { passive: true });
  update();
});
