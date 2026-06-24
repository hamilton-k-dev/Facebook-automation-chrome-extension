import { getStats, getSettings, getContents, getGroups } from './storage.js';
import { showToast } from './ui.js';

async function loadPopup() {
  const [stats, settings, contents, groups] = await Promise.all([
    getStats(), getSettings(), getContents(), getGroups()
  ]);

  const toggle = document.getElementById('toggleEnabled');
  toggle.checked = settings.enabled;
  updateStatusUI(settings.enabled, stats.nextPost);

  toggle.addEventListener('change', async () => {
    const res = await chrome.runtime.sendMessage({ type: 'TOGGLE_AUTOMATION', enabled: toggle.checked });
    if (res?.error) {
      showToast('error', 'Error', res.error);
      toggle.checked = !toggle.checked;
    } else {
      updateStatusUI(toggle.checked, null);
      showToast(
        toggle.checked ? 'success' : 'warning',
        toggle.checked ? 'Automation enabled' : 'Automation disabled',
        toggle.checked ? 'Scheduler is now running' : 'No posts will be sent'
      );
    }
  });

  document.getElementById('statTodayPosts').textContent = stats.todayPosts || 0;
  document.getElementById('statTotalPosts').textContent = stats.totalPosts || 0;
  document.getElementById('statGroups').textContent = groups.filter(g => g.selected && !g.excluded).length;
  document.getElementById('statContents').textContent = contents.length;

  if (stats.lastPost) {
    document.getElementById('lastPostInfo').style.display = 'block';
    document.getElementById('lastPostText').textContent =
      `${stats.lastPost.groupName} — ${new Date(stats.lastPostDate).toLocaleString('en-US')}`;
  }

  if (stats.nextPost) {
    document.getElementById('nextPostTime').textContent =
      `Next: ${new Date(stats.nextPost).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  }

  document.getElementById('btnManualPost').addEventListener('click', async () => {
    const btn = document.getElementById('btnManualPost');
    btn.disabled = true;
    btn.querySelector('span:last-child').textContent = 'Posting...';
    try {
      const res = await chrome.runtime.sendMessage({ type: 'MANUAL_POST' });
      if (res?.success) {
        showToast('success', 'Success', 'Post published!');
        setTimeout(loadPopup, 1500);
      } else if (res?.skipped) {
        showToast('warning', 'Skipped', res.reason || 'No eligible group');
      } else {
        showToast('error', 'Error', res?.error || 'Post failed');
      }
    } catch (err) {
      showToast('error', 'Error', err.message);
    } finally {
      btn.disabled = false;
      btn.querySelector('span:last-child').textContent = 'Post now';
    }
  });
}

function updateStatusUI(enabled, nextPost) {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  dot.className = 'status-dot ' + (enabled ? 'active' : 'inactive');
  text.textContent = enabled ? 'Active' : 'Disabled';
  if (enabled && nextPost) {
    document.getElementById('nextPostTime').textContent =
      `Next: ${new Date(nextPost).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  }
}

loadPopup();
