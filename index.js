require('dotenv').config();
const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const {
  SESSION_SECRET,
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI,
  MONGODB_URI,
  DISCORD_USER_ID,
} = process.env;

// Support multiple admin IDs
const ADMIN_DISCORD_ID = (process.env.ADMIN_DISCORD_ID || '').split(',').map(id => id.trim());



// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB connected!'))
  .catch(err => console.error('MongoDB connection error:', err));

// Setup uploads folder
const uploadsDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Multer for PNG uploads only
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safeName = Date.now() + '-' + file.originalname.replace(/\s+/g, '-');
    cb(null, safeName);
  },
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    cb(null, file.mimetype === 'image/png');
  },
});

// Schemas
const updateSchema = new mongoose.Schema({
  text: String,
  date: { type: Date, default: Date.now },
  visible: { type: Boolean, default: false },
  progressPercent: { type: Number, min: 0, max: 100, default: 0 },
  showPercent: { type: Boolean, default: true },
  image: { type: String, default: null },
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

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
}));

// Helpers
function isAdmin(req, res, next) {
  if (req.session.user && ADMIN_DISCORD_ID.includes(req.session.user.id)) return next();
  res.status(403).send('Forbidden: Admins only');
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

// Routes

// Homepage
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>My Portfolio</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #fafafa;
            padding: 2rem;
            text-align: center;
            color: #333;
          }
          a {
            color: #4a90e2;
            text-decoration: none;
            font-weight: 600;
          }
          a:hover {
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <h1>Hey there! Welcome to my portfolio.</h1>
        <p>Check out my <a href="/order-tracker">Order Tracker</a>.</p>
      </body>
    </html>
  `);
});

// Order Tracker - Dashboard
// app.get('/order-tracker', async (req, res) => {
//   if (!req.session.user) {
//     return res.send(`
//       <html><body style="font-family:sans-serif; padding:2rem; text-align:center;">
//         <h2>Please <a href="/order-tracker/login">log in with Discord</a> to see your commissions.</h2>
//       </body></html>
//     `);
//   }

app.get('/order-tracker', async (req, res) => {
  if (!req.session.user) {
    return res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Login - Order Tracker</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet" />
  <style>
    body {
      font-family: 'Inter', sans-serif;
      background: #121212;
      color: #ddd;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      flex-direction: column;
      text-align: center;
      padding: 1rem;
    }
    h2 {
      font-weight: 600;
      margin-bottom: 1.5rem;
      color: #06b6d4;
      text-shadow: 0 0 8px #06b6d4aa;
    }
    a.login-btn {
      background: #3b82f6;
      color: white;
      font-weight: 600;
      padding: 0.75rem 2.5rem;
      border-radius: 9999px;
      text-decoration: none;
      box-shadow: 0 6px 15px #3b82f6aa;
      transition: background-color 0.3s ease, box-shadow 0.3s ease, transform 0.3s ease;
      user-select: none;
    }
    a.login-btn:hover, a.login-btn:focus {
      background: #8b5cf6;
      box-shadow: 0 8px 25px #8b5cf6bb;
      transform: scale(1.05);
      outline: none;
    }
  </style>
</head>
<body>
  <h2>Please log in with Discord to see your commissions</h2>
  <a href="/order-tracker/login" class="login-btn" aria-label="Login with Discord">Login with Discord</a>
</body>
</html>
    `);
  }


  const commissions = await Commission.find({ userId: req.session.user.id }).lean();

  let listHTML = '';
  if (!commissions.length) {
    listHTML = '<p>You have no commissions yet.</p>';
  } else {
    listHTML = '<ul>';
    commissions.forEach(c => {
      let updatesHTML = '';
      if (c.updates && c.updates.length) {
        updatesHTML += '<ul>';
        c.updates.filter(u => u.visible).forEach(u => {
          updatesHTML += `<li>
            ${u.showPercent ? `<strong>Progress: ${u.progressPercent}%</strong><br>` : ''}
            ${escapeHTML(u.text)}<br>
            <small>${new Date(u.date).toLocaleString()}</small>
            ${u.image ? `<br><img src="${escapeHTML(u.image)}" alt="Update image" style="max-width:300px;">` : ''}
          </li>`;
        });
        updatesHTML += '</ul>';
      }
      listHTML += `
        <li>
          <strong>Description:</strong> ${escapeHTML(c.description)}<br>
          <strong>Status:</strong> ${escapeHTML(c.status)}<br>
          <small>Created: ${new Date(c.createdAt).toLocaleString()}</small>
          ${updatesHTML}
        </li>`;
    });
    listHTML += '</ul>';
  }

//   res.send(`
//     <html>
//       <head>
//         <title>Your Commissions</title>
//         <style>
//           body {
//             font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
//             padding: 2rem;
//             background: #fff;
//             color: #333;
//             max-width: 700px;
//             margin: auto;
//           }
//           h1, h2 {
//             text-align: center;
//           }
//           a, button {
//             background: #4a90e2;
//             color: white;
//             border: none;
//             padding: 0.5rem 1rem;
//             margin: 0.5rem 0;
//             border-radius: 4px;
//             cursor: pointer;
//             text-decoration: none;
//             display: inline-block;
//             font-weight: 600;
//           }
//           a:hover, button:hover {
//             background: #357ABD;
//           }
//           ul {
//             list-style: none;
//             padding-left: 0;
//           }
//           li {
//             margin-bottom: 1rem;
//             padding: 1rem;
//             border: 1px solid #ddd;
//             border-radius: 6px;
//           }
//           img {
//             margin-top: 0.5rem;
//             border-radius: 6px;
//           }
//           form {
//             text-align: center;
//           }
//         </style>
//       </head>
//       <body>
//         <h1>Welcome, ${escapeHTML(req.session.user.username)}#${escapeHTML(req.session.user.discriminator)}</h1>
//         <h2>Your Commissions</h2>
//         ${listHTML}
//         <p style="text-align:center;">
//           <a href="https://discord.com/users/${DISCORD_USER_ID}" target="_blank" rel="noopener noreferrer">Request a Commission</a>
//         </p>
//         <form method="POST" action="/order-tracker/logout" style="text-align:center;">
//           <button type="submit">Sign Out</button>
//         </form>
// ${ADMIN_DISCORD_ID.includes(req.session.user.id) ? `<a href="/order-tracker/admin">Admin Panel</a>` : ''}
//       </body>
//     </html>
//   `);

// res.send(`
// <!DOCTYPE html>
// <html lang="en">
// <head>
//   <meta charset="UTF-8" />
//   <meta name="viewport" content="width=device-width, initial-scale=1" />
//   <title>Your Commissions - Order Tracker</title>
//   <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
//   <style>
//     /* Reset and base */
//     *, *::before, *::after {
//       box-sizing: border-box;
//     }
//     body {
//       margin: 0; padding: 0;
//       font-family: 'Inter', sans-serif;
//       background: linear-gradient(135deg, #121212, #1a1a1a);
//       color: #ddd;
//       min-height: 100vh;
//       display: flex;
//       flex-direction: column;
//       align-items: center;
//       padding: 2rem 1rem;
//     }
//     h1, h2 {
//       font-weight: 700;
//       color: #06b6d4; /* cyan accent */
//       margin-bottom: 0.5rem;
//       text-align: center;
//       text-shadow: 0 0 6px #06b6d4aa;
//     }
//     h2 {
//       font-size: 1.8rem;
//     }
//     a {
//       color: #3b82f6; /* electric blue */
//       text-decoration: none;
//       font-weight: 600;
//       transition: color 0.3s ease;
//     }
//     a:hover, a:focus {
//       color: #8b5cf6; /* purple */
//       outline: none;
//       text-decoration: underline;
//     }
//     .container {
//       max-width: 720px;
//       width: 100%;
//       background: #222;
//       border-radius: 12px;
//       box-shadow: 0 0 12px #06b6d4aa;
//       padding: 2rem;
//       margin-top: 1rem;
//     }
//     ul.commissions-list {
//       list-style: none;
//       padding-left: 0;
//       margin: 0;
//     }
//     ul.commissions-list li {
//       background: #1f1f1f;
//       border-radius: 10px;
//       padding: 1.25rem 1.5rem;
//       margin-bottom: 1.25rem;
//       box-shadow: 0 0 6px #3b82f6aa;
//       transition: transform 0.2s ease, box-shadow 0.2s ease;
//       cursor: default;
//     }
//     ul.commissions-list li:hover, ul.commissions-list li:focus-within {
//       transform: translateY(-4px);
//       box-shadow: 0 0 15px #8b5cf6bb;
//       outline: none;
//     }
//     ul.commissions-list li strong {
//       display: inline-block;
//       color: #06b6d4;
//       margin-bottom: 0.3rem;
//       font-weight: 600;
//     }
//     ul.commissions-list li small {
//       color: #888;
//       font-size: 0.85rem;
//       display: block;
//       margin-top: 0.5rem;
//     }
//     img.update-image {
//       margin-top: 0.75rem;
//       border-radius: 8px;
//       max-width: 100%;
//       filter: drop-shadow(0 0 3px #06b6d4aa);
//     }
//     .update-list {
//       margin-top: 0.8rem;
//       padding-left: 1rem;
//       border-left: 2px solid #3b82f6;
//       color: #aaa;
//     }
//     .update-list li {
//       margin-bottom: 0.8rem;
//       font-size: 0.95rem;
//       line-height: 1.3;
//       color: #bbb;
//     }
//     .update-list li strong {
//       color: #8b5cf6;
//       font-weight: 700;
//       display: block;
//       margin-bottom: 0.2rem;
//     }
//     .btn {
//       display: inline-block;
//       background: #3b82f6;
//       color: white;
//       font-weight: 600;
//       border: none;
//       padding: 0.75rem 2.5rem;
//       border-radius: 9999px;
//       cursor: pointer;
//       text-decoration: none;
//       text-align: center;
//       box-shadow: 0 6px 15px #3b82f6aa;
//       transition: background-color 0.3s ease, box-shadow 0.3s ease, transform 0.3s ease;
//       user-select: none;
//       margin-top: 2rem;
//       margin-bottom: 1.5rem;
//     }
//     .btn:hover, .btn:focus {
//       background: #8b5cf6;
//       box-shadow: 0 8px 25px #8b5cf6bb;
//       transform: scale(1.05);
//       outline: none;
//     }
//     form.logout-form {
//       text-align: center;
//       margin-top: 1rem;
//     }
//     button.logout-btn {
//       background: #e55353;
//       padding: 0.5rem 1.8rem;
//       font-weight: 600;
//       border-radius: 9999px;
//       border: none;
//       cursor: pointer;
//       box-shadow: 0 4px 10px #e5535366;
//       transition: background-color 0.3s ease, box-shadow 0.3s ease, transform 0.2s ease;
//     }
//     button.logout-btn:hover, button.logout-btn:focus {
//       background: #b33b3b;
//       box-shadow: 0 6px 18px #b33b3b99;
//       transform: scale(1.05);
//       outline: none;
//     }
//     .admin-link {
//       display: block;
//       margin-top: 1.5rem;
//       text-align: center;
//       font-weight: 600;
//       color: #06b6d4;
//       text-decoration: underline;
//     }
//     .admin-link:hover, .admin-link:focus {
//       color: #8b5cf6;
//       outline: none;
//     }
//   </style>
// </head>
// <body>
//   <h1>Welcome, ${escapeHTML(req.session.user.username)}#${escapeHTML(req.session.user.discriminator)}</h1>
//   <h2>Your Commissions</h2>
//   <div class="container">
//     ${
//       commissions.length === 0
//         ? '<p style="text-align:center; color:#666;">You have no commissions yet.</p>'
//         : `<ul class="commissions-list">
//             ${commissions
//               .map(
//                 (c) => `
//               <li tabindex="0" aria-label="Commission: ${escapeHTML(c.description)} status ${escapeHTML(c.status)}">
//                 <strong>Description:</strong> ${escapeHTML(c.description)}<br>
//                 <strong>Status:</strong> ${escapeHTML(c.status)}<br>
//                 <small>Created: ${new Date(c.createdAt).toLocaleString()}</small>
//                 ${
//                   c.updates && c.updates.length
//                     ? `<ul class="update-list" aria-label="Visible updates">
//                         ${c.updates
//                           .filter((u) => u.visible)
//                           .map(
//                             (u) => `
//                           <li>
//                             ${u.showPercent ? `<strong>Progress: ${u.progressPercent}%</strong>` : ''}
//                             ${escapeHTML(u.text)}<br>
//                             <small>${new Date(u.date).toLocaleString()}</small>
//                             ${
//                               u.image
//                                 ? `<img src="${escapeHTML(u.image)}" alt="Update image" class="update-image" />`
//                                 : ''
//                             }
//                           </li>
//                         `
//                           )
//                           .join('')}
//                       </ul>`
//                     : ''
//                 }
//               </li>`
//               )
//               .join('')}
//           </ul>`
//     }
//   </div>
//   <a href="https://discord.com/users/${DISCORD_USER_ID}" target="_blank" rel="noopener noreferrer" class="btn" aria-label="Request a commission">Request a Commission</a>
//   <form method="POST" action="/order-tracker/logout" class="logout-form">
//     <button type="submit" class="logout-btn" aria-label="Sign out">Sign Out</button>
//   </form>
//   ${
//     ADMIN_DISCORD_ID.includes(req.session.user.id)
//       ? `<a href="/order-tracker/admin" class="admin-link" aria-label="Admin panel">Admin Panel</a>`
//       : ''
//   }
// </body>
// </html>
// `);
res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Your Commissions - Order Tracker</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0; padding: 0;
      font-family: 'Inter', sans-serif;
      background: linear-gradient(135deg, #121212, #1a1a1a);
      color: #ddd;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 2rem 1rem;
    }
    h1, h2 {
      font-weight: 700;
      color: #06b6d4;
      margin-bottom: 0.5rem;
      text-align: center;
      text-shadow: 0 0 6px #06b6d4aa;
    }
    h2 { font-size: 1.8rem; }
    a, button {
      font-weight: 600;
      border: none;
      border-radius: 9999px;
      cursor: pointer;
      text-align: center;
      user-select: none;
      transition: background-color 0.3s ease, box-shadow 0.3s ease, transform 0.3s ease;
    }
    a.btn {
      display: inline-block;
      background: #3b82f6;
      color: white;
      padding: 0.75rem 2.5rem;
      box-shadow: 0 6px 15px #3b82f6aa;
      text-decoration: none;
      margin-top: 2rem;
      margin-bottom: 1.5rem;
    }
    a.btn:hover, a.btn:focus {
      background: #8b5cf6;
      box-shadow: 0 8px 25px #8b5cf6bb;
      transform: scale(1.05);
      outline: none;
    }
    form.logout-form {
      text-align: center;
      margin-top: 1rem;
    }
    button.logout-btn {
      background: #e55353;
      padding: 0.5rem 1.8rem;
      color: white;
      font-weight: 600;
      box-shadow: 0 4px 10px #e5535366;
    }
    button.logout-btn:hover, button.logout-btn:focus {
      background: #b33b3b;
      box-shadow: 0 6px 18px #b33b3b99;
      transform: scale(1.05);
      outline: none;
    }
    .container {
      max-width: 720px;
      width: 100%;
      background: #222;
      border-radius: 12px;
      box-shadow: 0 0 12px #06b6d4aa;
      padding: 2rem;
      margin-top: 1rem;
    }
    ul.commissions-list {
      list-style: none;
      padding-left: 0;
      margin: 0;
    }
    ul.commissions-list li {
      background: #1f1f1f;
      border-radius: 10px;
      padding: 1.25rem 1.5rem;
      margin-bottom: 1.25rem;
      box-shadow: 0 0 6px #3b82f6aa;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      cursor: default;
    }
    ul.commissions-list li:hover, ul.commissions-list li:focus-within {
      transform: translateY(-4px);
      box-shadow: 0 0 15px #8b5cf6bb;
      outline: none;
    }
    ul.commissions-list li strong {
      display: inline-block;
      color: #06b6d4;
      margin-bottom: 0.3rem;
      font-weight: 600;
    }
    ul.commissions-list li small {
      color: #888;
      font-size: 0.85rem;
      display: block;
      margin-top: 0.5rem;
    }
    img.update-image {
      margin-top: 0.75rem;
      border-radius: 8px;
      max-width: 100%;
      filter: drop-shadow(0 0 3px #06b6d4aa);
    }
    .update-list {
      margin-top: 0.8rem;
      padding-left: 1rem;
      border-left: 2px solid #3b82f6;
      color: #aaa;
    }
    .update-list li {
      margin-bottom: 0.8rem;
      font-size: 0.95rem;
      line-height: 1.3;
      color: #bbb;
    }
    .update-list li strong {
      color: #8b5cf6;
      font-weight: 700;
      display: block;
      margin-bottom: 0.2rem;
    }
    .admin-link {
      display: block;
      margin-top: 1.5rem;
      text-align: center;
      font-weight: 600;
      color: #06b6d4;
      text-decoration: underline;
    }
    .admin-link:hover, .admin-link:focus {
      color: #8b5cf6;
      outline: none;
    }
    p.no-commissions {
      text-align: center;
      color: #666;
      font-style: italic;
    }
  </style>
</head>
<body>
  <h1>Welcome, ${escapeHTML(req.session.user.username)}#${escapeHTML(req.session.user.discriminator)}</h1>
  <h2>Your Commissions</h2>
  <div class="container">
    ${
      commissions.length === 0
        ? '<p class="no-commissions">You have no commissions yet.</p>'
        : `<ul class="commissions-list">
            ${commissions
              .map(
                (c) => `
              <li tabindex="0" aria-label="Commission: ${escapeHTML(c.description)} status ${escapeHTML(c.status)}">
                <strong>Description:</strong> ${escapeHTML(c.description)}<br>
                <strong>Status:</strong> ${escapeHTML(c.status)}<br>
                <small>Created: ${new Date(c.createdAt).toLocaleString()}</small>
                ${
                  c.updates && c.updates.length
                    ? `<ul class="update-list" aria-label="Visible updates">
                        ${c.updates
                          .filter((u) => u.visible)
                          .map(
                            (u) => `
                          <li>
                            ${u.showPercent ? `<strong>Progress: ${u.progressPercent}%</strong>` : ''}
                            ${escapeHTML(u.text)}<br>
                            <small>${new Date(u.date).toLocaleString()}</small>
                            ${
                              u.image
                                ? `<img src="${escapeHTML(u.image)}" alt="Update image" class="update-image" />`
                                : ''
                            }
                          </li>
                        `
                          )
                          .join('')}
                      </ul>`
                    : ''
                }
              </li>`
              )
              .join('')}
          </ul>`
    }
  </div>
  <a href="https://discord.com/users/${DISCORD_USER_ID}" target="_blank" rel="noopener noreferrer" class="btn" aria-label="Request a commission">Request a Commission</a>
  <form method="POST" action="/order-tracker/logout" class="logout-form">
    <button type="submit" class="logout-btn" aria-label="Sign out">Sign Out</button>
  </form>
  ${
    ADMIN_DISCORD_ID.includes(req.session.user.id)
      ? `<a href="/order-tracker/admin" class="admin-link" aria-label="Admin panel">Admin Panel</a>`
      : ''
  }
</body>
</html>
`);
});

// Admin panel - list commissions and updates
// app.get('/order-tracker/admin', isAdmin, async (req, res) => {
//   const commissions = await Commission.find().lean();

//   let rowsHTML = '';
//   commissions.forEach(c => {
//     let updatesHTML = '';
//     if (c.updates && c.updates.length) {
//       updatesHTML += '<ul>';
//       c.updates.forEach((u, i) => {
//         updatesHTML += `<li>
//           <strong>${new Date(u.date).toLocaleString()}:</strong> ${escapeHTML(u.text)} 
//           (${u.showPercent ? u.progressPercent + '%' : 'percent hidden'}) 
//           ${u.visible ? '[Visible]' : '[Hidden]'}
//           ${u.image ? `<br><img src="${escapeHTML(u.image)}" alt="Update image" style="max-width:150px; margin-top:0.3rem;">` : ''}
//           <form method="POST" action="/order-tracker/admin/update/toggle-visibility" style="display:inline;">
//             <input type="hidden" name="commissionId" value="${c._id}" />
//             <input type="hidden" name="updateIndex" value="${i}" />
//             <button type="submit">${u.visible ? 'Hide' : 'Show'}</button>
//           </form>
//           <form method="POST" action="/order-tracker/admin/update/toggle-percent" style="display:inline;">
//             <input type="hidden" name="commissionId" value="${c._id}" />
//             <input type="hidden" name="updateIndex" value="${i}" />
//             <button type="submit">${u.showPercent ? 'Hide %' : 'Show %'}</button>
//           </form>
//           <form method="POST" action="/order-tracker/admin/update/delete" style="display:inline;">
//             <input type="hidden" name="commissionId" value="${c._id}" />
//             <input type="hidden" name="updateIndex" value="${i}" />
//             <button type="submit" style="background:#e55353; color:white;">Delete</button>
//           </form>
//         </li>`;
//       });
//       updatesHTML += '</ul>';
//     } else {
//       updatesHTML = '<p>No updates yet.</p>';
//     }

//     rowsHTML += `
//       <tr>
//         <td>${escapeHTML(c.userId)}</td>
//         <td>${escapeHTML(c.description)}</td>
//         <td>${escapeHTML(c.status)}</td>
//         <td>${new Date(c.createdAt).toLocaleString()}</td>
//         <td>${c.updatedAt ? new Date(c.updatedAt).toLocaleString() : ''}</td>
//         <td>
//           <form method="POST" action="/order-tracker/admin/edit" style="margin-bottom:0.5rem;">
//             <input type="hidden" name="id" value="${c._id}" />
//             <input type="text" name="description" value="${escapeHTML(c.description)}" required />
//             <select name="status">
//               <option value="pending" ${c.status === 'pending' ? 'selected' : ''}>Pending</option>
//               <option value="in progress" ${c.status === 'in progress' ? 'selected' : ''}>In Progress</option>
//               <option value="completed" ${c.status === 'completed' ? 'selected' : ''}>Completed</option>
//               <option value="cancelled" ${c.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
//             </select>
//             <button type="submit">Update</button>
//           </form>
//           <form method="POST" action="/order-tracker/admin/delete" onsubmit="return confirm('Delete this commission?');">
//             <input type="hidden" name="id" value="${c._id}" />
//             <button type="submit" style="background:#e55353; color:white;">Delete</button>
//           </form>
//           <strong>Updates:</strong> ${updatesHTML}
//           <form method="POST" action="/order-tracker/admin/update/add" enctype="multipart/form-data" style="margin-top:1rem;">
//             <input type="hidden" name="commissionId" value="${c._id}" />
//             <textarea name="text" placeholder="Update text" required style="width:100%; height:60px;"></textarea><br>
//             <label>Progress %: <input type="number" name="progressPercent" min="0" max="100" value="0" /></label>
//             <label><input type="checkbox" name="visible" /> Visible</label><br>
//             <label>PNG image (optional): <input type="file" name="image" accept="image/png" /></label><br>
//             <button type="submit">Add Update</button>
//           </form>
//         </td>
//       </tr>
//     `;
//   });

//   res.send(`
//     <html>
//       <head>
//         <title>Admin Panel - Manage Commissions</title>
//         <style>
//           body {
//             font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
//             padding: 2rem;
//             max-width: 1000px;
//             margin: auto;
//             background: #fff;
//             color: #333;
//           }
//           table {
//             width: 100%;
//             border-collapse: collapse;
//             margin-bottom: 2rem;
//           }
//           th, td {
//             border: 1px solid #ddd;
//             padding: 0.5rem;
//             vertical-align: top;
//           }
//           th {
//             background: #4a90e2;
//             color: white;
//           }
//           textarea {
//             font-family: inherit;
//             font-size: 1rem;
//           }
//           input[type=text], select, input[type=number] {
//             font-family: inherit;
//             font-size: 1rem;
//             margin: 0.2rem 0.5rem 0.2rem 0;
//           }
//           button {
//             background: #4a90e2;
//             border: none;
//             color: white;
//             padding: 0.3rem 0.8rem;
//             cursor: pointer;
//             border-radius: 4px;
//             font-weight: 600;
//           }
//           button:hover {
//             background: #357ABD;
//           }
//           form {
//             margin-bottom: 0.5rem;
//           }
//           img {
//             border-radius: 4px;
//             margin-top: 0.3rem;
//           }
//         </style>
//       </head>
//       <body>
//         <h1>Admin Panel - Manage Commissions</h1>
//         <table>
//           <thead>
//             <tr>
//               <th>User ID</th>
//               <th>Description</th>
//               <th>Status</th>
//               <th>Created At</th>
//               <th>Updated At</th>
//               <th>Actions & Updates</th>
//             </tr>
//           </thead>
//           <tbody>
//             ${rowsHTML}
//           </tbody>
//         </table>
//         <h2>Add New Commission</h2>
//         <form method="POST" action="/order-tracker/admin/add" style="max-width: 500px;">
//           <label>User Discord ID: <input name="userId" required /></label><br><br>
//           <label>Description: <input name="description" required /></label><br><br>
//           <label>Status:
//             <select name="status">
//               <option value="pending" selected>Pending</option>
//               <option value="in progress">In Progress</option>
//               <option value="completed">Completed</option>
//               <option value="cancelled">Cancelled</option>
//             </select>
//           </label><br><br>
//           <button type="submit">Add Commission</button>
//         </form>
//         <p><a href="/order-tracker">← Back to Dashboard</a></p>
//       </body>
//     </html>
//   `);
// });
// Admin panel - list commissions and updates
app.get('/order-tracker/admin', isAdmin, async (req, res) => {
  const commissions = await Commission.find().lean();

  function escapeHTML(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Helper to truncate description in summary (max 50 chars)
  function truncate(text, max = 50) {
    if (!text) return '';
    return text.length > max ? text.slice(0, max) + '...' : text;
  }

  let rowsHTML = '';
  commissions.forEach((c, index) => {
    let updatesHTML = '';
    if (c.updates && c.updates.length) {
      updatesHTML += '<ul style="padding-left:1rem; max-height: 200px; overflow-y:auto; margin:0;">';
      c.updates.forEach((u, i) => {
        updatesHTML += `<li style="margin-bottom:0.5rem;">
          <strong>${new Date(u.date).toLocaleString()}:</strong> ${escapeHTML(u.text)} 
          (${u.showPercent ? u.progressPercent + '%' : 'percent hidden'}) 
          ${u.visible ? '[Visible]' : '[Hidden]'}
          ${u.image ? `<br><img src="${escapeHTML(u.image)}" alt="Update image" style="max-width:150px; margin-top:0.3rem; border-radius:8px; filter: drop-shadow(0 0 5px #06b6d4bb);" />` : ''}
          <form method="POST" action="/order-tracker/admin/update/toggle-visibility" style="display:inline;">
            <input type="hidden" name="commissionId" value="${c._id}" />
            <input type="hidden" name="updateIndex" value="${i}" />
            <button type="submit" style="margin: 0 0.3rem; padding: 0.3rem 0.7rem; border-radius: 6px; border:none; cursor:pointer; background:#3b82f6; color:#fff; font-weight:600;">${u.visible ? 'Hide' : 'Show'}</button>
          </form>
          <form method="POST" action="/order-tracker/admin/update/toggle-percent" style="display:inline;">
            <input type="hidden" name="commissionId" value="${c._id}" />
            <input type="hidden" name="updateIndex" value="${i}" />
            <button type="submit" style="margin: 0 0.3rem; padding: 0.3rem 0.7rem; border-radius: 6px; border:none; cursor:pointer; background:#8b5cf6; color:#fff; font-weight:600;">${u.showPercent ? 'Hide %' : 'Show %'}</button>
          </form>
          <form method="POST" action="/order-tracker/admin/update/delete" style="display:inline;">
            <input type="hidden" name="commissionId" value="${c._id}" />
            <input type="hidden" name="updateIndex" value="${i}" />
            <button type="submit" style="margin: 0 0.3rem; padding: 0.3rem 0.7rem; border-radius: 6px; border:none; cursor:pointer; background:#e55353; color:#fff; font-weight:600;">Delete</button>
          </form>
        </li>`;
      });
      updatesHTML += '</ul>';
    } else {
      updatesHTML = '<p style="color:#888; font-style: italic;">No updates yet.</p>';
    }

    rowsHTML += `
      <!-- Summary row, clickable -->
      <tr class="summary-row" data-index="${index}" style="cursor:pointer; user-select:none; background:#1e1e1e;">
        <td style="font-family: monospace; color:#06b6d4; max-width: 130px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHTML(c.userId)}</td>
        <td title="${escapeHTML(c.description)}" style="max-width: 350px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${truncate(c.description)}</td>
        <td style="text-transform: capitalize; max-width: 120px;">${escapeHTML(c.status)}</td>
        <td style="max-width: 170px;">${new Date(c.createdAt).toLocaleString()}</td>
        <td style="max-width: 170px;">${c.updatedAt ? new Date(c.updatedAt).toLocaleString() : ''}</td>
        <td>
          <button class="toggle-details-btn" aria-label="Toggle commission details" style="background:#06b6d4; color:#111; padding:0.3rem 0.7rem; border:none; border-radius:6px; font-weight:700; cursor:pointer;">Details</button>
        </td>
      </tr>

      <!-- Details row, hidden by default -->
      <tr class="details-row" data-index="${index}" style="display:none; background:#292929;">
        <td colspan="6" style="padding:1rem;">
          <form method="POST" action="/order-tracker/admin/edit" style="margin-bottom:1rem; display:flex; flex-wrap: wrap; gap:0.5rem; align-items:center;">
            <input type="hidden" name="id" value="${c._id}" />
            <input type="text" name="description" value="${escapeHTML(c.description)}" required style="flex:1; padding:0.4rem; border-radius:6px; border:none;" />
            <select name="status" style="padding:0.4rem; border-radius:6px; border:none; max-width: 160px;">
              <option value="pending" ${c.status === 'pending' ? 'selected' : ''}>Pending</option>
              <option value="in progress" ${c.status === 'in progress' ? 'selected' : ''}>In Progress</option>
              <option value="completed" ${c.status === 'completed' ? 'selected' : ''}>Completed</option>
              <option value="cancelled" ${c.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
            </select>
            <button type="submit" style="background:#3b82f6; color:#fff; padding:0.4rem 1rem; border-radius:6px; font-weight:600; cursor:pointer; border:none;">Update</button>
          </form>

          <!-- Moved delete form outside the edit form -->
          <form method="POST" action="/order-tracker/admin/delete" onsubmit="return confirm('Delete this commission?');" style="margin-top: 0.5rem;">
            <input type="hidden" name="id" value="${c._id}" />
            <button type="submit" style="background:#e55353; color:#fff; padding:0.4rem 1rem; border-radius:6px; font-weight:600; cursor:pointer; border:none;">Delete Commission</button>
          </form>

          <hr style="border-color: #444; margin: 1rem 0;" />

          <strong style="color:#06b6d4;">Updates:</strong>
          ${updatesHTML}

          <form method="POST" action="/order-tracker/admin/update/add" enctype="multipart/form-data" style="margin-top:1rem; display:flex; flex-direction: column; gap:0.6rem;">
            <input type="hidden" name="commissionId" value="${c._id}" />
            <textarea name="text" placeholder="Update text" required style="resize:none; padding:0.6rem; border-radius:8px; border:none; min-height:60px; font-family: 'Inter', sans-serif;"></textarea>
            <div style="display:flex; align-items:center; gap:1rem;">
              <label style="color:#ddd; user-select:none;">
                Progress %:
                <input type="number" name="progressPercent" min="0" max="100" value="0" style="width:70px; padding:0.3rem; border-radius:6px; border:none;" />
              </label>
              <label style="color:#ddd; user-select:none;">
                <input type="checkbox" name="visible" /> Visible
              </label>
            </div>
            <label style="color:#ddd; user-select:none;">
              PNG image (optional):
              <input type="file" name="image" accept="image/png" style="margin-top:0.2rem;" />
            </label>
            <button type="submit" style="background:#3b82f6; color:#fff; padding:0.5rem 1rem; border-radius:9999px; font-weight:700; cursor:pointer; border:none; align-self:flex-start; width: max-content;">
              Add Update
            </button>
          </form>
        </td>
      </tr>
    `;
  });

  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Admin Panel - Manage Commissions</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>
    body {
      margin: 0;
      font-family: 'Inter', sans-serif;
      background: linear-gradient(135deg, #121212, #1a1a1a);
      color: #ddd;
      min-height: 100vh;
      padding: 2rem 1rem;
      max-width: 1200px;
      margin-left: auto;
      margin-right: auto;
    }
    h1 {
      text-align: center;
      font-weight: 700;
      color: #06b6d4;
      text-shadow: 0 0 8px #06b6d4bb;
      margin-bottom: 2rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #222;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 0 15px #06b6d4aa;
      margin-bottom: 2rem;
    }
    th, td {
      padding: 1rem;
      text-align: left;
      vertical-align: top;
      border-bottom: 1px solid #333;
      max-width: 1px; /* To enable ellipsis */
    }
    th {
      background: #3b82f6;
      color: white;
      font-weight: 700;
      user-select: none;
    }
    tbody tr:hover {
      background: #2a2a2a;
    }
    a {
      color: #3b82f6;
      text-decoration: none;
      font-weight: 600;
    }
    a:hover, a:focus {
      color: #8b5cf6;
      outline: none;
      text-decoration: underline;
    }
    form {
      margin: 0;
    }
    button {
      transition: background-color 0.25s ease;
    }
    button:hover {
      filter: brightness(1.15);
    }
    /* Scroll for wide tables on small screens */
    @media (max-width: 768px) {
      table {
        display: block;
        overflow-x: auto;
        white-space: nowrap;
      }
    }
  </style>
</head>
<body>
  <h1>Admin Panel - Manage Commissions</h1>
  <table aria-label="List of commissions">
    <thead>
      <tr>
        <th>User ID</th>
        <th>Description</th>
        <th>Status</th>
        <th>Created At</th>
        <th>Updated At</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHTML}
    </tbody>
  </table>

  <h2 style="color:#06b6d4; text-align:center; margin-bottom: 1rem;">Add New Commission</h2>
  <form method="POST" action="/order-tracker/admin/add" style="max-width: 600px; margin: auto; background:#222; padding:1.5rem; border-radius: 12px; box-shadow: 0 0 12px #06b6d4aa;">
    <label style="display:block; margin-bottom: 0.6rem; font-weight:600;">
      User Discord ID:
      <input name="userId" required style="width: 100%; padding: 0.5rem; border-radius: 8px; border:none; margin-top:0.3rem; font-family: 'Inter', sans-serif;" />
    </label>
    <label style="display:block; margin-bottom: 0.6rem; font-weight:600;">
      Description:
      <input name="description" required style="width: 100%; padding: 0.5rem; border-radius: 8px; border:none; margin-top:0.3rem; font-family: 'Inter', sans-serif;" />
    </label>
    <label style="display:block; margin-bottom: 1rem; font-weight:600;">
      Status:
      <select name="status" style="width: 100%; padding: 0.5rem; border-radius: 8px; border:none; margin-top:0.3rem; font-family: 'Inter', sans-serif;">
        <option value="pending" selected>Pending</option>
        <option value="in progress">In Progress</option>
        <option value="completed">Completed</option>
        <option value="cancelled">Cancelled</option>
      </select>
    </label>
    <button type="submit" style="background:#3b82f6; color:#fff; padding: 0.75rem 2rem; border-radius: 9999px; font-weight: 700; border:none; cursor:pointer; display: block; margin: auto;">
      Add Commission
    </button>
  </form>

  <p style="text-align:center; margin-top: 2rem;">
    <a href="/order-tracker" aria-label="Back to Dashboard" style="color:#06b6d4; font-weight:600; text-decoration: underline;">← Back to Dashboard</a>
  </p>

  <script>
    // Toggle details row visibility on summary row or "Details" button click
    document.querySelectorAll('tr.summary-row').forEach(row => {
      row.addEventListener('click', e => {
        // But if clicked directly on a button inside summary row (like Details button), do nothing here to avoid double toggle
        if (e.target.tagName.toLowerCase() === 'button') return;

        const index = row.getAttribute('data-index');
        const detailsRow = document.querySelector('tr.details-row[data-index="' + index + '"]');
        if (detailsRow.style.display === 'none' || detailsRow.style.display === '') {
          detailsRow.style.display = 'table-row';
          row.classList.add('open');
        } else {
          detailsRow.style.display = 'none';
          row.classList.remove('open');
        }
      });
    });

    // Toggle details when clicking the "Details" button
    document.querySelectorAll('tr.summary-row button.toggle-details-btn').forEach(button => {
      button.addEventListener('click', e => {
        e.stopPropagation(); // Prevent bubbling up to row click
        const row = e.target.closest('tr.summary-row');
        const index = row.getAttribute('data-index');
        const detailsRow = document.querySelector('tr.details-row[data-index="' + index + '"]');
        if (detailsRow.style.display === 'none' || detailsRow.style.display === '') {
          detailsRow.style.display = 'table-row';
          row.classList.add('open');
        } else {
          detailsRow.style.display = 'none';
          row.classList.remove('open');
        }
      });
    });

    // Prevent clicks inside details row from toggling the summary row
    document.querySelectorAll('tr.details-row button, tr.details-row input, tr.details-row select, tr.details-row textarea, tr.details-row form').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
      });
    });
  </script>
</body>
</html>
  `);
});





// POST routes for admin actions:

// Add commission
app.post('/order-tracker/admin/add', isAdmin, async (req, res) => {
  const { userId, description, status } = req.body;
  await Commission.create({ userId, description, status, updatedAt: new Date() });
  res.redirect('/order-tracker/admin');
});

// Edit commission
app.post('/order-tracker/admin/edit', isAdmin, async (req, res) => {
  const { id, description, status } = req.body;
  await Commission.findByIdAndUpdate(id, { description, status, updatedAt: new Date() });
  res.redirect('/order-tracker/admin');
});

// Delete commission
app.post('/order-tracker/admin/delete', isAdmin, async (req, res) => {
  const { id } = req.body;
  await Commission.findByIdAndDelete(id);
  res.redirect('/order-tracker/admin');
});

// Add update (with image upload)
app.post('/order-tracker/admin/update/add', isAdmin, upload.single('image'), async (req, res) => {
  const { commissionId, text, progressPercent, visible } = req.body;
  if (!commissionId || !text) return res.status(400).send('Missing required fields');

  let imagePath = null;
  if (req.file) imagePath = '/uploads/' + req.file.filename;

  const updateObj = {
    text,
    progressPercent: Number(progressPercent) || 0,
    visible: visible === 'on',
    showPercent: true,
    date: new Date(),
    image: imagePath,
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

// Discord OAuth login flow (simplified)
app.get('/order-tracker/login', (req, res) => {
  const scope = encodeURIComponent('identify');
  const redirect = encodeURIComponent(DISCORD_REDIRECT_URI);
  res.redirect(`https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${redirect}&response_type=code&scope=${scope}`);
});

app.get('/order-tracker/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('No code provided');

  try {
    // Exchange code for token
    const tokenRes = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: DISCORD_REDIRECT_URI,
    }).toString(), {
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
      avatar: userRes.data.avatar,
    };

    res.redirect('/order-tracker');
  } catch (err) {
    console.error(err);
    res.status(500).send('Login failed');
  }
});

// Logout route
app.post('/order-tracker/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
