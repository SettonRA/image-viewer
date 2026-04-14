const express = require('express');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const IMAGES_DIR = path.join(__dirname, '..', 'images');
const THUMBS_DIR = path.join(__dirname, '..', 'thumbnails');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif']);
const VIDEO_EXTENSIONS = new Set(['.mp4']);
const ALLOWED_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS]);

// Multer config for file uploads
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, IMAGES_DIR),
  filename: (req, file, cb) => {
    const safeName = path.basename(file.originalname);
    const ext = path.extname(safeName).toLowerCase();
    const base = safeName.slice(0, safeName.length - ext.length);
    let finalName = safeName;
    let counter = 1;
    while (fs.existsSync(path.join(IMAGES_DIR, finalName))) {
      finalName = `${base}_${counter}${ext}`;
      counter++;
    }
    cb(null, finalName);
  },
});

const upload = multer({
  storage: uploadStorage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${ext}`));
    }
  },
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB per file
});

// Ensure directories exist
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
if (!fs.existsSync(THUMBS_DIR)) fs.mkdirSync(THUMBS_DIR, { recursive: true });

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

// Serve thumbnails directory
app.use('/thumbnails', express.static(THUMBS_DIR));

// Generate and serve video thumbnails on demand
app.get('/thumbnails/:filename', (req, res) => {
  const baseName = path.basename(decodeURIComponent(req.params.filename));
  const thumbPath = path.join(THUMBS_DIR, baseName);

  if (fs.existsSync(thumbPath)) {
    return res.sendFile(thumbPath);
  }

  // Strip .jpg suffix added by client to find the source video
  const videoName = baseName.replace(/\.jpg$/, '');
  const videoPath = path.join(IMAGES_DIR, videoName);

  if (!fs.existsSync(videoPath)) return res.status(404).end();

  execFile('ffmpeg', [
    '-i', videoPath,
    '-ss', '00:00:01',
    '-vframes', '1',
    '-vf', 'scale=600:-1',
    '-f', 'image2',
    thumbPath,
  ], (err) => {
    if (err || !fs.existsSync(thumbPath)) {
      return res.status(500).end();
    }
    res.sendFile(thumbPath);
  });
});

// Serve thumbnails directory
app.use('/thumbnails', express.static(THUMBS_DIR));

// Generate and serve video thumbnails on demand
app.get('/thumbnails/:filename', (req, res) => {
  const baseName = path.basename(decodeURIComponent(req.params.filename));
  const thumbPath = path.join(THUMBS_DIR, baseName);

  if (fs.existsSync(thumbPath)) {
    return res.sendFile(thumbPath);
  }

  // Strip .jpg suffix added by client to find the source video
  const videoName = baseName.replace(/\.jpg$/, '');
  const videoPath = path.join(IMAGES_DIR, videoName);

  if (!fs.existsSync(videoPath)) return res.status(404).end();

  execFile('ffmpeg', [
    '-i', videoPath,
    '-ss', '00:00:01',
    '-vframes', '1',
    '-vf', 'scale=600:-1',
    '-f', 'image2',
    thumbPath,
  ], (err) => {
    if (err || !fs.existsSync(thumbPath)) {
      return res.status(500).end();
    }
    res.sendFile(thumbPath);
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

// API: upload images via multipart/form-data
app.post('/api/upload', (req, res) => {
  upload.array('files', 50)(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    res.json({
      count: req.files.length,
      uploaded: req.files.map(f => f.filename),
    });
  });
});

// API: storage info for the images volume
app.get('/api/storage', (req, res) => {
  execFile('df', ['-Pk', IMAGES_DIR], (err, stdout) => {
    if (err) return res.status(500).json({ error: 'Failed to get storage info' });
    const lines = stdout.trim().split('\n');
    if (lines.length < 2) return res.status(500).json({ error: 'Unexpected df output' });
    const parts = lines[1].trim().split(/\s+/);
    // POSIX df output: Filesystem, 1024-blocks, Used, Available, Capacity%, Mounted
    const total = parseInt(parts[1], 10) * 1024;
    const used  = parseInt(parts[2], 10) * 1024;
    const free  = parseInt(parts[3], 10) * 1024;
    res.json({ total, used, free });
  });
});

app.listen(PORT, () => {
  console.log(`Image viewer running on port ${PORT}`);
  console.log(`Serving images from: ${IMAGES_DIR}`);
});
