// ============================================================
// API Client (replaces Electron's window.api)
// ============================================================
const api = {
  async listImages() {
    const res = await fetch('/api/images');
    const data = await res.json();
    return data.images || [];
  },

  getImageUrl(id) {
    return `/api/images/${id}`;
  },

  getThumbUrl(id) {
    return `/api/images/${id}/thumb`;
  },

  async readTags(imageId) {
    const res = await fetch(`/api/images/${imageId}/tags`);
    const data = await res.json();
    return data.tags || [];
  },

  async saveTags(imageId, tags) {
    await fetch(`/api/images/${imageId}/tags`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags }),
    });
  },

  async getAllTags() {
    const res = await fetch('/api/tags');
    const data = await res.json();
    return data.tags || [];
  },

  async uploadImage(file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    return res.json();
  },

  async deleteImage(id) {
    await fetch(`/api/images/${id}`, { method: 'DELETE' });
  },
};

// ============================================================
// State
// ============================================================
let imageList = []; // [{ id, filename, thumbUrl, ... }]
let currentIndex = -1;
let currentTags = [];
let allTags = [];
let saveTimeout = null;

// ============================================================
// DOM Elements
// ============================================================
const fileListEl = document.getElementById('file-list');
const imagePreview = document.getElementById('image-preview');
const imagePlaceholder = document.getElementById('image-placeholder');
const imageInfo = document.getElementById('image-info');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const currentTagsEl = document.getElementById('current-tags');
const tagInput = document.getElementById('tag-input');
const allTagsEl = document.getElementById('all-tags');
const allTagsSearch = document.getElementById('all-tags-search');
const uploadInput = document.getElementById('upload-input');

// Mobile panel toggle buttons
const btnToggleFiles = document.getElementById('btn-toggle-files');
const btnToggleTags = document.getElementById('btn-toggle-tags');
const sidebarLeft = document.getElementById('sidebar-left');
const sidebarRight = document.getElementById('sidebar-right');
const overlay = document.getElementById('mobile-overlay');

// ============================================================
// Mobile Panel Toggling
// ============================================================
function closePanels() {
  sidebarLeft.classList.remove('open');
  sidebarRight.classList.remove('open');
  overlay.classList.remove('visible');
}

if (btnToggleFiles) {
  btnToggleFiles.addEventListener('click', () => {
    const isOpen = sidebarLeft.classList.contains('open');
    closePanels();
    if (!isOpen) {
      sidebarLeft.classList.add('open');
      overlay.classList.add('visible');
    }
  });
}

if (btnToggleTags) {
  btnToggleTags.addEventListener('click', () => {
    const isOpen = sidebarRight.classList.contains('open');
    closePanels();
    if (!isOpen) {
      sidebarRight.classList.add('open');
      overlay.classList.add('visible');
    }
  });
}

if (overlay) {
  overlay.addEventListener('click', closePanels);
}

// ============================================================
// Initialization
// ============================================================
async function init() {
  imageList = await api.listImages();
  allTags = await api.getAllTags();
  renderFileList();
  renderAllTags();
  if (imageList.length > 0) {
    selectImage(0);
  }
}

// ============================================================
// File List (Left Sidebar)
// ============================================================
function renderFileList() {
  fileListEl.innerHTML = '';
  imageList.forEach((img, index) => {
    const div = document.createElement('div');
    div.className = 'file-item' + (index === currentIndex ? ' active' : '');
    div.textContent = img.filename;
    div.addEventListener('click', () => {
      selectImage(index);
      closePanels();
    });
    fileListEl.appendChild(div);
  });
}

// ============================================================
// Image Selection
// ============================================================
async function selectImage(index) {
  if (index < 0 || index >= imageList.length) return;
  currentIndex = index;
  const img = imageList[currentIndex];

  // Update image — use direct URL (synchronous, no await needed)
  const imgUrl = api.getImageUrl(img.id);
  imagePreview.src = imgUrl;
  imagePreview.style.display = 'block';
  imagePlaceholder.style.display = 'none';
  imageInfo.textContent = `${img.filename}  (${currentIndex + 1} / ${imageList.length})`;

  // Handle image load errors
  imagePreview.onerror = () => {
    imagePreview.style.display = 'none';
    imagePlaceholder.style.display = 'block';
    imagePlaceholder.textContent = `Failed to load image: ${img.filename}`;
  };

  imagePreview.onload = () => {
    imagePlaceholder.style.display = 'none';
    imagePreview.style.display = 'block';
  };

  // Update file list highlight
  const items = fileListEl.querySelectorAll('.file-item');
  items.forEach((item, i) => {
    item.classList.toggle('active', i === currentIndex);
  });

  // Scroll active item into view
  const activeItem = fileListEl.querySelector('.file-item.active');
  if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });

  // Load tags
  currentTags = await api.readTags(img.id);
  renderCurrentTags();
  renderAllTags();
}

