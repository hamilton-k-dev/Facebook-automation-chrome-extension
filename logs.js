import { getLogs } from './storage.js';
import { showToast, confirmDialog, initTheme, toggleTheme, formatDate, escapeHtml } from './ui.js';

initTheme();

let allLogs = [];
let currentFilter = 'all';
let searchQuery = '';
let filterDate = '';
let currentPage = 1;
const PAGE_SIZE = 25;

async function loadLogs() {
  allLogs = await getLogs();
  updateStats();
  renderLogs();
}

function getFiltered() {
  return allLogs.filter(log => {
    const matchFilter = currentFilter === 'all' || log.status === currentFilter;
    const matchSearch = !searchQuery
      || log.group?.toLowerCase().includes(searchQuery.toLowerCase())
      || log.content?.toLowerCase().includes(searchQuery.toLowerCase())
      || log.message?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchDate = !filterDate || log.timestamp?.startsWith(filterDate);
    return matchFilter && matchSearch && matchDate;
  });
}

function updateStats() {
  document.getElementById('logCountTotal').textContent = allLogs.length;
  document.getElementById('logCountSuccess').textContent = allLogs.filter(l => l.status === 'success').length;
  document.getElementById('logCountErrors').textContent = allLogs.filter(l => l.status === 'error').length;
}

function renderLogs() {
  const filtered = getFiltered();
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  currentPage = Math.min(currentPage, totalPages || 1);
  const pageData = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const container = document.getElementById('logsTableContainer');
  const empty = document.getElementById('emptyLogs');

  if (filtered.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    document.getElementById('pagination').innerHTML = '';
    return;
  }
  empty.style.display = 'none';

  container.innerHTML = `
    <table class="logs-table">
      <thead><tr>
        <th>Date & Time</th>
        <th>Group</th>
        <th>Content</th>
        <th>Status</th>
        <th>Message</th>
      </tr></thead>
      <tbody>
        ${pageData.map(log => `
          <tr>
            <td style="white-space:nowrap;font-size:12px;">${formatDate(log.timestamp)}</td>
            <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(log.group)}">${escapeHtml(log.group || '—')}</td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(log.content)}">${escapeHtml(log.content || '—')}</td>
            <td><span class="badge badge-${log.status === 'success' ? 'success' : 'error'}">${log.status === 'success' ? '✅ Success' : '❌ Error'}</span></td>
            <td style="max-width:200px;font-size:12px;color:var(--text-muted);" title="${escapeHtml(log.message)}">${escapeHtml(log.message || '—')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div style="padding:10px 12px;font-size:12px;color:var(--text-muted);border-top:1px solid var(--border);">
      ${filtered.length} entry(ies) — Page ${currentPage}/${totalPages || 1}
    </div>
  `;

  const pag = document.getElementById('pagination');
  if (totalPages <= 1) { pag.innerHTML = ''; return; }

  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    pages.push(`<button class="btn btn-sm ${i === currentPage ? 'btn-primary' : 'btn-ghost'}" data-page="${i}">${i}</button>`);
  }
  pag.innerHTML = pages.join('');
  pag.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => { currentPage = parseInt(btn.dataset.page); renderLogs(); });
  });
}

document.getElementById('searchLogs').addEventListener('input', (e) => { searchQuery = e.target.value; currentPage = 1; renderLogs(); });
document.getElementById('filterDate').addEventListener('change', (e) => { filterDate = e.target.value; currentPage = 1; renderLogs(); });

document.querySelectorAll('.tab-btn[data-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn[data-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    currentPage = 1;
    renderLogs();
  });
});

document.getElementById('btnClearLogs').addEventListener('click', async () => {
  const ok = await confirmDialog(`Permanently delete all ${allLogs.length} log entries?`);
  if (!ok) return;
  await chrome.storage.local.set({ logs: [] });
  allLogs = [];
  updateStats();
  renderLogs();
  showToast('success', 'Logs cleared', '');
});

document.getElementById('btnExportLogs').addEventListener('click', () => {
  const filtered = getFiltered();
  const csv = [
    ['Date', 'Group', 'Content', 'Status', 'Message'].join(','),
    ...filtered.map(log => [
      log.timestamp,
      `"${(log.group || '').replace(/"/g, '""')}"`,
      `"${(log.content || '').replace(/"/g, '""')}"`,
      log.status,
      `"${(log.message || '').replace(/"/g, '""')}"`
    ].join(','))
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fb-publisher-logs-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('success', 'Export successful', `${filtered.length} entries exported.`);
});

document.getElementById('btnTheme').addEventListener('click', () => {
  const t = toggleTheme();
  document.getElementById('btnTheme').textContent = t === 'dark' ? '☀️' : '🌙';
});

loadLogs();
