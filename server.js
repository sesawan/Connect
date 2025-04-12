const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { body, validationResult } = require('express-validator');
const sqlite3 = require('sqlite3').verbose();
const http = require('http');
const socketIo = require('socket.io');
const crypto = require('crypto');

const fs = require('fs');

const multer = require('multer');
const path = require('path');
const axios = require('axios');

// Configure multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, '/home/shaykhul/Downloads/Connect/uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Unique filename
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const fileTypes = /jpeg|jpg|png|gif|mp4|mov|avi|mkv/;
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = fileTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Invalid file type.'));
  }
});



// Storage configuration for videos (reels)
const videoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/reels/'); // Ensure this directory exists
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const uploadVideo = multer({ storage: videoStorage });

const app = express();
app.use('/uploads', express.static('/home/shaykhul/Downloads/Connect/uploads/'));
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Database setup
const db = new sqlite3.Database('./database.db');

// Initialize database
db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    email_verified INTEGER DEFAULT 0
  )`);

db.run(`
    CREATE TABLE IF NOT EXISTS verification_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        token TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
`, (err) => {
    if (err) {
        console.error("Error creating verification_tokens table", err.message);
    } else {
        console.log("verification_tokens table created successfully or already exists");
    }
});

  

db.run(`CREATE TABLE IF NOT EXISTS friend_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER,
    receiver_id INTEGER,
    status TEXT CHECK(status IN ('pending', 'accepted', 'rejected')),
    FOREIGN KEY(sender_id) REFERENCES users(id),
    FOREIGN KEY(receiver_id) REFERENCES users(id)
  )`);

db.run(`CREATE TABLE IF NOT EXISTS friends (
    user_id INTEGER,
    friend_id INTEGER,
    PRIMARY KEY(user_id, friend_id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(friend_id) REFERENCES users(id)
  )`);

db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER,
    receiver_id INTEGER,
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(sender_id) REFERENCES users(id),
    FOREIGN KEY(receiver_id) REFERENCES users(id)
  )`);
// Create posts table
db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    content TEXT NOT NULL,
    image TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
)`);

// Create comments table
db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER,
    user_id INTEGER,
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(post_id) REFERENCES posts(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
)`);

// Create likes table
db.run(`CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER,
    user_id INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(post_id) REFERENCES posts(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
)`);

// Ensure the 'profile_photo' column exists in the 'users' table
db.run(`ALTER TABLE users ADD COLUMN profile_photo TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
        console.error("Error adding 'profile_photo' column:", err.message);
    } else {
        console.log("'profile_photo' column added successfully or already exists.");
    }
});

// Ensure the 'video' column exists in the 'posts' table
db.run(`ALTER TABLE posts ADD COLUMN video TEXT`, (err) => {
  if (err && !err.message.includes('duplicate column name')) {
      console.error("Error adding 'video' column to posts table:", err.message);
  } else {
      console.log("'video' column added successfully or already exists in posts table.");
  }
});

// Create reels table
db.run(`CREATE TABLE IF NOT EXISTS reels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  video TEXT NOT NULL,
  caption TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
)`, (err) => {
  if (err) {
      console.error("Error creating reels table:", err.message);
  } else {
      console.log("Reels table created successfully or already exists.");
  }
});

const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Example usage
logger.info('User registered, verification token generated');

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());  // Handle JSON payloads

app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: false
}));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
  if (req.session.userId) {
    next();
  } else {
    res.redirect('/login');
  }
}

// Routes

// Home
app.get('/', (req, res) => {
  res.render('index');
});

// Registration
app.get('/register', (req, res) => {
  res.render('register', { errors: [] });
});

app.post('/register', [
  body('name').notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Enter a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).render('register', { errors: errors.array() });
  }

  const { name, email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  db.run('INSERT INTO users (name, email, password, email_verified) VALUES (?, ?, ?, ?)', [name, email, hashedPassword, 0], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed: users.email')) {
        return res.status(400).render('register', { errors: [{ msg: 'Email already registered. Please log in.' }] });
      }
      return res.status(500).render('error', { message: 'Failed to register user' });
    }

    const userId = this.lastID;
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour from now

    db.run('INSERT INTO verification_tokens (user_id, token, expires_at) VALUES (?, ?, ?)', [userId, token, expiresAt], (err) => {
      if (err) {
        return res.status(500).render('error', { message: 'Failed to store verification token' });
      }

      const verificationLink = `https://hopeful-newt-namely.ngrok-free.app/verify-email?token=${token}`;

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: 'shaykhul2004@gmail.com',
          pass: 'ulee sbdr sxws amlc'
        }
      });

      const mailOptions = {
        from: 'shaykhul2004@gmail.com',
        to: email,
        subject: 'Verify your email',
        text: `Click this link to verify your email: ${verificationLink}`
      };

      transporter.sendMail(mailOptions, (err) => {
        if (err) {
          return res.status(500).render('error', { message: 'Failed to send verification email' });
        }
        // Pass the email to the verify-email.ejs template
        res.render('verify-email', { email });
      });
    });
  });
});


// Email Verification
app.get('/verify-email', (req, res) => {
  const { token } = req.query;

  db.get('SELECT * FROM verification_tokens WHERE token = ?', [token], (err, tokenRecord) => {
    if (err || !tokenRecord) {
      return res.status(400).render('error', { message: 'Invalid or expired token' });
    }

    if (new Date(tokenRecord.expires_at) < new Date()) {
      return res.status(400).render('error', { message: 'Token has expired' });
    }

    db.run('UPDATE users SET email_verified = ? WHERE id = ?', [1, tokenRecord.user_id], (err) => {
      if (err) {
        return res.status(500).render('error', { message: 'Failed to verify email' });
      }

      db.run('DELETE FROM verification_tokens WHERE token = ?', [token], (err) => {
        if (err) {
          return res.status(500).render('error', { message: 'Failed to clean up token' });
        }
        res.render('verified');
      });
    });
  });
});

