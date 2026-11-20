const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure data folder exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'invoices.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency and reliability
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize database schema
function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_name TEXT NOT NULL,
      product_code TEXT NOT NULL UNIQUE,
      packaging TEXT NOT NULL,
      pack_size TEXT NOT NULL,
      mrp REAL NOT NULL,
      selling_price REAL NOT NULL,
      unit TEXT NOT NULL,
      tax_rate REAL NOT NULL DEFAULT 18,
      hsn TEXT DEFAULT '',
      description TEXT DEFAULT '',
      current_stock REAL DEFAULT 100,
      opening_stock REAL DEFAULT 100,
      min_stock REAL DEFAULT 10,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      company_name TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      billing_address TEXT DEFAULT '',
      shipping_address TEXT DEFAULT '',
      gstin TEXT DEFAULT '',
      state TEXT DEFAULT '',
      country TEXT DEFAULT 'India',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      invoice_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      customer_id INTEGER,
      customer_data_snapshot TEXT NOT NULL,
      items_snapshot TEXT NOT NULL,
      subtotal REAL NOT NULL DEFAULT 0,
      discount_type TEXT DEFAULT 'percent',
      discount_val REAL DEFAULT 0,
      total_discount REAL DEFAULT 0,
      taxable_subtotal REAL DEFAULT 0,
      tax_type TEXT DEFAULT 'intra',
      cgst_amount REAL DEFAULT 0,
      sgst_amount REAL DEFAULT 0,
      igst_amount REAL DEFAULT 0,
      total_tax REAL DEFAULT 0,
      additional_charges REAL DEFAULT 0,
      shipping_charges REAL DEFAULT 0,
      round_off REAL DEFAULT 0,
      grand_total REAL NOT NULL DEFAULT 0,
      amount_paid REAL DEFAULT 0,
      balance_due REAL DEFAULT 0,
      status TEXT DEFAULT 'Draft',
      payment_terms TEXT DEFAULT 'Due on Receipt',
      notes TEXT DEFAULT '',
      terms TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      payment_date TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      reference_no TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS stock_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      change_qty REAL NOT NULL,
      reason TEXT NOT NULL,
      reference_id TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
  `);

  // Migrations for total_gst_val, total_tax_val, gst_amount, tax_amount
  try { db.exec("ALTER TABLE invoices ADD COLUMN total_gst_val TEXT DEFAULT ''"); } catch(e){}
  try { db.exec("ALTER TABLE invoices ADD COLUMN total_gst_type TEXT DEFAULT 'percent'"); } catch(e){}
  try { db.exec("ALTER TABLE invoices ADD COLUMN total_tax_val TEXT DEFAULT ''"); } catch(e){}
  try { db.exec("ALTER TABLE invoices ADD COLUMN total_tax_type TEXT DEFAULT 'percent'"); } catch(e){}
  try { db.exec("ALTER TABLE invoices ADD COLUMN gst_amount REAL DEFAULT 0"); } catch(e){}
  try { db.exec("ALTER TABLE invoices ADD COLUMN tax_amount REAL DEFAULT 0"); } catch(e){}

  // Initialize Default Settings if not present
  const defaultSettings = [
    ['company_name', 'EUREKA INTERNATIONAL'],
    ['company_tagline', 'Billing, Inventory & Invoicing Portal'],
    ['company_logo', ''],
    ['company_address', 'Plot No. 42, Industrial Area, Phase 2, Coastal Road\nVisakhapatnam, Andhra Pradesh - 530012'],
    ['company_phone', '+91 98765 43210'],
    ['company_email', 'billing@eurekainternational.com'],
    ['company_gstin', '37AAAAA0000A1Z5'],
    ['company_state', 'Andhra Pradesh'],
    ['invoice_prefix', 'EI/26-27/'],
    ['next_invoice_seq', '1'],
    ['default_tax_rate', '18'],
    ['enable_stock_tracking', 'true'],
    ['default_payment_terms', 'Due on Receipt'],
    ['default_notes', 'Thank you for your business. Please make payments via Bank Transfer or UPI.'],
    ['default_terms', '1. Goods once sold will not be taken back.\n2. Interest @ 18% p.a. will be charged if payment is delayed beyond due date.\n3. Subject to local jurisdiction only.']
  ];

  const insertSetting = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  for (const [key, value] of defaultSettings) {
    insertSetting.run(key, value);
  }

  // Ensure invoice prefix is set to EI/26-27/ if using legacy prefixes
  const currPrefix = db.prepare("SELECT value FROM settings WHERE key = 'invoice_prefix'").get();
  if (!currPrefix || currPrefix.value === 'INV-' || currPrefix.value === 'EUREKA/2026-27/') {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('invoice_prefix', 'EI/26-27/')").run();
  }

  // Preload Products if table is empty
  const countProducts = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  if (countProducts === 0) {
    const insertProduct = db.prepare(`
      INSERT INTO products (
        product_name, product_code, packaging, pack_size, mrp, selling_price,
        unit, tax_rate, hsn, description, current_stock, opening_stock, min_stock
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const initialProducts = [
      ['AQUA-GUARD', 'AG-500G', 'POUCH', '500 GM', 1950, 1950, 'GM', 18, '', 'Water quality conditioner and protectant for aquaculture', 120, 120, 15],
      ['SEA-MIN', 'SM-1KG', 'POUCH', '1 KG', 200, 200, 'KG', 18, '', 'Essential marine minerals blend for pond fertility', 250, 250, 25],
      ['SEA-MIN ADVANCE', 'SMA-1KG', 'POUCH', '1 KG', 760, 760, 'KG', 18, '', 'Advanced trace minerals and bio-nutrients for high density farming', 180, 180, 20],
      ['NUTRAGEL', 'NG-1LTR', 'BOTTLE', '1 LTR', 640, 640, 'LTR', 18, '', 'Premium binding gel with growth stimulants and gut enhancers', 90, 90, 10],
      ['Y-TREAT', 'YT-1LTR', 'BOTTLE', '1 LTR', 3800, 3800, 'LTR', 18, '', 'Specialized biological treatment for pond bottom hygiene', 60, 60, 5]
    ];

    const tx = db.transaction(() => {
      for (const p of initialProducts) {
        insertProduct.run(...p);
      }
    });
    tx();
    console.log('Preloaded initial 5 products into Product Master successfully.');
  }

  // Preload Customers if empty
  const countCustomers = db.prepare('SELECT COUNT(*) as count FROM customers').get().count;
  if (countCustomers === 0) {
    const insertCustomer = db.prepare(`
      INSERT INTO customers (
        customer_name, company_name, phone, email, billing_address,
        shipping_address, gstin, state, country
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const initialCustomers = [
      [
        'Ramesh Naidu',
        'Coastal Blue Aquaculture Farms',
        '+91 94401 23456',
        'ramesh.coastal@gmail.com',
        'Survey 84, Coastal Creek Road, Bhimavaram, West Godavari, Andhra Pradesh - 534201',
        'Survey 84, Coastal Creek Road, Bhimavaram, West Godavari, Andhra Pradesh - 534201',
        '37ABCDE1234F1Z2',
        'Andhra Pradesh',
        'India'
      ],
      [
        'Venkatesh Rao',
        'Sri Krishna Shrimp Hatcheries',
        '+91 98480 98765',
        'srikrishna.hatcheries@yahoo.com',
        'Beach Road, Near Lighthouse, Kakinada, Andhra Pradesh - 533001',
        'Beach Road, Near Lighthouse, Kakinada, Andhra Pradesh - 533001',
        '37KLMNO5678P1Z8',
        'Andhra Pradesh',
        'India'
      ],
      [
        'Mahesh Patel',
        'Gujarat Aqua Agri Tech',
        '+91 98250 11223',
        'mpatel@gujagritech.com',
        'Plot 12, GIDC Industrial Estate, Surat, Gujarat - 395003',
        'Plot 12, GIDC Industrial Estate, Surat, Gujarat - 395003',
        '24ABCDE9876K1Z1',
        'Gujarat',
        'India'
      ]
    ];

    const tx = db.transaction(() => {
      for (const c of initialCustomers) {
        insertCustomer.run(...c);
      }
    });
    tx();
    console.log('Preloaded sample customers successfully.');
  }
}

initDatabase();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
}));

// ----------------------------------------------------
// SETTINGS API
// ----------------------------------------------------
app.get('/api/settings', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings', (req, res) => {
  try {
    const entries = Object.entries(req.body);
    const upsert = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value
    `);
    const tx = db.transaction(() => {
      for (const [k, v] of entries) {
        upsert.run(k, String(v));
      }
    });
    tx();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// PRODUCT MASTER API
// ----------------------------------------------------
app.get('/api/products', (req, res) => {
  try {
    const { search, limit } = req.query;
    let query = 'SELECT * FROM products';
    const params = [];

    if (search) {
      query += ` WHERE product_name LIKE ? OR product_code LIKE ? OR packaging LIKE ? OR pack_size LIKE ?`;
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    query += ' ORDER BY product_name ASC';

    if (limit) {
      query += ' LIMIT ?';
      params.push(parseInt(limit, 10));
    }

    const products = db.prepare(query).all(...params);
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/:id', (req, res) => {
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', (req, res) => {
  try {
    let {
      product_name, product_code, packaging, pack_size, mrp, selling_price,
      unit, tax_rate, hsn, description, current_stock, min_stock
    } = req.body;

    if (!product_name || !product_name.trim()) {
      return res.status(400).json({ error: 'Product Name is required.' });
    }

    product_name = product_name.trim();

    // Auto-generate unique product_code if not provided
    if (!product_code || !product_code.trim()) {
      const cleanPrefix = product_name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'PRD';
      let candidate = `${cleanPrefix}-${Math.floor(100 + Math.random() * 900)}`;
      while (db.prepare('SELECT id FROM products WHERE product_code = ?').get(candidate)) {
        candidate = `${cleanPrefix}-${Math.floor(100 + Math.random() * 900)}`;
      }
      product_code = candidate;
    } else {
      product_code = product_code.trim();
      const existing = db.prepare('SELECT id FROM products WHERE product_code = ?').get(product_code);
      if (existing) {
        return res.status(400).json({ error: `Product Code "${product_code}" already exists.` });
      }
    }

    packaging = (packaging && packaging.trim()) ? packaging.trim().toUpperCase() : 'POUCH';
    pack_size = (pack_size && pack_size.trim()) ? pack_size.trim() : '1 KG';

    const mrpVal = parseFloat(mrp) || 0;
    const priceVal = (selling_price !== undefined && selling_price !== null && selling_price !== '') 
      ? parseFloat(selling_price) 
      : mrpVal;
    const taxVal = parseFloat(tax_rate) || 0;
    const stockVal = (current_stock !== undefined && current_stock !== null && current_stock !== '') ? parseFloat(current_stock) : 100;
    const minStockVal = parseFloat(min_stock) || 5;

    const stmt = db.prepare(`
      INSERT INTO products (
        product_name, product_code, packaging, pack_size, mrp, selling_price,
        unit, tax_rate, hsn, description, current_stock, opening_stock, min_stock, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const result = stmt.run(
      product_name.trim(),
      product_code.trim(),
      packaging.trim().toUpperCase(),
      pack_size.trim(),
      mrpVal,
      priceVal,
      (unit || 'NOS').trim().toUpperCase(),
      taxVal,
      (hsn || '').trim(),
      (description || '').trim(),
      stockVal,
      stockVal,
      minStockVal
    );

    const created = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/products/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    const {
      product_name, product_code, packaging, pack_size, mrp, selling_price,
      unit, tax_rate, hsn, description, current_stock, min_stock
    } = req.body;

    const nameVal = (product_name !== undefined && product_name !== null ? product_name : existing.product_name || '').trim();
    let codeVal = (product_code !== undefined && product_code !== null ? product_code : existing.product_code || '').trim();
    if (!codeVal) {
      codeVal = existing.product_code;
    }

    // Check unique product_code for other products
    const duplicate = db.prepare('SELECT id FROM products WHERE product_code = ? AND id != ?').get(codeVal, id);
    if (duplicate) {
      return res.status(400).json({ error: `Product Code "${codeVal}" is used by another product.` });
    }

    const pkgVal = (packaging !== undefined && packaging !== null ? packaging : existing.packaging || 'POUCH').trim().toUpperCase();
    const sizeVal = (pack_size !== undefined && pack_size !== null ? pack_size : existing.pack_size || '1 KG').trim();
    const mrpVal = (mrp !== undefined && mrp !== null && mrp !== '') ? parseFloat(mrp) || 0 : existing.mrp;
    const priceVal = (selling_price !== undefined && selling_price !== null && selling_price !== '') ? parseFloat(selling_price) || mrpVal : existing.selling_price;
    const unitVal = (unit !== undefined && unit !== null ? unit : existing.unit || 'NOS').trim().toUpperCase();
    const taxVal = (tax_rate !== undefined && tax_rate !== null && tax_rate !== '') ? parseFloat(tax_rate) || 0 : existing.tax_rate;
    const hsnVal = (hsn !== undefined && hsn !== null ? hsn : existing.hsn || '').trim();
    const descVal = (description !== undefined && description !== null ? description : existing.description || '').trim();
    const stockVal = (current_stock !== undefined && current_stock !== null && current_stock !== '') ? parseFloat(current_stock) || 0 : existing.current_stock;
    const minVal = (min_stock !== undefined && min_stock !== null && min_stock !== '') ? parseFloat(min_stock) || 0 : existing.min_stock;

    db.prepare(`
      UPDATE products SET
        product_name = ?,
        product_code = ?,
        packaging = ?,
        pack_size = ?,
        mrp = ?,
        selling_price = ?,
        unit = ?,
        tax_rate = ?,
        hsn = ?,
        description = ?,
        current_stock = ?,
        min_stock = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      nameVal,
      codeVal,
      pkgVal,
      sizeVal,
      mrpVal,
      priceVal,
      unitVal,
      taxVal,
      hsnVal,
      descVal,
      stockVal,
      minVal,
      id
    );

    const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM stock_logs WHERE product_id = ?').run(id);
      db.prepare('DELETE FROM products WHERE id = ?').run(id);
    });
    tx();
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    console.error('Delete product error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products/:id/adjust-stock', (req, res) => {
  try {
    const id = req.params.id;
    const { change_qty, reason, reference_id } = req.body;
    const qty = parseFloat(change_qty);

    if (isNaN(qty) || qty === 0) {
      return res.status(400).json({ error: 'Valid change_qty required.' });
    }

    const tx = db.transaction(() => {
      db.prepare('UPDATE products SET current_stock = current_stock + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(qty, id);
      db.prepare('INSERT INTO stock_logs (product_id, change_qty, reason, reference_id) VALUES (?, ?, ?, ?)')
        .run(id, qty, reason || 'Manual Adjustment', reference_id || '');
    });
    tx();

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// CUSTOMER MASTER API
// ----------------------------------------------------
app.get('/api/customers', (req, res) => {
  try {
    const { search } = req.query;
    let query = 'SELECT * FROM customers';
    const params = [];

    if (search) {
      query += ' WHERE customer_name LIKE ? OR company_name LIKE ? OR phone LIKE ? OR email LIKE ?';
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    query += ' ORDER BY customer_name ASC';

    const customers = db.prepare(query).all(...params);
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/customers/:id', (req, res) => {
  try {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/customers', (req, res) => {
  try {
    const {
      customer_name, company_name, phone, email, billing_address,
      shipping_address, gstin, state, country
    } = req.body;

    if (!customer_name) {
      return res.status(400).json({ error: 'Customer Name is required.' });
    }

    const stmt = db.prepare(`
      INSERT INTO customers (
        customer_name, company_name, phone, email, billing_address,
        shipping_address, gstin, state, country, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const result = stmt.run(
      customer_name.trim(),
      (company_name || '').trim(),
      (phone || '').trim(),
      (email || '').trim(),
      (billing_address || '').trim(),
      (shipping_address || billing_address || '').trim(),
      (gstin || '').trim().toUpperCase(),
      (state || '').trim(),
      (country || 'India').trim()
    );

    const created = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/customers/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Customer not found' });

    const {
      customer_name, company_name, phone, email, billing_address,
      shipping_address, gstin, state, country
    } = req.body;

    const nameVal = (customer_name !== undefined && customer_name !== null ? customer_name : existing.customer_name || '').trim();
    const compVal = (company_name !== undefined && company_name !== null ? company_name : existing.company_name || '').trim();
    const phoneVal = (phone !== undefined && phone !== null ? phone : existing.phone || '').trim();
    const emailVal = (email !== undefined && email !== null ? email : existing.email || '').trim();
    const billVal = (billing_address !== undefined && billing_address !== null ? billing_address : existing.billing_address || '').trim();
    const shipVal = (shipping_address !== undefined && shipping_address !== null ? shipping_address : existing.shipping_address || billVal).trim();
    const gstinVal = (gstin !== undefined && gstin !== null ? gstin : existing.gstin || '').trim().toUpperCase();
    const stateVal = (state !== undefined && state !== null ? state : existing.state || '').trim();
    const countryVal = (country !== undefined && country !== null ? country : existing.country || 'India').trim();

    db.prepare(`
      UPDATE customers SET
        customer_name = ?,
        company_name = ?,
        phone = ?,
        email = ?,
        billing_address = ?,
        shipping_address = ?,
        gstin = ?,
        state = ?,
        country = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      nameVal, compVal, phoneVal, emailVal, billVal, shipVal, gstinVal, stateVal, countryVal, id
    );

    const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/customers/:id', (req, res) => {
  try {
    const id = req.params.id;
    db.prepare('DELETE FROM customers WHERE id = ?').run(id);
    res.json({ success: true, message: 'Customer deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// INVOICE API
// ----------------------------------------------------

// Generate Next Invoice Number
app.get('/api/invoices/next-number', (req, res) => {
  try {
    const prefixRow = db.prepare("SELECT value FROM settings WHERE key = 'invoice_prefix'").get();
    const seqRow = db.prepare("SELECT value FROM settings WHERE key = 'next_invoice_seq'").get();
    const prefix = prefixRow && prefixRow.value ? prefixRow.value : 'EI/26-27/';
    let seq = seqRow ? parseInt(seqRow.value, 10) : 1;
    if (isNaN(seq) || seq < 1) seq = 1;

    let candidate = `${prefix}${String(seq).padStart(3, '0')}`;
    while (db.prepare('SELECT id FROM invoices WHERE invoice_number = ?').get(candidate)) {
      seq += 1;
      candidate = `${prefix}${String(seq).padStart(3, '0')}`;
    }

    res.json({ invoice_number: candidate, next_seq: seq });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List Invoices
app.get('/api/invoices', (req, res) => {
  try {
    const { search, status, from_date, to_date } = req.query;
    let query = 'SELECT * FROM invoices WHERE 1=1';
    const params = [];

    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }
    if (from_date) {
      query += ' AND invoice_date >= ?';
      params.push(from_date);
    }
    if (to_date) {
      query += ' AND invoice_date <= ?';
      params.push(to_date);
    }
    if (search) {
      query += ' AND (invoice_number LIKE ? OR customer_data_snapshot LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s);
    }

    query += ' ORDER BY id DESC';

    const invoices = db.prepare(query).all(...params);
    const parsed = invoices.map(inv => {
      return {
        ...inv,
        customer_data: JSON.parse(inv.customer_data_snapshot || '{}'),
        items: JSON.parse(inv.items_snapshot || '[]')
      };
    });

    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Single Invoice
app.get('/api/invoices/:id', (req, res) => {
  try {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const payments = db.prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY id DESC').all(invoice.id);

    const parsed = {
      ...invoice,
      customer_data: JSON.parse(invoice.customer_data_snapshot || '{}'),
      items: JSON.parse(invoice.items_snapshot || '[]'),
      payments
    };

    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Invoice
app.post('/api/invoices', (req, res) => {
  try {
    const {
      invoice_number,
      invoice_date,
      due_date,
      customer_id,
      customer_data,
      items,
      subtotal,
      discount_type,
      discount_val,
      total_discount,
      taxable_subtotal,
      tax_type,
      cgst_amount,
      sgst_amount,
      igst_amount,
      total_tax,
      total_gst_val,
      total_gst_type,
      total_tax_val,
      total_tax_type,
      gst_amount,
      tax_amount,
      additional_charges,
      shipping_charges,
      round_off,
      grand_total,
      amount_paid,
      balance_due,
      status,
      payment_terms,
      notes,
      terms
    } = req.body;

    if (!invoice_number) {
      return res.status(400).json({ error: 'Invoice number is required.' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one invoice line item is required.' });
    }

    // Check duplicate invoice number
    const dup = db.prepare('SELECT id FROM invoices WHERE invoice_number = ?').get(invoice_number.trim());
    if (dup) {
      return res.status(400).json({ error: `Invoice number "${invoice_number}" already exists.` });
    }

    // Snapshot guarantees:
    // Items snapshot contains frozen product information: product_name, product_code, packaging, pack_size, mrp, selling_price, quantity, unit, rate, discount, taxable_amount, tax_rate, tax_amount, line_total
    const customerSnapshotStr = JSON.stringify(customer_data || {});
    const itemsSnapshotStr = JSON.stringify(items);

    const paidVal = parseFloat(amount_paid) || 0;
    const grandVal = parseFloat(grand_total) || 0;
    const balanceVal = Math.max(0, grandVal - paidVal);

    let finalStatus = status || 'Draft';
    if (paidVal >= grandVal && grandVal > 0) {
      finalStatus = 'Paid';
    } else if (paidVal > 0 && paidVal < grandVal) {
      finalStatus = 'Partially Paid';
    }

    const tx = db.transaction(() => {
      const stmt = db.prepare(`
        INSERT INTO invoices (
          invoice_number, invoice_date, due_date, customer_id, customer_data_snapshot,
          items_snapshot, subtotal, discount_type, discount_val, total_discount,
          taxable_subtotal, tax_type, cgst_amount, sgst_amount, igst_amount,
          total_tax, total_gst_val, total_gst_type, total_tax_val, total_tax_type,
          gst_amount, tax_amount, additional_charges, shipping_charges, round_off, grand_total,
          amount_paid, balance_due, status, payment_terms, notes, terms, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      const resInsert = stmt.run(
        invoice_number.trim(),
        invoice_date,
        due_date,
        customer_id || null,
        customerSnapshotStr,
        itemsSnapshotStr,
        parseFloat(subtotal) || 0,
        discount_type || 'percent',
        parseFloat(discount_val) || 0,
        parseFloat(total_discount) || 0,
        parseFloat(taxable_subtotal) || 0,
        tax_type || 'intra',
        parseFloat(cgst_amount) || 0,
        parseFloat(sgst_amount) || 0,
        parseFloat(igst_amount) || 0,
        parseFloat(total_tax) || 0,
        total_gst_val !== undefined && total_gst_val !== null ? String(total_gst_val) : '',
        total_gst_type || 'percent',
        total_tax_val !== undefined && total_tax_val !== null ? String(total_tax_val) : '',
        total_tax_type || 'percent',
        parseFloat(gst_amount) || 0,
        parseFloat(tax_amount) || 0,
        parseFloat(additional_charges) || 0,
        parseFloat(shipping_charges) || 0,
        parseFloat(round_off) || 0,
        grandVal,
        paidVal,
        balanceVal,
        finalStatus,
        payment_terms || 'Due on Receipt',
        notes || '',
        terms || ''
      );

      const newInvoiceId = resInsert.lastInsertRowid;

      // If initial payment was recorded
      if (paidVal > 0) {
        db.prepare(`
          INSERT INTO payments (invoice_id, amount, payment_date, payment_method, reference_no, notes)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(newInvoiceId, paidVal, invoice_date, 'Initial Payment', '', 'Recorded upon invoice creation');
      }

      // Stock adjustment if enabled
      const trackStockRow = db.prepare("SELECT value FROM settings WHERE key = 'enable_stock_tracking'").get();
      const trackStock = trackStockRow ? trackStockRow.value === 'true' : true;

      if (trackStock) {
        for (const itm of items) {
          if (itm.product_id && itm.quantity) {
            const qty = parseFloat(itm.quantity);
            if (qty > 0) {
              db.prepare('UPDATE products SET current_stock = current_stock - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                .run(qty, itm.product_id);
              db.prepare('INSERT INTO stock_logs (product_id, change_qty, reason, reference_id) VALUES (?, ?, ?, ?)')
                .run(itm.product_id, -qty, `Invoice ${invoice_number.trim()}`, String(newInvoiceId));
            }
          }
        }
      }

      // Update sequence setting if invoice_number followed standard sequence
      const prefixRow = db.prepare("SELECT value FROM settings WHERE key = 'invoice_prefix'").get();
      const prefix = prefixRow && prefixRow.value ? prefixRow.value : 'EI/26-27/';
      if (invoice_number.startsWith(prefix)) {
        const numPart = parseInt(invoice_number.replace(prefix, ''), 10);
        if (!isNaN(numPart)) {
          const currentSeqRow = db.prepare("SELECT value FROM settings WHERE key = 'next_invoice_seq'").get();
          const currentSeq = currentSeqRow ? parseInt(currentSeqRow.value, 10) : 1;
          const newSeq = Math.max(currentSeq, numPart + 1);
          db.prepare("UPDATE settings SET value = ? WHERE key = 'next_invoice_seq'").run(String(newSeq));
        }
      }

      return newInvoiceId;
    });

    const insertedId = tx();
    const created = db.prepare('SELECT * FROM invoices WHERE id = ?').get(insertedId);
    res.status(201).json({
      ...created,
      customer_data: JSON.parse(created.customer_data_snapshot || '{}'),
      items: JSON.parse(created.items_snapshot || '[]')
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Invoice
app.put('/api/invoices/:id', (req, res) => {
  try {
    const id = req.params.id;
    const existing = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Invoice not found' });

    const {
      invoice_number,
      invoice_date,
      due_date,
      customer_id,
      customer_data,
      items,
      subtotal,
      discount_type,
      discount_val,
      total_discount,
      taxable_subtotal,
      tax_type,
      cgst_amount,
      sgst_amount,
      igst_amount,
      total_tax,
      total_gst_val,
      total_gst_type,
      total_tax_val,
      total_tax_type,
      gst_amount,
      tax_amount,
      additional_charges,
      shipping_charges,
      round_off,
      grand_total,
      amount_paid,
      status,
      payment_terms,
      notes,
      terms
    } = req.body;

    const grandVal = parseFloat(grand_total) || 0;
    const paidVal = (amount_paid !== undefined) ? parseFloat(amount_paid) : (existing.amount_paid || 0);
    const balanceVal = Math.max(0, grandVal - paidVal);

    let finalStatus = status || existing.status;
    if (paidVal >= grandVal && grandVal > 0) {
      finalStatus = 'Paid';
    } else if (paidVal > 0 && paidVal < grandVal) {
      finalStatus = 'Partially Paid';
    }

    const tx = db.transaction(() => {
      // If stock tracking is enabled, revert old items and apply new items
      const trackStockRow = db.prepare("SELECT value FROM settings WHERE key = 'enable_stock_tracking'").get();
      const trackStock = trackStockRow ? trackStockRow.value === 'true' : true;

      if (trackStock && items) {
        const oldItems = JSON.parse(existing.items_snapshot || '[]');
        // Revert old items
        for (const itm of oldItems) {
          if (itm.product_id && itm.quantity) {
            const qty = parseFloat(itm.quantity);
            if (qty > 0) {
              db.prepare('UPDATE products SET current_stock = current_stock + ? WHERE id = ?').run(qty, itm.product_id);
            }
          }
        }
        // Apply new items
        for (const itm of items) {
          if (itm.product_id && itm.quantity) {
            const qty = parseFloat(itm.quantity);
            if (qty > 0) {
              db.prepare('UPDATE products SET current_stock = current_stock - ? WHERE id = ?').run(qty, itm.product_id);
            }
          }
        }
      }

      const stmt = db.prepare(`
        UPDATE invoices SET
          invoice_number = ?,
          invoice_date = ?,
          due_date = ?,
          customer_id = ?,
          customer_data_snapshot = ?,
          items_snapshot = ?,
          subtotal = ?,
          discount_type = ?,
          discount_val = ?,
          total_discount = ?,
          taxable_subtotal = ?,
          tax_type = ?,
          cgst_amount = ?,
          sgst_amount = ?,
          igst_amount = ?,
          total_tax = ?,
          total_gst_val = ?,
          total_gst_type = ?,
          total_tax_val = ?,
          total_tax_type = ?,
          gst_amount = ?,
          tax_amount = ?,
          additional_charges = ?,
          shipping_charges = ?,
          round_off = ?,
          grand_total = ?,
          amount_paid = ?,
          balance_due = ?,
          status = ?,
          payment_terms = ?,
          notes = ?,
          terms = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      stmt.run(
        invoice_number ? invoice_number.trim() : existing.invoice_number,
        invoice_date || existing.invoice_date,
        due_date || existing.due_date,
        customer_id !== undefined ? customer_id : existing.customer_id,
        customer_data ? JSON.stringify(customer_data) : existing.customer_data_snapshot,
        items ? JSON.stringify(items) : existing.items_snapshot,
        parseFloat(subtotal) || existing.subtotal,
        discount_type || existing.discount_type,
        parseFloat(discount_val) || existing.discount_val,
        parseFloat(total_discount) || existing.total_discount,
        parseFloat(taxable_subtotal) || existing.taxable_subtotal,
        tax_type || existing.tax_type,
        parseFloat(cgst_amount) || existing.cgst_amount,
        parseFloat(sgst_amount) || existing.sgst_amount,
        parseFloat(igst_amount) || existing.igst_amount,
        parseFloat(total_tax) || existing.total_tax,
        total_gst_val !== undefined && total_gst_val !== null ? String(total_gst_val) : (existing.total_gst_val || ''),
        total_gst_type || existing.total_gst_type || 'percent',
        total_tax_val !== undefined && total_tax_val !== null ? String(total_tax_val) : (existing.total_tax_val || ''),
        total_tax_type || existing.total_tax_type || 'percent',
        parseFloat(gst_amount) !== undefined && !isNaN(parseFloat(gst_amount)) ? parseFloat(gst_amount) : (existing.gst_amount || 0),
        parseFloat(tax_amount) !== undefined && !isNaN(parseFloat(tax_amount)) ? parseFloat(tax_amount) : (existing.tax_amount || 0),
        parseFloat(additional_charges) || existing.additional_charges,
        parseFloat(shipping_charges) || existing.shipping_charges,
        parseFloat(round_off) || existing.round_off,
        grandVal,
        paidVal,
        balanceVal,
        finalStatus,
        payment_terms || existing.payment_terms,
        notes !== undefined ? notes : existing.notes,
        terms !== undefined ? terms : existing.terms,
        id
      );
    });

    tx();

    const updated = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
    res.json({
      ...updated,
      customer_data: JSON.parse(updated.customer_data_snapshot || '{}'),
      items: JSON.parse(updated.items_snapshot || '[]')
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Invoice
app.delete('/api/invoices/:id', (req, res) => {
  try {
    const id = req.params.id;
    const existing = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Invoice not found' });

    const trackStockRow = db.prepare("SELECT value FROM settings WHERE key = 'enable_stock_tracking'").get();
    const trackStock = trackStockRow ? trackStockRow.value === 'true' : true;

    const tx = db.transaction(() => {
      if (trackStock) {
        const oldItems = JSON.parse(existing.items_snapshot || '[]');
        for (const itm of oldItems) {
          if (itm.product_id && itm.quantity) {
            const qty = parseFloat(itm.quantity);
            if (qty > 0) {
              db.prepare('UPDATE products SET current_stock = current_stock + ? WHERE id = ?').run(qty, itm.product_id);
              db.prepare('INSERT INTO stock_logs (product_id, change_qty, reason, reference_id) VALUES (?, ?, ?, ?)')
                .run(itm.product_id, qty, `Deleted Invoice ${existing.invoice_number}`, String(id));
            }
          }
        }
      }
      db.prepare('DELETE FROM invoices WHERE id = ?').run(id);
    });
    tx();

    res.json({ success: true, message: 'Invoice deleted and inventory restored.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add Payment to Invoice
app.post('/api/invoices/:id/payments', (req, res) => {
  try {
    const id = req.params.id;
    const { amount, payment_date, payment_method, reference_no, notes } = req.body;
    const payAmt = parseFloat(amount);

    if (isNaN(payAmt) || payAmt <= 0) {
      return res.status(400).json({ error: 'Valid payment amount is required.' });
    }

    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO payments (invoice_id, amount, payment_date, payment_method, reference_no, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        id,
        payAmt,
        payment_date || new Date().toISOString().split('T')[0],
        payment_method || 'Bank Transfer',
        (reference_no || '').trim(),
        (notes || '').trim()
      );

      const totalPaid = db.prepare('SELECT SUM(amount) as total FROM payments WHERE invoice_id = ?').get(id).total || 0;
      const balance = Math.max(0, invoice.grand_total - totalPaid);

      let newStatus = 'Partially Paid';
      if (balance <= 0) {
        newStatus = 'Paid';
      }

      db.prepare(`
        UPDATE invoices SET
          amount_paid = ?,
          balance_due = ?,
          status = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(totalPaid, balance, newStatus, id);
    });

    tx();

    const updated = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
    const payments = db.prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY id DESC').all(id);

    res.json({
      invoice: {
        ...updated,
        customer_data: JSON.parse(updated.customer_data_snapshot || '{}'),
        items: JSON.parse(updated.items_snapshot || '[]')
      },
      payments
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// DASHBOARD STATS API
// ----------------------------------------------------
app.get('/api/dashboard/stats', (req, res) => {
  try {
    const totalInvoices = db.prepare('SELECT COUNT(*) as count FROM invoices').get().count;
    const salesRow = db.prepare('SELECT SUM(grand_total) as total, SUM(amount_paid) as paid, SUM(balance_due) as due FROM invoices WHERE status != "Cancelled"').get();
    const paidCount = db.prepare("SELECT COUNT(*) as count FROM invoices WHERE status = 'Paid'").get().count;
    const unpaidCount = db.prepare("SELECT COUNT(*) as count FROM invoices WHERE status != 'Paid' AND status != 'Cancelled'").get().count;
    const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
    const lowStockCount = db.prepare('SELECT COUNT(*) as count FROM products WHERE current_stock <= min_stock').get().count;

    const recentInvoices = db.prepare(`
      SELECT id, invoice_number, invoice_date, customer_data_snapshot, grand_total, amount_paid, balance_due, status
      FROM invoices ORDER BY id DESC LIMIT 5
    `).all().map(inv => ({
      ...inv,
      customer_data: JSON.parse(inv.customer_data_snapshot || '{}')
    }));

    const lowStockItems = db.prepare(`
      SELECT id, product_name, product_code, packaging, pack_size, current_stock, min_stock, unit
      FROM products WHERE current_stock <= min_stock ORDER BY current_stock ASC LIMIT 5
    `).all();

    res.json({
      totalInvoices,
      totalSales: salesRow.total || 0,
      totalPaid: salesRow.paid || 0,
      totalOutstanding: salesRow.due || 0,
      paidCount,
      unpaidCount,
      totalProducts,
      lowStockCount,
      recentInvoices,
      lowStockItems
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// IMPORT / EXPORT PRODUCTS API
// ----------------------------------------------------
app.get('/api/products/export/csv', (req, res) => {
  try {
    const products = db.prepare('SELECT * FROM products ORDER BY id ASC').all();
    const headers = ['Product Name', 'Product Code', 'Packaging', 'Pack Size', 'MRP', 'Selling Price', 'Unit', 'Tax Rate', 'HSN', 'Current Stock', 'Min Stock', 'Description'];
    const rows = products.map(p => [
      `"${p.product_name.replace(/"/g, '""')}"`,
      `"${p.product_code.replace(/"/g, '""')}"`,
      `"${p.packaging}"`,
      `"${p.pack_size}"`,
      p.mrp,
      p.selling_price,
      `"${p.unit}"`,
      p.tax_rate,
      `"${p.hsn || ''}"`,
      p.current_stock,
      p.min_stock,
      `"${(p.description || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="product_master.csv"');
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SPA fallback
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`EUREKA INTERNATIONAL Invoicing Server is running:`);
  console.log(`- Local:   http://localhost:${PORT}`);
  console.log(`- Network: http://0.0.0.0:${PORT}`);
});
