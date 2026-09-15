let allImages = [];
let filteredImages = [];
let lightboxIndex = 0;

const gallery = document.getElementById('gallery');
const emptyState = document.getElementById('empty-state');
const imageCount = document.getElementById('image-count');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxVideo = document.getElementById('lightbox-video');
const lightboxClose = document.getElementById('lightbox-close');
const lightboxPrev = document.getElementById('lightbox-prev');
const lightboxNext = document.getElementById('lightbox-next');
const dropOverlay = document.getElementById('drop-overlay');
const toast = document.getElementById('toast');
const storageBar = document.getElementById('storage-bar');
const storageText = document.getElementById('storage-text');
const confirmModal = document.getElementById('confirm-modal');
const confirmFilename = document.getElementById('confirm-filename');
const confirmCancel = document.getElementById('confirm-cancel');
const confirmDelete = document.getElementById('confirm-delete');
const slideshowBtn = document.getElementById('slideshow-btn');
const tagFilterDropdown = document.getElementById('tag-filter-dropdown');
const tagFilterBtn = document.getElementById('tag-filter-btn');
const tagFilterCount = document.getElementById('tag-filter-count');
const tagFilterPanel = document.getElementById('tag-filter-panel');
const tagFilterClearBtn = document.getElementById('tag-filter-clear-btn');
const lightboxTags = document.getElementById('lightbox-tags');
const multiselectBtn = document.getElementById('multiselect-btn');
const bulkBar = document.getElementById('bulk-bar');
const bulkCount = document.getElementById('bulk-count');
const bulkSelectAllBtn = document.getElementById('bulk-select-all-btn');
const bulkClearBtn = document.getElementById('bulk-clear-btn');
const bulkTagInput = document.getElementById('bulk-tag-input');
const bulkTagDropdown = document.getElementById('bulk-tag-dropdown');
const bulkPendingTagsEl = document.getElementById('bulk-pending-tags');
const bulkApplyBtn = document.getElementById('bulk-apply-btn');
const bulkDoneBtn = document.getElementById('bulk-done-btn');

let multiSelectMode = false;
let selectedImageNames = new Set();
let bulkPendingTags = []; // tags staged in the bulk bar, applied together on "Apply"

// Custom-tag filter state: tag name -> 'include' | 'exclude'. Cycles none -> include -> exclude -> none.
let tagFilterState = new Map();
let untaggedSelected = false;
let favoritesOnly = false;
let selectedTypeFilter = null; // 'image' | 'video' | null — mutually exclusive with each other

function isTagFilterActive() {
  return favoritesOnly || untaggedSelected || selectedTypeFilter !== null || tagFilterState.size > 0;
}

const ALLOWED_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif', 'mp4']);

// ── Storage meter ────────────────────────────────────────────────────────────

async function loadStorageInfo() {
  try {
    const res = await fetch('/api/storage');
    if (!res.ok) return;
    const { total, used, free } = await res.json();
    if (!total) return;
    const pct = Math.min(100, Math.round((used / total) * 100));
    const freeGB  = (free  / 1073741824).toFixed(1);
    const totalGB = (total / 1073741824).toFixed(1);
    storageBar.style.width = `${pct}%`;
    storageBar.className = 'storage-bar' + (pct > 90 ? ' danger' : pct > 70 ? ' warning' : '');
    storageText.textContent = `${freeGB} GB free of ${totalGB} GB`;
    document.getElementById('storage-meter').classList.remove('hidden');
  } catch {
    // Storage meter is non-critical — silently ignore
  }
}

// ── Drag & drop upload ───────────────────────────────────────────────────────

let dragCounter = 0;

document.addEventListener('dragenter', e => {
  if (!e.dataTransfer.types.includes('Files')) return;
  dragCounter++;
  dropOverlay.classList.remove('hidden');
});

document.addEventListener('dragleave', () => {
  dragCounter = Math.max(0, dragCounter - 1);
  if (dragCounter === 0) dropOverlay.classList.add('hidden');
});

document.addEventListener('dragover', e => e.preventDefault());

