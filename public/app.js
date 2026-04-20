let allImages = [];
let filteredImages = [];
let lightboxIndex = 0;

const gallery = document.getElementById('gallery');
const emptyState = document.getElementById('empty-state');
const imageCount = document.getElementById('image-count');
const sortSelect = document.getElementById('sort-select');
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
    renderGallery();
  } catch (err) {
    console.error('Error loading images:', err);
  }
}

function sortImages(images, order) {
  const sorted = [...images];
  switch (order) {
    case 'newest':  sorted.sort((a, b) => b.modified - a.modified); break;
    case 'oldest':  sorted.sort((a, b) => a.modified - b.modified); break;
    case 'name-asc':  sorted.sort((a, b) => a.name.localeCompare(b.name)); break;
    case 'name-desc': sorted.sort((a, b) => b.name.localeCompare(a.name)); break;
  }
  // Favorites always float to the top
  return sorted.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));
}

function renderGallery() {
  filteredImages = sortImages(allImages, sortSelect.value);

  gallery.innerHTML = '';

  if (filteredImages.length === 0) {
    emptyState.classList.remove('hidden');
    imageCount.textContent = '';
    return;
  }

  emptyState.classList.add('hidden');
  imageCount.textContent = `${filteredImages.length} image${filteredImages.length !== 1 ? 's' : ''}`;

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
    item.addEventListener('click', () => openLightbox(index));
    item.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') openLightbox(index);
    });

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

const isTouchDevice = () => window.matchMedia('(pointer: coarse)').matches;

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
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document);
  }
  lightbox.classList.add('hidden');
  document.body.style.overflow = '';
  lightboxImg.src = '';
  lightboxVideo.pause();
  lightboxVideo.src = '';
}

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
sortSelect.addEventListener('change', renderGallery);
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
