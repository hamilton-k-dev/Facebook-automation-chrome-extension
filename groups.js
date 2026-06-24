import { getGroups, saveGroups } from './storage.js';
import { showToast, confirmDialog, initTheme, toggleTheme, escapeHtml } from './ui.js';

initTheme();

let allGroups = [];
let currentFilter = 'all';
let searchQuery = '';

async function loadGroups() {
  allGroups = await getGroups();
  renderGroups();
}

function renderGroups() {
  const filtered = allGroups.filter(g => {
    const matchSearch = !searchQuery || g.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchFilter = currentFilter === 'all'
      || (currentFilter === 'selected' && g.selected && !g.excluded)
      || (currentFilter === 'excluded' && g.excluded);
    return matchSearch && matchFilter;
  });

  const list = document.getElementById('groupList');
  const empty = document.getElementById('emptyGroups');
  document.getElementById('groupCountBadge').textContent = `${allGroups.length} group${allGroups.length !== 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = filtered.map(g => `
    <div class="group-item ${g.selected && !g.excluded ? 'selected' : ''} ${g.excluded ? 'excluded' : ''}" data-id="${g.id}">
      <div class="group-avatar">${g.name.charAt(0).toUpperCase()}</div>
      <div class="group-info">
        <div class="group-name">${escapeHtml(g.name)}</div>
        <div class="group-meta">
          ID: ${escapeHtml(g.id)}
          ${g.excluded ? ' • <span style="color:var(--danger)">Excluded</span>' : g.selected ? ' • <span style="color:var(--success)">Active</span>' : ' • <span style="color:var(--text-muted)">Inactive</span>'}
          ${g.postsToday ? ` • ${g.postsToday} post(s) today` : ''}
        </div>
      </div>
      <div class="group-actions">
        ${!g.excluded
          ? `<button class="btn btn-sm ${g.selected ? 'btn-ghost' : 'btn-success'} btn-toggle" data-id="${g.id}" title="${g.selected ? 'Deactivate' : 'Activate'}">
              ${g.selected ? '⏸️' : '▶️'}
            </button>`
          : ''}
        <button class="btn btn-sm ${g.excluded ? 'btn-success' : 'btn-ghost'} btn-exclude" data-id="${g.id}" title="${g.excluded ? 'Re-include' : 'Exclude'}">
          ${g.excluded ? '✅' : '🚫'}
        </button>
        <button class="btn btn-sm btn-ghost btn-delete-group" data-id="${g.id}" title="Remove">🗑️</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.btn-toggle').forEach(btn => btn.addEventListener('click', () => toggleGroup(btn.dataset.id)));
  list.querySelectorAll('.btn-exclude').forEach(btn => btn.addEventListener('click', () => excludeGroup(btn.dataset.id)));
  list.querySelectorAll('.btn-delete-group').forEach(btn => btn.addEventListener('click', () => deleteGroup(btn.dataset.id)));
}

async function toggleGroup(id) {
  const g = allGroups.find(g => g.id === id);
  if (!g) return;
  g.selected = !g.selected;
  await saveGroups(allGroups);
  renderGroups();
  showToast('success', g.selected ? 'Group activated' : 'Group deactivated', g.name);
}

async function excludeGroup(id) {
  const g = allGroups.find(g => g.id === id);
  if (!g) return;
  if (!g.excluded) {
    const ok = await confirmDialog(`Exclude "${g.name}" from all publications?`);
    if (!ok) return;
  }
  g.excluded = !g.excluded;
  if (g.excluded) g.selected = false;
  await saveGroups(allGroups);
  renderGroups();
  showToast(g.excluded ? 'warning' : 'success', g.excluded ? 'Group excluded' : 'Group re-included', g.name);
}

async function deleteGroup(id) {
  const g = allGroups.find(g => g.id === id);
  const ok = await confirmDialog(`Remove "${g?.name || id}" from the list?`);
  if (!ok) return;
  allGroups = allGroups.filter(g => g.id !== id);
  await saveGroups(allGroups);
  renderGroups();
  showToast('success', 'Removed', 'Group has been deleted from the list.');
}

// Auto-detect groups
document.getElementById('btnFetchGroups').addEventListener('click', async () => {
  document.getElementById('detectBanner').style.display = 'block';
  document.getElementById('btnFetchGroups').disabled = true;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_GROUPS_FROM_FB' });
    document.getElementById('detectBanner').style.display = 'none';
    if (res?.success && res.groups?.length > 0) {
      let newCount = 0;
      for (const g of res.groups) {
        if (!allGroups.find(existing => existing.id === g.id)) {
          allGroups.push({ ...g, selected: true, excluded: false });
          newCount++;
        }
      }
      await saveGroups(allGroups);
      renderGroups();
      showToast('success', 'Detection complete', `${newCount} new group(s) added.`);
    } else {
      showToast('warning', 'No groups found', res?.error || 'No groups detected automatically. Try adding them manually.');
    }
  } catch (err) {
    document.getElementById('detectBanner').style.display = 'none';
    showToast('error', 'Error', err.message);
  } finally {
    document.getElementById('btnFetchGroups').disabled = false;
  }
});

// Manual add
document.getElementById('btnAddManual').addEventListener('click', async () => {
  const rawId = document.getElementById('manualGroupId').value.trim();
  const name = document.getElementById('manualGroupName').value.trim();
  if (!rawId) { showToast('warning', 'Required', 'Enter a group ID or URL.'); return; }

  const match = rawId.match(/groups\/([^/?#]+)/);
  const id = match ? match[1] : rawId;
  const groupName = name || id;

  if (allGroups.find(g => g.id === id)) {
    showToast('warning', 'Already exists', 'This group is already in the list.');
    return;
  }

  allGroups.push({ id, name: groupName, url: `https://www.facebook.com/groups/${id}`, selected: true, excluded: false });
  await saveGroups(allGroups);
  document.getElementById('manualGroupId').value = '';
  document.getElementById('manualGroupName').value = '';
  renderGroups();
  showToast('success', 'Added', `${groupName} added to the list.`);
});

// Select all toggle
document.getElementById('btnSelectAll').addEventListener('click', async () => {
  const allSelected = allGroups.filter(g => !g.excluded).every(g => g.selected);
  allGroups.forEach(g => { if (!g.excluded) g.selected = !allSelected; });
  await saveGroups(allGroups);
  renderGroups();
  showToast('success', allSelected ? 'All deselected' : 'All selected', '');
});

// Search & filters
document.getElementById('searchGroups').addEventListener('input', (e) => {
  searchQuery = e.target.value;
  renderGroups();
});

document.querySelectorAll('.tab-btn[data-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn[data-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderGroups();
  });
});

document.getElementById('btnTheme').addEventListener('click', () => {
  const t = toggleTheme();
  document.getElementById('btnTheme').textContent = t === 'dark' ? '☀️' : '🌙';
});

// Listen for groups detected via content script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'GROUPS_DETECTED' && msg.groups?.length > 0) {
    let added = 0;
    msg.groups.forEach(g => {
      if (!allGroups.find(e => e.id === g.id)) {
        allGroups.push({ ...g, selected: true, excluded: false });
        added++;
      }
    });
    if (added > 0) {
      saveGroups(allGroups).then(() => {
        renderGroups();
        showToast('info', 'Groups detected', `${added} new group(s) added from Facebook.`);
      });
    }
  }
});

loadGroups();
