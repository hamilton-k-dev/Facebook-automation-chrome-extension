// Service Worker — main extension entry point

import { runAutoPost } from './poster.js';
import { scheduleNextPost, stopScheduler, ALARM_NAME } from './scheduler.js';
import { getSettings, saveSettings, addLog } from './storage.js';

chrome.runtime.onInstalled.addListener(async () => {
  console.log('[BG] Extension installed/updated');
  const settings = await getSettings();
  if (settings.enabled) {
    await scheduleNextPost();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('[BG] Browser started');
  const settings = await getSettings();
  if (settings.enabled) {
    await scheduleNextPost();
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  console.log('[BG] Alarm fired, attempting post...');

  try {
    const result = await runAutoPost();
    console.log('[BG] Post result:', result);
  } catch (err) {
    console.error('[BG] Post error:', err);
    await addLog({
      group: 'System',
      groupId: null,
      content: '',
      contentId: null,
      status: 'error',
      message: `System error: ${err.message}`
    });
  }

  const settings = await getSettings();
  if (settings.enabled) {
    await scheduleNextPost();
  }
});

// Handle messages from extension UI pages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(err => {
    sendResponse({ error: err.message });
  });
  return true; // keep channel open for async responses
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case 'GET_GROUPS_FROM_FB':
      return await fetchGroupsFromFacebook();

    case 'TOGGLE_AUTOMATION':
      return await toggleAutomation(message.enabled);

    case 'MANUAL_POST':
      return await runAutoPost();

    case 'RESCHEDULE':
      const settings = await getSettings();
      if (settings.enabled) {
        const next = await scheduleNextPost();
        return { success: true, nextPost: next?.toISOString() };
      }
      return { success: true, nextPost: null };

    case 'STOP_SCHEDULER':
      await stopScheduler();
      return { success: true };

    default:
      return { error: 'Unknown message type' };
  }
}

async function toggleAutomation(enabled) {
  const settings = await getSettings();
  settings.enabled = enabled;
  await saveSettings(settings);

  if (enabled) {
    await scheduleNextPost();
  } else {
    await stopScheduler();
  }
  return { success: true, enabled };
}

async function fetchGroupsFromFacebook() {
  try {
    const tab = await chrome.tabs.create({
      url: 'https://www.facebook.com/groups/feed/',
      active: false
    });

    await waitForTabLoad(tab.id);
    await sleep(3000);

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractGroupsFromPage
    });

    await chrome.tabs.remove(tab.id);

    const groups = results?.[0]?.result || [];
    return { success: true, groups };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Injected into the FB page — runs in page context
function extractGroupsFromPage() {
  const groups = [];
  const seen = new Set();

  document.querySelectorAll('a[href*="/groups/"]').forEach(link => {
    const href = link.href || '';
    const match = href.match(/facebook\.com\/groups\/([^/?#]+)/);
    if (match) {
      const groupId = match[1];
      if (!seen.has(groupId) && !/^(feed|discover|create|joins|membership)$/.test(groupId)) {
        seen.add(groupId);
        const nameEl = link.querySelector('[dir="auto"]') || link;
        const name = nameEl.textContent?.trim() || groupId;
        if (name && name.length > 1) {
          groups.push({ id: groupId, name, url: `https://www.facebook.com/groups/${groupId}` });
        }
      }
    }
  });

  return groups;
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(resolve, 15000);
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