app.post('/resend-verification', async (req, res) => {
  const { email } = req.body;

  db.get('SELECT id, email_verified FROM users WHERE email = ?', [email], async (err, user) => {
    if (err || !user) {
      return res.status(400).render('error', { message: 'User not found' });
    }

    if (user.email_verified) {
      return res.status(400).render('error', { message: 'Email already verified' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour from now

    db.run('INSERT INTO verification_tokens (user_id, token, expires_at) VALUES (?, ?, ?)', [user.id, token, expiresAt], (err) => {
      if (err) {
        return res.status(500).render('error', { message: 'Failed to store verification token' });
      }

      const verificationLink = `https://hopeful-newt-namely.ngrok-free.app/verify-email?token=${token}`;

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: 'shaykhul2004@gmail.com',
          pass: 'ulee sbdr sxws amlc'
        },
      });

      const mailOptions = {
        from: 'shaykhul2004@gmail.com',
        to: email,
        subject: 'Verify your email',
        text: `Click this link to verify your email: ${verificationLink}`,
      };

      transporter.sendMail(mailOptions, (err) => {
        if (err) {
          return res.status(500).render('error', { message: 'Failed to resend verification email' });
        }
        // Render the confirmation page with acknowledgment message
        res.render('verify-email', { email, message: 'A new verification email has been sent to your email address.' });
      });
    });
  });
});


// Login
app.get('/login', (req, res) => {
  res.render('login', { errors: [] });
});

app.post('/login', [
  body('email').isEmail().withMessage('Enter a valid email'),
  body('password').notEmpty().withMessage('Password is required')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).render('login', { errors: errors.array() });
  }

  const { email, password } = req.body;

  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err || !user) {
      return res.status(401).render('login', { errors: [{ msg: 'Invalid email or password' }] });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).render('login', { errors: [{ msg: 'Invalid email or password' }] });
    }

    if (!user.email_verified) {
      return res.status(403).render('login', { errors: [{ msg: 'Please verify your email before logging in' }] });
    }

    req.session.userId = user.id;
    req.session.username = user.name;
    res.redirect('/dashboard');
  });
});

