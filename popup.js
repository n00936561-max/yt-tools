['ads', 'dislikes'].forEach(key => {
  const el = document.getElementById(key);
  chrome.storage.local.get({ [key]: true }, r => { el.checked = r[key]; });
  el.addEventListener('change', () => chrome.storage.local.set({ [key]: el.checked }));
});