document.addEventListener('drop', async e => {
  e.preventDefault();
  dragCounter = 0;
  dropOverlay.classList.add('hidden');

  const files = Array.from(e.dataTransfer.files).filter(f => {
    const ext = f.name.split('.').pop().toLowerCase();
    return ALLOWED_EXTS.has(ext);
  });

  if (files.length === 0) {
    showToast('No supported image or video files found.', 'error');
    return;
  }

  await uploadFiles(files);
});

async function uploadFiles(files) {
  showToast(`Uploading ${files.length} file${files.length !== 1 ? 's' : ''}…`, 'info');
  const formData = new FormData();
  files.forEach(f => formData.append('files', f));

  try {
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Upload failed');
    }
    const data = await res.json();
    showToast(`Uploaded ${data.count} file${data.count !== 1 ? 's' : ''} successfully.`, 'success');
    await loadImages();
    loadStorageInfo();
  } catch (err) {
    showToast(err.message || 'Upload failed. Please try again.', 'error');
  }
}

// ── Toast ────────────────────────────────────────────────────────────────────

let toastTimer;

function showToast(message, type = 'info') {
  toast.textContent = message;
  toast.className = `toast toast-${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'toast hidden'; }, 4000);
}

// ── Delete confirmation ──────────────────────────────────────────────────────

let pendingDeleteName = null;

function promptDelete(filename) {
  pendingDeleteName = filename;
  confirmFilename.textContent = filename;
  confirmModal.classList.remove('hidden');
  confirmDelete.focus();
}

function closeConfirmModal() {
  pendingDeleteName = null;
  confirmModal.classList.add('hidden');
}

confirmCancel.addEventListener('click', closeConfirmModal);
confirmModal.addEventListener('click', e => {
  if (e.target === confirmModal) closeConfirmModal();
});
document.addEventListener('keydown', e => {
  if (!confirmModal.classList.contains('hidden') && e.key === 'Escape') closeConfirmModal();
});

confirmDelete.addEventListener('click', async () => {
  if (!pendingDeleteName) return;
  const name = pendingDeleteName;
  closeConfirmModal();

  try {
    const res = await fetch(`/api/images/${encodeURIComponent(name)}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Delete failed');
    }
    showToast(`Deleted "${name}"`, 'success');
    await loadImages();
    loadStorageInfo();
  } catch (err) {
    showToast(err.message || 'Delete failed. Please try again.', 'error');
  }
});

// ── Favorites ────────────────────────────────────────────────────────────────

async function toggleFavorite(image, starEl) {
  const adding = !image.favorite;
  const method = adding ? 'POST' : 'DELETE';
  try {
    const res = await fetch(`/api/favorites/${encodeURIComponent(image.name)}`, { method });
    if (!res.ok) throw new Error('Request failed');
    image.favorite = adding;
    starEl.classList.toggle('favorited', adding);
    starEl.setAttribute('aria-pressed', String(adding));
    starEl.setAttribute('aria-label', adding ? `Remove ${image.name} from favorites` : `Favorite ${image.name}`);
    // Re-sort so the card floats to/from the top
    renderGallery();
  } catch {
    showToast('Could not update favorite. Try again.', 'error');
  }
}
async function loadImages() {
  try {
    const res = await fetch('/api/images');
    if (!res.ok) throw new Error('Failed to fetch');
    allImages = await res.json();
    renderTagFilterPanel();
    renderGallery();
  } catch (err) {
    console.error('Error loading images:', err);
  }
}

function sortImages(images) {
  const sorted = [...images].sort((a, b) => b.modified - a.modified);
  // Favorites always float to the top
  return sorted.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));
}

function filterByTags(images) {
  let result = images;
  if (favoritesOnly) {
    result = result.filter(img => img.favorite);
  }
  if (selectedTypeFilter) {
    result = result.filter(img => img.type === selectedTypeFilter);
  }
  if (untaggedSelected) {
    result = result.filter(img => img.tags.every(t => t === 'image' || t === 'video'));
  } else if (tagFilterState.size > 0) {
    for (const [tag, state] of tagFilterState) {
      if (state === 'include') result = result.filter(img => img.tags.includes(tag));
      else result = result.filter(img => !img.tags.includes(tag));
    }
  }
  return result;
}

// ── Tags ─────────────────────────────────────────────────────────────────────

