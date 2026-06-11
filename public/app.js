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

  async getTagSets(imageId) {
    const res = await fetch(`/api/images/${imageId}/tagsets`);
    const data = await res.json();
    return data.sets || [];
  },

  async createTagSet(imageId, payload) {
    const res = await fetch(`/api/images/${imageId}/tagsets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return data.set;
  },

  async updateTagSet(setId, payload) {
    await fetch(`/api/tagsets/${setId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  async deleteTagSet(setId) {
    await fetch(`/api/tagsets/${setId}`, { method: 'DELETE' });
  },

  async getAllTags(filters = {}) {
    const params = new URLSearchParams();
    if (filters.purpose) params.set('purpose', filters.purpose);
    if (filters.model) params.set('model', filters.model);
    const qs = params.toString();
    const res = await fetch(`/api/tags${qs ? '?' + qs : ''}`);
    const data = await res.json();
    return data.tags || [];
  },

  async exportTags(filters = {}) {
    const params = new URLSearchParams();
    if (filters.purpose) params.set('purpose', filters.purpose);
    if (filters.model) params.set('model', filters.model);
    const res = await fetch(`/api/export?${params.toString()}`);
    return res.json();
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
// Tag Guide helpers
// ============================================================
const GUIDE = window.TAG_GUIDE || { models: [], purposes: [], categories: [], entries: [] };
const MODEL_BY_ID = Object.fromEntries(GUIDE.models.map((m) => [m.id, m]));
const PURPOSE_BY_ID = Object.fromEntries(GUIDE.purposes.map((p) => [p.id, p]));
const CATEGORY_BY_ID = Object.fromEntries(GUIDE.categories.map((c) => [c.id, c]));
const ENTRY_BY_ID = Object.fromEntries(GUIDE.entries.map((e) => [e.id, e]));
const ALL_MODEL_IDS = GUIDE.models.map((m) => m.id);

function normTag(tag) {
  return String(tag)
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/\\/g, '')
    .replace(/:\d+(\.\d+)?$/, '') // strip (tag:1.2) weight remnants
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const GUIDE_INDEX = (() => {
  const map = new Map();
  for (const entry of GUIDE.entries) {
    const keys = [entry.en, entry.booru, entry.id.replace(/_/g, ' '), ...(entry.aliases || [])];
    for (const key of keys) {
      if (!key) continue;
      const norm = normTag(key);
      if (norm && !map.has(norm)) map.set(norm, entry);
    }
  }
  return map;
})();

function guideFor(tag) {
  return GUIDE_INDEX.get(normTag(tag)) || null;
}

function entryModels(entry) {
  if (entry.models) return entry.models;
  const cat = CATEGORY_BY_ID[entry.category];
  return (cat && cat.models) || ALL_MODEL_IDS;
}

// Preferred tag form for a model: booru models get the booru tag,
// natural-language models get the descriptive phrase.
function entryForm(entry, modelId) {
  const model = MODEL_BY_ID[modelId];
  const style = model ? model.promptStyle : 'booru';
  if (style === 'booru' || style === 'hybrid') {
    return entry.booru || entry.natural || entry.en;
  }
  return entry.natural || entry.booru || entry.en;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ============================================================
// State
// ============================================================
let imageList = []; // [{ id, filename, thumbUrl, ... }]
let currentIndex = -1;
let imageSets = []; // tag sets of the current image
let activeSetId = null;
let currentTags = []; // tags of the active set (editing buffer)
let allTags = [];
let saveTimeout = null;
let sidebarTab = 'used'; // 'used' | 'suggest'
let setModalEditId = null; // null = create mode

const ctx = {
  purpose: localStorage.getItem('ts-purpose') || '',
  model: localStorage.getItem('ts-model') || '',
};

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
const setTabsEl = document.getElementById('set-tabs');
const purposeSelect = document.getElementById('purpose-select');
const modelSelect = document.getElementById('model-select');
const tabUsed = document.getElementById('tab-used');
const tabSuggest = document.getElementById('tab-suggest');

// Gallery elements
const galleryView = document.getElementById('gallery-view');
const galleryGrid = document.getElementById('gallery-grid');
const btnGalleryToggle = document.getElementById('btn-gallery-toggle');
const mainView = document.getElementById('main');
let isGalleryMode = false;
let galleryTagCounts = {}; // { imageId: tagCount }

// Guide view elements
const guideView = document.getElementById('guide-view');
const btnGuideToggle = document.getElementById('btn-guide-toggle');
const guideModelTips = document.getElementById('guide-model-tips');
const guideSearch = document.getElementById('guide-search');
const guideCategoryChips = document.getElementById('guide-category-chips');
const guideSections = document.getElementById('guide-sections');
let isGuideMode = false;
let guideCategoryFilter = '';

// Modals
const setModal = document.getElementById('set-modal');
const guideModal = document.getElementById('guide-modal');
const guideModalBody = document.getElementById('guide-modal-body');
const exportModal = document.getElementById('export-modal');

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
// View switching (main / gallery / guide)
// ============================================================
function showView(view) {
  isGalleryMode = view === 'gallery';
  isGuideMode = view === 'guide';
  mainView.style.display = view === 'main' ? '' : 'none';
  galleryView.style.display = isGalleryMode ? '' : 'none';
  guideView.style.display = isGuideMode ? '' : 'none';

  btnGalleryToggle.classList.toggle('active', isGalleryMode);
  btnGalleryToggle.innerHTML = isGalleryMode ? '&#9776;' : '&#9871;';
  btnGalleryToggle.title = isGalleryMode ? 'Editor View' : 'Gallery View';
  btnGuideToggle.classList.toggle('active', isGuideMode);

  if (isGalleryMode) renderGallery();
  if (isGuideMode) renderGuideView();
}

function toggleGalleryMode() {
  showView(isGalleryMode ? 'main' : 'gallery');
}

function toggleGuideMode() {
  showView(isGuideMode ? 'main' : 'guide');
}

btnGalleryToggle.addEventListener('click', toggleGalleryMode);
btnGuideToggle.addEventListener('click', toggleGuideMode);

async function loadGalleryTagCounts() {
  galleryTagCounts = {};
  const promises = imageList.map(async (img) => {
    const tags = await api.readTags(img.id);
    galleryTagCounts[img.id] = tags.length;
  });
  await Promise.all(promises);
}

function renderGallery() {
  galleryGrid.innerHTML = '';
  imageList.forEach((img, index) => {
    const item = document.createElement('div');
    item.className = 'gallery-item' + (index === currentIndex ? ' active' : '');

    const thumbUrl = api.getThumbUrl(img.id);
    const fullUrl = api.getImageUrl(img.id);

    item.innerHTML = `
      <img src="${thumbUrl}" alt="${esc(img.filename)}" loading="lazy"
           onerror="this.src='${fullUrl}'" />
      <div class="gallery-filename">${esc(img.filename)}</div>
      ${galleryTagCounts[img.id] ? `<div class="gallery-tag-count">${galleryTagCounts[img.id]} tags</div>` : ''}
    `;

    item.addEventListener('click', () => {
      selectImage(index);
      showView('main');
    });

    galleryGrid.appendChild(item);
  });
}

// ============================================================
// Context selectors (purpose / model)
// ============================================================
function initContextSelectors() {
  modelSelect.innerHTML = '<option value="">모델: 전체</option>' +
    GUIDE.models.map((m) => `<option value="${m.id}">${esc(m.name)} (${esc(m.type)})</option>`).join('');

  purposeSelect.value = ctx.purpose;
  modelSelect.value = ctx.model;

  purposeSelect.addEventListener('change', () => {
    ctx.purpose = purposeSelect.value;
    localStorage.setItem('ts-purpose', ctx.purpose);
    onContextChange();
  });
  modelSelect.addEventListener('change', () => {
    ctx.model = modelSelect.value;
    localStorage.setItem('ts-model', ctx.model);
    onContextChange();
  });
}

async function onContextChange() {
  flushSave();
  chooseActiveSet();
  syncCurrentTagsFromActive();
  renderSetTabs();
  renderCurrentTags();
  allTags = await api.getAllTags(ctx);
  renderSidebar();
  if (isGuideMode) renderGuideView();
}

// ============================================================
// Initialization
// ============================================================
async function init() {
  initContextSelectors();
  imageList = await api.listImages();
  allTags = await api.getAllTags(ctx);
  renderFileList();
  renderSidebar();

  // Preload tag counts for gallery
  loadGalleryTagCounts();

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
  flushSave();
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

  // Load tag sets
  imageSets = await api.getTagSets(img.id);
  chooseActiveSet();
  syncCurrentTagsFromActive();
  renderSetTabs();
  renderCurrentTags();
  renderSidebar();
}

// ============================================================
// Tag Sets
// ============================================================
function chooseActiveSet() {
  if (imageSets.length === 0) {
    activeSetId = null;
    return;
  }
  if (ctx.purpose) {
    let cands = imageSets.filter((s) => s.purpose === ctx.purpose);
    if (ctx.model) {
      const exact = cands.filter((s) => s.model === ctx.model);
      const agnostic = cands.filter((s) => !s.model);
      cands = exact.length > 0 ? exact : agnostic;
    }
    activeSetId = cands.length > 0 ? cands[0].id : null;
    return;
  }
  if (ctx.model) {
    const exact = imageSets.filter((s) => s.model === ctx.model);
    if (exact.length > 0) {
      activeSetId = exact[0].id;
      return;
    }
  }
  const def = imageSets.find((s) => s.isDefault) || imageSets[0];
  activeSetId = def.id;
}

function activeSet() {
  return imageSets.find((s) => s.id === activeSetId) || null;
}

function syncCurrentTagsFromActive() {
  const set = activeSet();
  currentTags = set ? [...set.tags] : [];
}

function purposeLabel(purposeId) {
  const p = PURPOSE_BY_ID[purposeId];
  return p ? p.icon + ' ' + p.short : purposeId;
}

function renderSetTabs() {
  setTabsEl.innerHTML = '';
  imageSets.forEach((set) => {
    const tab = document.createElement('button');
    tab.className = 'set-tab' + (set.id === activeSetId ? ' active' : '');
    const model = set.model ? MODEL_BY_ID[set.model] : null;
    tab.innerHTML = `
      <span class="set-tab-purpose">${esc(purposeLabel(set.purpose))}</span>
      <span class="set-tab-name">${esc(set.name)}</span>
      ${model ? `<span class="set-tab-model" style="--model-color:${model.color}">${esc(model.name)}</span>` : ''}
      <span class="set-tab-count">${set.tags.length}</span>
    `;
    tab.title = `${set.name} — ${purposeLabel(set.purpose)}${model ? ' / ' + model.name : ''}`;
    tab.addEventListener('click', () => {
      if (activeSetId === set.id) {
        openSetModal(set.id); // click active tab again → edit
        return;
      }
      flushSave();
      activeSetId = set.id;
      syncCurrentTagsFromActive();
      renderSetTabs();
      renderCurrentTags();
      renderSidebar();
    });
    setTabsEl.appendChild(tab);
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'set-tab set-tab-add';
  addBtn.textContent = '+';
  addBtn.title = '새 태그셋 만들기';
  addBtn.addEventListener('click', () => openSetModal(null));
  setTabsEl.appendChild(addBtn);
}

// ============================================================
// Current Tags (Center)
// ============================================================
function renderCurrentTags() {
  currentTagsEl.innerHTML = '';

  if (!activeSetId && currentIndex >= 0) {
    // No set matches the selected context — offer to create one
    const p = PURPOSE_BY_ID[ctx.purpose];
    const m = ctx.model ? MODEL_BY_ID[ctx.model] : null;
    const hint = document.createElement('div');
    hint.className = 'no-set-hint';
    hint.innerHTML = `
      <span>이 이미지에는 <b>${esc(p ? p.ko : ctx.purpose)}${m ? ' / ' + esc(m.name) : ''}</b> 태그셋이 없습니다.</span>
      <button id="btn-create-ctx-set" class="modal-btn primary">셋 만들기</button>
    `;
    currentTagsEl.appendChild(hint);
    hint.querySelector('#btn-create-ctx-set').addEventListener('click', () => openSetModal(null));
    return;
  }

  currentTags.forEach((tag, index) => {
    const chip = document.createElement('button');
    chip.className = 'tag-chip';
    const entry = guideFor(tag);
    chip.innerHTML = `${esc(tag)} ${entry ? '<span class="guide-i" title="태그 가이드 보기">ⓘ</span>' : ''}<span class="remove-x">&times;</span>`;
    chip.title = entry ? `${entry.ko} — 클릭: 제거 / ⓘ 또는 우클릭: 가이드` : 'Click to remove';
    chip.addEventListener('click', (e) => {
      if (e.target.classList.contains('guide-i')) {
        openGuideModal(tag);
        return;
      }
      removeTag(index);
    });
    chip.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openGuideModal(tag);
    });
    currentTagsEl.appendChild(chip);
  });
}

async function removeTag(index) {
  currentTags.splice(index, 1);
  renderCurrentTags();
  renderSidebar();
  debouncedSave();
}

async function addTag(tagText) {
  const tag = tagText.trim();
  if (!tag || currentTags.includes(tag)) return;

  const setId = await ensureActiveSet();
  if (!setId) return;

  currentTags.push(tag);

  if (!allTags.includes(tag)) {
    allTags.push(tag);
    allTags.sort();
  }

  renderCurrentTags();
  renderSidebar();
  debouncedSave();
}

// Create a tag set on the fly when typing into an image that has no set
// matching the current context.
async function ensureActiveSet() {
  if (activeSetId) return activeSetId;
  if (currentIndex < 0) return null;
  const img = imageList[currentIndex];
  const purpose = ctx.purpose || 'inference';
  const p = PURPOSE_BY_ID[purpose];
  const m = ctx.model ? MODEL_BY_ID[ctx.model] : null;
  const name = (p ? p.short : purpose) + (m ? ' · ' + m.name : '');
  const set = await api.createTagSet(img.id, { name, purpose, model: ctx.model || null });
  imageSets.push(set);
  activeSetId = set.id;
  renderSetTabs();
  return activeSetId;
}

// Debounced save (300ms)
function debouncedSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  const setId = activeSetId;
  if (!setId) return;
  saveTimeout = setTimeout(() => persistTags(setId, [...currentTags]), 300);
}

function flushSave() {
  if (!saveTimeout) return;
  clearTimeout(saveTimeout);
  saveTimeout = null;
  if (activeSetId) persistTags(activeSetId, [...currentTags]);
}

async function persistTags(setId, tags) {
  saveTimeout = null;
  await api.updateTagSet(setId, { tags });
  const set = imageSets.find((s) => s.id === setId);
  if (set) {
    set.tags = tags;
    if (set.isDefault && currentIndex >= 0) {
      galleryTagCounts[imageList[currentIndex].id] = tags.length;
    }
  }
  renderSetTabs();
}

// ============================================================
// Tag Set Modal (create / edit)
// ============================================================
const setModalTitle = document.getElementById('set-modal-title');
const setNameInput = document.getElementById('set-name-input');
const setPurposeSelect = document.getElementById('set-purpose-select');
const setPurposeHint = document.getElementById('set-purpose-hint');
const setModelSelect = document.getElementById('set-model-select');
const setCopyRow = document.getElementById('set-copy-row');
const setCopySelect = document.getElementById('set-copy-select');
const setModalDelete = document.getElementById('set-modal-delete');

function updatePurposeHint() {
  const p = PURPOSE_BY_ID[setPurposeSelect.value];
  setPurposeHint.textContent = p ? p.tips : '';
}
setPurposeSelect.addEventListener('change', updatePurposeHint);

function openSetModal(editSetId) {
  if (currentIndex < 0) return;
  setModalEditId = editSetId;
  const editSet = editSetId ? imageSets.find((s) => s.id === editSetId) : null;

  setModalTitle.textContent = editSet ? '태그셋 편집' : '새 태그셋';
  setModelSelect.innerHTML = '<option value="">공용 (모델 무관)</option>' +
    GUIDE.models.map((m) => `<option value="${m.id}">${esc(m.name)} (${esc(m.type)})</option>`).join('');

  if (editSet) {
    setNameInput.value = editSet.name;
    setPurposeSelect.value = editSet.purpose;
    setModelSelect.value = editSet.model || '';
    setCopyRow.style.display = 'none';
    setModalDelete.style.display = '';
  } else {
    const purpose = ctx.purpose || 'inference';
    const p = PURPOSE_BY_ID[purpose];
    const m = ctx.model ? MODEL_BY_ID[ctx.model] : null;
    setNameInput.value = (p ? p.short : purpose) + (m ? ' · ' + m.name : '');
    setPurposeSelect.value = purpose;
    setModelSelect.value = ctx.model || '';
    setCopyRow.style.display = '';
    setCopySelect.innerHTML = '<option value="">비어있게 시작</option>' +
      imageSets.map((s) => `<option value="${s.id}">"${esc(s.name)}" 에서 복사 (${s.tags.length} tags)</option>`).join('');
    const def = imageSets.find((s) => s.isDefault);
    if (def) setCopySelect.value = def.id;
    setModalDelete.style.display = 'none';
  }
  updatePurposeHint();
  setModal.style.display = '';
  setNameInput.focus();
}

function closeSetModal() {
  setModal.style.display = 'none';
  setModalEditId = null;
}

document.getElementById('set-modal-cancel').addEventListener('click', closeSetModal);
setModal.addEventListener('click', (e) => {
  if (e.target === setModal) closeSetModal();
});

document.getElementById('set-modal-save').addEventListener('click', async () => {
  if (currentIndex < 0) return;
  const img = imageList[currentIndex];
  const name = setNameInput.value.trim() || setPurposeSelect.value;
  const purpose = setPurposeSelect.value;
  const model = setModelSelect.value || null;

  if (setModalEditId) {
    await api.updateTagSet(setModalEditId, { name, purpose, model });
    const set = imageSets.find((s) => s.id === setModalEditId);
    if (set) Object.assign(set, { name, purpose, model });
  } else {
    const payload = { name, purpose, model };
    if (setCopySelect.value) payload.copyFromSetId = setCopySelect.value;
    const set = await api.createTagSet(img.id, payload);
    imageSets.push(set);
    flushSave();
    activeSetId = set.id;
    syncCurrentTagsFromActive();
  }
  closeSetModal();
  renderSetTabs();
  renderCurrentTags();
  renderSidebar();
});

setModalDelete.addEventListener('click', async () => {
  if (!setModalEditId) return;
  const set = imageSets.find((s) => s.id === setModalEditId);
  if (!confirm(`태그셋 "${set ? set.name : ''}" 을(를) 삭제할까요? (태그 ${set ? set.tags.length : 0}개)`)) return;
  await api.deleteTagSet(setModalEditId);
  imageSets = imageSets.filter((s) => s.id !== setModalEditId);
  if (imageSets.length > 0 && !imageSets.some((s) => s.isDefault)) {
    imageSets[0].isDefault = true;
  }
  if (activeSetId === setModalEditId) {
    chooseActiveSet();
    syncCurrentTagsFromActive();
  }
  closeSetModal();
  renderSetTabs();
  renderCurrentTags();
  renderSidebar();
});

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

function anyModalOpen() {
  return setModal.style.display !== 'none' || guideModal.style.display !== 'none' || exportModal.style.display !== 'none';
}

function closeAllModals() {
  setModal.style.display = 'none';
  guideModal.style.display = 'none';
  exportModal.style.display = 'none';
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (anyModalOpen()) {
      closeAllModals();
      return;
    }
    if (isGalleryMode || isGuideMode) {
      showView('main');
      return;
    }
    return;
  }
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (anyModalOpen()) return;
  if (e.key === 'g' || e.key === 'G') {
    toggleGalleryMode();
    return;
  }
  if (e.key === 'b' || e.key === 'B') {
    toggleGuideMode();
    return;
  }
  if (isGalleryMode || isGuideMode) return; // no arrow nav in overlay views
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
// Right Sidebar: used tags / guide suggestions
// ============================================================
tabUsed.addEventListener('click', () => {
  sidebarTab = 'used';
  tabUsed.classList.add('active');
  tabSuggest.classList.remove('active');
  allTagsSearch.placeholder = 'Search tags...';
  renderSidebar();
});

tabSuggest.addEventListener('click', () => {
  sidebarTab = 'suggest';
  tabSuggest.classList.add('active');
  tabUsed.classList.remove('active');
  allTagsSearch.placeholder = '가이드 검색...';
  renderSidebar();
});

function renderSidebar() {
  if (sidebarTab === 'used') renderAllTags();
  else renderSuggestions();
}

function renderAllTags() {
  const searchTerm = allTagsSearch.value.trim().toLowerCase();
  allTagsEl.innerHTML = '';

  const filteredTags = searchTerm
    ? allTags.filter((t) => t.toLowerCase().includes(searchTerm))
    : allTags;

  filteredTags.forEach((tag) => {
    const div = document.createElement('div');
    const isActive = currentTags.includes(tag);
    const entry = guideFor(tag);
    div.className = 'all-tag-item' + (isActive ? ' disabled' : '');
    div.innerHTML = `<span class="all-tag-text">${esc(tag)}</span>` +
      (entry ? '<button class="guide-i-btn" title="태그 가이드">ⓘ</button>' : '');
    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('guide-i-btn')) {
        openGuideModal(tag);
        return;
      }
      if (!isActive) addTag(tag);
    });
    allTagsEl.appendChild(div);
  });
}

// Guide entries compatible with the selected model, grouped by category
function renderSuggestions() {
  const searchTerm = allTagsSearch.value.trim().toLowerCase();
  allTagsEl.innerHTML = '';

  const entries = GUIDE.entries.filter((entry) => {
    if (ctx.model && !entryModels(entry).includes(ctx.model)) return false;
    if (!searchTerm) return true;
    const hay = [entry.ko, entry.en, entry.booru, entry.natural, ...(entry.keywords || [])]
      .filter(Boolean).join(' ').toLowerCase();
    return hay.includes(searchTerm);
  });

  if (ctx.model && MODEL_BY_ID[ctx.model]) {
    const m = MODEL_BY_ID[ctx.model];
    const note = document.createElement('div');
    note.className = 'suggest-note';
    note.innerHTML = `<b style="color:${m.color}">${esc(m.name)}</b> 호환 태그 — ${esc(m.promptStyle === 'booru' ? 'Booru 태그형' : m.promptStyle === 'natural' ? '자연어형' : '하이브리드')} 표기`;
    allTagsEl.appendChild(note);
  }

  for (const cat of GUIDE.categories) {
    const catEntries = entries.filter((e) => e.category === cat.id);
    if (catEntries.length === 0) continue;

    const header = document.createElement('div');
    header.className = 'suggest-cat-header';
    header.textContent = `${cat.icon} ${cat.ko}`;
    allTagsEl.appendChild(header);

    for (const entry of catEntries) {
      const form = entryForm(entry, ctx.model);
      const isActive = currentTags.includes(form);
      const div = document.createElement('div');
      div.className = 'suggest-item' + (isActive ? ' disabled' : '');
      div.innerHTML = `
        <div class="suggest-form">${esc(form)}</div>
        <div class="suggest-ko">${esc(entry.ko)}</div>
        <button class="guide-i-btn" title="태그 가이드">ⓘ</button>
      `;
      div.addEventListener('click', (e) => {
        if (e.target.classList.contains('guide-i-btn')) {
          openGuideModal(entry);
          return;
        }
        if (!isActive) addTag(form);
      });
      allTagsEl.appendChild(div);
    }
  }

  if (allTagsEl.children.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'suggest-note';
    empty.textContent = '검색 결과가 없습니다.';
    allTagsEl.appendChild(empty);
  }
}

allTagsSearch.addEventListener('input', () => renderSidebar());

// ============================================================
// Tag Guide Modal
// ============================================================
function modelBadges(entry) {
  return entryModels(entry).map((id) => {
    const m = MODEL_BY_ID[id];
    if (!m) return '';
    return `<span class="model-badge" style="--model-color:${m.color}">${esc(m.name)}</span>`;
  }).join('');
}

function openGuideModal(tagOrEntry) {
  const entry = typeof tagOrEntry === 'string' ? guideFor(tagOrEntry) : tagOrEntry;

  if (!entry) {
    const tag = String(tagOrEntry);
    const wikiTag = tag.trim().replace(/\s+/g, '_').toLowerCase();
    const similar = GUIDE.entries.filter((e) => {
      const hay = [e.ko, e.en, e.booru, e.natural].filter(Boolean).join(' ').toLowerCase();
      return tag.length >= 2 && hay.includes(tag.toLowerCase());
    }).slice(0, 6);
    guideModalBody.innerHTML = `
      <div class="guide-modal-header">
        <div class="guide-modal-ko">${esc(tag)}</div>
        <div class="guide-modal-en">내장 가이드에 없는 태그입니다</div>
      </div>
      <p class="guide-modal-desc">이 태그에 대한 내장 설명이 아직 없습니다. 아래 외부 위키에서 의미를 확인할 수 있습니다.</p>
      <div class="guide-modal-links">
        <a href="https://danbooru.donmai.us/wiki_pages/${encodeURIComponent(wikiTag)}" target="_blank" rel="noopener">Danbooru 위키에서 보기 ↗</a>
        <a href="https://danbooru.donmai.us/posts?tags=${encodeURIComponent(wikiTag)}" target="_blank" rel="noopener">Danbooru 예시 이미지 검색 ↗</a>
      </div>
      ${similar.length > 0 ? `
        <div class="guide-modal-section-title">비슷한 가이드 항목</div>
        <div class="guide-modal-related">
          ${similar.map((s) => `<button class="related-link" data-entry="${s.id}">${esc(s.ko)}</button>`).join('')}
        </div>` : ''}
    `;
  } else {
    const cat = CATEGORY_BY_ID[entry.category];
    const related = (entry.related || []).map((id) => ENTRY_BY_ID[id]).filter(Boolean);
    const wikiTag = entry.booru ? entry.booru.replace(/\s+/g, '_').toLowerCase() : null;
    guideModalBody.innerHTML = `
      <div class="guide-modal-header">
        <div class="guide-modal-ko">${esc(entry.ko)}</div>
        <div class="guide-modal-en">${esc(entry.en)}</div>
        <div class="guide-modal-cat">${cat ? esc(cat.icon + ' ' + cat.ko) : ''}</div>
      </div>
      <div class="guide-modal-badges">${modelBadges(entry)}</div>
      <p class="guide-modal-desc">${esc(entry.desc)}</p>
      ${entry.keywords ? `<div class="guide-modal-keywords">${entry.keywords.map((k) => `<span class="kw-chip">${esc(k)}</span>`).join('')}</div>` : ''}
      <div class="guide-modal-section-title">프롬프트 표현</div>
      <div class="guide-modal-forms">
        ${entry.booru ? `
          <div class="form-row">
            <span class="form-label">Booru</span>
            <code class="form-code">${esc(entry.booru)}</code>
            <button class="form-btn" data-add="${esc(entry.booru)}">+ 추가</button>
            <button class="form-btn" data-copy="${esc(entry.booru)}">복사</button>
          </div>` : ''}
        ${entry.natural ? `
          <div class="form-row">
            <span class="form-label">자연어</span>
            <code class="form-code">${esc(entry.natural)}</code>
            <button class="form-btn" data-add="${esc(entry.natural)}">+ 추가</button>
            <button class="form-btn" data-copy="${esc(entry.natural)}">복사</button>
          </div>` : ''}
      </div>
      ${related.length > 0 ? `
        <div class="guide-modal-section-title">관련 항목</div>
        <div class="guide-modal-related">
          ${related.map((r) => `<button class="related-link" data-entry="${r.id}">${esc(r.ko)}</button>`).join('')}
        </div>` : ''}
      ${wikiTag ? `
        <div class="guide-modal-links">
          <a href="https://danbooru.donmai.us/wiki_pages/${encodeURIComponent(wikiTag)}" target="_blank" rel="noopener">Danbooru 위키 ↗</a>
          <a href="https://danbooru.donmai.us/posts?tags=${encodeURIComponent(wikiTag)}" target="_blank" rel="noopener">예시 이미지 검색 ↗</a>
        </div>` : ''}
    `;
  }

  guideModalBody.querySelectorAll('[data-entry]').forEach((btn) => {
    btn.addEventListener('click', () => openGuideModal(ENTRY_BY_ID[btn.dataset.entry]));
  });
  guideModalBody.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await addTag(btn.dataset.add);
      btn.textContent = '✓ 추가됨';
      setTimeout(() => { btn.textContent = '+ 추가'; }, 1200);
    });
  });
  guideModalBody.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.copy);
      btn.textContent = '✓ 복사됨';
      setTimeout(() => { btn.textContent = '복사'; }, 1200);
    });
  });

  guideModal.style.display = '';
}

