const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const IMAGES_DIR = path.join(__dirname, '..', 'images');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif']);
const VIDEO_EXTENSIONS = new Set(['.mp4']);

// Ensure images directory exists
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Serve images directory
app.use('/images', express.static(IMAGES_DIR));

// API: list all images sorted by modified date (newest first)
app.get('/api/images', (req, res) => {
  try {
    const files = fs.readdirSync(IMAGES_DIR);
    const images = files
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        return IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext);
      })
      .map(file => {
        const ext = path.extname(file).toLowerCase();
        const filePath = path.join(IMAGES_DIR, file);
        const stat = fs.statSync(filePath);
        return {
          name: file,
          url: `/images/${encodeURIComponent(file)}`,
          type: VIDEO_EXTENSIONS.has(ext) ? 'video' : 'image',
          size: stat.size,
          modified: stat.mtimeMs,
        };
      })
      .sort((a, b) => b.modified - a.modified);

    res.json(images);
  } catch (err) {
    console.error('Error reading images directory:', err);
    res.status(500).json({ error: 'Failed to read images' });
  }
});

app.listen(PORT, () => {
  console.log(`Image viewer running on port ${PORT}`);
  console.log(`Serving images from: ${IMAGES_DIR}`);
});