async function addTag(image, tag) {
  try {
    const res = await fetch(`/api/tags/${encodeURIComponent(image.name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to add tag');
    image.tags = data.tags;
  } catch (err) {
    showToast(err.message || 'Could not add tag.', 'error');
  }
}

// Applies one tag to many images in a single request (avoids firing hundreds of individual
// requests against the shared .tags.json file, which would race and lose updates).
async function bulkAddTags(filenames, tags) {
  try {
    const res = await fetch('/api/tags/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filenames, tags }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to apply tags');
    return data;
  } catch (err) {
    showToast(err.message || 'Could not apply tags.', 'error');
    return null;
  }
}

async function removeTag(image, tag) {
  try {
    const res = await fetch(`/api/tags/${encodeURIComponent(image.name)}/${encodeURIComponent(tag)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to remove tag');
    const data = await res.json();
    image.tags = data.tags;
  } catch {
    showToast('Could not remove tag.', 'error');
  }
}

// Builds a chip row for one image's tags, with add/remove controls.
// `onChange` is called after any tag mutation so callers can re-render whatever else depends on it.
function buildTagsElement(image, onChange) {
  const container = document.createElement('div');
  container.className = 'tag-row';

  function refresh() {
    container.innerHTML = '';

    image.tags.forEach(tag => {
      const isAuto = tag === image.type;
      const chip = document.createElement('span');
      chip.className = 'tag-chip' + (isAuto ? ' tag-chip-auto' : '');
      chip.textContent = tag;

      if (!isAuto) {
        const rm = document.createElement('button');
        rm.className = 'tag-remove';
        rm.type = 'button';
        rm.textContent = '×';
        rm.setAttribute('aria-label', `Remove tag "${tag}" from ${image.name}`);
        rm.addEventListener('click', async e => {
          e.stopPropagation();
          await removeTag(image, tag);
          refresh();
          onChange();
        });
        chip.appendChild(rm);
      }
      container.appendChild(chip);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'tag-add-btn';
    addBtn.type = 'button';
    addBtn.textContent = '+ tag';
    addBtn.setAttribute('aria-label', `Add tag to ${image.name}`);
    addBtn.addEventListener('click', e => {
      e.stopPropagation();

      const wrapper = document.createElement('div');
      wrapper.className = 'tag-input-wrapper';

      const input = document.createElement('input');
      input.className = 'tag-input';
      input.type = 'text';
      input.placeholder = 'tag name';
      input.maxLength = 40;
      input.setAttribute('autocomplete', 'off');

      const dropdown = document.createElement('div');
      dropdown.className = 'tag-dropdown hidden';

      wrapper.appendChild(input);
      wrapper.appendChild(dropdown);
      container.replaceChild(wrapper, addBtn);
      input.focus();

      let committed = false;
      const commit = async (value) => {
        if (committed) return;
        committed = true;
        const val = (value !== undefined ? value : input.value).trim();
        if (val) await addTag(image, val);
        refresh();
        onChange();
      };

      function renderDropdown() {
        const query = input.value.trim().toLowerCase();
        const already = new Set(image.tags.map(t => t.toLowerCase()));
        const options = knownTags.filter(t => !already.has(t.toLowerCase()) && (!query || t.toLowerCase().includes(query)));
        dropdown.innerHTML = '';
        dropdown.classList.toggle('hidden', options.length === 0);
        options.forEach(tag => {
          const opt = document.createElement('button');
          opt.type = 'button';
          opt.className = 'tag-dropdown-item';
          opt.textContent = tag;
          // mousedown (not click) so this fires before the input's blur handler
          opt.addEventListener('mousedown', ev => {
            ev.preventDefault();
            commit(tag);
          });
          dropdown.appendChild(opt);
        });
      }

      input.addEventListener('click', e2 => e2.stopPropagation());
      input.addEventListener('input', renderDropdown);
      input.addEventListener('focus', renderDropdown);
      input.addEventListener('keydown', ev => {
        ev.stopPropagation();
        if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
        if (ev.key === 'Escape') { committed = true; refresh(); }
      });
      input.addEventListener('blur', () => commit());

      renderDropdown();
    });
    container.appendChild(addBtn);
  }

  refresh();
  return container;
}

// All known user tags (excludes the automatic 'image'/'video' tags), for the add-tag dropdown.
let knownTags = [];

function updateKnownTags() {
  const userTags = new Set();
  allImages.forEach(img => img.tags.forEach(t => { if (t !== 'image' && t !== 'video') userTags.add(t); }));
  knownTags = [...userTags].sort((a, b) => a.localeCompare(b));
}

function updateTagFilterCount() {
  const count = (favoritesOnly ? 1 : 0) + (selectedTypeFilter ? 1 : 0) + (untaggedSelected ? 1 : tagFilterState.size);
  tagFilterCount.textContent = count > 0 ? String(count) : '';
  tagFilterCount.classList.toggle('hidden', count === 0);
  tagFilterBtn.classList.toggle('active', count > 0);
  tagFilterClearBtn.classList.toggle('hidden', !isTagFilterActive());
}

function closeTagFilterPanel() {
  tagFilterPanel.classList.add('hidden');
  tagFilterBtn.setAttribute('aria-expanded', 'false');
}

// Appends a labeled checkbox option to the filter panel; `onChange` receives the new checked state.
function appendFilterOption(container, label, checked, onChange) {
  const option = document.createElement('button');
  option.type = 'button';
  option.className = 'tag-filter-row tag-filter-row-clickable';
  option.setAttribute('aria-pressed', String(checked));

  const box = document.createElement('span');
  box.className = 'tag-filter-fakebox' + (checked ? ' on' : '');
  box.textContent = checked ? '✓' : '';
  option.appendChild(box);

  const name = document.createElement('span');
  name.className = 'tag-filter-tagname';
  name.textContent = label;
  option.appendChild(name);

  option.addEventListener('click', () => onChange(!checked));
  container.appendChild(option);
}

// Appends a tag row with a single checkbox-styled control that cycles none -> include -> exclude
// -> none on each click. Only custom tags get this three-state cycle; Favorites/Untagged/Image/
// Video (appendFilterOption) share the same fake-checkbox look but are plain two-state toggles.
// Both use a <button> styled to look like a checkbox (a real checkbox can't hold 3 states); the
// document-level "close on outside click" listener uses composedPath() so it isn't fooled when a
// click here rebuilds the panel's DOM mid-bubble.
function appendTagCheckboxRow(container, tag) {
  const state = tagFilterState.get(tag); // 'include' | 'exclude' | undefined

  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'tag-filter-row tag-filter-row-clickable';
  row.setAttribute('aria-label', `Filter by tag "${tag}": ${state || 'not applied'}`);

  const box = document.createElement('span');
  box.className = 'tag-filter-fakebox' + (state === 'include' ? ' on' : state === 'exclude' ? ' exclude' : '');
  box.textContent = state === 'include' ? '✓' : state === 'exclude' ? '✕' : '';
  row.appendChild(box);

  const name = document.createElement('span');
  name.className = 'tag-filter-tagname';
  name.textContent = tag;
  row.appendChild(name);

  row.addEventListener('click', () => {
    if (state === 'include') {
      tagFilterState.set(tag, 'exclude');
    } else if (state === 'exclude') {
      tagFilterState.delete(tag);
    } else {
      tagFilterState.set(tag, 'include');
    }
    untaggedSelected = false; // mutually exclusive with any custom-tag filter
    renderTagFilterPanel();
    renderGallery();
  });

  container.appendChild(row);
}

function renderTagFilterPanel() {
  updateKnownTags();

  const knownSet = new Set(knownTags);
  [...tagFilterState.keys()].forEach(t => { if (!knownSet.has(t)) tagFilterState.delete(t); });

  tagFilterDropdown.classList.toggle('hidden', allImages.length === 0);
  if (allImages.length === 0) {
    closeTagFilterPanel();
    updateTagFilterCount();
    return;
  }

  tagFilterPanel.innerHTML = '';

  appendFilterOption(tagFilterPanel, '★ Favorites', favoritesOnly, checked => {
    favoritesOnly = checked;
    renderTagFilterPanel();
    renderGallery();
  });

  appendFilterOption(tagFilterPanel, 'Untagged', untaggedSelected, checked => {
    untaggedSelected = checked;
    if (untaggedSelected) tagFilterState.clear(); // mutually exclusive with custom tags
    renderTagFilterPanel();
    renderGallery();
  });

  appendFilterOption(tagFilterPanel, 'Image', selectedTypeFilter === 'image', checked => {
    selectedTypeFilter = checked ? 'image' : null;
    renderTagFilterPanel();
    renderGallery();
  });

  appendFilterOption(tagFilterPanel, 'Video', selectedTypeFilter === 'video', checked => {
    selectedTypeFilter = checked ? 'video' : null;
    renderTagFilterPanel();
    renderGallery();
  });

  const divider = document.createElement('div');
  divider.className = 'tag-filter-divider';
  tagFilterPanel.appendChild(divider);

  knownTags.forEach(tag => appendTagCheckboxRow(tagFilterPanel, tag));

  updateTagFilterCount();
}

tagFilterClearBtn.addEventListener('click', () => {
  tagFilterState.clear();
  untaggedSelected = false;
  favoritesOnly = false;
  selectedTypeFilter = null;
  renderTagFilterPanel();
  renderGallery();
});

tagFilterBtn.addEventListener('click', e => {
  e.stopPropagation();
  const isOpen = !tagFilterPanel.classList.contains('hidden');
  if (isOpen) {
    closeTagFilterPanel();
  } else {
    tagFilterPanel.classList.remove('hidden');
    tagFilterBtn.setAttribute('aria-expanded', 'true');
  }
});

document.addEventListener('click', e => {
  // composedPath() is captured at dispatch time, so it stays accurate even if a handler earlier
  // in the bubble phase rebuilds the panel's DOM and detaches e.target before this listener runs.
  const path = e.composedPath ? e.composedPath() : [e.target];
  if (!path.includes(tagFilterDropdown)) closeTagFilterPanel();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !tagFilterPanel.classList.contains('hidden')) closeTagFilterPanel();
});

function onTagsChanged() {
  renderTagFilterPanel();
  renderGallery();
}

function renderGallery() {
  filteredImages = sortImages(filterByTags(allImages));

  gallery.innerHTML = '';
  gallery.classList.toggle('multiselect-mode', multiSelectMode);

  if (filteredImages.length === 0) {
    emptyState.classList.remove('hidden');
    imageCount.textContent = isTagFilterActive() ? '0 images match the selected filters' : '';
    return;
  }

  emptyState.classList.add('hidden');
  imageCount.textContent = isTagFilterActive()
    ? `${filteredImages.length} of ${allImages.length} images`
    : `${filteredImages.length} image${filteredImages.length !== 1 ? 's' : ''}`;

  filteredImages.forEach((image, index) => {
    const card = document.createElement('div');
    card.className = 'gallery-card';

    const item = document.createElement('div');
    item.className = 'gallery-item';
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-label', image.name);

    let media;
    if (image.type === 'video') {
      media = document.createElement('img');
      media.alt = image.name;
      media.loading = 'lazy';
      media.decoding = 'async';
      item.classList.add('is-video');
      // Retry thumbnail up to 4 times if ffmpeg hasn't finished yet
      (function setThumbSrc(attempts) {
        media.src = `/thumbnails/${encodeURIComponent(image.name)}.jpg?t=${Date.now()}`;
        if (attempts > 0) {
          media.onerror = () => {
            media.onerror = null;
            setTimeout(() => setThumbSrc(attempts - 1), 1500);
          };
        }
      })(4);
    } else {
      media = document.createElement('img');
      media.src = image.url;
      media.alt = image.name;
      media.loading = 'lazy';
      media.decoding = 'async';
    }

    item.appendChild(media);
    item.addEventListener('click', () => {
      if (multiSelectMode) toggleImageSelected(image.name);
      else openLightbox(index);
    });
    item.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      if (multiSelectMode) toggleImageSelected(image.name);
      else openLightbox(index);
    });

    if (multiSelectMode) {
      const selected = selectedImageNames.has(image.name);
      card.classList.toggle('card-selected', selected);
      const selectBadge = document.createElement('span');
      selectBadge.className = 'select-badge' + (selected ? ' on' : '');
      selectBadge.textContent = selected ? '✓' : '';
      item.appendChild(selectBadge);
    }

    // Star / favorite button
    const starBtn = document.createElement('button');
    starBtn.className = 'star-btn' + (image.favorite ? ' favorited' : '');
    starBtn.setAttribute('aria-label', image.favorite ? `Remove ${image.name} from favorites` : `Favorite ${image.name}`);
    starBtn.setAttribute('aria-pressed', String(!!image.favorite));
    starBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    starBtn.addEventListener('click', e => { e.stopPropagation(); toggleFavorite(image, starBtn); });
    item.appendChild(starBtn);

    const dlBtn = document.createElement('a');
    dlBtn.className = 'download-btn';
    dlBtn.href = image.url;
    dlBtn.download = image.name;
    dlBtn.setAttribute('aria-label', `Download ${image.name}`);
    dlBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download';
    dlBtn.addEventListener('click', e => e.stopPropagation());

    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.setAttribute('aria-label', `Delete ${image.name}`);
    delBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg> Delete';
    delBtn.addEventListener('click', e => { e.stopPropagation(); promptDelete(image.name); });

    const cardActions = document.createElement('div');
    cardActions.className = 'card-actions';
    cardActions.appendChild(dlBtn);
    cardActions.appendChild(delBtn);

    card.appendChild(item);
    card.appendChild(cardActions);
    gallery.appendChild(card);
  });
}

// ── Bulk select & tagging ────────────────────────────────────────────────────

function setMultiSelectMode(on) {
  multiSelectMode = on;
  multiselectBtn.classList.toggle('active', on);
  multiselectBtn.setAttribute('aria-pressed', String(on));
  bulkBar.classList.toggle('hidden', !on);
  if (!on) {
    selectedImageNames.clear();
    bulkTagInput.value = '';
    bulkTagDropdown.classList.add('hidden');
    bulkPendingTags = [];
    renderBulkPendingTags();
  }
  updateBulkBar();
  renderGallery();
}

function toggleImageSelected(name) {
  if (selectedImageNames.has(name)) selectedImageNames.delete(name);
  else selectedImageNames.add(name);
  updateBulkBar();
  renderGallery();
}

function updateBulkBar() {
  bulkCount.textContent = `${selectedImageNames.size} selected`;
}

function renderBulkTagDropdown() {
  const query = bulkTagInput.value.trim().toLowerCase();
  const staged = new Set(bulkPendingTags.map(t => t.toLowerCase()));
  const options = knownTags.filter(t => !staged.has(t.toLowerCase()) && (!query || t.toLowerCase().includes(query)));
  bulkTagDropdown.innerHTML = '';
  bulkTagDropdown.classList.toggle('hidden', options.length === 0);
  options.forEach(tag => {
    const opt = document.createElement('button');
    opt.type = 'button';
    opt.className = 'tag-dropdown-item';
    opt.textContent = tag;
    // mousedown (not click) so this fires before the input's blur handler
    opt.addEventListener('mousedown', ev => {
      ev.preventDefault();
      stageTag(tag);
    });
    bulkTagDropdown.appendChild(opt);
  });
}

function renderBulkPendingTags() {
  bulkPendingTagsEl.innerHTML = '';
  bulkPendingTags.forEach(tag => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.textContent = tag;
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'tag-remove';
    rm.textContent = '×';
    rm.setAttribute('aria-label', `Remove staged tag "${tag}"`);
    rm.addEventListener('click', () => {
      bulkPendingTags = bulkPendingTags.filter(t => t !== tag);
      renderBulkPendingTags();
    });
    chip.appendChild(rm);
    bulkPendingTagsEl.appendChild(chip);
  });
}

