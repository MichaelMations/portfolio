require('dotenv').config();
const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const axios = require('axios');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const { DISCORD_USER_ID } = process.env;

const {
  SESSION_SECRET,
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI,
  MONGODB_URI,
  ADMIN_DISCORD_ID,
} = process.env;

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(console.error);

// Multer setup for PNG uploads to /public/uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname.replace(/\s+/g, '-');
    cb(null, uniqueName);
  },
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/png') {
      cb(null, true);
    } else {
      cb(new Error('Only PNG images are allowed'));
    }
  },
});

// Schemas
const updateSchema = new mongoose.Schema({
  text: String,
  date: { type: Date, default: Date.now },
  visible: { type: Boolean, default: false },
  progressPercent: { type: Number, min: 0, max: 100, default: 0 },
  showPercent: { type: Boolean, default: true },
  image: { type: String, default: null }, // store image filepath relative to /public
});

const commissionSchema = new mongoose.Schema({
  userId: String,
  description: String,
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: Date,
  updates: [updateSchema],
});

const Commission = mongoose.model('Commission', commissionSchema);

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
}));

// Helpers
function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.id === ADMIN_DISCORD_ID) return next();
  res.status(403).send('Forbidden: Admins only');
}
function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}

// ROUTES

// Home portfolio
app.get('/', (req, res) => {
  res.send(`
  <html>
  <head><title>Portfolio</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 2rem; background:#f9f9f9; color:#222;}
    a { color: #0078d7; text-decoration:none;}
    a:hover { text-decoration:underline;}
  </style>
  </head>
  <body>
    <h1>Welcome to My Portfolio</h1>
    <p><a href="/order-tracker">Go to Order Tracker</a></p>
  </body>
  </html>`);
});

