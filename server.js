const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'your-secret-key'; // In production, use environment variable

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Database setup
const db = new sqlite3.Database('./jc_cool.db');

// Create tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    email TEXT UNIQUE,
    password TEXT,
    profile_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    filename TEXT,
    original_name TEXT,
    size INTEGER,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);
});

// File upload setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = uuidv4() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

// Routes

// Register
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    db.run(
      'INSERT INTO users (id, username, email, password) VALUES (?, ?, ?, ?)',
      [userId, username, email, hashedPassword],
      function(err) {
        if (err) {
          if (err.code === 'SQLITE_CONSTRAINT') {
            return res.status(400).json({ error: 'Username or email already exists' });
          }
          return res.status(500).json({ error: 'Database error' });
        }

        const token = jwt.sign({ userId, username }, JWT_SECRET);
        res.json({ token, userId, username });
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!user) return res.status(400).json({ error: 'User not found' });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ error: 'Invalid password' });

    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET);
    res.json({ token, userId: user.id, username: user.username });
  });
});

// Middleware to verify token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Get user profile
app.get('/api/profile', authenticateToken, (req, res) => {
  db.get('SELECT id, username, email, profile_data FROM users WHERE id = ?', [req.user.userId], (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(user);
  });
});

// Update profile
app.put('/api/profile', authenticateToken, (req, res) => {
  const { profile_data } = req.body;

  db.run('UPDATE users SET profile_data = ? WHERE id = ?', [JSON.stringify(profile_data), req.user.userId], function(err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ message: 'Profile updated' });
  });
});

// Upload file
app.post('/api/upload', authenticateToken, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const fileId = uuidv4();
  db.run(
    'INSERT INTO files (id, user_id, filename, original_name, size) VALUES (?, ?, ?, ?, ?)',
    [fileId, req.user.userId, req.file.filename, req.file.originalname, req.file.size],
    function(err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ fileId, url: `/uploads/${req.file.filename}` });
    }
  );
});

// Get user files
app.get('/api/files', authenticateToken, (req, res) => {
  db.all('SELECT * FROM files WHERE user_id = ?', [req.user.userId], (err, files) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(files);
  });
});

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// User profile page
app.get('/:username', (req, res) => {
  const { username } = req.params;
  db.get('SELECT id, profile_data FROM users WHERE username = ?', [username], (err, user) => {
    if (err || !user) return res.status(404).send('User not found');
    res.send(generateProfilePage(user.profile_data, user.id, username));
  });
});

function generateProfilePage(profileData, uuid, username) {
  const profile = JSON.parse(profileData || '{}');
  const title = profile.title || username + "'s Links";
  const bio = profile.bio || '';
  const background = profile.background || 'gradient';
  const bgColor = profile.bgColor || '#667eea';
  const bgImage = profile.bgImage || '';
  const font = profile.font || 'Arial';
  const textColor = profile.textColor || '#333333';
  const theme = profile.theme || 'light';

  let bgStyle = '';
  if (background === 'gradient') {
    bgStyle = 'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);';
  } else if (background === 'solid') {
    bgStyle = `background: ${bgColor};`;
  } else if (background === 'image' && bgImage) {
    bgStyle = `background: url('${bgImage}') no-repeat center center fixed; background-size: cover;`;
  }

  let themeStyles = '';
  let containerBg = 'rgba(255, 255, 255, 0.95)';
  if (theme === 'dark') {
    themeStyles = 'color: #ffffff;';
    containerBg = 'rgba(0, 0, 0, 0.8)';
  } else if (theme === 'colorful') {
    themeStyles = 'color: #ff6b6b;';
    containerBg = 'rgba(255, 255, 255, 0.9)';
  } else {
    themeStyles = `color: ${textColor};`;
  }

  const linksHtml = (profile.links || []).map(link => 
    `<a class="link" href="${link.url}" style="color: ${textColor}; border-color: ${textColor};" target="_blank">
      <span class="link-label">${link.label}</span>
    </a>`
  ).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: ${font}, sans-serif;
          margin: 0;
          padding: 0;
          min-height: 100vh;
          ${bgStyle}
          ${themeStyles}
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
        }
        .container {
          max-width: 720px;
          width: 95%;
          background: ${containerBg};
          padding: 40px;
          border-radius: 28px;
          box-shadow: 0 25px 80px rgba(0,0,0,0.18);
          margin: 20px;
        }
        .profile-header {
          margin-bottom: 35px;
        }
        .username-box {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 18px 32px;
          border-radius: 999px;
          background: rgba(255,255,255,0.14);
          border: 1px solid rgba(255,255,255,0.18);
          box-shadow: 0 10px 30px rgba(0,0,0,0.16);
          margin-bottom: 18px;
        }
        .username {
          font-size: 2.6em;
          font-weight: 800;
          letter-spacing: 0.02em;
          position: relative;
          cursor: help;
          color: ${textColor};
        }
        .username:hover::after {
          content: attr(data-uuid);
          position: absolute;
          top: 120%;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0,0,0,0.85);
          color: white;
          padding: 7px 14px;
          border-radius: 999px;
          font-size: 0.82em;
          white-space: nowrap;
          z-index: 1000;
        }
        .bio {
          font-size: 1.05em;
          opacity: 0.82;
          margin-bottom: 35px;
          max-width: 560px;
          margin-left: auto;
          margin-right: auto;
        }
        .links {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 18px;
          justify-items: center;
          margin-bottom: 30px;
        }
        .link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 18px 22px;
          background: rgba(255,255,255,0.18);
          border: 1px solid rgba(255,255,255,0.28);
          border-radius: 24px;
          text-decoration: none;
          font-size: 1em;
          font-weight: 700;
          min-width: 160px;
          transition: transform 0.3s ease, background 0.3s ease, box-shadow 0.3s ease;
          color: ${textColor};
        }
        .link:hover {
          transform: translateY(-4px);
          background: rgba(255,255,255,0.95);
          color: ${textColor};
          box-shadow: 0 12px 30px rgba(0,0,0,0.16);
        }
        .link-label {
          display: block;
        }
        .footer {
          margin-top: 30px;
          font-size: 0.9em;
          opacity: 0.65;
        }
        @media (max-width: 768px) {
          .container {
            padding: 30px 20px;
          }
          .username {
            font-size: 2.2em;
          }
          .link {
            padding: 16px 20px;
            min-width: 140px;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="profile-header">
          <div class="username-box">
            <div class="username" data-uuid="${uuid}" title="UUID: ${uuid}">${username}</div>
          </div>
          ${bio ? `<div class="bio">${bio}</div>` : ''}
        </div>
        <div class="links">
          ${linksHtml}
        </div>
        <div class="footer">
          Powered by jc.cool
        </div>
      </div>
    </body>
    </html>
  `;
}

app.listen(PORT, () => {
  console.log(`jc.cool server running on port ${PORT}`);
});