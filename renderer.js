// State
let imageFolderPath = null;
let tagFolderPath = null;
let imageFiles = [];
let currentIndex = -1;
let currentTags = [];
let allTags = [];

// DOM Elements
const btnSelectImageFolder = document.getElementById('btn-select-image-folder');
const btnSelectTagFolder = document.getElementById('btn-select-tag-folder');
const labelImageFolder = document.getElementById('label-image-folder');
const labelTagFolder = document.getElementById('label-tag-folder');
const fileListEl = document.getElementById('file-list');
const imagePreview = document.getElementById('image-preview');
const imageInfo = document.getElementById('image-info');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const currentTagsEl = document.getElementById('current-tags');
const tagInput = document.getElementById('tag-input');
const allTagsEl = document.getElementById('all-tags');
const allTagsSearch = document.getElementById('all-tags-search');

// Helper: get tag file name from image file name
function getTagFileName(imageFileName) {
  const nameWithoutExt = imageFileName.replace(/\.[^/.]+$/, '');
  return nameWithoutExt + '.txt';
}

// Helper: get tag file path
function getTagFilePath(imageFileName) {
  if (!tagFolderPath) return null;
  return tagFolderPath + '/' + getTagFileName(imageFileName);
}

// Select Image Folder
btnSelectImageFolder.addEventListener('click', async () => {
  const folder = await window.api.selectFolder();
  if (!folder) return;
  imageFolderPath = folder;
  labelImageFolder.textContent = folder;
  imageFiles = await window.api.listImages(folder);
  renderFileList();
  if (imageFiles.length > 0) {
    selectImage(0);
  }
});

// Select Tag Folder
btnSelectTagFolder.addEventListener('click', async () => {
  const folder = await window.api.selectFolder();
  if (!folder) return;
  tagFolderPath = folder;
  labelTagFolder.textContent = folder;
  await refreshAllTags();
  if (currentIndex >= 0) {
    await loadCurrentTags();
    renderCurrentTags();
    renderAllTags();
  }
});

// Render file list in left sidebar
function renderFileList() {
  fileListEl.innerHTML = '';
  imageFiles.forEach((file, index) => {
    const div = document.createElement('div');
    div.className = 'file-item' + (index === currentIndex ? ' active' : '');
    div.textContent = file;
    div.addEventListener('click', () => selectImage(index));
    fileListEl.appendChild(div);
  });
}

// Select an image by index
async function selectImage(index) {
  if (index < 0 || index >= imageFiles.length) return;
  currentIndex = index;
  const fileName = imageFiles[currentIndex];

  // Update image
  const imgPath = await window.api.getImagePath(imageFolderPath, fileName);
  imagePreview.src = 'local-image://' + encodeURIComponent(imgPath);
  imageInfo.textContent = `${fileName}  (${currentIndex + 1} / ${imageFiles.length})`;

  // Update file list highlight
  const items = fileListEl.querySelectorAll('.file-item');
  items.forEach((item, i) => {
    item.classList.toggle('active', i === currentIndex);
  });

  // Scroll active item into view
  const activeItem = fileListEl.querySelector('.file-item.active');
  if (activeItem) {
    activeItem.scrollIntoView({ block: 'nearest' });
  }

  // Load tags
  await loadCurrentTags();
  renderCurrentTags();
  renderAllTags();
}

// Load tags for current image
async function loadCurrentTags() {
  const tagFilePath = getTagFilePath(imageFiles[currentIndex]);
  if (tagFilePath) {
    currentTags = await window.api.readTags(tagFilePath);
  } else {
    currentTags = [];
  }
}

// Save tags for current image (auto-save)
async function saveTags() {
  if (currentIndex < 0 || !tagFolderPath) return;
  const tagFilePath = getTagFilePath(imageFiles[currentIndex]);
  await window.api.saveTags(tagFilePath, currentTags);
}

// Render current tags as chips
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

// Remove a tag by index
async function removeTag(index) {
  currentTags.splice(index, 1);
  renderCurrentTags();
  renderAllTags();
  await saveTags();
}

// Add a tag
async function addTag(tagText) {
  const tag = tagText.trim();
  if (!tag || currentTags.includes(tag)) return;
  currentTags.push(tag);

  // Add to global all tags if new
  if (!allTags.includes(tag)) {
    allTags.push(tag);
    allTags.sort();
  }

  renderCurrentTags();
  renderAllTags();
  await saveTags();
}

// Tag input handler
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

// Also handle comma in input value (for paste)
tagInput.addEventListener('input', async () => {
  if (tagInput.value.includes(',')) {
    const parts = tagInput.value.split(',');
    for (const part of parts) {
      const tag = part.trim();
      if (tag) {
        await addTag(tag);
      }
    }
    tagInput.value = '';
  }
});

// Navigation
btnPrev.addEventListener('click', () => {
  if (currentIndex > 0) selectImage(currentIndex - 1);
});

btnNext.addEventListener('click', () => {
  if (currentIndex < imageFiles.length - 1) selectImage(currentIndex + 1);
});

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  // Don't navigate when typing in input
  if (e.target.tagName === 'INPUT') return;

  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
    if (currentIndex > 0) selectImage(currentIndex - 1);
  } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
    if (currentIndex < imageFiles.length - 1) selectImage(currentIndex + 1);
  }
});

// Refresh all unique tags from tag folder
async function refreshAllTags() {
  if (!tagFolderPath) {
    allTags = [];
    return;
  }
  allTags = await window.api.getAllTags(tagFolderPath);
}

// Render all tags in right sidebar
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

// Search filter for all tags
allTagsSearch.addEventListener('input', () => {
  renderAllTags();
});
