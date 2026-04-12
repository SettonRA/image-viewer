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

// Fetch images from API
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
    case 'newest':  return sorted.sort((a, b) => b.modified - a.modified);
    case 'oldest':  return sorted.sort((a, b) => a.modified - b.modified);
    case 'name-asc':  return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case 'name-desc': return sorted.sort((a, b) => b.name.localeCompare(a.name));
    default: return sorted;
  }
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
    const item = document.createElement('div');
    item.className = 'gallery-item';
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-label', image.name);

    let media;
    if (image.type === 'video') {
      media = document.createElement('video');
      media.src = image.url;
      media.muted = true;
      media.preload = 'metadata';
      media.playsInline = true;
      item.classList.add('is-video');
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

    gallery.appendChild(item);
  });
}

// Lightbox
function openLightbox(index) {
  lightboxIndex = index;
  showLightboxImage();
  lightbox.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
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
  } else {
    lightboxVideo.pause();
    lightboxVideo.src = '';
    lightboxVideo.classList.add('hidden');
    lightboxImg.classList.remove('hidden');
    lightboxImg.src = image.url;
    lightboxImg.alt = image.name;
  }

  lightboxPrev.style.display = lightboxIndex === 0 ? 'none' : '';
  lightboxNext.style.display = lightboxIndex === filteredImages.length - 1 ? 'none' : '';
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