app.get('/dashboard', isAuthenticated, async (req, res) => {
  const userId = req.session.userId;

  try {
    // Retrieve user profile photo URL
    const userProfile = await new Promise((resolve, reject) => {
      db.get('SELECT profile_photo FROM users WHERE id = ?', [userId], (err, row) => err ? reject(err) : resolve(row));
    });

    // Retrieve friend requests
    const requests = await new Promise((resolve, reject) => {
      db.all(`
        SELECT friend_requests.id, users.name, users.email, users.profile_photo AS sender_photo
        FROM friend_requests
        JOIN users ON friend_requests.sender_id = users.id
        WHERE friend_requests.receiver_id = ? AND friend_requests.status = ?`,
        [userId, 'pending'],
        (err, rows) => err ? reject(err) : resolve(rows)
      );
    });

    // Retrieve friends
    const friends = await new Promise((resolve, reject) => {
      db.all(`
        SELECT users.id, users.name, users.email, users.profile_photo
        FROM friends
        JOIN users ON friends.friend_id = users.id
        WHERE friends.user_id = ?`,
        [userId],
        (err, rows) => err ? reject(err) : resolve(rows)
      );
    });

    // Retrieve friend suggestions with profile photos
    const suggestions = await new Promise((resolve, reject) => {
      db.all(`
        WITH mutuals AS (
          SELECT
            u.id,
            u.name,
            u.email,
            u.profile_photo,
            COUNT(DISTINCT f2.friend_id) AS mutual_friends
          FROM users u
          JOIN friends f1 ON f1.friend_id = u.id
          LEFT JOIN friends f2 ON f2.friend_id = f1.user_id
          WHERE u.id != ? 
            AND u.id NOT IN (
              SELECT friend_id FROM friends WHERE user_id = ?
            ) 
            AND u.id NOT IN (
              SELECT receiver_id FROM friend_requests WHERE sender_id = ?
            )
            AND u.id NOT IN (
              SELECT sender_id FROM friend_requests WHERE receiver_id = ?
            )
          GROUP BY u.id
        )
        SELECT * FROM mutuals
        ORDER BY mutual_friends DESC
        LIMIT 10`,
        [userId, userId, userId, userId],
        (err, rows) => err ? reject(err) : resolve(rows)
      );
    });

    // Retrieve posts from the user and friends, including the image filename
    const posts = await new Promise((resolve, reject) => {
	  db.all(`
	    SELECT posts.id, posts.content, posts.timestamp, posts.image, posts.video, users.name AS author, users.id AS authorId, users.profile_photo AS author_photo,
	       COUNT(likes.id) AS like_count
	    FROM posts
	    LEFT JOIN users ON posts.user_id = users.id
	    LEFT JOIN likes ON posts.id = likes.post_id
	    WHERE posts.user_id = ? OR posts.user_id IN (
	      SELECT friend_id FROM friends WHERE user_id = ?
	    )
	    GROUP BY posts.id
	    ORDER BY posts.timestamp DESC`,
	    [userId, userId],
	    (err, rows) => err ? reject(err) : resolve(rows)
	  );
	});


    // Retrieve comments for each post
    const postComments = await new Promise((resolve, reject) => {
      db.all(`
        SELECT comments.id, comments.post_id, comments.content, comments.timestamp, users.name AS author
        FROM comments
        JOIN users ON comments.user_id = users.id
        WHERE comments.post_id IN (${posts.map(p => p.id).join(',')})`,
        [],
        (err, rows) => err ? reject(err) : resolve(rows)
      );
    });

    const reels = await new Promise((resolve, reject) => {
            db.all('SELECT reels.id, reels.user_id, reels.video, reels.caption, reels.timestamp, users.name AS author, users.profile_photo AS author_photo FROM reels JOIN users ON reels.user_id = users.id WHERE reels.user_id = ? OR reels.user_id IN (SELECT friend_id FROM friends WHERE user_id = ?) ORDER BY reels.timestamp DESC', [userId, userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        res.render('dashboard', {
            username: req.session.username,
            userId: userId,
            profilePhoto: userProfile.profile_photo,
            requests,
            friends,
            suggestions,
            posts,
            postComments,
            reels, // Include reels in the dashboard
            searchResults: [] // Initialize search results as an empty array
        });

    } catch (error) {
        console.error("Error loading dashboard data:", error);
        res.status(500).render('error', { message: 'Failed to retrieve data' });
    }
});

// Serve static files (including video files)
app.use('/uploads/reels', express.static(path.join(__dirname, 'uploads/reels')));

app.post('/create-post', isAuthenticated, upload.single('media'), (req, res) => {
  const { content } = req.body;
  const userId = req.session.userId;
  const media = req.file ? req.file.filename : null;
  const isVideo = media && (media.endsWith('.mp4') || media.endsWith('.mov') || media.endsWith('.avi') || media.endsWith('.mkv'));

  db.run(
    'INSERT INTO posts (user_id, content, image, video, timestamp) VALUES (?, ?, ?, ?, ?)',
    [userId, content, isVideo ? null : media, isVideo ? media : null, new Date()],
    function (err) {
      if (err) {
        console.error("Failed to create post:", err);
        return res.status(500).json({ success: false, message: "Failed to create post." });
      }
      res.json({
        success: true,
        message: "Post created successfully.",
        post: {
          id: this.lastID,
          content,
          media,
          timestamp: new Date(),
          authorId: userId,
          isVideo
        }
      });
    }
  );
});


app.post('/create-reel', isAuthenticated, uploadVideo.single('video'), (req, res) => {
    const userId = req.session.userId;
    const caption = req.body.caption;
    const video = req.file ? req.file.filename : null;

    db.run(
        'INSERT INTO reels (user_id, video, caption) VALUES (?, ?, ?)',
        [userId, video, caption],
        function (err) {
            if (err) {
                console.error("Failed to create reel:", err);
                return res.status(500).json({ success: false, message: "Failed to create reel." });
            }
            res.json({
                success: true,
                message: "Reel created successfully.",
                reel: {
                    id: this.lastID,
                    caption,
                    video,
                    timestamp: new Date()
                }
            });
        }
    );
});
app.get('/reels', async (req, res) => {
    try {
        const reels = await new Promise((resolve, reject) => {
            db.all('SELECT reels.id, reels.user_id, reels.video, reels.caption, reels.timestamp, users.name AS author, users.profile_photo AS author_photo FROM reels JOIN users ON reels.user_id = users.id ORDER BY reels.timestamp DESC', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        res.render('reels', {
            reels
        });
    } catch (error) {
        console.error("Error loading reels:", error);
        res.status(500).render('error', { message: 'Failed to retrieve reels' });
    }
});

// Create Comment Route with AJAX support
app.post('/create-comment', isAuthenticated, (req, res) => {
  const { content, post_id } = req.body;
  const userId = req.session.userId;

  db.run(
    'INSERT INTO comments (post_id, user_id, content, timestamp) VALUES (?, ?, ?, ?)',
    [post_id, userId, content, new Date()],
    function (err) {
      if (err) {
        console.error("Failed to create comment:", err);
        return res.status(500).json({ success: false, message: "Failed to create comment." });
      }
      res.json({ success: true, message: "Comment added successfully.", commentId: this.lastID });
    }
  );
});

/// Like/Unlike Post Route
app.post('/like-post', isAuthenticated, (req, res) => {
    const { post_id } = req.body;
    const userId = req.session.userId;

    if (!post_id || !userId) {
        return res.status(400).json({ success: false, message: "Invalid request parameters." });
    }

    // Check if the user has already liked the post
    db.get('SELECT * FROM likes WHERE post_id = ? AND user_id = ?', [post_id, userId], (err, row) => {
        if (err) {
            console.error("Failed to check like status:", err);
            return res.status(500).json({ success: false, message: "Failed to check like status." });
        }

        if (row) {
            // User has liked the post, so we need to unlike it
            db.run('DELETE FROM likes WHERE post_id = ? AND user_id = ?', [post_id, userId], function (err) {
                if (err) {
                    console.error("Failed to unlike post:", err);
                    return res.status(500).json({ success: false, message: "Failed to unlike post." });
                }

                // Update the like count in the post table
                db.run('UPDATE posts SET like_count = like_count - 1 WHERE id = ?', [post_id], function (err) {
                    if (err) {
                        console.error("Failed to update like count:", err);
                        return res.status(500).json({ success: false, message: "Failed to update like count." });
                    }

                    // Fetch the updated like count
                    db.get('SELECT like_count FROM posts WHERE id = ?', [post_id], (err, row) => {
                        if (err) {
                            console.error("Failed to get updated like count:", err);
                            return res.status(500).json({ success: false, message: "Failed to get updated like count." });
                        }

                        res.json({ success: true, message: "Post unliked successfully.", like_count: row.like_count, action: 'unlike' });
                    });
                });
            });
        } else {
            // User has not liked the post, so we need to like it
            db.run('INSERT INTO likes (post_id, user_id) VALUES (?, ?)', [post_id, userId], function (err) {
                if (err) {
                    // Handle unique constraint error
                    if (err.code === 'SQLITE_CONSTRAINT') {
                        return res.status(400).json({ success: false, message: "Like already exists." });
                    }
                    console.error("Failed to like post:", err);
                    return res.status(500).json({ success: false, message: "Failed to like post." });
                }

                // Update the like count in the post table
                db.run('UPDATE posts SET like_count = like_count + 1 WHERE id = ?', [post_id], function (err) {
                    if (err) {
                        console.error("Failed to update like count:", err);
                        return res.status(500).json({ success: false, message: "Failed to update like count." });
                    }

                    // Fetch the updated like count
                    db.get('SELECT like_count FROM posts WHERE id = ?', [post_id], (err, row) => {
                        if (err) {
                            console.error("Failed to get updated like count:", err);
                            return res.status(500).json({ success: false, message: "Failed to get updated like count." });
                        }

                        res.json({ success: true, message: "Post liked successfully.", like_count: row.like_count, action: 'like' });
                    });
                });
            });
        }
    });
});

const redis = require('redis');
const client = redis.createClient({
  url: 'redis://localhost:6379'
});

client.on('error', (err) => {
  console.error('Redis Client Error', err);
});

(async () => {
  try {
    await client.connect();
    console.log('Redis client connected');
  } catch (err) {
    console.error('Failed to connect to Redis:', err);
  }
})();

// Function to get videos from cache
async function getVideosFromCache(userId, page, limit) {
  const cacheKey = `videos:${userId}:${page}:${limit}`;
  try {
    const cachedData = await client.get(cacheKey);
    return cachedData ? JSON.parse(cachedData) : null;
  } catch (err) {
    console.error('Error fetching from Redis cache:', err);
    return null;
  }
}

// Function to set videos in cache
async function setVideosCache(userId, page, limit, data) {
  const cacheKey = `videos:${userId}:${page}:${limit}`;
  try {
    await client.setEx(cacheKey, 36, JSON.stringify(data)); // Cache for 1 hour 3600 sec. i changed it for test
  } catch (err) {
    console.error('Error setting Redis cache:', err);
  }
}

app.get('/videos', isAuthenticated, async (req, res) => {
  const userId = req.session.userId;
  const page = parseInt(req.query.page, 10) || 1; // Get page from query params
  const limit = parseInt(req.query.limit, 10) || 10; // Get limit from query params

  try {
    let videos = await getVideosFromCache(userId, page, limit);
    if (!videos) {
      videos = await new Promise((resolve, reject) => {
        db.all(
          `SELECT posts.id, posts.content, posts.video, posts.timestamp, users.name AS author,
                  users.profile_photo AS author_profile_photo, COUNT(likes.id) AS like_count
           FROM posts
           LEFT JOIN users ON posts.user_id = users.id
           LEFT JOIN likes ON posts.id = likes.post_id
           WHERE posts.video IS NOT NULL
             AND (posts.user_id = ? OR posts.user_id IN (
               SELECT friend_id FROM friends WHERE user_id = ?
             ))
           GROUP BY posts.id
           ORDER BY posts.timestamp DESC
           LIMIT ? OFFSET ?`,
          [userId, userId, limit, (page - 1) * limit],
          (err, rows) => err ? reject(err) : resolve(rows)
        );
      });
      await setVideosCache(userId, page, limit, videos);
    }

    res.render('videos', {
      username: req.session.username,
      userId: userId,
      videos
    });

  } catch (error) {
    console.error("Error loading video posts:", error);
    res.status(500).render('error', { message: 'Failed to retrieve video posts' });
  }
});

app.get('/more-videos', isAuthenticated, async (req, res) => {
  const userId = req.session.userId;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;

  try {
    const offset = (page - 1) * limit;

    let videos = await getVideosFromCache(userId, page, limit);
    if (!videos) {
      videos = await new Promise((resolve, reject) => {
        db.all(
          `SELECT posts.id, posts.content, posts.video, posts.timestamp, users.name AS author,
                 COUNT(likes.id) AS like_count
          FROM posts
          LEFT JOIN users ON posts.user_id = users.id
          LEFT JOIN likes ON posts.id = likes.post_id
          WHERE posts.video IS NOT NULL
            AND (posts.user_id = ? OR posts.user_id IN (
              SELECT friend_id FROM friends WHERE user_id = ?
            ))
          GROUP BY posts.id
          ORDER BY posts.timestamp DESC
          LIMIT ? OFFSET ?`,
          [userId, userId, limit, offset],
          (err, rows) => err ? reject(err) : resolve(rows)
        );
      });
      await setVideosCache(userId, page, limit, videos);
    }

    const morePosts = videos.length === limit;

    res.json({
      success: true,
      posts: videos,
      has_more: morePosts
    });

  } catch (error) {
    console.error("Error loading more video posts:", error);
    res.status(500).json({ success: false, message: 'Failed to retrieve more video posts' });
  }
});

// Cleanup Redis client on exit
process.on('SIGTERM', async () => {
  try {
    await client.quit();
    console.log('Redis client disconnected on SIGTERM');
  } catch (err) {
    console.error('Error disconnecting Redis client on SIGTERM:', err);
  } finally {
    process.exit(0);
  }
});

process.on('SIGINT', async () => {
  try {
    await client.quit();
    console.log('Redis client disconnected on SIGINT');
  } catch (err) {
    console.error('Error disconnecting Redis client on SIGINT:', err);
  } finally {
    process.exit(0);
  }
});

// Route to get comments for a video
app.get('/video-comments/:videoId', isAuthenticated, async (req, res) => {
  const { videoId } = req.params;
  
  try {
    const comments = await new Promise((resolve, reject) => {
      db.all(
        `SELECT comments.id, comments.content, comments.timestamp, users.name AS author
         FROM comments
         LEFT JOIN users ON comments.user_id = users.id
         WHERE comments.post_id = ?
         ORDER BY comments.timestamp ASC`,
        [videoId],
        (err, rows) => err ? reject(err) : resolve(rows)
      );
    });
    
    res.json({ success: true, comments });
  } catch (error) {
    console.error("Error loading comments:", error);
    res.status(500).json({ success: false, message: 'Failed to retrieve comments' });
  }
});

// Route to create a comment
app.post('/create-comment', isAuthenticated, (req, res) => {
  const { content, post_id } = req.body;
  const userId = req.session.userId;

  db.run(
    'INSERT INTO comments (post_id, user_id, content, timestamp) VALUES (?, ?, ?, ?)',
    [post_id, userId, content, new Date()],
    function (err) {
      if (err) {
        console.error("Failed to create comment:", err);
        return res.status(500).json({ success: false, message: "Failed to create comment." });
      }
      res.json({ success: true, message: "Comment added successfully.", commentId: this.lastID });
    }
  );
});

const Fuse = require('fuse.js');

// Search for friends
app.get('/search', isAuthenticated, (req, res) => {
  const { query } = req.query;

  // Trim and normalize whitespace in the query
  const trimmedQuery = query ? query.trim().replace(/\s+/g, ' ') : '';

  if (trimmedQuery === '') {
    return res.status(400).render('search-results', { users: [], error: 'Search query cannot be empty' });
  }

  // Fetch users from the database
  db.all('SELECT id, name, email FROM users WHERE id != ?', [req.session.userId], (err, users) => {
    if (err) {
      console.error('Database query error:', err);
      return res.status(500).render('error', { message: 'Failed to fetch users' });
    }

    // Create a Fuse instance with options for fuzzy searching
    const fuse = new Fuse(users, {
      keys: ['name'],
      threshold: 0.3 // Adjust the threshold to control the fuzziness
    });

    // Perform the search
    const results = fuse.search(trimmedQuery).map(result => result.item);

    res.render('search-results', { users: results, error: null });
  });
});

/// Send friend request
app.post('/send-friend-request', isAuthenticated, [
  body('receiverId').isInt().withMessage('Invalid user ID')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).render('error', { message: 'Invalid friend request', errors: errors.array() });
  }

  const { receiverId } = req.body;
  const senderId = req.session.userId;

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    db.get('SELECT * FROM users WHERE id = ?', [receiverId], (err, receiver) => {
      if (err) {
        db.run('ROLLBACK');
        return res.status(500).render('error', { message: 'Error checking receiver existence' });
      }
      if (!receiver) {
        db.run('ROLLBACK');
        return res.status(404).render('error', { message: 'Receiver not found' });
      }

      // Check existing friendships
      db.get('SELECT * FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)', [senderId, receiverId, receiverId, senderId], (err, existingFriendship) => {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).render('error', { message: 'Error checking existing friendships' });
        }
        if (existingFriendship) {
          db.run('ROLLBACK');
          return res.status(400).render('error', { message: 'Already friends' });
        }

        // Check existing friend requests
        db.get('SELECT * FROM friend_requests WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)', [senderId, receiverId, receiverId, senderId], (err, existingRequest) => {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).render('error', { message: 'Error checking existing friend requests' });
          }

          if (existingRequest) {
            if (existingRequest.status === 'pending') {
              db.run('ROLLBACK');
              return res.status(400).render('error', { message: 'Friend request already sent' });
            } else {
              db.run('DELETE FROM friend_requests WHERE id = ?', [existingRequest.id], (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  return res.status(500).render('error', { message: 'Error removing previous friend request' });
                }

                db.run('INSERT INTO friend_requests (sender_id, receiver_id, status) VALUES (?, ?, ?)', [senderId, receiverId, 'pending'], (err) => {
                  if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).render('error', { message: 'Failed to send friend request' });
                  }

                  db.run('COMMIT');
                  res.redirect('/dashboard');
                });
              });
            }
          } else {
            db.run('INSERT INTO friend_requests (sender_id, receiver_id, status) VALUES (?, ?, ?)', [senderId, receiverId, 'pending'], (err) => {
              if (err) {
                db.run('ROLLBACK');
                return res.status(500).render('error', { message: 'Failed to send friend request' });
              }

              db.run('COMMIT');
              res.redirect('/dashboard');
            });
          }
        });
      });
    });
  });
});


