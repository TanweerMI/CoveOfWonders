const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const sharp = require('sharp');
const session = require('express-session');
const app = express();
const port = process.env.PORT || 3000;

// Apply CORS middleware
app.use(cors());

// Middleware to parse JSON
app.use(express.json());

// Use session middleware to store verification state
app.use(session({
  secret: 'yourSecretKey',
  resave: false,
  saveUninitialized: true,
}));

// Ensure directories exist
const uploadsDir = path.join(__dirname, 'uploads');
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

// Password middleware for verification route
const password = 'oogabooga12';

const checkPassword = (req, res, next) => {
  if (req.session.isVerified) {
    return next();
  }
  const { password: pw } = req.query;
  if (pw === password) {
    req.session.isVerified = true;
    return next();
  }
  res.status(401).send(`
    <h1>Unauthorized</h1>
    <form action="/verify" method="get">
      <label for="password">Enter Password:</label>
      <input type="password" name="password" id="password" required />
      <button type="submit">Submit</button>
    </form>
  `);
};

// Route for the root path
app.get('/', (req, res) => {
  // Clear the session's verification status when accessing the main page
  req.session.isVerified = false;
  
  res.send(`
    <h1>Welcome to the Image Gallery Server!</h1>
    <a href="/verify"><button style="font-size: 20px;">Go to Verification Tab</button></a>
  `);
});

// Route for image upload
app.post('/upload', multer({ dest: tempDir }).single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = path.join(tempDir, req.file.filename);
  const resizedFilePath = path.join(tempDir, req.file.originalname);

  try {
    await sharp(filePath)
      .resize({ width: 600, height: 600, fit: 'inside' })
      .toFile(resizedFilePath);

    // Delete original file after resizing
    fs.unlinkSync(filePath);

    res.json({ imagePath: req.file.originalname });
  } catch (error) {
    res.status(500).json({ error: 'Error processing image' });
  }
});

// Route to list all images (for Unity)
app.get('/images', (req, res) => {
  fs.readdir(uploadsDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: "Unable to scan directory" });
    }
    res.json(files);
  });
});

// Route to serve images from the temporary directory
app.get('/temp/:filename', (req, res) => {
  const filePath = path.join(tempDir, req.params.filename);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).send('File not found');
    }
  });
});

// Route for verification with password protection
app.get('/verify', checkPassword, (req, res) => {
  fs.readdir(tempDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: "Unable to scan directory" });
    }
    let images = files.map(file => `
      <div style="margin-bottom: 20px;">
        <img src="/temp/${file}" width="300" /><br>
        <a href="/verify/approve/${file}"><button style="font-size: 20px;">Approve</button></a>
        <a href="/verify/reject/${file}"><button style="font-size: 20px;">Reject</button></a>
      </div>
    `).join('');
    res.send(`
      <h1>Verification Tab</h1>
      ${images}
      <a href="/"><button style="font-size: 20px;">Back to Gallery</button></a>
    `);
  });
});

// Route to approve an image
app.get('/verify/approve/:filename', checkPassword, (req, res) => {
  const filePath = path.join(tempDir, req.params.filename);
  const destinationPath = path.join(uploadsDir, req.params.filename);

  fs.rename(filePath, destinationPath, (err) => {
    if (err) {
      return res.status(500).json({ error: "Unable to move file" });
    }
    res.redirect('/verify'); // Redirect to verify tab without re-entering password
  });
});

// Route to serve images
app.get('/images/:filename', (req, res) => {
  const filePath = path.join(uploadsDir, req.params.filename);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).send('File not found');
    }
  });
});

// Route to reject an image
app.get('/verify/reject/:filename', checkPassword, (req, res) => {
  const filePath = path.join(tempDir, req.params.filename);

  fs.unlink(filePath, (err) => {
    if (err) {
      return res.status(500).json({ error: "Unable to delete file" });
    }
    res.redirect('/verify'); // Redirect to verify tab without re-entering password
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
