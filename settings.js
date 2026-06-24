import { getSettings, saveSettings, DEFAULT_SETTINGS } from './storage.js';
import { showToast, confirmDialog, initTheme, toggleTheme } from './ui.js';

initTheme();

let currentSettings = { ...DEFAULT_SETTINGS };

async function loadSettings() {
  currentSettings = await getSettings();
  applyToForm(currentSettings);
  updatePreview(currentSettings);
}

function applyToForm(s) {
  document.getElementById('settingEnabled').checked = s.enabled;
  document.getElementById('enabledLabel').textContent = s.enabled ? 'Enabled' : 'Disabled';
  document.getElementById('settingPostsPerDay').value = s.postsPerDay;
  document.getElementById('settingCooldownDays').value = s.cooldownDays;
  document.getElementById('settingDelayMin').value = s.delayMin;
  document.getElementById('settingDelayMax').value = s.delayMax;
  document.getElementById('settingStartHour').value = s.startHour;
  document.getElementById('settingEndHour').value = s.endHour;
  document.getElementById('settingPageMode').checked = s.pageMode || false;
  document.getElementById('settingPageName').value = s.pageName || '';
  document.getElementById('settingPageId').value = s.pageId || '';
  togglePageFields(s.pageMode);
}

function togglePageFields(enabled) {
  document.getElementById('pageFields').style.display = enabled ? 'block' : 'none';
  document.getElementById('pageModeLabel').textContent = enabled
    ? '✅ Enabled (will post as Page)'
    : 'Disabled (personal profile)';
}

function readFromForm() {
  return {
    enabled: document.getElementById('settingEnabled').checked,
    postsPerDay: parseInt(document.getElementById('settingPostsPerDay').value) || 1,
    cooldownDays: parseInt(document.getElementById('settingCooldownDays').value) || 1,
    delayMin: parseInt(document.getElementById('settingDelayMin').value) || 20,
    delayMax: parseInt(document.getElementById('settingDelayMax').value) || 40,
    startHour: parseInt(document.getElementById('settingStartHour').value) || 8,
    endHour: parseInt(document.getElementById('settingEndHour').value) || 22,
    pageMode: document.getElementById('settingPageMode').checked,
    pageName: document.getElementById('settingPageName').value.trim(),
    pageId: document.getElementById('settingPageId').value.trim(),
  };
}

function updatePreview(s) {
  const pad = n => String(n).padStart(2, '0');
  document.getElementById('settingsPreview').innerHTML = `
    <div>📅 <strong>${s.postsPerDay}</strong> post(s) per day per group</div>
    <div>⏱️ Random delay between <strong>${s.delayMin}</strong> and <strong>${s.delayMax}</strong> minutes</div>
    <div>🕐 Active hours: <strong>${pad(s.startHour)}:00</strong> – <strong>${pad(s.endHour)}:00</strong></div>
    <div>🔄 Repeat cooldown: <strong>${s.cooldownDays}</strong> day(s)</div>
    <div>⚡ Automation: <strong>${s.enabled ? '✅ Enabled' : '❌ Disabled'}</strong></div>
    <div>📄 Account: <strong>${s.pageMode && s.pageName ? `Page "${s.pageName}"` : 'Personal profile'}</strong></div>
  `;
}

document.getElementById('settingPageMode').addEventListener('change', (e) => {
  togglePageFields(e.target.checked);
  updatePreview(readFromForm());
});

['settingEnabled','settingPostsPerDay','settingCooldownDays','settingDelayMin','settingDelayMax','settingStartHour','settingEndHour','settingPageName','settingPageId'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    const s = readFromForm();
    updatePreview(s);
    if (id === 'settingEnabled') {
      document.getElementById('enabledLabel').textContent = s.enabled ? 'Enabled' : 'Disabled';
    }
  });
  document.getElementById(id).addEventListener('change', () => updatePreview(readFromForm()));
});

document.getElementById('btnSaveSettings').addEventListener('click', async () => {
  const s = readFromForm();
  if (s.delayMin > s.delayMax) {
    showToast('warning', 'Validation error', 'Minimum delay must be less than maximum delay.');
    return;
  }
  if (s.startHour >= s.endHour) {
    showToast('warning', 'Validation error', 'Start hour must be before end hour.');
    return;
  }
  if (s.pageMode && (!s.pageName || !s.pageId)) {
    showToast('warning', 'Missing page info', 'Please fill in both the Page name AND ID/username, or disable Page mode.');
    return;
  }
  await saveSettings(s);
  await chrome.runtime.sendMessage({ type: s.enabled ? 'RESCHEDULE' : 'STOP_SCHEDULER' });
  currentSettings = s;
  showToast('success', 'Settings saved', 'Configuration has been updated.');
});

document.getElementById('btnResetSettings').addEventListener('click', async () => {
  const ok = await confirmDialog('Reset all settings to default values?');
  if (!ok) return;
  await saveSettings({ ...DEFAULT_SETTINGS });
  applyToForm(DEFAULT_SETTINGS);
  updatePreview(DEFAULT_SETTINGS);
  showToast('success', 'Reset complete', 'Settings have been restored to defaults.');
});

document.getElementById('btnClearLogs').addEventListener('click', async () => {
  const ok = await confirmDialog('Permanently delete all activity logs?');
  if (!ok) return;
  await chrome.storage.local.set({ logs: [] });
  showToast('success', 'Logs cleared', 'All logs have been deleted.');
});

document.getElementById('btnClearHistory').addEventListener('click', async () => {
  const ok = await confirmDialog('Delete post history? All counters will be reset to zero.');
  if (!ok) return;
  await chrome.storage.local.set({ postHistory: {}, stats: null });
  showToast('success', 'History cleared', 'Post history has been reset.');
});

document.getElementById('btnTheme').addEventListener('click', () => {
  const t = toggleTheme();
  document.getElementById('btnTheme').textContent = t === 'dark' ? '☀️' : '🌙';
});

loadSettings();
