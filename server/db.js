const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_FILE = process.env.DB_FILE || './data/store.db';
const dir = path.dirname(DB_FILE);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_FILE);

// Init schema if necessary
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  sku TEXT UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  status TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  payment_info TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER,
  product_id INTEGER,
  quantity INTEGER,
  price_cents INTEGER,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);
`);

// Seed products if empty
const count = db.prepare('SELECT count(*) as c FROM products').get().c;
if (count === 0) {
  const insert = db.prepare('INSERT INTO products (sku, title, description, price_cents) VALUES (?, ?, ?, ?)');
  insert.run('SKU-TSHIRT', 'Demo T-Shirt', 'Comfortable cotton demo T-shirt (unisex)', 2500);
  insert.run('SKU-STICKER', 'Sticker Pack', 'Set of 5 demo stickers', 500);
  insert.run('SKU-MUG', 'Coffee Mug', 'Ceramic demo coffee mug', 1500);
  insert.run('SKU-HOODIE', 'Demo Hoodie', 'Warm demo hoodie with logo', 4500);
  insert.run('SKU-CAP', 'Baseball Cap', 'Adjustable demo cap', 2000);
}

module.exports = db;
