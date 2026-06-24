// Storage module — centralises all chrome.storage.local operations

export const KEYS = {
  CONTENTS: 'contents',
  GROUPS: 'groups',
  SETTINGS: 'settings',
  LOGS: 'logs',
  STATS: 'stats',
  POST_HISTORY: 'postHistory',
  SCHEDULER_STATE: 'schedulerState'
};

export const DEFAULT_SETTINGS = {
  enabled: false,
  postsPerDay: 1,
  delayMin: 20,
  delayMax: 40,
  startHour: 8,
  endHour: 22,
  cooldownDays: 1,
  // Facebook Page (optional)
  pageMode: false,
  pageId: '',    // numeric ID or Page username
  pageName: ''   // display name (used for UI and account switching)
};

export async function get(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => resolve(result[key]));
  });
}

export async function set(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

export async function getAll() {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, resolve);
  });
}

// Contents (max 5)
export async function getContents() {
  const contents = await get(KEYS.CONTENTS);
  return contents || [];
}

export async function saveContent(content) {
  const contents = await getContents();
  const existing = contents.findIndex(c => c.id === content.id);
  if (existing >= 0) {
    contents[existing] = content;
  } else {
    if (contents.length >= 5) throw new Error('Maximum of 5 contents allowed');
    contents.push({ ...content, id: Date.now().toString() });
  }
  await set(KEYS.CONTENTS, contents);
  return contents;
}

export async function deleteContent(id) {
  const contents = await getContents();
  await set(KEYS.CONTENTS, contents.filter(c => c.id !== id));
}

// Groups
export async function getGroups() {
  const groups = await get(KEYS.GROUPS);
  return groups || [];
}

export async function saveGroups(groups) {
  await set(KEYS.GROUPS, groups);
}

export async function updateGroupStatus(groupId, status) {
  const groups = await getGroups();
  const idx = groups.findIndex(g => g.id === groupId);
  if (idx >= 0) {
    groups[idx] = { ...groups[idx], ...status };
    await set(KEYS.GROUPS, groups);
  }
}

// Settings
export async function getSettings() {
  const settings = await get(KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...settings };
}

export async function saveSettings(settings) {
  await set(KEYS.SETTINGS, settings);
}

// Logs
export async function getLogs() {
  const logs = await get(KEYS.LOGS);
  return logs || [];
}

export async function addLog(entry) {
  const logs = await getLogs();
  logs.unshift({
    ...entry,
    timestamp: new Date().toISOString(),
    id: Date.now().toString()
  });
  // Keep max 500 entries (FIFO)
  if (logs.length > 500) logs.splice(500);
  await set(KEYS.LOGS, logs);
}

// Statistics
export async function getStats() {
  const stats = await get(KEYS.STATS);
  return stats || {
    totalPosts: 0,
    todayPosts: 0,
    lastPostDate: null,
    lastPost: null,
    nextPost: null
  };
}

export async function incrementStats(postInfo) {
  const stats = await getStats();
  const today = new Date().toDateString();
  const todayPosts = stats.lastResetDate === today ? stats.todayPosts + 1 : 1;
  await set(KEYS.STATS, {
    ...stats,
    totalPosts: (stats.totalPosts || 0) + 1,
    todayPosts,
    lastResetDate: today,
    lastPost: postInfo,
    lastPostDate: new Date().toISOString()
  });
}

export async function updateNextPost(nextTime) {
  const stats = await getStats();
  await set(KEYS.STATS, { ...stats, nextPost: nextTime });
}

// Per-group post history
export async function getPostHistory() {
  const history = await get(KEYS.POST_HISTORY);
  return history || {};
}

export async function recordGroupPost(groupId, contentId) {
  const history = await getPostHistory();
  if (!history[groupId]) history[groupId] = [];
  history[groupId].push({
    contentId,
    timestamp: new Date().toISOString(),
    date: new Date().toDateString()
  });
  // Keep max 30 entries per group
  if (history[groupId].length > 30) history[groupId].splice(0, history[groupId].length - 30);
  await set(KEYS.POST_HISTORY, history);
}

export async function getGroupPostsToday(groupId) {
  const history = await getPostHistory();
  const groupHistory = history[groupId] || [];
  const today = new Date().toDateString();
  return groupHistory.filter(h => h.date === today).length;
}

export async function getLastContentForGroup(groupId) {
  const history = await getPostHistory();
  const groupHistory = history[groupId] || [];
  return groupHistory.length > 0 ? groupHistory[groupHistory.length - 1] : null;
}