// Accept friend request continuation
app.post('/accept-friend-request', isAuthenticated, [
  body('requestId').isInt().withMessage('Invalid request ID')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).render('error', { message: 'Invalid friend request' });
  }

  const { requestId } = req.body;
  const userId = req.session.userId;

  db.serialize(() => {
    db.get('SELECT * FROM friend_requests WHERE id = ? AND receiver_id = ?', [requestId, userId], (err, request) => {
      if (err || !request) {
        return res.status(400).render('error', { message: 'Invalid friend request' });
      }

      db.run('BEGIN TRANSACTION');

      db.run('UPDATE friend_requests SET status = ? WHERE id = ?', ['accepted', requestId], (err) => {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).render('error', { message: 'Failed to accept friend request' });
        }

        db.run('INSERT INTO friends (user_id, friend_id) VALUES (?, ?), (?, ?)', 
          [userId, request.sender_id, request.sender_id, userId], (err) => {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).render('error', { message: 'Failed to add friend' });
          }

          db.run('COMMIT');
          res.redirect('/dashboard');
        });
      });
    });
  });
});



// Decline friend request
app.post('/decline-friend-request', isAuthenticated, [
  body('requestId').isInt().withMessage('Invalid request ID')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).render('error', { message: 'Invalid friend request' });
  }

  const { requestId } = req.body;
  const userId = req.session.userId;

  db.serialize(() => {
    db.get('SELECT * FROM friend_requests WHERE id = ? AND receiver_id = ?', [requestId, userId], (err, request) => {
      if (err || !request) {
        return res.status(400).render('error', { message: 'Invalid friend request' });
      }

      db.run('UPDATE friend_requests SET status = ? WHERE id = ?', ['rejected', requestId], (err) => {
        if (err) {
          return res.status(500).render('error', { message: 'Failed to decline friend request' });
        }
        res.redirect('/dashboard');
      });
    });
  });
});