document.getElementById('guide-modal-close').addEventListener('click', () => {
  guideModal.style.display = 'none';
});
guideModal.addEventListener('click', (e) => {
  if (e.target === guideModal) guideModal.style.display = 'none';
});

// ============================================================
// Tag Guide View (browser)
// ============================================================
function renderGuideView() {
  // Model prompting tips
  if (ctx.model && MODEL_BY_ID[ctx.model]) {
    const m = MODEL_BY_ID[ctx.model];
    guideModelTips.innerHTML = `
      <div class="model-tips-card" style="--model-color:${m.color}">
        <div class="model-tips-title">${esc(m.name)} <span class="model-tips-type">${esc(m.type)} · ${esc(m.promptStyle)}</span></div>
        <div class="model-tips-desc">${esc(m.desc)}</div>
        <ul class="model-tips-list">${m.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      </div>
    `;
  } else {
    guideModelTips.innerHTML = `
      <div class="model-tips-card model-tips-empty">
        상단에서 모델을 선택하면 해당 모델의 프롬프팅 팁과 호환 태그만 보여줍니다.
        <div class="model-quick-btns">
          ${GUIDE.models.map((m) => `<button class="model-quick-btn" data-model="${m.id}" style="--model-color:${m.color}">${esc(m.name)}</button>`).join('')}
        </div>
      </div>
    `;
    guideModelTips.querySelectorAll('[data-model]').forEach((btn) => {
      btn.addEventListener('click', () => {
        modelSelect.value = btn.dataset.model;
        modelSelect.dispatchEvent(new Event('change'));
      });
    });
  }

  // Category filter chips
  guideCategoryChips.innerHTML = '';
  const allChip = document.createElement('button');
  allChip.className = 'cat-chip' + (guideCategoryFilter === '' ? ' active' : '');
  allChip.textContent = '전체';
  allChip.addEventListener('click', () => {
    guideCategoryFilter = '';
    renderGuideView();
  });
  guideCategoryChips.appendChild(allChip);

  for (const cat of GUIDE.categories) {
    if (ctx.model && cat.models && !cat.models.includes(ctx.model)) continue;
    const chip = document.createElement('button');
    chip.className = 'cat-chip' + (guideCategoryFilter === cat.id ? ' active' : '');
    chip.textContent = `${cat.icon} ${cat.ko}`;
    chip.addEventListener('click', () => {
      guideCategoryFilter = guideCategoryFilter === cat.id ? '' : cat.id;
      renderGuideView();
    });
    guideCategoryChips.appendChild(chip);
  }

  // Entry cards by category
  const searchTerm = guideSearch.value.trim().toLowerCase();
  guideSections.innerHTML = '';

  for (const cat of GUIDE.categories) {
    if (guideCategoryFilter && cat.id !== guideCategoryFilter) continue;

    const catEntries = GUIDE.entries.filter((entry) => {
      if (entry.category !== cat.id) return false;
      if (ctx.model && !entryModels(entry).includes(ctx.model)) return false;
      if (!searchTerm) return true;
      const hay = [entry.ko, entry.en, entry.booru, entry.natural, entry.desc, ...(entry.keywords || [])]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(searchTerm);
    });
    if (catEntries.length === 0) continue;

    const section = document.createElement('div');
    section.className = 'guide-section';
    section.innerHTML = `<div class="guide-section-title">${esc(cat.icon)} ${esc(cat.ko)} <span class="guide-section-count">${catEntries.length}</span></div>`;

    const grid = document.createElement('div');
    grid.className = 'guide-card-grid';

    for (const entry of catEntries) {
      const card = document.createElement('div');
      card.className = 'guide-card';
      const forms = [];
      if (entry.booru) forms.push(`<div class="guide-card-form"><span class="form-label">Booru</span><code>${esc(entry.booru)}</code></div>`);
      if (entry.natural) forms.push(`<div class="guide-card-form"><span class="form-label">자연어</span><code>${esc(entry.natural)}</code></div>`);
      card.innerHTML = `
        <div class="guide-card-ko">${esc(entry.ko)}</div>
        <div class="guide-card-en">${esc(entry.en)}</div>
        ${forms.join('')}
        <div class="guide-card-desc">${esc(entry.desc)}</div>
        ${entry.keywords ? `<div class="guide-card-keywords">${entry.keywords.map((k) => `<span class="kw-chip">${esc(k)}</span>`).join('')}</div>` : ''}
        <div class="guide-card-footer">
          <div class="guide-card-models">${modelBadges(entry)}</div>
          <button class="guide-card-add" ${currentIndex < 0 ? 'disabled' : ''}>+ 현재 이미지에 추가</button>
        </div>
      `;
      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('guide-card-add')) return;
        openGuideModal(entry);
      });
      card.querySelector('.guide-card-add').addEventListener('click', async (e) => {
        const form = entryForm(entry, ctx.model);
        await addTag(form);
        e.target.textContent = `✓ "${form.length > 24 ? form.slice(0, 24) + '…' : form}" 추가됨`;
        setTimeout(() => { e.target.textContent = '+ 현재 이미지에 추가'; }, 1500);
      });
      grid.appendChild(card);
    }

    section.appendChild(grid);
    guideSections.appendChild(section);
  }

  if (guideSections.children.length === 0) {
    guideSections.innerHTML = '<div class="suggest-note" style="padding:24px;">검색 결과가 없습니다.</div>';
  }
}

