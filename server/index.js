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

// Serve images via static (no range needed)
app.use('/images', (req, res, next) => {
  const ext = path.extname(req.path).toLowerCase();
  if (VIDEO_EXTENSIONS.has(ext)) return next();
  express.static(IMAGES_DIR)(req, res, next);
});

// Serve videos with range request support for mobile
app.get('/images/:filename', (req, res) => {
  const filename = decodeURIComponent(req.params.filename);
  const ext = path.extname(filename).toLowerCase();
  if (!VIDEO_EXTENSIONS.has(ext)) return res.status(404).end();

  // Prevent path traversal
  const filePath = path.join(IMAGES_DIR, path.basename(filename));
  if (!filePath.startsWith(IMAGES_DIR + path.sep) && filePath !== IMAGES_DIR) {
    return res.status(403).end();
  }

  fs.stat(filePath, (err, stat) => {
    if (err) return res.status(404).end();

    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/mp4',
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });
});

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