// Adds a tag to the staged list (not yet sent to the server — "Apply" sends them all at once).
function stageTag(rawTag) {
  const tag = rawTag.trim();
  if (!tag) return;
  if (!bulkPendingTags.some(t => t.toLowerCase() === tag.toLowerCase())) {
    bulkPendingTags.push(tag);
    renderBulkPendingTags();
  }
  bulkTagInput.value = '';
  bulkTagDropdown.classList.add('hidden');
  bulkTagInput.focus();
}

async function applyBulkTags() {
  // Commit whatever's still typed but not staged yet, so hitting Apply doesn't silently drop it
  const typed = bulkTagInput.value.trim();
  if (typed) stageTag(typed);

  if (bulkPendingTags.length === 0) {
    showToast('Add at least one tag first.', 'error');
    return;
  }
  if (selectedImageNames.size === 0) {
    showToast('Select at least one image first.', 'error');
    return;
  }

  const filenames = [...selectedImageNames];
  const tags = [...bulkPendingTags];
  const data = await bulkAddTags(filenames, tags);
  if (!data) return;

  bulkPendingTags = [];
  renderBulkPendingTags();
  const skippedNote = data.skipped.length ? ` (${data.skipped.length} skipped)` : '';
  showToast(`Applied ${data.tags.length} tag${data.tags.length !== 1 ? 's' : ''} to ${data.updated.length} image${data.updated.length !== 1 ? 's' : ''}${skippedNote}.`, 'success');

  await loadImages(); // refreshes tags/knownTags/filter panel; keeps current selection + mode
}

