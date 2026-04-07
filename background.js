// Fetch dislike counts on behalf of the content script
// (avoids any content-script fetch restrictions)
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type !== 'getDislikes') return false;

  fetch('https://returnyoutubedislike.com/api/votes?videoId=' + msg.videoId)
    .then(r => r.json())
    .then(d => reply({ ok: true, count: d.dislikes ?? null }))
    .catch(() => reply({ ok: false, count: null }));

  return true; // keep message channel open for async reply
});
