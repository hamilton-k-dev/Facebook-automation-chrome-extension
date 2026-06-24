import { getContents, saveContent, deleteContent } from './storage.js';
import { showToast, confirmDialog, initTheme, toggleTheme, escapeHtml } from './ui.js';

initTheme();

let editingId = null;
let currentImageData = null;

async function loadContents() {
  const contents = await getContents();
  const list = document.getElementById('contentList');
  const empty = document.getElementById('emptyContents');
  const count = document.getElementById('contentCount');
  const addBtn = document.getElementById('btnAddContent');

  count.textContent = `${contents.length}/5`;
  addBtn.disabled = contents.length >= 5;

  if (contents.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = contents.map(c => `
    <div class="content-item" data-id="${c.id}">
      <div class="content-item-thumb">
        ${c.imageData
          ? `<img src="${c.imageData}" style="width:60px;height:60px;object-fit:cover;border-radius:6px;" alt="">`
          : '🖼️'}
      </div>
      <div class="content-item-body">
        <div class="content-item-text">${escapeHtml(c.text)}</div>
        <div class="content-item-actions">
          <button class="btn btn-ghost btn-sm btn-edit" data-id="${c.id}">✏️ Edit</button>
          <button class="btn btn-danger btn-sm btn-delete" data-id="${c.id}">🗑️ Delete</button>
        </div>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.btn-edit').forEach(btn => btn.addEventListener('click', () => openEditModal(btn.dataset.id, contents)));
  list.querySelectorAll('.btn-delete').forEach(btn => btn.addEventListener('click', () => handleDelete(btn.dataset.id)));
}

function openModal() {
  document.getElementById('contentModal').style.display = 'flex';
}

function closeModalFn() {
  document.getElementById('contentModal').style.display = 'none';
  editingId = null;
  currentImageData = null;
  document.getElementById('contentText').value = '';
  document.getElementById('imagePreview').style.display = 'none';
  document.getElementById('imagePrompt').style.display = 'block';
  document.getElementById('removeImage').style.display = 'none';
  document.getElementById('modalTitle').textContent = 'New content';
  document.getElementById('charCount').textContent = '0 characters';
}

function openEditModal(id, contents) {
  const content = contents.find(c => c.id === id);
  if (!content) return;
  editingId = id;
  currentImageData = content.imageData || null;
  document.getElementById('contentText').value = content.text || '';
  document.getElementById('charCount').textContent = `${(content.text || '').length} characters`;
  document.getElementById('modalTitle').textContent = 'Edit content';
  if (content.imageData) {
    document.getElementById('imagePreview').src = content.imageData;
    document.getElementById('imagePreview').style.display = 'block';
    document.getElementById('imagePrompt').style.display = 'none';
    document.getElementById('removeImage').style.display = 'inline-flex';
  }
  openModal();
}

async function handleDelete(id) {
  const ok = await confirmDialog('Delete this content?');
  if (!ok) return;
  await deleteContent(id);
  showToast('success', 'Deleted', 'Content has been removed.');
  loadContents();
}

document.getElementById('btnAddContent').addEventListener('click', () => { editingId = null; openModal(); });
document.getElementById('btnAddContentEmpty')?.addEventListener('click', () => { editingId = null; openModal(); });
document.getElementById('closeModal').addEventListener('click', closeModalFn);
document.getElementById('cancelContent').addEventListener('click', closeModalFn);

document.getElementById('contentText').addEventListener('input', (e) => {
  document.getElementById('charCount').textContent = `${e.target.value.length} characters`;
});

document.getElementById('saveContent').addEventListener('click', async () => {
  const text = document.getElementById('contentText').value.trim();
  if (!text) { showToast('warning', 'Required', 'Post text is required.'); return; }

  try {
    await saveContent({ id: editingId, text, imageData: currentImageData });
    showToast('success', 'Saved', 'Content has been saved.');
    closeModalFn();
    loadContents();
  } catch (err) {
    showToast('error', 'Error', err.message);
  }
});

const uploadArea = document.getElementById('imageUploadArea');
const imageInput = document.getElementById('imageInput');

uploadArea.addEventListener('click', () => imageInput.click());
uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) processImageFile(file);
});

imageInput.addEventListener('change', (e) => {
  if (e.target.files[0]) processImageFile(e.target.files[0]);
});

function processImageFile(file) {
  if (!file.type.startsWith('image/')) { showToast('error', 'Invalid format', 'Please select an image file.'); return; }
  if (file.size > 5 * 1024 * 1024) { showToast('error', 'Too large', 'Maximum file size is 5 MB.'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    currentImageData = e.target.result;
    document.getElementById('imagePreview').src = currentImageData;
    document.getElementById('imagePreview').style.display = 'block';
    document.getElementById('imagePrompt').style.display = 'none';
    document.getElementById('removeImage').style.display = 'inline-flex';
  };
  reader.readAsDataURL(file);
}

document.getElementById('removeImage').addEventListener('click', (e) => {
  e.stopPropagation();
  currentImageData = null;
  document.getElementById('imagePreview').style.display = 'none';
  document.getElementById('imagePrompt').style.display = 'block';
  document.getElementById('removeImage').style.display = 'none';
});

document.getElementById('btnTheme').addEventListener('click', () => {
  const t = toggleTheme();
  document.getElementById('btnTheme').textContent = t === 'dark' ? '☀️' : '🌙';
});

loadContents();