guideSearch.addEventListener('input', () => renderGuideView());

// ============================================================
// Export (.txt zip / JSON)
// ============================================================
const exportPurposeSelect = document.getElementById('export-purpose-select');
const exportModelSelect = document.getElementById('export-model-select');
const exportFormatSelect = document.getElementById('export-format-select');
const exportStatus = document.getElementById('export-status');

document.getElementById('btn-export').addEventListener('click', () => {
  exportModelSelect.innerHTML = '<option value="">전체 (공용 셋 포함)</option>' +
    GUIDE.models.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
  exportPurposeSelect.value = ctx.purpose || 'inference';
  exportModelSelect.value = ctx.model || '';
  exportStatus.textContent = '';
  exportModal.style.display = '';
});

document.getElementById('export-modal-cancel').addEventListener('click', () => {
  exportModal.style.display = 'none';
});
exportModal.addEventListener('click', (e) => {
  if (e.target === exportModal) exportModal.style.display = 'none';
});

document.getElementById('export-modal-run').addEventListener('click', async () => {
  flushSave();
  exportStatus.textContent = '내보내는 중...';
  try {
    const purpose = exportPurposeSelect.value;
    const model = exportModelSelect.value;
    const data = await api.exportTags({ purpose, model });
    if (!data.files || data.files.length === 0) {
      exportStatus.textContent = `일치하는 태그셋이 없습니다 (이미지 ${data.totalImages || 0}개 중 0개).`;
      return;
    }

    const stamp = `${purpose}${model ? '-' + model : ''}`;
    if (exportFormatSelect.value === 'json') {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      downloadBlob(blob, `tags-${stamp}.json`);
    } else {
      const files = data.files.map((f) => ({
        name: f.filename.replace(/\.[^.]+$/, '') + '.txt',
        text: f.tags.join(', '),
      }));
      // de-dupe names (a.png + a.jpg → a.txt, a (1).txt)
      const seen = {};
      for (const f of files) {
        if (seen[f.name]) {
          const n = seen[f.name]++;
          f.name = f.name.replace(/\.txt$/, ` (${n}).txt`);
        } else {
          seen[f.name] = 1;
        }
      }
      downloadBlob(buildZip(files), `tags-${stamp}.zip`);
    }
    exportStatus.textContent = `완료 — 이미지 ${data.totalImages}개 중 ${data.matchedImages}개 내보냄.`;
  } catch (e) {
    exportStatus.textContent = '오류: ' + e.message;
  }
});

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Minimal ZIP writer (STORE method, no compression)
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(data) {
  let crc = -1;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ data[i]) & 0xFF];
  }
  return (crc ^ -1) >>> 0;
}