/// Remove friend
app.post('/remove-friend', isAuthenticated, [
  body('friendId').isInt().withMessage('Invalid friend ID')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).render('error', { message: 'Invalid friend ID', errors: errors.array() });
  }

  const { friendId } = req.body;
  const userId = req.session.userId;

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    db.get('SELECT * FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)', [userId, friendId, friendId, userId], (err, friendship) => {
      if (err) {
        db.run('ROLLBACK');
        return res.status(500).render('error', { message: 'Error retrieving friendship' });
      }
      if (!friendship) {
        db.run('ROLLBACK');
        return res.status(400).render('error', { message: 'Friendship not found' });
      }

      db.run('DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)', [userId, friendId, friendId, userId], (err) => {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).render('error', { message: 'Failed to remove friend' });
        }

        // Remove any pending friend request from the removed friend
        db.run('DELETE FROM friend_requests WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)', [userId, friendId, friendId, userId], (err) => {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).render('error', { message: 'Error removing pending friend request' });
          }

          db.run('COMMIT');
          res.redirect('/dashboard');
        });
      });
    });
  });
});

app.get('/friends', isAuthenticated, async (req, res) => {
  const userId = req.session.userId;

  try {
    const suggestions = await getAdvancedFriendSuggestions(userId);

    res.render('friends', {
      username: req.session.username,
      userId: userId,
      suggestions
    });
  } catch (error) {
    console.error("Error fetching friend suggestions:", error);
    res.status(500).render('error', { message: 'Failed to retrieve friend suggestions' });
  }
});

