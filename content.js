(function () {
  // ── Ad skipper ────────────────────────────────────────────────────────────
  const RATE = 16;
  const SKIP_SELS = ['.ytp-skip-ad-button','.ytp-ad-skip-button','.ytp-ad-skip-button-modern','.ytp-ad-skip-button-slot button'];
  let adActive = false, savedRate = 1;

  setInterval(() => {
    const v = document.querySelector('video');
    if (!v) return;
    if (document.querySelector('.ad-showing')) {
      if (!adActive) { adActive = true; savedRate = v.playbackRate || 1; v.muted = true; }
      v.playbackRate = RATE;
      for (const s of SKIP_SELS) { const b = document.querySelector(s); if (b) { b.click(); break; } }
    } else if (adActive) { adActive = false; v.playbackRate = savedRate; v.muted = false; }
  }, 300);

  // ── Dislike counter ───────────────────────────────────────────────────────
  let lastId = null;
  let busy = false;

  function fmt(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toLocaleString();
  }

  function findDislikeBtn() {
    return (
      document.querySelector('#dislike-button button') ||
      document.querySelector('#segmented-dislike-button button') ||
      (() => { for (const b of document.querySelectorAll('button')) { if ((b.getAttribute('aria-label')||'').toLowerCase().includes('dislike')) return b; } })()
    );
  }

  function inject(count) {
    document.getElementById('ryd-count')?.remove();

    const dislikeBtn = findDislikeBtn();
    if (!dislikeBtn) return false;

    // Try to clone the like button text container for native YT styling
    const likeTextDiv = document.querySelector(
      '.yt-spec-button-shape-next__button-text-content'
    );

    if (likeTextDiv) {
      // Remove any existing text content from dislike button
      dislikeBtn.querySelectorAll('.yt-spec-button-shape-next__button-text-content').forEach(e => e.remove());
      // Switch from icon-only to icon+text
      dislikeBtn.classList.remove('yt-spec-button-shape-next--icon-button');
      dislikeBtn.classList.add('yt-spec-button-shape-next--icon-leading');
      const clone = likeTextDiv.cloneNode(true);
      clone.id = 'ryd-count';
      (clone.querySelector('span[role="text"]') || clone.querySelector('span') || clone).textContent = fmt(count);
      dislikeBtn.appendChild(clone);
    } else {
      // Fallback: insert count after the dislike button's outer container
      const outer =
        dislikeBtn.closest('ytd-toggle-button-renderer') ||
        dislikeBtn.closest('like-button-view-model') ||
        dislikeBtn.closest('yt-button-shape') ||
        dislikeBtn.parentElement;

      const span = document.createElement('span');
      span.id = 'ryd-count';
      span.style.cssText = `
        color: var(--yt-spec-text-primary, #fff);
        font-size: 1.4rem;
        font-weight: 500;
        margin-left: 4px;
        align-self: center;
        display: inline-flex;
        align-items: center;
      `;
      span.textContent = fmt(count);
      outer.insertAdjacentElement('afterend', span);
    }

    return true;
  }

  async function run(videoId) {
    if (busy) return;
    busy = true;

    let count = null;
    try {
      const res = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'getDislikes', videoId }, r => {
          if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
          resolve(r);
        });
      });
      count = res?.ok ? res.count : null;
    } catch { busy = false; return; }

    if (count === null) { busy = false; return; }

    // Retry injection until the button is in the DOM
    let tries = 0;
    const poll = setInterval(() => {
      if (tries++ > 40) { clearInterval(poll); busy = false; return; }
      if (inject(count)) { clearInterval(poll); busy = false; }
    }, 500);
  }

  setInterval(() => {
    const id = new URLSearchParams(location.search).get('v');
    if (id && id !== lastId) {
      lastId = id;
      busy = false;
      document.getElementById('ryd-count')?.remove();
      run(id);
    }
  }, 1000);
})();