// ============================================================
// Current Tags (Center)
// ============================================================
function renderCurrentTags() {
  currentTagsEl.innerHTML = '';
  currentTags.forEach((tag, index) => {
    const chip = document.createElement('button');
    chip.className = 'tag-chip';
    chip.innerHTML = `${tag} <span class="remove-x">&times;</span>`;
    chip.title = 'Click to remove';
    chip.addEventListener('click', () => removeTag(index));
    currentTagsEl.appendChild(chip);
  });
}

async function removeTag(index) {
  currentTags.splice(index, 1);
  renderCurrentTags();
  renderAllTags();
  debouncedSave();
}

async function addTag(tagText) {
  const tag = tagText.trim();
  if (!tag || currentTags.includes(tag)) return;
  currentTags.push(tag);

  if (!allTags.includes(tag)) {
    allTags.push(tag);
    allTags.sort();
  }

  renderCurrentTags();
  renderAllTags();
  debouncedSave();
}

// Debounced save (300ms)
function debouncedSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    if (currentIndex < 0) return;
    const img = imageList[currentIndex];
    await api.saveTags(img.id, currentTags);
  }, 300);
}

// ============================================================
// Tag Input
// ============================================================
tagInput.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const value = tagInput.value.replace(/,/g, '').trim();
    if (value) {
      await addTag(value);
      tagInput.value = '';
    }
  }
});

tagInput.addEventListener('input', async () => {
  if (tagInput.value.includes(',')) {
    const parts = tagInput.value.split(',');
    for (const part of parts) {
      const tag = part.trim();
      if (tag) await addTag(tag);
    }
    tagInput.value = '';
  }
});

// ============================================================
// Navigation
// ============================================================
btnPrev.addEventListener('click', () => {
  if (currentIndex > 0) selectImage(currentIndex - 1);
});

btnNext.addEventListener('click', () => {
  if (currentIndex < imageList.length - 1) selectImage(currentIndex + 1);
});

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
    if (currentIndex > 0) selectImage(currentIndex - 1);
  } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
    if (currentIndex < imageList.length - 1) selectImage(currentIndex + 1);
  }
});

// Swipe support for mobile
let touchStartX = 0;
let touchEndX = 0;
const imageContainer = document.getElementById('image-container');

imageContainer.addEventListener('touchstart', (e) => {
  touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

imageContainer.addEventListener('touchend', (e) => {
  touchEndX = e.changedTouches[0].screenX;
  const diff = touchStartX - touchEndX;
  if (Math.abs(diff) > 60) {
    if (diff > 0 && currentIndex < imageList.length - 1) {
      selectImage(currentIndex + 1);
    } else if (diff < 0 && currentIndex > 0) {
      selectImage(currentIndex - 1);
    }
  }
}, { passive: true });

// ============================================================
// All Tags (Right Sidebar)
// ============================================================
function renderAllTags() {
  const searchTerm = allTagsSearch.value.trim().toLowerCase();
  allTagsEl.innerHTML = '';

  const filteredTags = searchTerm
    ? allTags.filter((t) => t.toLowerCase().includes(searchTerm))
    : allTags;

  filteredTags.forEach((tag) => {
    const div = document.createElement('div');
    const isActive = currentTags.includes(tag);
    div.className = 'all-tag-item' + (isActive ? ' disabled' : '');
    div.textContent = tag;
    if (!isActive) {
      div.addEventListener('click', () => addTag(tag));
    }
    allTagsEl.appendChild(div);
  });
}

allTagsSearch.addEventListener('input', () => renderAllTags());

// ============================================================
// Upload
// ============================================================
uploadInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;

  for (const file of files) {
    await api.uploadImage(file);
  }

  // Refresh
  imageList = await api.listImages();
  allTags = await api.getAllTags();
  renderFileList();
  renderAllTags();

  // Select newly uploaded last image
  if (imageList.length > 0) {
    selectImage(imageList.length - 1);
  }

  uploadInput.value = '';
});

// ============================================================
// Start
// ============================================================
init();
