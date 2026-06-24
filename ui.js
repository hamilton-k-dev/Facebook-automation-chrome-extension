// Shared UI utilities — toasts, modals, theme

export function showToast(type, title, message, duration = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <div class="toast-body">
      <div class="toast-title">${escapeHtml(title)}</div>
      ${message ? `<div class="toast-message">${escapeHtml(message)}</div>` : ''}
    </div>
    <button onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--text-muted);margin-left:8px;">×</button>
  `;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

export function openModal(html) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal">${html}</div>`;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  return overlay;
}

export function closeModal() {
  document.querySelector('.modal-overlay')?.remove();
}

export function formatDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleString('en-US', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function initTheme() {
  const saved = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  return saved;
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  return next;
}

export function confirmDialog(message) {
  return new Promise((resolve) => {
    const overlay = openModal(`
      <div class="modal-header">
        <h3 class="modal-title">Confirm</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
      </div>
      <p style="margin-bottom:20px;">${escapeHtml(message)}</p>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="confirmNo">Cancel</button>
        <button class="btn btn-danger" id="confirmYes">Confirm</button>
      </div>
    `);
    overlay.querySelector('#confirmYes').onclick = () => { overlay.remove(); resolve(true); };
    overlay.querySelector('#confirmNo').onclick = () => { overlay.remove(); resolve(false); };
  });
}
