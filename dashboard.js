import { getStats, getSettings, getContents, getGroups, getLogs } from './storage.js';
import { showToast, formatDate, initTheme, toggleTheme } from './ui.js';

initTheme();

async function loadDashboard() {
  const [stats, settings, contents, groups, logs] = await Promise.all([
    getStats(), getSettings(), getContents(), getGroups(), getLogs()
  ]);

  const activeGroups = groups.filter(g => g.selected && !g.excluded);
  const excludedGroups = groups.filter(g => g.excluded);

  document.getElementById('statTotalGroups').textContent = groups.length;
  document.getElementById('statActiveGroups').textContent = activeGroups.length;
  document.getElementById('statExcludedGroups').textContent = excludedGroups.length;
  document.getElementById('statTodayPosts').textContent = stats.todayPosts || 0;
  document.getElementById('statTotalPosts').textContent = stats.totalPosts || 0;
  document.getElementById('statContents').textContent = contents.length;

  const dot = document.getElementById('bigStatusDot');
  const text = document.getElementById('bigStatusText');
  dot.className = 'status-dot ' + (settings.enabled ? 'active' : 'inactive');
  text.textContent = settings.enabled ? '🟢 Active' : '⚫ Disabled';

  document.getElementById('nextPostDisplay').textContent =
    stats.nextPost ? formatDate(stats.nextPost) : '—';
  document.getElementById('lastPostDisplay').textContent =
    stats.lastPostDate ? `${stats.lastPost?.groupName || ''} — ${formatDate(stats.lastPostDate)}` : '—';

  const toggle = document.getElementById('sidebarToggle');
  toggle.checked = settings.enabled;
  document.getElementById('sidebarToggleText').textContent = settings.enabled ? 'Active' : 'Disabled';

  toggle.addEventListener('change', async () => {
    await chrome.runtime.sendMessage({ type: 'TOGGLE_AUTOMATION', enabled: toggle.checked });
    document.getElementById('sidebarToggleText').textContent = toggle.checked ? 'Active' : 'Disabled';
    dot.className = 'status-dot ' + (toggle.checked ? 'active' : 'inactive');
    text.textContent = toggle.checked ? '🟢 Active' : '⚫ Disabled';
    showToast(toggle.checked ? 'success' : 'warning',
      toggle.checked ? 'Automation enabled' : 'Automation disabled', '');
  });

  document.getElementById('settingsSummary').innerHTML = `
    <div class="form-group">
      <span class="form-label">Posts per day per group</span>
      <span style="font-weight:600">${settings.postsPerDay}</span>
    </div>
    <div class="form-group">
      <span class="form-label">Delay between posts</span>
      <span style="font-weight:600">${settings.delayMin}–${settings.delayMax} min</span>
    </div>
    <div class="form-group">
      <span class="form-label">Active hours</span>
      <span style="font-weight:600">${String(settings.startHour).padStart(2,'0')}:00 – ${String(settings.endHour).padStart(2,'0')}:00</span>
    </div>
    <div class="form-group">
      <span class="form-label">Repeat cooldown</span>
      <span style="font-weight:600">${settings.cooldownDays} day(s)</span>
    </div>
  `;

  const logsContainer = document.getElementById('recentLogs');
  const recent = logs.slice(0, 8);
  if (recent.length === 0) {
    logsContainer.innerHTML = '<div class="empty-state"><div class="empty-state-text">No recent activity</div></div>';
  } else {
    logsContainer.innerHTML = `
      <table class="logs-table">
        <thead><tr>
          <th>Date</th><th>Group</th><th>Content</th><th>Status</th>
        </tr></thead>
        <tbody>
          ${recent.map(log => `
            <tr>
              <td style="white-space:nowrap">${formatDate(log.timestamp)}</td>
              <td>${escHtml(log.group)}</td>
              <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(log.content)}</td>
              <td><span class="badge badge-${log.status === 'success' ? 'success' : 'error'}">${log.status === 'success' ? '✅ Success' : '❌ Error'}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
}

document.getElementById('btnManualPost').addEventListener('click', async () => {
  const btn = document.getElementById('btnManualPost');
  btn.disabled = true; btn.textContent = '⏳ Posting...';
  try {
    const res = await chrome.runtime.sendMessage({ type: 'MANUAL_POST' });
    if (res?.success) { showToast('success', 'Success', 'Post published!'); setTimeout(loadDashboard, 1500); }
    else if (res?.skipped) showToast('warning', 'Skipped', res.reason || 'No eligible group');
    else showToast('error', 'Error', res?.error || 'Post failed');
  } finally {
    btn.disabled = false; btn.textContent = '🚀 Post now';
  }
});

document.getElementById('btnTheme').addEventListener('click', () => {
  const t = toggleTheme();
  document.getElementById('btnTheme').textContent = t === 'dark' ? '☀️' : '🌙';
});

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

loadDashboard();