multiselectBtn.addEventListener('click', () => setMultiSelectMode(!multiSelectMode));
bulkDoneBtn.addEventListener('click', () => setMultiSelectMode(false));

bulkSelectAllBtn.addEventListener('click', () => {
  filteredImages.forEach(img => selectedImageNames.add(img.name));
  updateBulkBar();
  renderGallery();
});

bulkClearBtn.addEventListener('click', () => {
  selectedImageNames.clear();
  updateBulkBar();
  renderGallery();
});

bulkTagInput.addEventListener('input', renderBulkTagDropdown);
bulkTagInput.addEventListener('focus', renderBulkTagDropdown);
bulkTagInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); stageTag(bulkTagInput.value); }
  if (e.key === 'Escape') { bulkTagDropdown.classList.add('hidden'); }
});
bulkTagInput.addEventListener('blur', () => bulkTagDropdown.classList.add('hidden'));
bulkApplyBtn.addEventListener('click', () => applyBulkTags());

const isTouchDevice = () => window.matchMedia('(pointer: coarse)').matches;

// ── Slideshow ─────────────────────────────────────────────────────────────────

const SLIDESHOW_INTERVAL = 60000; // 60 seconds
let slideshowTimer = null;

function startSlideshow() {
  if (filteredImages.length === 0) return;
  openLightbox(0);
  lightbox.classList.add('slideshow-active');
  slideshowBtn.setAttribute('aria-pressed', 'true');
  slideshowBtn.classList.add('active');
  scheduleNext();
}

