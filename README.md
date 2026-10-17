# Professional Invoicing & Billing Web Application

A full-featured, professional web-based billing and invoicing ERP system designed specifically to solve the inventory-to-invoice auto-population limitation seen in platforms like Refrens.

Built with an application and database-level Product Master that guarantees fixed product information—**Product Code**, **Packaging**, **Pack Size**, **Fixed MRP**, **Selling Price / Rate**, **Unit**, and **Tax/GST Rate**—reliably auto-fills into every invoice line item.

---

## 🌟 Key Features

### 1. Robust Product Master & Fixed MRP
- **Application & Database Level Storage**: Products are persisted in SQLite (`data/invoices.db`) using WAL mode and ACID transactions.
- **Dedicated Business Fields**:
  - `Product Name`
  - `Product Code` (Actual business code, distinct from SKU, HSN, or Batch Code)
  - `Packaging` (e.g. `POUCH`, `BOTTLE`)
  - `Pack Size` (e.g. `1 KG`, `500 GM`, `1 LTR`)
  - `Fixed MRP` (Fixed product value, protected from accidental invoice line edits)
  - `Selling Price` (Used as the billing Rate; equals MRP for current products)
  - `Unit` (e.g. `KG`, `LTR`, `GM`, `NOS`)
  - `Tax / GST Rate` (Defaults to 18%)
  - `HSN` (Separate optional tax classification field)
  - `Current Stock`, `Opening Stock`, and `Min Stock Alert Threshold`

### 2. Preloaded Products
1. **AQUA-GUARD**: Code `AG-500G`, Packaging `POUCH`, Pack Size `500 GM`, MRP `₹1,950`, Rate `₹1,950`, Unit `GM`
2. **SEA-MIN**: Code `SM-1KG`, Packaging `POUCH`, Pack Size `1 KG`, MRP `₹200`, Rate `₹200`, Unit `KG`
3. **SEA-MIN ADVANCE**: Code `SMA-1KG`, Packaging `POUCH`, Pack Size `1 KG`, MRP `₹760`, Rate `₹760`, Unit `KG`
4. **NUTRAGEL**: Code `NG-1LTR`, Packaging `BOTTLE`, Pack Size `1 LTR`, MRP `₹640`, Rate `₹640`, Unit `LTR`
5. **Y-TREAT**: Code `YT-1LTR`, Packaging `BOTTLE`, Pack Size `1 LTR`, MRP `₹3,800`, Rate `₹3,800`, Unit `LTR`

### 3. Refrens-Style Swift Invoice Creator Workflow
- **Searchable Autocomplete Product Dropdown**:
  - Search by product name, business code, packaging, or size.
  - Keyboard navigation: use `ArrowDown`, `ArrowUp`, and `Enter` to select instantly.
  - **Instant Auto-Fill**: Selecting a product immediately populates Product Code, Packaging, Pack Size, Fixed MRP, Rate, Unit, and Tax Rate.
  - **Only Quantity is manually entered**: Focus jumps directly to Quantity with text auto-selected.
- **Mathematical Calculation Engine (`InvoiceCalc`)**:
  - Gross Subtotal = `Quantity × Rate`
  - Line / Invoice Discounts (% or Flat ₹)
  - Taxable Subtotal = `Gross - Discount`
  - GST Calculation:
    - **Intra-State**: Automatically splits into CGST (50%) + SGST (50%)
    - **Inter-State**: Automatically calculates IGST (100%)
  - Additional Charges & Shipping / Freight
  - Optional Round-Off to nearest Rupee
  - Grand Total & Balance Due (`Grand Total - Amount Paid`)
  - Real-time Indian Currency Words Converter (e.g. *"Rupees One Thousand Seven Hundred Ninety-Three and Sixty Paise Only"*)

### 4. Immutable Invoice Snapshots
- When an invoice is finalized and saved, the entire customer details and product line items are frozen in the database.
- Future edits to the Product Master or Customer Directory **never retroactively modify existing finalized invoices**.

### 5. Inventory Management
- Deducts stock upon invoice generation with an audit trail in `stock_logs`.
- Stock adjustment modal (Stock In / Stock Out).
- Low stock visual indicators and dashboard alerts.

### 6. A4 Print & PDF Generation
- **Print Preview**: High-contrast, clean A4 Tax Invoice layout with company logo, GSTIN, place of supply, tax summary table, and authorized signatory.
- **Print Invoice**: Browser print optimized for standard A4 portrait without column cutting.
- **Download PDF**: Bundled with `html2pdf.bundle.min.js` for one-click local PDF generation.

---

## 🚀 Running the Application

### Prerequisites
- Node.js (v18+)

### Start the Server
```bash
npm start
```
The server will start on: **http://localhost:3000**

---

## 🧪 Critical Test Cases Verification

### Test Case 1:
- Select **SEA-MIN ADVANCE**:
  - Product Code = `SMA-1KG`
  - Packaging = `POUCH`
  - Pack Size = `1 KG`
  - MRP = `₹760`
  - Selling Price / Rate = `₹760`
  - Unit = `KG`
- Enter **Quantity = 2**:
  - Subtotal = `₹1,520.00`
  - Taxable Amount = `₹1,520.00`
  - GST (18%) = `₹273.60` (CGST `₹136.80` + SGST `₹136.80`)
  - Grand Total = `₹1,793.60`
- Change **Quantity = 3**:
  - Subtotal = `₹2,280.00`
  - GST = `₹410.40`
  - Grand Total = `₹2,690.40`
- Change Product to **Y-TREAT**:
  - Product Code = `YT-1LTR`
  - Packaging = `BOTTLE`
  - Pack Size = `1 LTR`
  - MRP = `₹3,800`
  - Rate = `₹3,800`
  - Quantity remains editable.

### Test Case 2:
- Select **AQUA-GUARD**:
  - Product Code = `AG-500G`
  - Packaging = `POUCH`
  - Pack Size = `500 GM`
  - MRP = `₹1,950`
  - Rate = `₹1,950`
  - Only Quantity needs manual entry.
