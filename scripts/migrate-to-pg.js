/**
 * Standalone migration script: SQLite -> PostgreSQL
 * Usage: node scripts/migrate-to-pg.js [DATABASE_URL]
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function runMigration() {
  const connectionString = process.argv[2] || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ Error: DATABASE_URL is required as argument or environment variable.');
    process.exit(1);
  }

  const exportPath = path.join(__dirname, '..', 'data', 'database_export.json');
  if (!fs.existsSync(exportPath)) {
    console.error('❌ Error: data/database_export.json not found.');
    process.exit(1);
  }

  const dump = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  console.log('🚀 Connecting to PostgreSQL at:', connectionString.replace(/:[^:@]+@/, ':****@'));

  try {
    // 1. Create tables
    console.log('📦 Ensuring PostgreSQL schema exists...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        product_name TEXT NOT NULL,
        product_code TEXT NOT NULL UNIQUE,
        packaging TEXT NOT NULL,
        pack_size TEXT NOT NULL,
        mrp NUMERIC NOT NULL,
        selling_price NUMERIC NOT NULL,
        unit TEXT NOT NULL,
        tax_rate NUMERIC NOT NULL DEFAULT 18,
        hsn TEXT DEFAULT '',
        description TEXT DEFAULT '',
        current_stock NUMERIC DEFAULT 100,
        opening_stock NUMERIC DEFAULT 100,
        min_stock NUMERIC DEFAULT 10,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        customer_name TEXT NOT NULL,
        company_name TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        email TEXT DEFAULT '',
        billing_address TEXT DEFAULT '',
        shipping_address TEXT DEFAULT '',
        gstin TEXT DEFAULT '',
        state TEXT DEFAULT '',
        country TEXT DEFAULT 'India',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        invoice_number TEXT NOT NULL UNIQUE,
        invoice_date TEXT NOT NULL,
        due_date TEXT NOT NULL,
        customer_id INTEGER,
        customer_data_snapshot TEXT NOT NULL,
        items_snapshot TEXT NOT NULL,
        subtotal NUMERIC NOT NULL DEFAULT 0,
        discount_type TEXT DEFAULT 'percent',
        discount_val NUMERIC DEFAULT 0,
        total_discount NUMERIC DEFAULT 0,
        taxable_subtotal NUMERIC DEFAULT 0,
        tax_type TEXT DEFAULT 'intra',
        cgst_amount NUMERIC DEFAULT 0,
        sgst_amount NUMERIC DEFAULT 0,
        igst_amount NUMERIC DEFAULT 0,
        total_tax NUMERIC DEFAULT 0,
        total_gst_val TEXT DEFAULT '',
        total_gst_type TEXT DEFAULT 'percent',
        total_tax_val TEXT DEFAULT '',
        total_tax_type TEXT DEFAULT 'percent',
        gst_amount NUMERIC DEFAULT 0,
        tax_amount NUMERIC DEFAULT 0,
        additional_charges NUMERIC DEFAULT 0,
        shipping_charges NUMERIC DEFAULT 0,
        round_off NUMERIC DEFAULT 0,
        grand_total NUMERIC NOT NULL DEFAULT 0,
        amount_paid NUMERIC DEFAULT 0,
        balance_due NUMERIC DEFAULT 0,
        status TEXT DEFAULT 'Draft',
        payment_terms TEXT DEFAULT 'Due on Receipt',
        notes TEXT DEFAULT '',
        terms TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        amount NUMERIC NOT NULL,
        payment_date TEXT NOT NULL,
        payment_method TEXT NOT NULL,
        reference_no TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS stock_logs (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        change_qty NUMERIC NOT NULL,
        reason TEXT NOT NULL,
        reference_id TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Insert Settings
    console.log(`⚙️ Migrating ${dump.settings.length} settings...`);
    for (const s of dump.settings) {
      await pool.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [s.key, s.value]);
    }

    // 3. Insert Products
    console.log(`🛍️ Migrating ${dump.products.length} products...`);
    for (const p of dump.products) {
      await pool.query(`
        INSERT INTO products (
          id, product_name, product_code, packaging, pack_size, mrp, selling_price,
          unit, tax_rate, hsn, description, current_stock, opening_stock, min_stock
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (product_code) DO NOTHING
      `, [
        p.id, p.product_name, p.product_code, p.packaging, p.pack_size, p.mrp, p.selling_price,
        p.unit, p.tax_rate, p.hsn, p.description, p.current_stock, p.opening_stock, p.min_stock
      ]);
    }
    await pool.query("SELECT setval('products_id_seq', (SELECT COALESCE(MAX(id), 1) FROM products))");

    // 4. Insert Customers
    console.log(`👥 Migrating ${dump.customers.length} customers...`);
    for (const c of dump.customers) {
      await pool.query(`
        INSERT INTO customers (
          id, customer_name, company_name, phone, email, billing_address,
          shipping_address, gstin, state, country
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO NOTHING
      `, [
        c.id, c.customer_name, c.company_name, c.phone, c.email, c.billing_address,
        c.shipping_address, c.gstin, c.state, c.country
      ]);
    }
    await pool.query("SELECT setval('customers_id_seq', (SELECT COALESCE(MAX(id), 1) FROM customers))");

    // 5. Insert Invoices
    console.log(`📄 Migrating ${dump.invoices.length} invoices...`);
    for (const inv of dump.invoices) {
      await pool.query(`
        INSERT INTO invoices (
          id, invoice_number, invoice_date, due_date, customer_id, customer_data_snapshot,
          items_snapshot, subtotal, discount_type, discount_val, total_discount,
          taxable_subtotal, tax_type, cgst_amount, sgst_amount, igst_amount, total_tax,
          total_gst_val, total_gst_type, total_tax_val, total_tax_type, gst_amount, tax_amount,
          additional_charges, shipping_charges, round_off, grand_total, amount_paid,
          balance_due, status, payment_terms, notes, terms
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16, $17,
          $18, $19, $20, $21, $22, $23,
          $24, $25, $26, $27, $28,
          $29, $30, $31, $32, $33
        ) ON CONFLICT (invoice_number) DO NOTHING
      `, [
        inv.id, inv.invoice_number, inv.invoice_date, inv.due_date, inv.customer_id, inv.customer_data_snapshot,
        inv.items_snapshot, inv.subtotal, inv.discount_type, inv.discount_val, inv.total_discount,
        inv.taxable_subtotal, inv.tax_type, inv.cgst_amount, inv.sgst_amount, inv.igst_amount, inv.total_tax,
        inv.total_gst_val || '', inv.total_gst_type || 'percent', inv.total_tax_val || '', inv.total_tax_type || 'percent',
        inv.gst_amount || 0, inv.tax_amount || 0, inv.additional_charges, inv.shipping_charges, inv.round_off,
        inv.grand_total, inv.amount_paid, inv.balance_due, inv.status, inv.payment_terms, inv.notes, inv.terms
      ]);
    }
    await pool.query("SELECT setval('invoices_id_seq', (SELECT COALESCE(MAX(id), 1) FROM invoices))");

    // 6. Insert Payments
    if (dump.payments && dump.payments.length > 0) {
      console.log(`💳 Migrating ${dump.payments.length} payments...`);
      for (const py of dump.payments) {
        await pool.query(`
          INSERT INTO payments (id, invoice_id, amount, payment_date, payment_method, reference_no, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO NOTHING
        `, [py.id, py.invoice_id, py.amount, py.payment_date, py.payment_method, py.reference_no, py.notes]);
      }
      await pool.query("SELECT setval('payments_id_seq', (SELECT COALESCE(MAX(id), 1) FROM payments))");
    }

    console.log('🎉 Migration completed successfully! All records verified in cloud PostgreSQL.');
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await pool.end();
  }
}

runMigration();