function stopSlideshow() {
  clearTimeout(slideshowTimer);
  slideshowTimer = null;
  lightbox.classList.remove('slideshow-active');
  slideshowBtn.setAttribute('aria-pressed', 'false');
  slideshowBtn.classList.remove('active');
}

function scheduleNext() {
  clearTimeout(slideshowTimer);
  // Restart progress bar animation
  lightbox.classList.remove('slideshow-active');
  void lightbox.offsetWidth; // force reflow
  lightbox.classList.add('slideshow-active');
  slideshowTimer = setTimeout(() => {
    if (lightbox.classList.contains('hidden')) { stopSlideshow(); return; }
    if (lightboxIndex < filteredImages.length - 1) {
      lightboxIndex++;
    } else {
      lightboxIndex = 0; // loop
    }
    showLightboxImage();
    scheduleNext();
  }, SLIDESHOW_INTERVAL);
}

slideshowBtn.addEventListener('click', () => {
  if (slideshowTimer !== null) {
    stopSlideshow();
    closeLightbox();
  } else {
    startSlideshow();
  }
});

// Lightbox
function openLightbox(index) {
  lightboxIndex = index;
  showLightboxImage();
  lightbox.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  if (isTouchDevice()) {
    const el = lightbox;
    (el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || (() => {})).call(el);
  }
}