app.get('/notifications', isAuthenticated, (req, res) => {
  const userId = req.session.userId;
  console.log(`Fetching notifications for user ID: ${userId}`);

  db.all(
    `SELECT fr.id, fr.sender_id, u.name AS sender_name, u.profile_photo AS sender_photo
     FROM friend_requests fr
     JOIN users u ON fr.sender_id = u.id
     WHERE fr.receiver_id = ? AND fr.status = ?`,
    [userId, 'pending'],
    (err, requests) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to load notifications' });
      }

      console.log('Friend requests:', requests);
      res.json({ friendRequests: requests });
    }
  );
});


app.get('/chat/:friendId', isAuthenticated, (req, res) => {
  const { friendId } = req.params;
  const userId = req.session.userId;

  db.serialize(() => {
    // Fetch user's profile information
    db.get('SELECT name, profile_photo FROM users WHERE id = ?', [userId], (err, userProfile) => {
      if (err || !userProfile) {
        console.error('Failed to retrieve user profile:', err);
        return res.status(500).render('error', { message: 'Failed to retrieve user profile' });
      }

      // Check if the users are friends
      db.get('SELECT * FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)', [userId, friendId, friendId, userId], (err, friendship) => {
        if (err || !friendship) {
          console.error('Friendship check failed:', err);
          return res.status(400).render('error', { message: 'You are not friends with this user' });
        }

        // Fetch chat messages
        db.all('SELECT * FROM messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) ORDER BY timestamp ASC', [userId, friendId, friendId, userId], (err, messages) => {
          if (err) {
            console.error('Failed to retrieve chat messages:', err);
            return res.status(500).render('error', { message: 'Failed to retrieve chat messages' });
          }

          // Fetch friend's profile (name and profile photo)
          db.get('SELECT name, profile_photo FROM users WHERE id = ?', [friendId], (err, friend) => {
            if (err) {
              console.error('Failed to fetch friend\'s information:', err);
              return res.status(500).render('error', { message: 'Failed to retrieve friend\'s information' });
            }
            if (!friend) {
              console.error('No user found with the provided friendId:', friendId);
              return res.status(500).render('error', { message: 'Friend\'s information not found' });
            }

            // Fetch user's friends list with last message timestamp and content
            db.all(`
              SELECT u.id, u.name, u.profile_photo, MAX(m.timestamp) AS last_message_time, 
                     (SELECT content FROM messages m2 
                      WHERE (m2.sender_id = u.id AND m2.receiver_id = ?) 
                         OR (m2.sender_id = ? AND m2.receiver_id = u.id)
                      ORDER BY m2.timestamp DESC 
                      LIMIT 1) AS last_message_content
              FROM friends f
              JOIN users u ON f.friend_id = u.id
              LEFT JOIN messages m ON (m.sender_id = u.id AND m.receiver_id = ?) 
                                    OR (m.sender_id = ? AND m.receiver_id = u.id)
              WHERE f.user_id = ?
              GROUP BY u.id, u.name, u.profile_photo
              ORDER BY last_message_time DESC
            `, [userId, userId, userId, userId, userId], (err, friends) => {
              if (err) {
                console.error('Failed to fetch friends list:', err);
                return res.status(500).render('error', { message: 'Failed to retrieve friends list' });
              }

              res.render('chat', {
                userId: userId,
                userProfile: userProfile, // Pass user's profile to the template
                friendId: friendId,
                friendPhoto: friend.profile_photo, // Pass friend's profile photo to the template
                friendName: friend.name, // Pass friend's name if you still want to display it
                messages: messages,
                friends: friends // Pass friends list to the template
              });
            });
          });
        });
      });
    });
  });
});


