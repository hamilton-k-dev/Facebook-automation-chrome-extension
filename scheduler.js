// Scheduler — manages post scheduling via chrome.alarms

import {
  getSettings,
  getContents,
  getGroups,
  getGroupPostsToday,
  getLastContentForGroup,
  updateNextPost,
  getStats
} from './storage.js';

export const ALARM_NAME = 'fb-auto-post';

export async function scheduleNextPost() {
  const settings = await getSettings();
  if (!settings.enabled) return;

  const now = new Date();
  const nextTime = await computeNextPostTime(settings, now);
  if (!nextTime) return;

  await chrome.alarms.clear(ALARM_NAME);
  await chrome.alarms.create(ALARM_NAME, { when: nextTime.getTime() });
  await updateNextPost(nextTime.toISOString());

  console.log('[Scheduler] Next post scheduled:', nextTime.toLocaleString());
  return nextTime;
}

async function computeNextPostTime(settings, from) {
  const { startHour, endHour, delayMin, delayMax } = settings;
  const now = from || new Date();

  // Pick a random delay in minutes
  const delayMinutes = delayMin + Math.floor(Math.random() * (delayMax - delayMin + 1));
  let candidate = new Date(now.getTime() + delayMinutes * 60 * 1000);

  // If outside the allowed window, shift to the next window start
  const candidateHour = candidate.getHours() + candidate.getMinutes() / 60;
  if (candidateHour < startHour) {
    candidate.setHours(startHour, Math.floor(Math.random() * 30), 0, 0);
  } else if (candidateHour >= endHour) {
    // Push to next morning
    candidate.setDate(candidate.getDate() + 1);
    candidate.setHours(startHour, Math.floor(Math.random() * 30), 0, 0);
  }

  return candidate;
}

export async function getEligibleGroup(settings) {
  const groups = await getGroups();
  const activeGroups = groups.filter(g => g.selected && !g.excluded);

  const eligible = [];
  for (const group of activeGroups) {
    const postsToday = await getGroupPostsToday(group.id);
    if (postsToday < settings.postsPerDay) {
      eligible.push(group);
    }
  }

  if (eligible.length === 0) return null;
  return eligible[Math.floor(Math.random() * eligible.length)];
}

export async function getRandomContent(groupId, settings) {
  const contents = await getContents();
  if (contents.length === 0) return null;

  const lastPost = await getLastContentForGroup(groupId);
  if (!lastPost || contents.length === 1) {
    return contents[Math.floor(Math.random() * contents.length)];
  }

  // Avoid reusing the same content in the same group if alternatives exist
  const others = contents.filter(c => c.id !== lastPost.contentId);
  const pool = others.length > 0 ? others : contents;
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function shouldPost() {
  const settings = await getSettings();
  if (!settings.enabled) return false;

  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  if (hour < settings.startHour || hour >= settings.endHour) return false;

  const group = await getEligibleGroup(settings);
  return group !== null;
}

export async function stopScheduler() {
  await chrome.alarms.clear(ALARM_NAME);
  await updateNextPost(null);
}