// Order Tracker dashboard (user)
app.get('/order-tracker', async (req, res) => {
  if (!req.session.user) {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Your Commissions</title>
        <style>
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap');

        body {
            margin: 0;
            font-family: 'Poppins', sans-serif;
            background: #f4f6fc;
            color: #222;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }

        header {
            background: #5865F2;
            color: white;
            padding: 2rem 1rem;
            text-align: center;
            box-shadow: 0 4px 8px rgba(88,101,242,0.3);
        }

        header h1 {
            margin: 0;
            font-weight: 700;
            font-size: 2.2rem;
        }

        header h2 {
            margin-top: 0.25rem;
            font-weight: 500;
            font-size: 1.2rem;
            opacity: 0.8;
        }

        main {
            max-width: 900px;
            margin: 2rem auto;
            padding: 0 1rem;
            flex-grow: 1;
        }

        .actions {
            text-align: center;
            margin-bottom: 2rem;
        }

        .actions a.button,
        .actions form button {
            background: #5865F2;
            color: white;
            border: none;
            padding: 0.75rem 2.5rem;
            border-radius: 40px;
            font-weight: 700;
            font-size: 1rem;
            cursor: pointer;
            margin: 0 0.75rem 1rem 0.75rem;
            box-shadow: 0 6px 20px rgba(88,101,242,0.4);
            transition: background-color 0.3s ease, box-shadow 0.3s ease;
            text-decoration: none;
            display: inline-block;
        }

        .actions a.button:hover,
        .actions form button:hover {
            background: #4752c4;
            box-shadow: 0 10px 30px rgba(71,82,196,0.6);
        }

        .commission-list {
            display: grid;
            grid-template-columns: repeat(auto-fit,minmax(320px,1fr));
            gap: 1.5rem;
        }

        .commission-card {
            background: white;
            border-radius: 14px;
            padding: 1.5rem;
            box-shadow: 0 6px 20px rgba(0,0,0,0.05);
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            transition: box-shadow 0.3s ease;
        }

        .commission-card:hover {
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }

        .commission-card h3 {
            margin: 0 0 0.5rem 0;
            font-weight: 600;
            color: #5865F2;
            font-size: 1.3rem;
        }

        .commission-status {
            font-weight: 600;
            margin-bottom: 1rem;
            color: #444;
        }

        .commission-date {
            font-size: 0.85rem;
            color: #777;
            margin-bottom: 1rem;
        }

        .commission-updates {
            max-height: 160px;
            overflow-y: auto;
            border-top: 1px solid #eee;
            padding-top: 1rem;
        }

        .update {
            margin-bottom: 1rem;
            font-size: 0.95rem;
            color: #555;
        }

        .update strong {
            color: #5865F2;
        }

        .update img {
            max-width: 100%;
            max-height: 140px;
            border-radius: 8px;
            margin-top: 0.4rem;
        }

        footer {
            text-align: center;
            padding: 1.5rem;
            font-size: 0.9rem;
            color: #888;
        }

        @media (max-width: 480px) {
            .actions a.button, .actions form button {
            width: 100%;
            margin: 0.5rem 0;
            }
        }
        </style>
        </head>
        <body>
        <header>
        <h1>Welcome, ${escapeHTML(req.session.user.username)}#${escapeHTML(req.session.user.discriminator)}</h1>
        <h2>Your Commissions</h2>
        </header>

        <main>
        <div class="actions">
            <a href="https://discord.com/users/${DISCORD_USER_ID}" target="_blank" rel="noopener noreferrer" class="button" aria-label="Request Commission via Discord">
            Request a Commission
            </a>
            <form action="/order-tracker/logout" method="POST" style="display:inline;">
            <button type="submit" aria-label="Sign Out">Sign Out</button>
            </form>
            ${req.session.user.id === ADMIN_DISCORD_ID ? `
            <a href="/order-tracker/admin" class="button" aria-label="Admin Panel">Admin Panel</a>` : ''}
        </div>

        <section class="commission-list">
            ${commissionListHTML}
        </section>
        </main>

        <footer>&copy; ${new Date().getFullYear()} Your Company Name</footer>

        </body>
        </html>
        `);


  }

  const userId = req.session.user.id;
  const commissions = await Commission.find({ userId }).lean();

  let commissionListHTML = '';
  if (commissions.length === 0) {
    commissionListHTML = '<p>You have no commissions yet.</p>';
  } else {
    commissionListHTML = '<ul style="list-style:none; padding:0;">';
    commissions.forEach(c => {
      let updatesHTML = '';
      if (c.updates && c.updates.length) {
        const visibleUpdates = c.updates.filter(u => u.visible);
        if (visibleUpdates.length) {
          updatesHTML += '<ul style="margin-top: 0.5rem;">';
          visibleUpdates.forEach(u => {
            updatesHTML += `
            <li style="background:#eef2f5; margin:0.25rem 0; padding:0.5rem; border-radius:6px;">
              ${u.showPercent ? `<strong>Progress:</strong> ${u.progressPercent}%<br/>` : ''}
              <em>${escapeHTML(u.text)}</em><br/>
              <small>${new Date(u.date).toLocaleString()}</small>
              ${u.image ? `<br/><img src="${escapeHTML(u.image)}" alt="Update image" style="max-width:300px; margin-top:0.5rem; border-radius:6px;"/>` : ''}
            </li>`;
          });
          updatesHTML += '</ul>';
        }
      }

      commissionListHTML += `
      <li style="background:white; margin:0.5rem 0; padding:1rem; border-radius:8px; box-shadow:0 2px 5px rgba(0,0,0,0.1);">
        <strong>Description:</strong> ${escapeHTML(c.description)}<br/>
        <strong>Status:</strong> ${escapeHTML(c.status)}<br/>
        <small>Created: ${new Date(c.createdAt).toLocaleString()}</small>
        ${updatesHTML}
      </li>`;
    });
    commissionListHTML += '</ul>';
  }

  res.send(`
  <html>
  <head>
    <title>Your Commissions</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        max-width: 700px;
        margin: 2rem auto;
        background: #f6f8fa;
        padding: 2rem;
        border-radius: 8px;
      }
      h1, h2 {
        text-align: center;
        color: #333;
      }
      button, a.button {
        background: #5865F2;
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        margin-top: 1rem;
        border-radius: 5px;
        cursor: pointer;
        font-weight: bold;
        text-decoration: none;
        display: inline-block;
      }
      button:hover, a.button:hover {
        background: #4752c4;
      }
      .admin-link {
        margin-top: 1rem;
        display: block;
        text-align: center;
      }
      form { text-align: center; margin-top: 2rem; }
    </style>
  </head>
  <body>
   <h1>Welcome, ${escapeHTML(req.session.user.username)}#${escapeHTML(req.session.user.discriminator)}</h1>
<h2>Your Commissions</h2>
${commissionListHTML}

<p style="text-align:center; margin: 1rem 0;">
<a href="https://discord.com/users/${DISCORD_USER_ID}" target="_blank" 
   style="background:#5865F2; color:white; padding:0.6rem 1.2rem; border-radius:5px; text-decoration:none; font-weight:bold; display:inline-block;">
  Request Commission
</a>
</p>

<form action="/order-tracker/logout" method="POST">
  <button type="submit">Sign Out</button>
</form>
${req.session.user.id === ADMIN_DISCORD_ID ? '<a href="/order-tracker/admin" class="admin-link">Go to Admin Panel</a>' : ''}

  </body>
  </html>
  `);
});

// Admin panel
app.get('/order-tracker/admin', isAdmin, async (req, res) => {
  const commissions = await Commission.find().lean();

  let commissionRows = commissions.map(c => {
    let updatesHTML = '';
    if (c.updates && c.updates.length) {
      updatesHTML += '<ul style="padding-left: 1rem; max-height:150px; overflow-y:auto; border:1px solid #ccc; margin-top:0.5rem;">';
      c.updates.forEach((u, i) => {
        updatesHTML += `
        <li style="margin-bottom:0.3rem;">
          <strong>${new Date(u.date).toLocaleString()}:</strong> 
          ${escapeHTML(u.text)} 
          (${u.showPercent ? u.progressPercent + '%' : '(percent hidden)'})
          ${u.image ? `<br/><img src="${escapeHTML(u.image)}" alt="Update image" style="max-width:150px; margin-top:0.25rem; border-radius:4px;"/>` : ''}
          <form method="POST" action="/order-tracker/admin/update/toggle-visibility" style="display:inline;">
            <input type="hidden" name="commissionId" value="${c._id}" />
            <input type="hidden" name="updateIndex" value="${i}" />
            <button type="submit" style="font-size: 0.7rem; margin-left: 10px;">
              ${u.visible ? 'Hide' : 'Show'}
            </button>
          </form>
          <form method="POST" action="/order-tracker/admin/update/toggle-percent" style="display:inline;">
            <input type="hidden" name="commissionId" value="${c._id}" />
            <input type="hidden" name="updateIndex" value="${i}" />
            <button type="submit" style="font-size: 0.7rem; margin-left: 5px;">
              ${u.showPercent ? 'Hide %' : 'Show %'}
            </button>
          </form>
          <form method="POST" action="/order-tracker/admin/update/delete" style="display:inline;">
            <input type="hidden" name="commissionId" value="${c._id}" />
            <input type="hidden" name="updateIndex" value="${i}" />
            <button type="submit" style="font-size: 0.7rem; margin-left: 5px; background:#e55353; color:white; border:none; border-radius:3px;">
              Delete
            </button>
          </form>
        </li>`;
      });
      updatesHTML += '</ul>';
    } else {
      updatesHTML = '<small>No updates yet</small>';
    }

    // Add update form with file upload
    const updateForm = `
    <form method="POST" action="/order-tracker/admin/update/add" enctype="multipart/form-data" style="margin-top: 0.5rem;">
      <input type="hidden" name="commissionId" value="${c._id}" />
      <textarea name="text" required placeholder="Update text" rows="2" style="width:100%;"></textarea><br/>
      <label>Progress %: <input type="number" name="progressPercent" min="0" max="100" value="0" style="width:60px;" /></label>
      <label style="margin-left: 1rem;"><input type="checkbox" name="visible" /> Visible to user</label><br/>
      <label>Upload PNG Image (optional):<br/>
        <input type="file" name="image" accept="image/png" />
      </label><br/>
      <button type="submit" style="margin-top: 0.3rem;">Add Update</button>
    </form>`;

    return `
    <tr>
      <td>${escapeHTML(c.userId)}</td>
      <td>${escapeHTML(c.description)}</td>
      <td>${escapeHTML(c.status)}</td>
      <td>${new Date(c.createdAt).toLocaleString()}</td>
      <td>${c.updatedAt ? new Date(c.updatedAt).toLocaleString() : ''}</td>
      <td>
        <form action="/order-tracker/admin/edit" method="POST" style="display:inline-block;">
          <input type="hidden" name="id" value="${c._id}" />
          <input type="text" name="description" value="${escapeHTML(c.description)}" required />
          <select name="status">
            <option value="pending" ${c.status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="in progress" ${c.status === 'in progress' ? 'selected' : ''}>In Progress</option>
            <option value="completed" ${c.status === 'completed' ? 'selected' : ''}>Completed</option>
            <option value="cancelled" ${c.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
          <button type="submit">Update</button>
        </form>
        <form action="/order-tracker/admin/delete" method="POST" onsubmit="return confirm('Are you sure you want to delete this commission?');" style="display:inline-block;">
          <input type="hidden" name="id" value="${c._id}" />
          <button type="submit" style="background:#e55353;">Delete</button>
        </form>
        <br/>
        <strong>Updates:</strong>
        ${updatesHTML}
        ${updateForm}
      </td>
    </tr>`;
  }).join('');

  res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Admin Panel - Manage Commissions</title>
        <style>
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap');

        body {
            font-family: 'Poppins', sans-serif;
            max-width: 1100px;
            margin: 2rem auto;
            background: #f4f6fc;
            padding: 2rem;
            border-radius: 12px;
            color: #222;
        }

        h1 {
            text-align: center;
            font-weight: 700;
            color: #5865F2;
            margin-bottom: 2rem;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 2rem;
        }

        th, td {
            padding: 0.6rem 0.9rem;
            border-bottom: 1px solid #ddd;
            text-align: left;
            vertical-align: top;
        }

        th {
            background: #5865F2;
            color: white;
            font-weight: 600;
        }

        tbody tr:hover {
            background: #e3e8ff;
        }

        input[type="text"],
        select,
        textarea {
            width: 95%;
            padding: 0.4rem 0.6rem;
            border-radius: 6px;
            border: 1px solid #ccc;
            font-size: 1rem;
            font-family: 'Poppins', sans-serif;
            resize: vertical;
            box-sizing: border-box;
        }

        textarea {
            min-height: 60px;
        }

        button {
            background: #5865F2;
            border: none;
            color: white;
            padding: 0.35rem 1rem;
            font-weight: 700;
            border-radius: 6px;
            cursor: pointer;
            transition: background-color 0.3s ease;
            font-family: 'Poppins', sans-serif;
        }

        button:hover {
            background: #4752c4;
        }

        button.delete {
            background: #e55353;
        }
        button.delete:hover {
            background: #b33030;
        }

        form {
            margin-top: 0.5rem;
        }

        .update-list {
            max-height: 140px;
            overflow-y: auto;
            border: 1px solid #ccc;
            padding: 0.5rem;
            border-radius: 6px;
            background: white;
        }

        .update-item {
            margin-bottom: 0.4rem;
            font-size: 0.9rem;
        }

        .update-item img {
            max-width: 120px;
            margin-top: 0.2rem;
            border-radius: 6px;
        }

        .update-actions button {
            font-size: 0.75rem;
            padding: 0.2rem 0.5rem;
            margin-left: 6px;
        }

        .add-commission-form {
            background: white;
            padding: 1rem 1.5rem;
            border-radius: 12px;
            box-shadow: 0 6px 20px rgba(88,101,242,0.1);
        }

        .add-commission-form label {
            display: block;
            margin-bottom: 0.75rem;
            font-weight: 600;
        }

        .add-commission-form input,
        .add-commission-form select {
            width: 100%;
        }

        a.back-link {
            display: block;
            text-align: center;
            margin-top: 1.8rem;
            font-weight: 600;
            color: #5865F2;
            text-decoration: none;
            font-size: 1rem;
        }
        a.back-link:hover {
            text-decoration: underline;
        }

        @media (max-width: 650px) {
            table, thead, tbody, th, td, tr {
            display: block;
            }
            thead tr {
            position: absolute;
            top: -9999px;
            left: -9999px;
            }
            tr {
            border: 1px solid #ccc;
            margin-bottom: 1rem;
            border-radius: 12px;
            padding: 1rem;
            background: white;
            }
            td {
            border: none;
            padding: 0.4rem 0;
            position: relative;
            padding-left: 50%;
            }
            td::before {
            position: absolute;
            top: 0.5rem;
            left: 1rem;
            width: 45%;
            white-space: nowrap;
            font-weight: 600;
            color: #5865F2;
            }
            td:nth-of-type(1)::before { content: "User ID"; }
            td:nth-of-type(2)::before { content: "Description"; }
            td:nth-of-type(3)::before { content: "Status"; }
            td:nth-of-type(4)::before { content: "Created At"; }
            td:nth-of-type(5)::before { content: "Updated At"; }
            td:nth-of-type(6)::before { content: "Actions & Updates"; }
        }
        </style>
        </head>
        <body>

        <h1>Admin Panel - Manage Commissions</h1>

        <table>
        <thead>
            <tr>
            <th>User ID</th>
            <th>Description</th>
            <th>Status</th>
            <th>Created At</th>
            <th>Updated At</th>
            <th>Actions & Updates</th>
            </tr>
        </thead>
        <tbody>
            ${commissionRows}
        </tbody>
        </table>

        <section class="add-commission-form" aria-label="Add New Commission">
        <h2>Add New Commission</h2>
        <form method="POST" action="/order-tracker/admin/add">
            <label for="userId">User Discord ID:</label>
            <input id="userId" name="userId" required autocomplete="off" />
            
            <label for="description">Description:</label>
            <input id="description" name="description" required autocomplete="off" />
            
            <label for="status">Status:</label>
            <select id="status" name="status" required>
            <option value="pending" selected>Pending</option>
            <option value="in progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            </select>
            <br /><br />
            <button type="submit">Add Commission</button>
        </form>
        </section>

        <a href="/order-tracker" class="back-link" aria-label="Back to Dashboard">← Back to Dashboard</a>

        </body>
        </html>
        `);

});

// Add commission (admin)
app.post('/order-tracker/admin/add', isAdmin, async (req, res) => {
  const { userId, description, status } = req.body;
  await Commission.create({ userId, description, status, updatedAt: new Date() });
  res.redirect('/order-tracker/admin');
});

// Edit commission (admin)
app.post('/order-tracker/admin/edit', isAdmin, async (req, res) => {
  const { id, description, status } = req.body;
  await Commission.findByIdAndUpdate(id, { description, status, updatedAt: new Date() });
  res.redirect('/order-tracker/admin');
});

// Delete commission (admin)
app.post('/order-tracker/admin/delete', isAdmin, async (req, res) => {
  const { id } = req.body;
  await Commission.findByIdAndDelete(id);
  res.redirect('/order-tracker/admin');
});

// Add update (admin) with file upload middleware
app.post('/order-tracker/admin/update/add', isAdmin, upload.single('image'), async (req, res) => {
  const { commissionId, text, progressPercent, visible } = req.body;
  if (!commissionId || !text) return res.status(400).send('Missing required fields');

  let imageFilename = null;
  if (req.file) {
    imageFilename = '/uploads/' + req.file.filename;
  }

  const updateObj = {
    text,
    progressPercent: Number(progressPercent) || 0,
    visible: visible === 'on',
    showPercent: true,
    date: new Date(),
    image: imageFilename,
  };

  await Commission.findByIdAndUpdate(commissionId, {
    $push: { updates: updateObj },
    $set: { updatedAt: new Date() },
  });

  res.redirect('/order-tracker/admin');
});

// Toggle update visibility
app.post('/order-tracker/admin/update/toggle-visibility', isAdmin, async (req, res) => {
  const { commissionId, updateIndex } = req.body;
  if (!commissionId || updateIndex === undefined) return res.status(400).send('Invalid request');

  const commission = await Commission.findById(commissionId);
  if (!commission) return res.status(404).send('Commission not found');

  const update = commission.updates[updateIndex];
  if (!update) return res.status(404).send('Update not found');

  update.visible = !update.visible;
  commission.updatedAt = new Date();
  await commission.save();

  res.redirect('/order-tracker/admin');
});

// Toggle update showPercent
app.post('/order-tracker/admin/update/toggle-percent', isAdmin, async (req, res) => {
  const { commissionId, updateIndex } = req.body;
  if (!commissionId || updateIndex === undefined) return res.status(400).send('Invalid request');

  const commission = await Commission.findById(commissionId);
  if (!commission) return res.status(404).send('Commission not found');

  const update = commission.updates[updateIndex];
  if (!update) return res.status(404).send('Update not found');

  update.showPercent = !update.showPercent;
  commission.updatedAt = new Date();
  await commission.save();

  res.redirect('/order-tracker/admin');
});

// Delete update
app.post('/order-tracker/admin/update/delete', isAdmin, async (req, res) => {
  const { commissionId, updateIndex } = req.body;
  if (!commissionId || updateIndex === undefined) return res.status(400).send('Invalid request');

  const commission = await Commission.findById(commissionId);
  if (!commission) return res.status(404).send('Commission not found');

  commission.updates.splice(updateIndex, 1);
  commission.updatedAt = new Date();
  await commission.save();

  res.redirect('/order-tracker/admin');
});

// DISCORD OAUTH LOGIN FLOW

app.get('/order-tracker/login', (req, res) => {
  const authorizeURL = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&response_type=code&scope=identify`;
  res.redirect(authorizeURL);
});

app.get('/order-tracker/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('No code provided');

  try {
    // Exchange code for token
    const tokenRes = await axios.post('https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: DISCORD_REDIRECT_URI,
      }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const accessToken = tokenRes.data.access_token;

    // Get user info
    const userRes = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    req.session.user = {
      id: userRes.data.id,
      username: userRes.data.username,
      discriminator: userRes.data.discriminator,
    };

    res.redirect('/order-tracker');
  } catch (err) {
    console.error(err);
    res.status(500).send('OAuth error');
  }
});

app.post('/order-tracker/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/order-tracker');
  });
});

// Make sure uploads folder exists
const fs = require('fs');
const uploadsDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