app.post('/message-seen', isAuthenticated, (req, res) => {
  const { messageId } = req.body;
  const userId = req.session.userId;

  db.run('INSERT OR REPLACE INTO message_status (message_id, user_id, seen) VALUES (?, ?, ?)', [messageId, userId, true], function (err) {
    if (err) {
      console.error('Failed to update message seen status:', err);
      return res.status(500).json({ error: 'Failed to update message seen status' });
    }
    res.json({ success: true });
  });
});


const handleError = (err, message, socket) => {
  console.error(`${message}:`, err);
  socket.emit('errorMessage', { message: 'An error occurred. Please try again later.' });
};

const onlineUsers = new Map();
const typingUsers = new Map(); // Map to track typing users and their timeouts (roomName -> {userId: timeoutId})

const TYPING_TIMEOUT = 3000; // Time in milliseconds to clear typing indicator if no activity

// Utility function to generate room name
const getRoomName = (userId, friendId) => `room_${[userId, friendId].sort().join('_')}`;

// Utility function to fetch chat history
const fetchChatHistory = (db, userId, friendId) => {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)', 
      [userId, friendId, friendId, userId], 
      (err, rows) => err ? reject(err) : resolve(rows)
    );
  });
};

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Handle joining a room
  socket.on('joinRoom', async ({ userId, friendId }) => {
    const roomName = getRoomName(userId, friendId);
    
    try {
      socket.join(roomName);
      console.log(`User ${userId} joined room with ${friendId}`);

      const rows = await fetchChatHistory(db, userId, friendId);
      socket.emit('chatHistory', rows);

      // Update online status
      io.emit('updateOnlineStatus', Array.from(onlineUsers.keys()));
      socket.broadcast.emit('userOnline', { userId });
    } catch (err) {
      handleError(err, 'Failed to join room', socket);
    }
  });

  // Handle sending a message
  socket.on('sendMessage', async (message) => {
  const { senderId, receiverId, content } = message;
  const roomName = getRoomName(senderId, receiverId);

  try {
    // Insert message and get its ID
    const result = await new Promise((resolve, reject) => {
      db.run('INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)', 
        [senderId, receiverId, content], 
        function (err) {
          if (err) return reject(err);
          resolve(this.lastID);
        }
      );
    });

    const messageId = result;

    // Notify the receiver about the new message
    io.to(roomName).emit('receiveMessage', { ...message, messageId });

  } catch (err) {
    handleError(err, 'Failed to save message', socket);
  }
});

socket.on('messageSeen', async ({ messageId, userId }) => {
  try {
    await new Promise((resolve, reject) => {
      db.run('INSERT OR REPLACE INTO message_status (message_id, user_id, seen) VALUES (?, ?, ?)', [messageId, userId, true], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    // Notify the sender that the message has been seen
    socket.broadcast.emit('messageSeen', { messageId, userId });

  } catch (err) {
    handleError(err, 'Failed to update message seen status', socket);
  }
});

  // Handle typing event
  socket.on('typing', ({ userId, friendId }) => {
    const roomName = getRoomName(userId, friendId);

    try {
      if (!typingUsers.has(roomName)) {
        typingUsers.set(roomName, {});
      }
      const timeouts = typingUsers.get(roomName);

      // Clear existing timeout if it exists
      if (timeouts[userId]) {
        clearTimeout(timeouts[userId]);
        delete timeouts[userId];
      }

      // Set a new timeout to clear typing status
      const timeoutId = setTimeout(() => {
        socket.broadcast.to(roomName).emit('userStoppedTyping', { userId });
        handleTypingTimeout(roomName, userId);
      }, TYPING_TIMEOUT);

      timeouts[userId] = timeoutId;
      socket.broadcast.to(roomName).emit('userTyping', { userId });
    } catch (err) {
      handleError(err, 'Failed to send typing status', socket);
    }
  });
  
   // Video Call Offer
  socket.on('offer', (data) => {
    const { offer, friendId } = data;
    socket.to(friendId).emit('offer', { offer });
  });

  // Video Call Answer
  socket.on('answer', (data) => {
    const { answer, friendId } = data;
    socket.to(friendId).emit('answer', { answer });
  });

  // ICE Candidate
  socket.on('iceCandidate', (data) => {
    const { candidate, friendId } = data;
    socket.to(friendId).emit('iceCandidate', { candidate });
  });

  // End Call
  socket.on('endCall', (data) => {
    const { friendId } = data;
    socket.to(friendId).emit('endCall');
  });

  // Handle stop typing event
  socket.on('stopTyping', ({ userId, friendId }) => {
    const roomName = getRoomName(userId, friendId);

    try {
      handleTypingTimeout(roomName, userId);
      socket.broadcast.to(roomName).emit('userStoppedTyping', { userId });
    } catch (err) {
      handleError(err, 'Failed to send stop typing status', socket);
    }
  });

  // Handle user coming online
  socket.on('userOnline', (userId) => {
    onlineUsers.set(userId, socket.id);
    io.emit('updateOnlineStatus', Array.from(onlineUsers.keys()));
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
    let disconnectedUserId;
    for (const [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        disconnectedUserId = userId;
        onlineUsers.delete(userId);
        break;
      }
    }

    if (disconnectedUserId) {
      io.emit('updateOnlineStatus', Array.from(onlineUsers.keys()));
    }

    for (const [roomName, timeouts] of typingUsers.entries()) {
      if (timeouts[disconnectedUserId]) {
        clearTimeout(timeouts[disconnectedUserId]);
        delete timeouts[disconnectedUserId];
      }

      if (Object.keys(timeouts).length === 0) {
        typingUsers.delete(roomName);
      }
    }
  });

  // Utility function to handle typing timeout
  const handleTypingTimeout = (roomName, userId) => {
    if (typingUsers.has(roomName)) {
      const timeouts = typingUsers.get(roomName);
      if (timeouts[userId]) {
        clearTimeout(timeouts[userId]);
        delete timeouts[userId];
      }
      if (Object.keys(timeouts).length === 0) {
        typingUsers.delete(roomName);
      }
    }
  };
});





io.on('connection', (socket) => {
  console.log('a user connected');

  socket.on('new_post', (data) => {
    io.emit('new_post', data); // Broadcast to all connected clients
  });

  socket.on('new_comment', (data) => {
    io.emit('new_comment', data); // Broadcast to all connected clients
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
});


// Serve static files from the "public" directory
app.use(express.static('public'));

// Body parser middleware
app.use(express.urlencoded({ extended: true }));

// Route to view user profile
app.get('/profile/:userId', isAuthenticated, (req, res) => {
  const { userId } = req.params;
  const loggedInUserId = req.session.userId;

  db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user) {
      return res.status(404).render('error', { message: 'User not found' });
    }

    db.all('SELECT * FROM users INNER JOIN friends ON users.id = friends.friend_id WHERE friends.user_id = ?', [userId], (err, friends) => {
      if (err) {
        return res.status(500).render('error', { message: 'Failed to retrieve friends' });
      }

      db.get('SELECT * FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)', [loggedInUserId, userId, userId, loggedInUserId], (err, friendship) => {
        if (err) {
          return res.status(500).render('error', { message: 'Failed to check friendship status' });
        }

        const isFriend = Boolean(friendship) || userId === loggedInUserId;

        res.render('profile', {
          user: user,
          isFriend: isFriend,
          friends: friends,
          loggedInUserId: loggedInUserId
        });
      });
    });
  });
});