function buildZip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const data = enc.encode(f.text);
    const crc = crc32(data);

    const lfh = new DataView(new ArrayBuffer(30));
    lfh.setUint32(0, 0x04034b50, true);
    lfh.setUint16(4, 20, true);      // version needed
    lfh.setUint16(6, 0x0800, true);  // UTF-8 names
    lfh.setUint16(8, 0, true);       // method: store
    lfh.setUint16(10, 0, true);      // mod time
    lfh.setUint16(12, 0x21, true);   // mod date (1980-01-01)
    lfh.setUint32(14, crc, true);
    lfh.setUint32(18, data.length, true);
    lfh.setUint32(22, data.length, true);
    lfh.setUint16(26, nameBytes.length, true);
    lfh.setUint16(28, 0, true);
    parts.push(lfh.buffer, nameBytes, data);

    const cdh = new DataView(new ArrayBuffer(46));
    cdh.setUint32(0, 0x02014b50, true);
    cdh.setUint16(4, 20, true);
    cdh.setUint16(6, 20, true);
    cdh.setUint16(8, 0x0800, true);
    cdh.setUint16(10, 0, true);
    cdh.setUint16(12, 0, true);
    cdh.setUint16(14, 0x21, true);
    cdh.setUint32(16, crc, true);
    cdh.setUint32(20, data.length, true);
    cdh.setUint32(24, data.length, true);
    cdh.setUint16(28, nameBytes.length, true);
    cdh.setUint32(42, offset, true);
    central.push(cdh.buffer, nameBytes);

    offset += 30 + nameBytes.length + data.length;
  }

  const cdSize = central.reduce((s, b) => s + b.byteLength, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, files.length, true);
  eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, cdSize, true);
  eocd.setUint32(16, offset, true);

  return new Blob([...parts, ...central, eocd.buffer], { type: 'application/zip' });
}

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
  allTags = await api.getAllTags(ctx);
  renderFileList();
  renderSidebar();

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
