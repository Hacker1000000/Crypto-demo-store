const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const db = require('./db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const JWT_SECRET = process.env.JWT_SECRET || 'replace-me';
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

// Static addresses (for demo/testing only)
const STATIC_BTC_ADDRESS = process.env.STATIC_BTC_ADDRESS || '';
const STATIC_XMR_ADDRESS = process.env.STATIC_XMR_ADDRESS || '';
const STATIC_XMR_PAYMENT_ID = process.env.STATIC_XMR_PAYMENT_ID || '';

// Admin token (set via .env or Replit secrets). Default only for demo — change it.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-secret';

/**
 * Ensure orders table has an admin_note column (add if missing)
 * This allows admins to attach notes to orders.
 */
try {
  const cols = db.prepare("PRAGMA table_info(orders)").all();
  if (!cols.find(c => c.name === 'admin_note')) {
    db.prepare('ALTER TABLE orders ADD COLUMN admin_note TEXT').run();
    console.log('Added admin_note column to orders table.');
  }
} catch (e) {
  console.warn('Could not ensure admin_note column:', e.message);
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Missing auth' });
  const parts = auth.split(' ');
  if (parts[0] !== 'Bearer') return res.status(401).json({ error: 'Invalid auth' });
  try {
    const payload = jwt.verify(parts[1], JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

/** Admin auth middleware: allow header X-Admin-Token or Authorization: Bearer <token> */
function adminAuth(req, res, next) {
  const headerToken = (req.headers['x-admin-token'] || '').toString();
  let bearerToken = null;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    bearerToken = req.headers.authorization.slice(7).trim();
  }
  const token = headerToken || bearerToken;
  if (!token || token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Missing or invalid admin token' });
  }
  next();
}

// --- Auth ---
app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const hashed = await bcrypt.hash(password, 10);
  try {
    const stmt = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)');
    const info = stmt.run(email, hashed);
    res.json({ id: info.lastInsertRowid, email });
  } catch (e) {
    res.status(400).json({ error: 'User exists or invalid' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!row) return res.status(400).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return res.status(400).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: row.id, email: row.email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

// --- Products ---
app.get('/api/products', (req, res) => {
  const rows = db.prepare('SELECT id, sku, title, description, price_cents FROM products').all();
  res.json(rows);
});

// --- Checkout: return static addresses for payments ---
app.post('/api/checkout', authMiddleware, async (req, res) => {
  // body: { cart: [{productId, quantity}], paymentMethod: "BTC"|"XMR" }
  const { cart, paymentMethod } = req.body;
  if (!Array.isArray(cart) || cart.length === 0) return res.status(400).json({ error: 'Empty cart' });
  if (!['BTC', 'XMR'].includes(paymentMethod)) return res.status(400).json({ error: 'Unsupported paymentMethod' });

  // calculate total
  let total = 0;
  const items = [];
  const getProduct = db.prepare('SELECT * FROM products WHERE id = ?');
  for (const line of cart) {
    const product = getProduct.get(line.productId);
    if (!product) return res.status(400).json({ error: 'Invalid product in cart' });
    const qty = Math.max(1, Number(line.quantity) || 1);
    total += product.price_cents * qty;
    items.push({ productId: product.id, qty, price_cents: product.price_cents });
  }

  // create order row
  const insert = db.prepare('INSERT INTO orders (user_id, status, total_cents, currency) VALUES (?, ?, ?, ?)');
  const info = insert.run(req.user.id, 'pending', total, paymentMethod);
  const orderId = info.lastInsertRowid;
  const insertItem = db.prepare('INSERT INTO order_items (order_id, product_id, quantity, price_cents) VALUES (?, ?, ?, ?)');
  for (const it of items) insertItem.run(orderId, it.productId, it.qty, it.price_cents);

  // For demo: return static address info
  if (paymentMethod === 'BTC') {
    if (!STATIC_BTC_ADDRESS) {
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('error', orderId);
      return res.status(500).json({ error: 'STATIC_BTC_ADDRESS not configured' });
    }
    // Optionally form a BIP21 URI (no amount in BTC because we do not convert USD here)
    const bip21 = `bitcoin:${STATIC_BTC_ADDRESS}?label=Order-${orderId}`;
    db.prepare('UPDATE orders SET payment_info = ? WHERE id = ?').run(JSON.stringify({ provider: 'static', method: 'BTC', address: STATIC_BTC_ADDRESS }), orderId);
    return res.json({
      orderId,
      payment: {
        method: 'BTC',
        address: STATIC_BTC_ADDRESS,
        bip21
      }
    });
  } else { // XMR
    if (!STATIC_XMR_ADDRESS) {
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('error', orderId);
      return res.status(500).json({ error: 'STATIC_XMR_ADDRESS not configured' });
    }
    // Provide static XMR address and optional payment id (for your manual tracking)
    db.prepare('UPDATE orders SET payment_info = ? WHERE id = ?').run(JSON.stringify({ provider: 'static', method: 'XMR', address: STATIC_XMR_ADDRESS, payment_id: STATIC_XMR_PAYMENT_ID || null }), orderId);
    return res.json({
      orderId,
      payment: {
        method: 'XMR',
        address: STATIC_XMR_ADDRESS,
        payment_id: STATIC_XMR_PAYMENT_ID || null
      }
    });
  }
});

// Get order (owner only)
app.get('/api/order/:id', authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Order not found' });
  const items = db.prepare('SELECT oi.*, p.sku, p.title FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE order_id = ?').all(id);
  row.items = items;
  res.json(row);
});

// Demo-only: allow owner to mark their order paid (simulate on-chain detection)
app.post('/api/order/:id/mark-paid', authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Order not found' });
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('paid', id);
  res.json({ ok: true, orderId: id, status: 'paid' });
});

// ----------------- Admin endpoints (require ADMIN_TOKEN) -----------------
// List recent orders (admin access)
app.get('/api/admin/orders', adminAuth, (req, res) => {
  const rows = db.prepare('SELECT id, user_id, status, total_cents, currency, payment_info, created_at, admin_note FROM orders ORDER BY created_at DESC LIMIT 500').all();
  // Attach a minimal items preview (count)
  const attachItems = rows.map(r => {
    const items = db.prepare('SELECT oi.*, p.sku, p.title FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE order_id = ?').all(r.id);
    return Object.assign({}, r, { items });
  });
  res.json(attachItems);
});

// Get full order details (admin access)
app.get('/api/admin/order/:id', adminAuth, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Order not found' });
  const items = db.prepare('SELECT oi.*, p.sku, p.title FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE order_id = ?').all(id);
  row.items = items;
  res.json(row);
});

// Update order status and admin_note (admin access)
app.post('/api/admin/order/:id/update', adminAuth, (req, res) => {
  const id = Number(req.params.id);
  const { status, admin_note } = req.body || {};
  const validStatuses = ['pending', 'paid', 'cancelled', 'error', 'refunded'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Allowed: ' + validStatuses.join(', ') });
  }
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Order not found' });
  db.prepare('UPDATE orders SET status = ?, admin_note = ? WHERE id = ?').run(status, admin_note || null, id);
  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  res.json({ ok: true, order: updated });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server listening on', PORT);
  console.log('Open ' + (process.env.APP_BASE_URL || `http://localhost:${PORT}`));
});