// Route to handle profile photo upload
app.post('/profile/photo', isAuthenticated, upload.single('profilePhoto'), (req, res) => {
  const loggedInUserId = req.session.userId;
  const photoPath = req.file ? `/uploads/${req.file.filename}` : null;

  if (photoPath) {
    db.run('UPDATE users SET profile_photo = ? WHERE id = ?', [photoPath, loggedInUserId], (err) => {
      if (err) {
        console.error('Error updating profile photo:', err);
        return res.status(500).render('error', { message: 'Failed to update profile photo' });
      }

      res.redirect(`/profile/${loggedInUserId}`);
    });
  } else {
    res.status(400).render('error', { message: 'No file uploaded' });
  }
});




const API_KEY = '12345678';

// Serve the index page
app.get('/', (req, res) => {
    res.render('index');
});

// Handle form submission with AJAX
app.post('/chatai', async (req, res) => {
    const userMessage = req.body.message;

    try {
        // Make a POST request to the Python API with the API key in headers
        const response = await axios.post('http://127.0.0.1:5000/chatai', {
            message: userMessage
        }, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        // Send response as JSON
        res.json({ response: response.data.response });
    } catch (error) {
        console.error('Error making request to Python API:', error.message);
        res.json({ error: 'Error occurred while processing your message.' });
    }
});

app.post('/send-chat-message', async (req, res) => {
    const userMessage = req.body.message;

    try {
        const response = await fetch('http://localhost:5000/chatai', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer 12345678',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message: userMessage })
        });

        const data = await response.json();
        res.json({ response: data.response });
    } catch (error) {
        console.error("Error communicating with AI server:", error);
        res.status(500).json({ response: 'Sorry, something went wrong. Please try again later.' });
    }
});




// Logout
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).render('error', { message: 'Failed to log out' });
    }
    res.redirect('/');
  });
});

// Error handling middleware
app.use((req, res, next) => {
  res.status(404).render('error', { message: 'Page not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { message: 'Something went wrong' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

// Advanced friend suggestion logic
const getAdvancedFriendSuggestions = async (userId) => {
  return new Promise((resolve, reject) => {
    db.all(`
      WITH current_friends AS (
        SELECT friend_id 
        FROM friends 
        WHERE user_id = ?
      ),
      mutuals AS (
        SELECT 
          u.id,
          u.name,
          u.email,
          u.profile_photo,
          COUNT(DISTINCT f1.friend_id) AS mutual_friends,
          COUNT(DISTINCT p.id) AS shared_posts,
          COUNT(DISTINCT l.id) AS shared_likes
        FROM users u
        LEFT JOIN friends f1 ON f1.user_id = u.id
        LEFT JOIN posts p ON p.user_id = u.id
        LEFT JOIN likes l ON l.user_id = u.id
        WHERE u.id != ?
          AND u.id NOT IN (
            SELECT friend_id 
            FROM friends 
            WHERE user_id = ?
          )
          AND u.id NOT IN (
            SELECT receiver_id 
            FROM friend_requests 
            WHERE sender_id = ?
          )
          AND u.id NOT IN (
            SELECT sender_id 
            FROM friend_requests 
            WHERE receiver_id = ?
          )
          AND f1.friend_id IN (
            SELECT friend_id FROM current_friends
          )
        GROUP BY u.id
      )
      SELECT 
        mutuals.id,
        mutuals.name,
        mutuals.email,
        mutuals.profile_photo,
        mutuals.mutual_friends,
        mutuals.shared_posts,
        mutuals.shared_likes,
        (mutuals.mutual_friends * 2 + mutuals.shared_posts + mutuals.shared_likes) AS score
      FROM mutuals
      ORDER BY score DESC
      LIMIT 10
    `, [userId, userId, userId, userId, userId], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