function closeLightbox() {
  stopSlideshow();
  clearTimeout(lightboxIdleTimer);
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document);
  }
  lightbox.classList.add('hidden');
  document.body.style.overflow = '';
  lightboxImg.src = '';
  lightboxVideo.pause();
  lightboxVideo.src = '';
}

// ── Lightbox tag bar idle-fade (mirrors native video-control fade behavior) ───

const LIGHTBOX_IDLE_DELAY = 3000;
let lightboxIdleTimer = null;

function wakeLightboxTags() {
  lightboxTags.classList.remove('faded');
  scheduleLightboxIdle();
}

function scheduleLightboxIdle() {
  clearTimeout(lightboxIdleTimer);
  lightboxIdleTimer = setTimeout(() => {
    // Don't fade out while the user is actively editing a tag
    if (lightboxTags.contains(document.activeElement)) return;
    lightboxTags.classList.add('faded');
  }, LIGHTBOX_IDLE_DELAY);
}

lightbox.addEventListener('mousemove', wakeLightboxTags);
lightbox.addEventListener('touchstart', wakeLightboxTags, { passive: true });
lightboxTags.addEventListener('mouseenter', () => { clearTimeout(lightboxIdleTimer); lightboxTags.classList.remove('faded'); });
lightboxTags.addEventListener('mouseleave', scheduleLightboxIdle);
lightboxTags.addEventListener('focusin', () => { clearTimeout(lightboxIdleTimer); lightboxTags.classList.remove('faded'); });
lightboxTags.addEventListener('focusout', scheduleLightboxIdle);

