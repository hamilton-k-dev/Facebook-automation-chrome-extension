// Content Script — runs on all Facebook pages

(function () {
  'use strict';

  // Respond to pings from the service worker
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'PING') {
      sendResponse({ alive: true, url: window.location.href });
    }
    return true;
  });

  // Observe DOM mutations to passively detect groups the user visits
  const groupObserver = new MutationObserver(debounce(() => {
    const groups = extractVisibleGroups();
    if (groups.length > 0) {
      chrome.runtime.sendMessage({ type: 'GROUPS_DETECTED', groups }).catch(() => {});
    }
  }, 2000));

  groupObserver.observe(document.body, { childList: true, subtree: true });

  function extractVisibleGroups() {
    const groups = [];
    const seen = new Set();
    document.querySelectorAll('a[href*="/groups/"]').forEach(link => {
      const match = link.href?.match(/facebook\.com\/groups\/([^/?#]+)/);
      if (match) {
        const id = match[1];
        if (!seen.has(id) && !/^(feed|discover|create|joins|membership)$/.test(id)) {
          seen.add(id);
          const name = link.querySelector('[dir="auto"]')?.textContent?.trim() || link.textContent?.trim() || id;
          if (name && name.length > 1) groups.push({ id, name });
        }
      }
    });
    return groups;
  }

  function debounce(fn, delay) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
  }
})();