function showLightboxImage() {
  const image = filteredImages[lightboxIndex];
  if (image.type === 'video') {
    lightboxImg.classList.add('hidden');
    lightboxVideo.classList.remove('hidden');
    lightboxVideo.src = image.url;
    lightboxVideo.load();
    lightboxVideo.play().catch(() => {});
  } else {
    lightboxVideo.pause();
    lightboxVideo.src = '';
    lightboxVideo.classList.add('hidden');
    lightboxImg.classList.remove('hidden');
    lightboxImg.src = image.url;
    lightboxImg.alt = image.name;
  }

  lightboxPrev.classList.toggle('nav-hidden', lightboxIndex === 0);
  lightboxNext.classList.toggle('nav-hidden', lightboxIndex === filteredImages.length - 1);

  lightboxTags.innerHTML = '';
  lightboxTags.appendChild(buildTagsElement(image, onTagsChanged));
  wakeLightboxTags();
}

function prevImage() {
  if (lightboxIndex > 0) {
    lightboxIndex--;
    showLightboxImage();
  }
}

function nextImage() {
  if (lightboxIndex < filteredImages.length - 1) {
    lightboxIndex++;
    showLightboxImage();
    if (slideshowTimer !== null) scheduleNext(); // reset timer on manual nav
  }
}

// Close lightbox if user exits fullscreen via browser controls (touch only)
document.addEventListener('fullscreenchange', () => {
  if (!isTouchDevice()) return;
  if (!document.fullscreenElement && !lightbox.classList.contains('hidden')) {
    lightbox.classList.add('hidden');
    document.body.style.overflow = '';
    lightboxImg.src = '';
    lightboxVideo.pause();
    lightboxVideo.src = '';
  }
});
document.addEventListener('webkitfullscreenchange', () => {
  if (!isTouchDevice()) return;
  if (!document.webkitFullscreenElement && !lightbox.classList.contains('hidden')) {
    lightbox.classList.add('hidden');
    document.body.style.overflow = '';
    lightboxImg.src = '';
    lightboxVideo.pause();
    lightboxVideo.src = '';
  }
});

// Swipe gesture support
let touchStartX = 0;
let touchStartY = 0;

lightbox.addEventListener('touchstart', e => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });

lightbox.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  // Require a mostly-horizontal swipe of at least 40px
  if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
  if (dx < 0) nextImage();
  else prevImage();
}, { passive: true });

// Event listeners
lightboxClose.addEventListener('click', closeLightbox);
lightboxPrev.addEventListener('click', prevImage);
lightboxNext.addEventListener('click', nextImage);

lightbox.addEventListener('click', e => {
  if (e.target === lightbox) closeLightbox();
});

document.addEventListener('keydown', e => {
  if (lightbox.classList.contains('hidden')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') prevImage();
  if (e.key === 'ArrowRight') nextImage();
});

// Init
loadImages();
loadStorageInfo();
