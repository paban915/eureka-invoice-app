/**
 * Professional Invoicing & Billing Application
 * Main Application Controller & UI State Engine
 */

const App = {
  state: {
    activeTab: 'invoice-creator',
    products: [],
    customers: [],
    settings: {},
    invoices: [],
    currentInvoice: null,
    editingInvoiceId: null,
    editingProductId: null,
    editingCustomerId: null,
    activeDropdownIndex: null
  },

  // Initialize application
  async init() {
    this.bindGlobalEvents();
    await this.loadInitialData();
    this.initNewInvoice();
  },

  // Bind global event listeners
  bindGlobalEvents() {
    // Navigation tab switches
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = btn.dataset.tab;
        this.switchTab(tab);
      });
    });

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.product-select-container')) {
        this.closeAllProductDropdowns();
      }
    });

    // Global keyboard shortcuts (Alt+A for Add Line, Ctrl+S for Save)
    document.addEventListener('keydown', (e) => {
      if (e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        if (this.state.activeTab === 'invoice-creator') {
          this.addNewLine();
        }
      }
    });
  },

  // Load products, customers, settings from server
  async loadInitialData() {
    try {
      const [settings, products, customers] = await Promise.all([
        API.getSettings(),
        API.getProducts(),
        API.getCustomers()
      ]);
      this.state.settings = settings || {};
      this.state.products = products || [];
      this.state.customers = customers || [];
      
      this.updateHeaderBrand();
      this.updateCounters();
    } catch (err) {
      this.showToast('Error loading initial data: ' + err.message, 'error');
    }
  },

  // Update header branding
  updateHeaderBrand() {
    const nameEl = document.getElementById('hdrCompanyName');
    const taglineEl = document.getElementById('hdrCompanyTagline');
    if (nameEl && this.state.settings.company_name) {
      nameEl.textContent = this.state.settings.company_name;
    }
    if (taglineEl && this.state.settings.company_tagline) {
      taglineEl.textContent = this.state.settings.company_tagline;
    }
  },

  // Update navbar counters
  updateCounters() {
    const pCount = document.getElementById('cntProducts');
    const cCount = document.getElementById('cntCustomers');
    if (pCount) pCount.textContent = this.state.products.length;
    if (cCount) cCount.textContent = this.state.customers.length;
  },

  // Switch between tabs
  switchTab(tabName) {
    this.state.activeTab = tabName;
    document.querySelectorAll('.nav-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tabName);
    });

    document.querySelectorAll('.view-panel').forEach(v => {
      v.classList.remove('active');
    });

    const activePanel = document.getElementById(`view-${tabName}`);
    if (activePanel) {
      activePanel.classList.add('active');
    }

    // Refresh view specific data
    if (tabName === 'dashboard') {
      this.loadDashboardData();
    } else if (tabName === 'invoices-list') {
      this.loadInvoicesList();
    } else if (tabName === 'products-list') {
      this.renderProductsTable();
    } else if (tabName === 'customers-list') {
      this.renderCustomersTable();
    } else if (tabName === 'settings') {
      this.populateSettingsForm();
    }
  },

  // ----------------------------------------------------
  // INVOICE CREATOR LOGIC (CORE WORKFLOW)
  // ----------------------------------------------------
  async initNewInvoice(baseData = null) {
    let invNumber = 'INV-0001';
    try {
      const numRes = await API.getNextInvoiceNumber();
      if (numRes && numRes.invoice_number) {
        invNumber = numRes.invoice_number;
      }
    } catch (e) {
      console.warn('Could not fetch next sequence, using fallback');
    }

    const today = new Date().toISOString().split('T')[0];
    const dueDate = new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0];

    this.state.editingInvoiceId = null;
    this.state.currentInvoice = baseData || {
      invoice_number: invNumber,
      invoice_date: today,
      due_date: dueDate,
      customer_id: '',
      customer_data: {
        customer_name: '',
        company_name: '',
        phone: '',
        email: '',
        billing_address: '',
        shipping_address: '',
        gstin: '',
        state: this.state.settings.company_state || 'Andhra Pradesh'
      },
      items: [],
      tax_type: 'intra', // 'intra' (CGST+SGST) or 'inter' (IGST)
      total_gst_val: '',
      total_gst_type: 'percent',
      total_tax_val: '',
      total_tax_type: 'percent',
      gst_amount: 0,
      tax_amount: 0,
      invoice_discount_type: 'percent',
      invoice_discount_val: 0,
      additional_charges: 0,
      shipping_charges: 0,
      apply_round_off: false,
      amount_paid: 0,
      payment_terms: this.state.settings.default_payment_terms || 'Due on Receipt',
      notes: this.state.settings.default_notes || '',
      terms: this.state.settings.default_terms || '',
      status: 'Draft'
    };

    // If starting fresh without lines, add 1 empty line
    if (!this.state.currentInvoice.items || this.state.currentInvoice.items.length === 0) {
      this.addNewLine(false);
    }

    this.populateInvoiceForm();
    this.recalculateAndRenderSummary();
  },

  // Populate creator form with current invoice state
  populateInvoiceForm() {
    const inv = this.state.currentInvoice;
    document.getElementById('invNumber').value = inv.invoice_number || '';
    document.getElementById('invDate').value = inv.invoice_date || '';
    document.getElementById('invDueDate').value = inv.due_date || '';
    document.getElementById('invPaymentTerms').value = inv.payment_terms || 'Due on Receipt';
    document.getElementById('invNotes').value = inv.notes || '';
    document.getElementById('invTerms').value = inv.terms || '';

    // Customer Select dropdown
    this.populateCustomerDropdown(inv.customer_id);
    this.renderCustomerPreview(inv.customer_data);

    // Discount & Extra charges - completely blank by default if not set or 0
    document.getElementById('invDiscountVal').value = (inv.invoice_discount_val && inv.invoice_discount_val > 0) ? inv.invoice_discount_val : '';
    document.getElementById('invDiscountType').value = inv.invoice_discount_type || 'percent';
    document.getElementById('invShippingCharges').value = (inv.shipping_charges && inv.shipping_charges > 0) ? inv.shipping_charges : '';
    document.getElementById('invAdditionalCharges').value = (inv.additional_charges && inv.additional_charges > 0) ? inv.additional_charges : '';
    const roundOffEl = document.getElementById('invRoundOffCheck');
    if (roundOffEl) roundOffEl.checked = !!inv.apply_round_off;
    document.getElementById('invAmountPaid').value = (inv.amount_paid && inv.amount_paid > 0) ? inv.amount_paid : '';

    // 1. Total GST input - completely blank by default if empty
    const gstInput = document.getElementById('invTotalGstVal');
    if (gstInput) {
      if (inv.total_gst_val !== undefined && inv.total_gst_val !== null && inv.total_gst_val !== '') {
        gstInput.value = inv.total_gst_val;
      } else {
        gstInput.value = '';
      }
    }
    const gstTypeSelect = document.getElementById('invTotalGstType');
    if (gstTypeSelect) {
      gstTypeSelect.value = inv.total_gst_type || 'percent';
    }

    // 2. Total Tax input - completely blank by default if empty
    const taxInput = document.getElementById('invTotalTaxVal');
    if (taxInput) {
      if (inv.total_tax_val !== undefined && inv.total_tax_val !== null && inv.total_tax_val !== '') {
        taxInput.value = inv.total_tax_val;
      } else {
        taxInput.value = '';
      }
    }
    const taxTypeSelect = document.getElementById('invTotalTaxType');
    if (taxTypeSelect) {
      taxTypeSelect.value = inv.total_tax_type || 'percent';
    }

    // Render items table
    this.renderInvoiceItemsTable();
  },

  // Populate Customer Select element
  populateCustomerDropdown(selectedId = '') {
    const select = document.getElementById('invCustomerSelect');
    if (!select) return;

    select.innerHTML = '<option value="">-- Select Saved Customer --</option>';
    this.state.customers.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.customer_name} ${c.company_name ? '(' + c.company_name + ')' : ''} - ${c.state || ''}`;
      if (String(c.id) === String(selectedId)) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });
  },

  // On selecting a customer
  onCustomerSelectChange(customerId) {
    if (!customerId) {
      this.state.currentInvoice.customer_id = '';
      this.state.currentInvoice.customer_data = {
        customer_name: '',
        company_name: '',
        phone: '',
        email: '',
        billing_address: '',
        shipping_address: '',
        gstin: '',
        state: ''
      };
      this.renderCustomerPreview(null);
      return;
    }

    const cust = this.state.customers.find(c => String(c.id) === String(customerId));
    if (cust) {
      this.state.currentInvoice.customer_id = cust.id;
      this.state.currentInvoice.customer_data = {
        customer_name: cust.customer_name,
        company_name: cust.company_name,
        phone: cust.phone,
        email: cust.email,
        billing_address: cust.billing_address,
        shipping_address: cust.shipping_address,
        gstin: cust.gstin,
        state: cust.state,
        country: cust.country
      };

      // Auto-detect tax type: if customer state matches business state => Intra-state (CGST+SGST), else Inter-state (IGST)
      const compState = (this.state.settings.company_state || '').trim().toLowerCase();
      const custState = (cust.state || '').trim().toLowerCase();

      if (custState && compState && custState !== compState) {
        this.setTaxType('inter');
      } else {
        this.setTaxType('intra');
      }

      this.renderCustomerPreview(this.state.currentInvoice.customer_data);
      this.recalculateAndRenderSummary();
    }
  },

  // Render customer details preview box (Matching Photo 1 & 2)
  renderCustomerPreview(data) {
    const billToBox = document.getElementById('billToBannerBody');
    const shipToBox = document.getElementById('shipToBannerBody');

    if (!data || !data.customer_name) {
      if (billToBox) {
        billToBox.innerHTML = `
          <div class="party-company">Bengal Engineering Works Pvt Ltd</div>
          <div class="party-attn">Attn: Rajesh Kumar Sharma</div>
          <div>Plot 42, Sector V, Salt Lake, Kolkata - 700091</div>
          <div class="party-meta">
            <span class="code-badge">GSTIN: 19AABCB1234F1Z8</span>
            <span class="pkg-badge">State: West Bengal | Code: 19</span>
          </div>
        `;
      }
      if (shipToBox) {
        shipToBox.innerHTML = `
          <div class="party-company">Bengal Engineering Works Pvt Ltd</div>
          <div>Plot 42, Sector V, Salt Lake, Kolkata - 700091</div>
          <div style="margin-top: 3px;">Place of Supply: <strong>West Bengal (Code: 19)</strong></div>
          <div style="margin-top: 3px; font-size: 0.8rem; color: #475569;">
            Contact Info: <strong>9830123456</strong> | <strong>procurement@bengalengg.com</strong>
          </div>
        `;
      }
      return;
    }

    if (billToBox) {
      billToBox.innerHTML = `
        <div class="party-company">${this.escapeHtml(data.company_name || data.customer_name)}</div>
        ${data.customer_name ? `<div class="party-attn">Attn: ${this.escapeHtml(data.customer_name)}</div>` : ''}
        <div>${this.escapeHtml(data.billing_address || '-')}</div>
        <div class="party-meta">
          <span class="code-badge">GSTIN: ${this.escapeHtml(data.gstin || 'Unregistered')}</span>
          <span class="pkg-badge">State: ${this.escapeHtml(data.state || 'West Bengal (19)')}</span>
        </div>
      `;
    }

    if (shipToBox) {
      shipToBox.innerHTML = `
        <div class="party-company">${this.escapeHtml(data.company_name || data.customer_name)}</div>
        <div>${this.escapeHtml(data.shipping_address || data.billing_address || '-')}</div>
        <div style="margin-top: 3px;">Place of Supply: <strong>${this.escapeHtml(data.state || 'West Bengal (Code: 19)')}</strong></div>
        <div style="margin-top: 3px; font-size: 0.8rem; color: #475569;">
          Contact Info: <strong>${this.escapeHtml(data.phone || '-')}</strong> | <strong>${this.escapeHtml(data.email || '-')}</strong>
        </div>
      `;
    }
  },

  // Set tax type (intra or inter)
  setTaxType(type) {
    this.state.currentInvoice.tax_type = type;
    document.querySelectorAll('.tax-toggle-btn').forEach(btn => {
      if (btn.dataset.taxtype) {
        btn.classList.toggle('active', btn.dataset.taxtype === type);
      }
    });
    const splitRow = document.getElementById('cgstSgstSplitRow');
    if (splitRow) {
      splitRow.style.display = (type === 'intra') ? 'flex' : 'none';
    }
    this.recalculateAndRenderSummary();
  },

  // ----------------------------------------------------
  // PRODUCT SELECTION & AUTO-POPULATION (CRITICAL)
  // ----------------------------------------------------
  addNewLine(autoFocus = true) {
    const newLine = {
      product_id: '',
      product_name: '',
      product_code: '',
      packaging: '',
      pack_size: '',
      mrp: 0,
      selling_price: 0,
      rate: 0,
      quantity: 1,
      unit: 'NOS',
      tax_rate: 0,
      discount_type: 'percent',
      discount_val: 0,
      hsn: '',
      description: ''
    };

    this.state.currentInvoice.items.push(newLine);
    this.renderInvoiceItemsTable();

    if (autoFocus) {
      const lastIndex = this.state.currentInvoice.items.length - 1;
      const input = document.getElementById(`productSearchInput_${lastIndex}`);
      if (input) {
        input.focus();
        this.openProductDropdown(lastIndex);
      }
    }
  },

  removeLine(index) {
    if (this.state.currentInvoice.items.length <= 1) {
      // Keep at least 1 empty row
      this.state.currentInvoice.items = [{
        product_id: '',
        product_name: '',
        product_code: '',
        packaging: '',
        pack_size: '',
        mrp: 0,
        selling_price: 0,
        rate: 0,
        quantity: 1,
        unit: 'NOS',
        tax_rate: 0,
        discount_type: 'percent',
        discount_val: 0
      }];
    } else {
      this.state.currentInvoice.items.splice(index, 1);
    }
    this.renderInvoiceItemsTable();
    this.recalculateAndRenderSummary();
  },

  // Select a product from Product Master and AUTO-POPULATE ALL FIELDS
  selectProductForLine(lineIndex, productId) {
    const product = this.state.products.find(p => String(p.id) === String(productId));
    if (!product) return;

    const line = this.state.currentInvoice.items[lineIndex];
    if (!line) return;

    // Preserve user quantity if already edited, or default to 1
    const currentQty = (line.quantity && line.quantity > 0) ? line.quantity : 1;

    // AUTO-POPULATE FROM PRODUCT MASTER (APPLICATION & DB LEVEL)
    line.product_id = product.id;
    line.product_name = product.product_name;
    line.product_code = product.product_code;
    line.packaging = product.packaging;
    line.pack_size = product.pack_size;
    line.mrp = product.mrp;
    line.selling_price = product.selling_price;
    line.rate = product.selling_price; // Selling Price is billing rate
    line.unit = product.unit;
    line.tax_rate = 0;
    line.hsn = product.hsn || '';
    line.description = product.description || '';
    line.quantity = currentQty;

    this.closeAllProductDropdowns();
    this.renderInvoiceItemsTable();
    this.recalculateAndRenderSummary();

    // Focus Quantity input for swift keyboard billing
    setTimeout(() => {
      const qtyInput = document.getElementById(`lineQty_${lineIndex}`);
      if (qtyInput) {
        qtyInput.focus();
        qtyInput.select();
      }
    }, 50);

    this.showToast(`Selected "${product.product_name}" (${product.product_code})`, 'info');
  },

  // Open product dropdown for a given row
  openProductDropdown(lineIndex) {
    this.closeAllProductDropdowns();
    this.state.activeDropdownIndex = lineIndex;
    const menu = document.getElementById(`productDropdown_${lineIndex}`);
    if (menu) {
      menu.classList.add('show');
      this.filterProductDropdown(lineIndex, '');
    }
  },

  closeAllProductDropdowns() {
    this.state.activeDropdownIndex = null;
    document.querySelectorAll('.product-dropdown-menu').forEach(menu => {
      menu.classList.remove('show');
    });
  },

  filterProductDropdown(lineIndex, query) {
    const menu = document.getElementById(`productDropdown_${lineIndex}`);
    if (!menu) return;

    const q = (query || '').toLowerCase().trim();
    const filtered = this.state.products.filter(p => {
      return (
        p.product_name.toLowerCase().includes(q) ||
        p.product_code.toLowerCase().includes(q) ||
        p.packaging.toLowerCase().includes(q) ||
        p.pack_size.toLowerCase().includes(q)
      );
    });

    if (filtered.length === 0) {
      menu.innerHTML = `
        <div style="padding: 16px; text-align: center; color: #475569; font-size: 0.85rem;">
          <div style="margin-bottom: 8px;">No matching product found.</div>
          <button 
            type="button" 
            class="btn btn-primary btn-sm" 
            style="font-weight: 700; padding: 6px 14px; width: 100%; margin-bottom: 6px;" 
            onmousedown="event.stopPropagation(); event.preventDefault(); App.quickCreateProductForLine(${lineIndex}, '${this.escapeHtml(q)}');"
          >
            ⚡ Quick-Add "${this.escapeHtml(q || 'New Product')}"
          </button>
          <a href="javascript:void(0)" style="font-size: 0.75rem; color: #2563eb; font-weight: 600;" onmousedown="event.stopPropagation(); event.preventDefault(); App.openAddProductModalForLine(${lineIndex}, '${this.escapeHtml(q)}');">
            Or Open Full Product Form ➔
          </a>
        </div>
      `;
      return;
    }

    const itemsHtml = filtered.map((p, idx) => `
      <div 
        class="product-dropdown-item ${idx === 0 ? 'highlighted' : ''}" 
        data-index="${idx}"
      >
        <div 
          class="p-item-info" 
          style="flex: 1; cursor: pointer;"
          onmousedown="event.preventDefault(); App.selectProductForLine(${lineIndex}, ${p.id});"
        >
          <div class="p-item-name" style="font-weight: 700; color: #0f172a;">${this.escapeHtml(p.product_name)}</div>
          <div class="p-item-sub" style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 3px;">
            <span class="code-badge">${this.escapeHtml(p.product_code)}</span>
            <span class="pkg-badge">${this.escapeHtml(p.packaging)}</span>
            <span class="size-badge">${this.escapeHtml(p.pack_size)}</span>
            <span style="font-size: 0.75rem; color: #64748b;">${this.escapeHtml(p.unit)}</span>
          </div>
        </div>
        <div class="p-item-pricing" style="display: flex; align-items: center; gap: 8px;">
          <div 
            style="cursor: pointer; text-align: right;"
            onmousedown="event.preventDefault(); App.selectProductForLine(${lineIndex}, ${p.id});"
          >
            <div class="p-item-mrp" style="font-weight: 800; color: #0284c7;">₹${Number(p.selling_price || p.mrp).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
            <div class="p-item-stock" style="font-size: 0.75rem; color: #64748b;">Stock: ${p.current_stock}</div>
          </div>
          <button 
            type="button" 
            class="btn-dropdown-del" 
            title="Delete product from Master"
            style="background: #fee2e2; border: 1px solid #fca5a5; color: #dc2626; border-radius: 4px; padding: 4px 7px; font-size: 0.85rem; cursor: pointer; transition: all 0.2s;"
            onmousedown="event.stopPropagation(); event.preventDefault(); App.confirmDeleteProductFromDropdown(${p.id}, '${this.escapeHtml(p.product_name)}', ${lineIndex});"
          >
            🗑️
          </button>
        </div>
      </div>
    `).join('');

    const addNewFooter = `
      <div style="background: #f8fafc; border-top: 1.5px solid #cbd5e1; padding: 8px 10px; display: flex; gap: 8px;">
        <button 
          type="button" 
          class="btn btn-primary btn-sm"
          style="flex: 1; font-weight: 700; font-size: 0.8rem; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 6px 10px;"
          onmousedown="event.stopPropagation(); event.preventDefault(); App.openAddProductModalForLine(${lineIndex}, '${this.escapeHtml(q)}');"
        >
          ➕ Add New Product / নতুন পণ্য যোগ করুন
        </button>
        <button 
          type="button" 
          class="btn btn-secondary btn-sm"
          style="font-size: 0.75rem; padding: 6px 8px; color: #475569;"
          title="Open Product Master database"
          onmousedown="event.stopPropagation(); event.preventDefault(); App.closeAllProductDropdowns(); App.switchTab('products-list');"
        >
          ⚙️ Master
        </button>
      </div>
    `;

    menu.innerHTML = itemsHtml + addNewFooter;
    menu._filteredList = filtered;
    menu._highlightedIndex = 0;
  },

  async confirmDeleteProductFromDropdown(id, name, lineIndex) {
    try {
      await API.deleteProduct(id);
      this.showToast(`Deleted product "${name}"`, 'info');
      this.state.products = await API.getProducts();
      this.updateCounters();
      this.renderProductsTable();

      // Clear from line item if it was currently selected
      const line = this.state.currentInvoice?.items?.[lineIndex];
      if (line && String(line.product_id) === String(id)) {
        line.product_id = '';
        line.product_name = '';
        line.product_code = '';
        line.packaging = '';
        line.pack_size = '';
        line.mrp = 0;
        line.rate = 0;
        this.renderInvoiceItemsTable();
        this.recalculateAndRenderSummary();
      } else {
        this.filterProductDropdown(lineIndex, '');
      }
    } catch (err) {
      this.showToast('Failed to delete product: ' + err.message, 'error');
    }
  },

  async quickCreateProductForLine(lineIndex, rawName) {
    const name = (rawName || '').trim();
    if (!name) {
      this.openAddProductModalForLine(lineIndex);
      return;
    }
    try {
      const created = await API.createProduct({
        product_name: name,
        packaging: 'POUCH',
        pack_size: '1 KG',
        unit: 'KG',
        mrp: 0,
        selling_price: 0,
        current_stock: 100
      });
      this.showToast(`Added "${created.product_name}" to Master!`, 'success');
      this.state.products = await API.getProducts();
      this.updateCounters();
      this.renderProductsTable();
      this.selectProductForLine(lineIndex, created.id);
    } catch (err) {
      this.showToast('Failed to add product: ' + err.message, 'error');
    }
  },

  openAddProductModalForLine(lineIndex, prefillName = '') {
    this.closeAllProductDropdowns();
    this.state.targetLineIndexForNewProduct = lineIndex;
    this.openAddProductModal();
    if (prefillName) {
      const nameInput = document.getElementById('pmProductName');
      if (nameInput) nameInput.value = prefillName;
    }
  },

  // Render the invoice lines table
  renderInvoiceItemsTable() {
    const tbody = document.getElementById('invoiceItemsTbody');
    if (!tbody) return;

    const items = this.state.currentInvoice.items || [];
    tbody.innerHTML = items.map((item, index) => {
      const lineTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0);

      return `
        <tr data-index="${index}">
          <td class="td-sno">${index + 1}</td>

          <!-- Searchable Product Selection Dropdown with Visible Chevron Box -->
          <td class="td-product">
            <div class="product-select-container">
              <input 
                type="text" 
                id="productSearchInput_${index}" 
                name="prd_srch_${Date.now()}_${index}"
                class="product-search-input ${item.product_name ? 'selected' : ''}" 
                placeholder="Click to select product..." 
                value="${this.escapeHtml(item.product_name || '')}" 
                autocomplete="chrome-off"
                autocorrect="off"
                autocapitalize="off"
                spellcheck="false"
                data-lpignore="true"
                data-form-type="other"
                data-1p-ignore="true"
                readonly
                onclick="this.removeAttribute('readonly'); App.openProductDropdown(${index}); this.select();"
                onfocus="this.removeAttribute('readonly'); App.openProductDropdown(${index}); this.select();"
                onblur="setTimeout(() => { try { this.setAttribute('readonly', 'readonly'); } catch(e){} }, 300);"
                oninput="App.filterProductDropdown(${index}, this.value)"
                onkeydown="App.handleProductInputKeydown(event, ${index})"
              />
              <span class="product-dropdown-arrow" onclick="App.openProductDropdown(${index}); document.getElementById('productSearchInput_${index}').focus();">▼</span>
              <div id="productDropdown_${index}" class="product-dropdown-menu"></div>
            </div>
          </td>

          <!-- Auto-Populated Product Code (Fixed) -->
          <td class="td-code">
            ${item.product_code 
              ? `<span class="code-badge" title="Business Product Code">${this.escapeHtml(item.product_code)}</span>` 
              : `<span style="color: #cbd5e1; font-style: italic;">Auto</span>`}
          </td>

          <!-- Auto-Populated Packaging (Fixed) -->
          <td class="td-pkg">
            ${item.packaging 
              ? `<span class="pkg-badge">${this.escapeHtml(item.packaging)}</span>` 
              : `<span style="color: #cbd5e1; font-style: italic;">Auto</span>`}
          </td>

          <!-- Auto-Populated Pack Size (Fixed) -->
          <td class="td-size">
            ${item.pack_size 
              ? `<span class="size-badge">${this.escapeHtml(item.pack_size)}</span>` 
              : `<span style="color: #cbd5e1; font-style: italic;">Auto</span>`}
          </td>

          <!-- Fixed MRP (Fixed Display from Product Master) -->
          <td class="td-mrp">
            ${item.mrp 
              ? `<span class="mrp-badge" title="Fixed MRP from Product Master">₹${Number(item.mrp).toFixed(2)}</span>` 
              : `<span style="color: #cbd5e1; font-style: italic;">₹0.00</span>`}
          </td>

          <!-- HSN/SAC (matching Photo 1 & 2) -->
          <td style="text-align: center; color: #64748b; font-family: var(--font-mono); font-size: 0.8rem;">
            ${this.escapeHtml(item.hsn || '-')}
          </td>

          <!-- Editable Quantity -->
          <td class="td-qty">
            <input 
              type="number" 
              id="lineQty_${index}"
              class="form-control qty-input" 
              value="${item.quantity}" 
              min="0.01" 
              step="any"
              onchange="App.onLineQtyChange(${index}, this.value)"
              oninput="App.onLineQtyChange(${index}, this.value)"
              onkeydown="App.handleLineQtyKeydown(event, ${index})"
            />
          </td>

          <!-- Auto-Populated Unit -->
          <td class="td-unit">
            <span style="font-weight: 700; color: #475569; font-size: 0.8rem;">
              ${this.escapeHtml(item.unit || 'NOS')}
            </span>
          </td>

          <!-- Rate / Selling Price (Auto-populated from Product Master) -->
          <td class="td-rate">
            <input 
              type="number" 
              class="form-control rate-input" 
              value="${item.rate}" 
              min="0" 
              step="0.01"
              title="Selling Price from Product Master"
              onchange="App.onLineRateChange(${index}, this.value)"
            />
          </td>

          <!-- Line Amount (Qty x Rate) -->
          <td class="td-total">
            ₹${lineTotal.toFixed(2)}
          </td>

          <!-- Delete Row Action -->
          <td class="td-action">
            <button 
              type="button" 
              class="btn-remove-line" 
              title="Remove row"
              onclick="App.removeLine(${index})"
            >✕</button>
          </td>
        </tr>
      `;
    }).join('');
  },

  // Keydown helper on product input
  handleProductInputKeydown(e, index) {
    const menu = document.getElementById(`productDropdown_${index}`);
    if (!menu || !menu.classList.contains('show')) {
      if (e.key === 'ArrowDown') {
        this.openProductDropdown(index);
        e.preventDefault();
      }
      return;
    }

    const items = menu.querySelectorAll('.product-dropdown-item');
    if (!items.length) return;

    let currentIndex = menu._highlightedIndex !== undefined ? menu._highlightedIndex : 0;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      currentIndex = (currentIndex + 1) % items.length;
      menu._highlightedIndex = currentIndex;
      items.forEach((it, i) => it.classList.toggle('highlighted', i === currentIndex));
      items[currentIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      currentIndex = (currentIndex - 1 + items.length) % items.length;
      menu._highlightedIndex = currentIndex;
      items.forEach((it, i) => it.classList.toggle('highlighted', i === currentIndex));
      items[currentIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (menu._filteredList && menu._filteredList[currentIndex]) {
        this.selectProductForLine(index, menu._filteredList[currentIndex].id);
      }
    } else if (e.key === 'Escape') {
      this.closeAllProductDropdowns();
    }
  },

  // Keydown helper on quantity input (Press Enter to add next line)
  handleLineQtyKeydown(e, index) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (index === this.state.currentInvoice.items.length - 1) {
        this.addNewLine(true);
      } else {
        const nextInput = document.getElementById(`lineQty_${index + 1}`);
        if (nextInput) nextInput.focus();
      }
    }
  },

  // Handlers for line updates
  onLineQtyChange(index, val) {
    const num = Math.max(0, parseFloat(val) || 0);
    if (this.state.currentInvoice.items[index]) {
      this.state.currentInvoice.items[index].quantity = num;
      this.updateLineDisplayValues(index);
      this.recalculateAndRenderSummary();
    }
  },

  onLineRateChange(index, val) {
    const num = Math.max(0, parseFloat(val) || 0);
    if (this.state.currentInvoice.items[index]) {
      this.state.currentInvoice.items[index].rate = num;
      this.updateLineDisplayValues(index);
      this.recalculateAndRenderSummary();
    }
  },

  onLineDiscountChange(index, val) {
    const num = Math.max(0, parseFloat(val) || 0);
    if (this.state.currentInvoice.items[index]) {
      this.state.currentInvoice.items[index].discount_val = num;
      this.updateLineDisplayValues(index);
      this.recalculateAndRenderSummary();
    }
  },

  // Update table cells for a single row without full re-render
  updateLineDisplayValues(index) {
    const item = this.state.currentInvoice.items[index];
    if (!item) return;

    const row = document.querySelector(`tr[data-index="${index}"]`);
    if (row) {
      const lineTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0);
      const totalTd = row.querySelector('.td-total');
      if (totalTd) totalTd.textContent = `₹${lineTotal.toFixed(2)}`;
    }
  },

  // Toggle between GST % rate and direct manual GST ₹ amount
  // Switch GST Input Mode: 'percent' or 'amount'
  setGstInputMode(mode) {
    this.state.gstInputMode = mode;
    const btnPct = document.getElementById('btnGstModePct');
    const btnAmt = document.getElementById('btnGstModeAmt');
    const pctBox = document.getElementById('gstPercentControls');
    const amtBox = document.getElementById('gstManualAmountControls');

    if (btnPct) btnPct.classList.toggle('active', mode === 'percent');
    if (btnAmt) btnAmt.classList.toggle('active', mode === 'amount');
    if (pctBox) pctBox.style.display = (mode === 'percent') ? 'block' : 'none';
    if (amtBox) amtBox.style.display = (mode === 'amount') ? 'block' : 'none';

    if (mode === 'amount') {
      const amtInput = document.getElementById('invManualGstAmount');
      if (amtInput) {
        if (!amtInput.value && this.state.currentInvoice && this.state.currentInvoice.total_tax) {
          amtInput.value = this.state.currentInvoice.total_tax;
        }
        amtInput.focus();
        amtInput.select();
      }
    }
    this.recalculateAndRenderSummary();
  },

  // Toggle between GST % rate and direct manual GST ₹ amount (legacy support)
  toggleManualGst(isManual) {
    this.setGstInputMode(isManual ? 'amount' : 'percent');
  },

  // 1-Click Total GST Preset
  setTotalGstPreset(rate) {
    const input = document.getElementById('invTotalGstVal');
    const typeSelect = document.getElementById('invTotalGstType');
    if (input) input.value = (rate > 0) ? rate : '';
    if (typeSelect) typeSelect.value = 'percent';
    this.recalculateAndRenderSummary();
  },

  // Clear Total GST completely (empty box)
  clearTotalGst() {
    const input = document.getElementById('invTotalGstVal');
    if (input) input.value = '';
    this.recalculateAndRenderSummary();
  },

  // 1-Click Total Tax Preset
  setTotalTaxPreset(rate) {
    const input = document.getElementById('invTotalTaxVal');
    const typeSelect = document.getElementById('invTotalTaxType');
    if (input) input.value = (rate > 0) ? rate : '';
    if (typeSelect) typeSelect.value = 'percent';
    this.recalculateAndRenderSummary();
  },

  // Clear Total Tax completely (empty box)
  clearTotalTax() {
    const input = document.getElementById('invTotalTaxVal');
    if (input) input.value = '';
    this.recalculateAndRenderSummary();
  },

  // Recalculate invoice totals and render summary card
  recalculateAndRenderSummary() {
    const inv = this.state.currentInvoice;
    if (!inv) return;

    // Grab latest values from form inputs
    const discInput = document.getElementById('invDiscountVal');
    inv.invoice_discount_val = (discInput && discInput.value !== '') ? Math.max(0, parseFloat(discInput.value) || 0) : 0;
    inv.invoice_discount_type = document.getElementById('invDiscountType')?.value || 'percent';

    const shipInput = document.getElementById('invShippingCharges');
    inv.shipping_charges = (shipInput && shipInput.value !== '') ? Math.max(0, parseFloat(shipInput.value) || 0) : 0;

    const extraInput = document.getElementById('invAdditionalCharges');
    inv.additional_charges = (extraInput && extraInput.value !== '') ? Math.max(0, parseFloat(extraInput.value) || 0) : 0;

    inv.apply_round_off = document.getElementById('invRoundOffCheck')?.checked || false;

    const paidInput = document.getElementById('invAmountPaid');
    inv.amount_paid = (paidInput && paidInput.value !== '') ? Math.max(0, parseFloat(paidInput.value) || 0) : 0;

    // 1. Total GST Input
    const gstValInput = document.getElementById('invTotalGstVal');
    const rawGstVal = (gstValInput && gstValInput.value !== '') ? gstValInput.value : '';
    const totalGstType = document.getElementById('invTotalGstType')?.value || 'percent';

    // 2. Total Tax Input
    const taxValInput = document.getElementById('invTotalTaxVal');
    const rawTaxVal = (taxValInput && taxValInput.value !== '') ? taxValInput.value : '';
    const totalTaxType = document.getElementById('invTotalTaxType')?.value || 'percent';

    const totals = InvoiceCalc.calculateInvoice(inv.items, {
      tax_type: inv.tax_type,
      total_gst_val: rawGstVal,
      total_gst_type: totalGstType,
      total_tax_val: rawTaxVal,
      total_tax_type: totalTaxType,
      invoice_discount_type: inv.invoice_discount_type,
      invoice_discount_val: inv.invoice_discount_val,
      additional_charges: inv.additional_charges,
      shipping_charges: inv.shipping_charges,
      apply_round_off: inv.apply_round_off,
      amount_paid: inv.amount_paid
    });

    // Store computed values into invoice state
    inv.total_gst_val = rawGstVal;
    inv.total_gst_type = totalGstType;
    inv.gst_amount = totals.gst_amount;
    inv.total_tax_val = rawTaxVal;
    inv.total_tax_type = totalTaxType;
    inv.tax_amount = totals.tax_amount;
    inv.subtotal = totals.subtotal;
    inv.total_discount = totals.total_discount;
    inv.taxable_subtotal = totals.taxable_subtotal;
    inv.cgst_amount = totals.cgst_amount;
    inv.sgst_amount = totals.sgst_amount;
    inv.igst_amount = totals.igst_amount;
    inv.total_tax = totals.total_tax;
    inv.grand_total = totals.grand_total;
    inv.balance_due = totals.balance_due;
    inv.round_off = totals.round_off;

    // Render Summary Card UI
    const summaryCard = document.getElementById('invoiceSummaryCard');
    if (summaryCard) {
      const gstLabel = (rawGstVal !== '' && parseFloat(rawGstVal) > 0)
        ? (totalGstType === 'percent' ? `Total GST (${rawGstVal}%)` : 'Total GST (Fixed)')
        : 'Total GST';

      const taxLabel = (rawTaxVal !== '' && parseFloat(rawTaxVal) > 0)
        ? (totalTaxType === 'percent' ? `Total Tax (${rawTaxVal}%)` : 'Total Tax (Fixed)')
        : 'Total Tax';

      summaryCard.innerHTML = `
        <div class="summary-row">
          <span>Gross Subtotal</span>
          <span class="val">₹${totals.subtotal.toFixed(2)}</span>
        </div>

        ${totals.total_discount > 0 ? `
          <div class="summary-row" style="color: #dc2626; font-weight: 600;">
            <span>Discount ${inv.invoice_discount_type === 'percent' ? '(' + inv.invoice_discount_val + '%)' : '(Fixed)'}</span>
            <span class="val">- ₹${totals.total_discount.toFixed(2)}</span>
          </div>
          <div class="summary-row" style="font-weight: 600;">
            <span>Subtotal after Discount</span>
            <span class="val">₹${totals.taxable_subtotal.toFixed(2)}</span>
          </div>
        ` : ''}

        <!-- 1. Total GST Line -->
        <div class="summary-row" style="font-weight: 700; color: #1e40af;">
          <span>⚡ ${gstLabel}</span>
          <span class="val">₹${totals.gst_amount.toFixed(2)}</span>
        </div>

        <!-- 2. Total Tax Line -->
        <div class="summary-row" style="font-weight: 700; color: #166534;">
          <span>💰 ${taxLabel}</span>
          <span class="val">₹${totals.tax_amount.toFixed(2)}</span>
        </div>

        ${totals.shipping_charges > 0 ? `
          <div class="summary-row">
            <span>Shipping / Freight</span>
            <span class="val">+ ₹${totals.shipping_charges.toFixed(2)}</span>
          </div>
        ` : ''}

        ${totals.additional_charges > 0 ? `
          <div class="summary-row">
            <span>Additional Charges</span>
            <span class="val">+ ₹${totals.additional_charges.toFixed(2)}</span>
          </div>
        ` : ''}

        ${inv.apply_round_off && totals.round_off !== 0 ? `
          <div class="summary-row sub-row">
            <span>Round Off</span>
            <span class="val">${totals.round_off > 0 ? '+' : ''}₹${totals.round_off.toFixed(2)}</span>
          </div>
        ` : ''}

        <!-- Grand Total -->
        <div class="summary-row total-row">
          <span>Grand Total</span>
          <span class="val">₹${totals.grand_total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>

        <!-- Amount Paid -->
        <div class="summary-row">
          <span>Amount Paid</span>
          <span class="val">₹${totals.amount_paid.toFixed(2)}</span>
        </div>

        <!-- Balance Due -->
        <div class="summary-row balance-row ${totals.balance_due > 0 ? 'due' : ''}">
          <span>Balance Due</span>
          <span class="val">₹${totals.balance_due.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>

        <!-- Amount in Words -->
        <div class="amount-words-box">
          Amount in Words:
          <strong>${totals.amount_in_words}</strong>
        </div>
      `;
    }
  },

  // ----------------------------------------------------
  // SAVE INVOICE (PERSISTENT SNAPSHOT GUARANTEE)
  // ----------------------------------------------------
  async saveCurrentInvoice(statusOverride = null) {
    const inv = this.state.currentInvoice;
    if (!inv) return;

    // Validate
    const invNumber = document.getElementById('invNumber').value.trim();
    if (!invNumber) {
      this.showToast('Please specify an Invoice Number.', 'error');
      return;
    }

    const validItems = (inv.items || []).filter(i => i.product_name && i.quantity > 0);
    if (validItems.length === 0) {
      this.showToast('Please select at least one product with valid quantity.', 'error');
      return;
    }

    // Freeze snapshot data
    inv.invoice_number = invNumber;
    inv.invoice_date = document.getElementById('invDate').value;
    inv.due_date = document.getElementById('invDueDate').value;
    inv.payment_terms = document.getElementById('invPaymentTerms').value;
    inv.notes = document.getElementById('invNotes').value;
    inv.terms = document.getElementById('invTerms').value;
    inv.status = statusOverride || (inv.balance_due === 0 && inv.grand_total > 0 ? 'Paid' : 'Draft');

    // Recalculate once more to guarantee exact numbers
    this.recalculateAndRenderSummary();

    const payload = {
      invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date,
      due_date: inv.due_date,
      customer_id: inv.customer_id || null,
      customer_data: inv.customer_data,
      items: validItems,
      subtotal: inv.subtotal,
      discount_type: inv.invoice_discount_type,
      discount_val: inv.invoice_discount_val,
      total_discount: inv.total_discount,
      taxable_subtotal: inv.taxable_subtotal,
      tax_type: inv.tax_type,
      cgst_amount: inv.cgst_amount,
      sgst_amount: inv.sgst_amount,
      igst_amount: inv.igst_amount,
      total_tax: inv.total_tax,
      total_gst_val: inv.total_gst_val,
      total_gst_type: inv.total_gst_type,
      total_tax_val: inv.total_tax_val,
      total_tax_type: inv.total_tax_type,
      gst_amount: inv.gst_amount,
      tax_amount: inv.tax_amount,
      additional_charges: inv.additional_charges,
      shipping_charges: inv.shipping_charges,
      round_off: inv.round_off,
      grand_total: inv.grand_total,
      amount_paid: inv.amount_paid,
      balance_due: inv.balance_due,
      status: inv.status,
      payment_terms: inv.payment_terms,
      notes: inv.notes,
      terms: inv.terms
    };

    try {
      let savedResult;
      if (this.state.editingInvoiceId) {
        savedResult = await API.updateInvoice(this.state.editingInvoiceId, payload);
        this.showToast(`Invoice ${payload.invoice_number} updated successfully!`, 'success');
      } else {
        savedResult = await API.createInvoice(payload);
        this.showToast(`Invoice ${payload.invoice_number} created and saved to database!`, 'success');
        this.state.editingInvoiceId = savedResult.id;
      }

      // Reload products to reflect updated inventory if enabled
      this.state.products = await API.getProducts();
      this.updateCounters();

      return savedResult;
    } catch (err) {
      this.showToast('Failed to save invoice: ' + err.message, 'error');
      throw err;
    }
  },

  // ----------------------------------------------------
  // PRINT & PDF GENERATION
  // ----------------------------------------------------
  // Synchronize current form controls into this.state.currentInvoice
  syncFormToCurrentInvoice() {
    const inv = this.state.currentInvoice;
    if (!inv) return;

    const numEl = document.getElementById('invNumber');
    if (numEl && numEl.value.trim()) inv.invoice_number = numEl.value.trim();

    const dateEl = document.getElementById('invDate');
    if (dateEl && dateEl.value) inv.invoice_date = dateEl.value;

    const dueDateEl = document.getElementById('invDueDate');
    if (dueDateEl && dueDateEl.value) inv.due_date = dueDateEl.value;

    const termsEl = document.getElementById('invPaymentTerms');
    if (termsEl && termsEl.value) inv.payment_terms = termsEl.value;

    const notesEl = document.getElementById('invNotes');
    if (notesEl) inv.notes = notesEl.value;

    const termsTextEl = document.getElementById('invTerms');
    if (termsTextEl) inv.terms = termsTextEl.value;

    // Recalculate summary so all values match latest inputs
    this.recalculateAndRenderSummary();
  },

  async openInvoicePreview(invoiceData = null) {
    if (!invoiceData) {
      this.syncFormToCurrentInvoice();
    }
    const inv = invoiceData || this.state.currentInvoice;
    if (!inv) return;

    // Render A4 HTML into the preview container
    const a4Html = this.generateA4InvoiceHtml(inv);
    const container = document.getElementById('previewPageContainer');
    if (container) {
      container.innerHTML = a4Html;
    }

    const modal = document.getElementById('previewModal');
    if (modal) {
      modal.classList.add('active');
    }
  },

  closePreviewModal() {
    const modal = document.getElementById('previewModal');
    if (modal) {
      modal.classList.remove('active');
    }
  },

  printInvoice() {
    // Open native browser print dialogue configured with A4 styles
    window.print();
  },

  // PDF options builder ensuring zero-margin exact A4 fit and scroll isolation
  getHtml2PdfConfig(filename) {
    return {
      margin: 0,
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        scrollY: 0,
        scrollX: 0,
        windowWidth: 1024,
        backgroundColor: '#ffffff'
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
  },

  async downloadInvoicePDF() {
    this.syncFormToCurrentInvoice();
    const inv = this.state.currentInvoice;
    if (!inv) return;

    const a4Html = this.generateA4InvoiceHtml(inv);
    const container = document.getElementById('previewPageContainer');
    if (container) {
      container.innerHTML = a4Html;
    }

    const element = container ? container.querySelector('.a4-page') : document.querySelector('.a4-page');
    if (!element) {
      this.showToast('Please open preview first.', 'error');
      return;
    }

    const filename = `${inv.invoice_number || 'Invoice'}.pdf`;
    this.showToast('Generating PDF, please wait...', 'info');

    // Ensure modal is visible for capture
    const modal = document.getElementById('previewModal');
    if (modal) modal.classList.add('active');

    const opt = this.getHtml2PdfConfig(filename);

    try {
      if (typeof html2pdf !== 'undefined') {
        const worker = html2pdf().set(opt).from(element);
        await worker.save();
        this.showToast(`Downloaded ${filename} successfully!`, 'success');

        // Automatically open the generated PDF in a new tab so user can immediately view it
        try {
          const pdfBlob = await worker.output('blob');
          const blobUrl = URL.createObjectURL(pdfBlob);
          const win = window.open(blobUrl, '_blank');
          if (!win) {
            console.info('Auto-popup was prevented by browser.');
          }
        } catch (e) {
          console.warn('Could not auto-open PDF in tab:', e);
        }
      } else {
        window.print();
      }
    } catch (err) {
      console.error('PDF generation error:', err);
      this.showToast('PDF generator fallback: Opening print dialog.', 'info');
      window.print();
    }
  },

  // View PDF directly in new browser tab
  async openInvoicePDFInNewTab() {
    this.syncFormToCurrentInvoice();
    const inv = this.state.currentInvoice;
    if (!inv) return;

    const a4Html = this.generateA4InvoiceHtml(inv);
    const container = document.getElementById('previewPageContainer');
    if (container) {
      container.innerHTML = a4Html;
    }

    const element = container ? container.querySelector('.a4-page') : document.querySelector('.a4-page');
    if (!element) return;

    const filename = `${inv.invoice_number || 'Invoice'}.pdf`;
    this.showToast('Preparing PDF view...', 'info');

    const opt = this.getHtml2PdfConfig(filename);

    try {
      if (typeof html2pdf !== 'undefined') {
        const worker = html2pdf().set(opt).from(element);
        const pdfBlob = await worker.output('blob');
        const blobUrl = URL.createObjectURL(pdfBlob);
        window.open(blobUrl, '_blank');
      } else {
        window.print();
      }
    } catch (err) {
      console.error('Error opening PDF in tab:', err);
      window.print();
    }
  },

  // Generate standardized A4 GST Tax Invoice HTML
  generateA4InvoiceHtml(inv) {
    const settings = this.state.settings || {};
    const cust = inv.customer_data || {};
    const items = inv.items || [];
    const totals = InvoiceCalc.calculateInvoice(items, {
      tax_type: 'intra',
      total_gst_val: inv.total_gst_val !== undefined ? inv.total_gst_val : '',
      total_gst_type: inv.total_gst_type || 'percent',
      total_tax_val: inv.total_tax_val !== undefined ? inv.total_tax_val : '',
      total_tax_type: inv.total_tax_type || 'percent',
      invoice_discount_type: inv.discount_type || inv.invoice_discount_type || 'percent',
      invoice_discount_val: inv.discount_val || inv.invoice_discount_val || 0,
      additional_charges: inv.additional_charges || 0,
      shipping_charges: inv.shipping_charges || 0,
      apply_round_off: !!inv.round_off,
      amount_paid: inv.amount_paid || 0
    });

    const isIntra = (inv.tax_type || 'intra') === 'intra';

    return `
      <div class="a4-page">
        <!-- Header (Matching Photo 1 & 2) -->
        <div class="p-header">
          <div style="max-width: 60%;">
            ${settings.company_logo ? `<img src="${settings.company_logo}" class="p-company-logo" alt="Logo" />` : ''}
            <div class="p-company-name">${this.escapeHtml(settings.company_name || 'EUREKA INTERNATIONAL')}</div>
            <div style="font-weight: 700; color: #1e40af; font-size: 9.5pt; margin-top: 1px;">${this.escapeHtml(settings.company_tagline || 'West Bengal')}</div>
            <div class="p-company-details">
              <div><strong>GSTIN:</strong> ${this.escapeHtml(settings.company_gstin || '19AAAAA0000A1Z5')} | ${this.escapeHtml(settings.company_address || '15/7 Ambika Mukherjee Road, Kolkata - 700056')} | <strong>State:</strong> ${this.escapeHtml(settings.company_state || 'West Bengal (19)')}</div>
              <div style="margin-top: 3px; font-size: 8pt; color: #64748b;">
                ${this.escapeHtml(settings.company_extra_info || 'Registration Date: 04/03/2020 | Constitution: Partnership | Taxpayer: Regular')}
              </div>
            </div>
          </div>
          <div class="p-invoice-title-block">
            <div class="p-tax-invoice-title" style="letter-spacing: 0.05em;">INVOICE</div>
            <table class="p-invoice-meta-table">
              <tr>
                <td class="meta-label">INVOICE #:</td>
                <td class="meta-val" style="color: #1e3a8a; font-size: 10pt;">${this.escapeHtml(inv.invoice_number)}</td>
              </tr>
              <tr>
                <td class="meta-label">DATE:</td>
                <td class="meta-val">${this.escapeHtml(inv.invoice_date)}</td>
              </tr>
              <tr>
                <td class="meta-label">DUE DATE:</td>
                <td class="meta-val">${this.escapeHtml(inv.due_date)}</td>
              </tr>
              <tr>
                <td class="meta-label">CUSTOMER ID:</td>
                <td class="meta-val">${this.escapeHtml(inv.customer_id_code || 'CUST-001')}</td>
              </tr>
              <tr>
                <td class="meta-label">Status:</td>
                <td class="meta-val" style="color: ${inv.status === 'Paid' ? '#059669' : '#b45309'};">${this.escapeHtml(inv.status || 'Draft')}</td>
              </tr>
            </table>
          </div>
        </div>

        <!-- Bill To & Ship To Parties (Blue Banner Headers Matching Photo 1 & 2) -->
        <div class="p-parties-grid" style="margin-bottom: 12px;">
          <div style="border-radius: 4px; overflow: hidden; border: 1.5px solid #1e3a8a;">
            <div style="background: #1e3a8a; color: #fff; font-weight: 800; font-size: 8pt; padding: 4px 8px; text-transform: uppercase; letter-spacing: 0.04em;">
              BILL TO
            </div>
            <div style="padding: 8px 10px; background: #fff; font-size: 8.5pt;">
              <div style="font-weight: 800; font-size: 9.5pt; color: #0f172a;">${this.escapeHtml(cust.company_name || 'Bengal Engineering Works Pvt Ltd')}</div>
              ${cust.customer_name ? `<div style="font-weight: 600; color: #334155;">Attn: ${this.escapeHtml(cust.customer_name)}</div>` : ''}
              <div style="margin-top: 2px;">${this.escapeHtml(cust.billing_address || 'Plot 42, Sector V, Salt Lake, Kolkata - 700091')}</div>
              <div style="margin-top: 3px; font-weight: 700; color: #0f172a;">
                GSTIN: ${this.escapeHtml(cust.gstin || '19AABCB1234F1Z8')} | State: ${this.escapeHtml(cust.state || 'West Bengal (Code: 19)')}
              </div>
            </div>
          </div>

          <div style="border-radius: 4px; overflow: hidden; border: 1.5px solid #1e3a8a;">
            <div style="background: #1e3a8a; color: #fff; font-weight: 800; font-size: 8pt; padding: 4px 8px; text-transform: uppercase; letter-spacing: 0.04em;">
              SHIP TO / PLACE OF SUPPLY
            </div>
            <div style="padding: 8px 10px; background: #fff; font-size: 8.5pt;">
              <div style="font-weight: 800; font-size: 9.5pt; color: #0f172a;">${this.escapeHtml(cust.company_name || 'Bengal Engineering Works Pvt Ltd')}</div>
              <div style="margin-top: 2px;">${this.escapeHtml(cust.shipping_address || cust.billing_address || 'Plot 42, Sector V, Salt Lake, Kolkata - 700091')}</div>
              <div style="margin-top: 3px;">Place of Supply: <strong>${this.escapeHtml(cust.state || 'West Bengal (Code: 19)')}</strong></div>
              <div style="margin-top: 2px;">Payment Terms: <strong>${this.escapeHtml(inv.payment_terms || 'Net 30 Days')}</strong></div>
              <div style="margin-top: 2px; font-size: 8pt; color: #475569;">
                Contact Info: <strong>${this.escapeHtml(cust.phone || '9830123456')}</strong> | <strong>${this.escapeHtml(cust.email || 'procurement@bengalengg.com')}</strong>
              </div>
            </div>
          </div>
        </div>

        <!-- Items Table (Matching Photo 1 & 2) -->
        <table class="p-items-table">
          <thead>
            <tr>
              <th style="width: 25px;" class="tac">#</th>
              <th>DESCRIPTION / PRODUCT</th>
              <th>product code</th>
              <th class="tac">packaging</th>
              <th class="tac">pack size</th>
              <th class="tar">MRP</th>
              <th class="tac">HSN/SAC</th>
              <th class="tac">QTY</th>
              <th class="tac">UNIT</th>
              <th class="tar">RATE (₹)</th>
              <th class="tar">AMOUNT (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((itm, i) => {
              const lineTotal = (parseFloat(itm.quantity) || 0) * (parseFloat(itm.rate) || 0);
              return `
                <tr>
                  <td class="tac">${i + 1}</td>
                  <td><strong>${this.escapeHtml(itm.product_name)}</strong></td>
                  <td><code style="font-size: 8pt; font-weight: 700; color: #1e40af;">${this.escapeHtml(itm.product_code || '')}</code></td>
                  <td class="tac">${this.escapeHtml(itm.packaging || '')}</td>
                  <td class="tac">${this.escapeHtml(itm.pack_size || '')}</td>
                  <td class="tar font-mono">₹${Number(itm.mrp || itm.rate).toFixed(2)}</td>
                  <td class="tac font-mono" style="color: #64748b;">${this.escapeHtml(itm.hsn || '-')}</td>
                  <td class="tac font-mono"><strong>${itm.quantity}</strong></td>
                  <td class="tac">${this.escapeHtml(itm.unit || '')}</td>
                  <td class="tar font-mono">₹${Number(itm.rate).toFixed(2)}</td>
                  <td class="tar font-mono"><strong>₹${lineTotal.toFixed(2)}</strong></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <!-- Totals & Tax Breakdown Grid -->
        <div class="p-totals-grid">
          <!-- Left: Tax Breakdown & Words -->
          <div>
            <div style="font-weight: 700; font-size: 8pt; color: #1e3a8a; text-transform: uppercase;">GST & Tax Summary</div>
            <table class="p-tax-breakdown-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Taxable Val</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Total GST ${inv.total_gst_val ? '(' + inv.total_gst_val + (inv.total_gst_type === 'fixed' ? '₹' : '%') + ')' : ''}</td>
                  <td>₹${totals.taxable_subtotal.toFixed(2)}</td>
                  <td>₹${totals.gst_amount.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>Total Tax ${inv.total_tax_val ? '(' + inv.total_tax_val + (inv.total_tax_type === 'fixed' ? '₹' : '%') + ')' : ''}</td>
                  <td>₹${totals.taxable_subtotal.toFixed(2)}</td>
                  <td>₹${totals.tax_amount.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>

            <div class="p-words-box">
              <span style="font-size: 7.5pt; color: #64748b;">Invoice Amount in Words:</span><br>
              <strong>${totals.amount_in_words}</strong>
            </div>

            ${settings.bank_details ? `
              <div class="p-bank-box">
                <strong>Bank Account Details for Payment:</strong><br>
                ${this.escapeHtml(settings.bank_details)}
              </div>
            ` : ''}
          </div>

          <!-- Right: Summary Table -->
          <div>
            <table class="p-summary-table">
              <tr>
                <td>Gross Subtotal:</td>
                <td class="tar">₹${totals.subtotal.toFixed(2)}</td>
              </tr>
              ${totals.total_discount > 0 ? `
                <tr>
                  <td>Total Discount:</td>
                  <td class="tar">- ₹${totals.total_discount.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>Subtotal after Discount:</td>
                  <td class="tar">₹${totals.taxable_subtotal.toFixed(2)}</td>
                </tr>
              ` : ''}
              <tr>
                <td style="font-weight: 700; color: #1e40af;">Total GST ${inv.total_gst_val ? '(' + inv.total_gst_val + (inv.total_gst_type === 'fixed' ? '₹' : '%') + ')' : ''}:</td>
                <td class="tar font-mono" style="font-weight: 700; color: #1e40af;">₹${totals.gst_amount.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="font-weight: 700; color: #166534;">Total Tax ${inv.total_tax_val ? '(' + inv.total_tax_val + (inv.total_tax_type === 'fixed' ? '₹' : '%') + ')' : ''}:</td>
                <td class="tar font-mono" style="font-weight: 700; color: #166534;">₹${totals.tax_amount.toFixed(2)}</td>
              </tr>
              ${totals.shipping_charges > 0 ? `
                <tr>
                  <td>Shipping Charges:</td>
                  <td class="tar">₹${totals.shipping_charges.toFixed(2)}</td>
                </tr>
              ` : ''}
              ${totals.additional_charges > 0 ? `
                <tr>
                  <td>Additional Charges:</td>
                  <td class="tar">₹${totals.additional_charges.toFixed(2)}</td>
                </tr>
              ` : ''}
              ${totals.round_off !== 0 ? `
                <tr>
                  <td>Round Off:</td>
                  <td class="tar">${totals.round_off > 0 ? '+' : ''}₹${totals.round_off.toFixed(2)}</td>
                </tr>
              ` : ''}
              <tr class="grand-total-row">
                <td>Grand Total:</td>
                <td class="tar">₹${totals.grand_total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
              <tr>
                <td>Amount Paid:</td>
                <td class="tar">₹${totals.amount_paid.toFixed(2)}</td>
              </tr>
              <tr style="font-weight: 700; color: ${totals.balance_due === 0 ? '#059669' : '#dc2626'};">
                <td>Balance Due:</td>
                <td class="tar">₹${totals.balance_due.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            </table>
          </div>
        </div>

        <!-- Footer: Terms & Signature -->
        <div class="p-footer-section">
          <div class="p-terms-box">
            <strong>Terms & Conditions:</strong><br>
            ${this.escapeHtml(inv.terms || settings.default_terms || '1. Goods once sold will not be returned.\n2. Subject to local jurisdiction.')}
            ${inv.notes ? '<div style="margin-top: 6px;"><strong>Notes:</strong> ' + this.escapeHtml(inv.notes) + '</div>' : ''}
          </div>
          <div class="p-sign-box">
            <div class="for-company">For ${this.escapeHtml(settings.company_name || 'EUREKA INTERNATIONAL')}</div>
            <div class="sign-label">Authorized Signatory</div>
          </div>
        </div>
      </div>
    `;
  },

  // ----------------------------------------------------
  // PRODUCT MASTER MANAGEMENT
  // ----------------------------------------------------
  renderProductsTable(filterText = '') {
    const tbody = document.getElementById('productsTableTbody');
    if (!tbody) return;

    const q = (filterText || '').toLowerCase().trim();
    const list = this.state.products.filter(p => {
      return (
        p.product_name.toLowerCase().includes(q) ||
        p.product_code.toLowerCase().includes(q) ||
        p.packaging.toLowerCase().includes(q) ||
        p.pack_size.toLowerCase().includes(q)
      );
    });

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 2rem; color: #64748b;">No products found in Product Master.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(p => `
      <tr>
        <td>
          <strong>${this.escapeHtml(p.product_name)}</strong>
          ${p.description ? `<div style="font-size: 0.75rem; color: #64748b;">${this.escapeHtml(p.description)}</div>` : ''}
        </td>
        <td><span class="code-badge">${this.escapeHtml(p.product_code)}</span></td>
        <td><span class="pkg-badge">${this.escapeHtml(p.packaging)}</span></td>
        <td><span class="size-badge">${this.escapeHtml(p.pack_size)}</span></td>
        <td style="text-align: right; font-family: var(--font-mono); font-weight: 700;">₹${Number(p.mrp).toFixed(2)}</td>
        <td style="text-align: right; font-family: var(--font-mono); font-weight: 700; color: #0284c7;">₹${Number(p.selling_price).toFixed(2)}</td>
        <td style="text-align: center;">${this.escapeHtml(p.unit)}</td>
        <td style="text-align: center;">
          <span style="font-weight: 700; color: ${p.current_stock <= p.min_stock ? '#dc2626' : '#059669'};">
            ${p.current_stock} ${p.unit}
          </span>
          ${p.current_stock <= p.min_stock ? `<span style="display:block; font-size: 0.7rem; color: #dc2626; font-weight: 700;">LOW STOCK</span>` : ''}
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <button class="btn btn-secondary btn-sm" onclick="App.openAdjustStockModal(${p.id})">Stock</button>
          <button class="btn btn-secondary btn-sm" onclick="App.openEditProductModal(${p.id})">Edit</button>
          <button class="btn btn-outline-danger btn-sm" onclick="App.deleteProduct(${p.id})">Delete</button>
        </td>
      </tr>
    `).join('');
  },

  openAddProductModal() {
    this.state.editingProductId = null;
    document.getElementById('productModalTitle').textContent = 'Add New Product to Master';
    document.getElementById('pmProductName').value = '';
    document.getElementById('pmProductCode').value = '';
    document.getElementById('pmPackaging').value = 'POUCH';
    document.getElementById('pmPackSize').value = '1 KG';
    document.getElementById('pmMRP').value = '';
    document.getElementById('pmSellingPrice').value = '';
    document.getElementById('pmUnit').value = 'KG';
    document.getElementById('pmTaxRate').value = '0';
    document.getElementById('pmHSN').value = '';
    document.getElementById('pmDescription').value = '';
    document.getElementById('pmCurrentStock').value = '100';
    document.getElementById('pmMinStock').value = '10';

    const btnDel = document.getElementById('btnDeleteProductInModal');
    if (btnDel) btnDel.style.display = 'none';

    document.getElementById('productModal').classList.add('active');
  },

  openEditProductModal(id) {
    const p = this.state.products.find(prod => String(prod.id) === String(id));
    if (!p) {
      console.warn('Product not found for id:', id);
      return;
    }

    this.state.editingProductId = id;
    document.getElementById('productModalTitle').textContent = `Edit Product: ${p.product_name}`;
    document.getElementById('pmProductName').value = p.product_name;
    document.getElementById('pmProductCode').value = p.product_code;
    document.getElementById('pmPackaging').value = p.packaging;
    document.getElementById('pmPackSize').value = p.pack_size;
    document.getElementById('pmMRP').value = p.mrp;
    document.getElementById('pmSellingPrice').value = p.selling_price;
    document.getElementById('pmUnit').value = p.unit;
    document.getElementById('pmTaxRate').value = p.tax_rate;
    document.getElementById('pmHSN').value = p.hsn || '';
    document.getElementById('pmDescription').value = p.description || '';
    document.getElementById('pmCurrentStock').value = p.current_stock;
    document.getElementById('pmMinStock').value = p.min_stock;

    const btnDel = document.getElementById('btnDeleteProductInModal');
    if (btnDel) btnDel.style.display = 'inline-block';

    document.getElementById('productModal').classList.add('active');
  },

  deleteProductFromModal() {
    if (this.state.editingProductId) {
      const id = this.state.editingProductId;
      this.closeProductModal();
      this.deleteProduct(id);
    }
  },

  closeProductModal() {
    document.getElementById('productModal').classList.remove('active');
  },

  async saveProductModal() {
    const name = document.getElementById('pmProductName').value.trim();
    if (!name) {
      this.showToast('Please enter a Product Name.', 'error');
      document.getElementById('pmProductName').focus();
      return;
    }

    let code = document.getElementById('pmProductCode').value.trim();
    if (!code) {
      const cleanPrefix = name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'PRD';
      code = `${cleanPrefix}-${Math.floor(100 + Math.random() * 900)}`;
    }

    const pkg = document.getElementById('pmPackaging').value.trim() || 'POUCH';
    const size = document.getElementById('pmPackSize').value.trim() || '1 KG';
    const mrp = parseFloat(document.getElementById('pmMRP').value) || 0;
    const priceInput = document.getElementById('pmSellingPrice').value;
    const sellingPrice = (priceInput !== '') ? (parseFloat(priceInput) || mrp) : mrp;
    const unit = document.getElementById('pmUnit').value.trim() || 'KG';
    const taxRate = parseFloat(document.getElementById('pmTaxRate').value) || 0;
    const hsn = document.getElementById('pmHSN').value.trim();
    const desc = document.getElementById('pmDescription').value.trim();
    const currentStock = parseFloat(document.getElementById('pmCurrentStock').value) || 100;
    const minStock = parseFloat(document.getElementById('pmMinStock').value) || 10;

    const payload = {
      product_name: name,
      product_code: code,
      packaging: pkg,
      pack_size: size,
      mrp,
      selling_price: sellingPrice,
      unit,
      tax_rate: taxRate,
      hsn,
      description: desc,
      current_stock: currentStock,
      min_stock: minStock
    };

    try {
      let savedProduct;
      if (this.state.editingProductId) {
        savedProduct = await API.updateProduct(this.state.editingProductId, payload);
        this.showToast(`Updated product "${name}"`, 'success');
      } else {
        savedProduct = await API.createProduct(payload);
        this.showToast(`Created product "${name}" in Product Master`, 'success');
      }

      this.closeProductModal();
      this.state.products = await API.getProducts();
      this.renderProductsTable();
      this.updateCounters();

      // If opened from an invoice line, automatically select the newly created product into that line!
      if (this.state.targetLineIndexForNewProduct !== null && this.state.targetLineIndexForNewProduct !== undefined) {
        const lineIdx = this.state.targetLineIndexForNewProduct;
        this.state.targetLineIndexForNewProduct = null;
        const targetId = (savedProduct && savedProduct.id) ? savedProduct.id : (this.state.products.find(p => p.product_code === code)?.id);
        if (targetId) {
          this.selectProductForLine(lineIdx, targetId);
        }
      }
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  openConfirmModal(title, message, onConfirm) {
    const modal = document.getElementById('confirmActionModal');
    if (!modal) {
      if (confirm(message)) onConfirm();
      return;
    }
    document.getElementById('confirmActionTitle').textContent = title || 'Confirm Delete';
    document.getElementById('confirmActionMessage').textContent = message || 'Are you sure?';
    const btn = document.getElementById('btnConfirmActionSubmit');
    btn.onclick = () => {
      this.closeConfirmModal();
      onConfirm();
    };
    modal.classList.add('active');
  },

  closeConfirmModal() {
    const modal = document.getElementById('confirmActionModal');
    if (modal) modal.classList.remove('active');
  },

  deleteProduct(id) {
    const p = this.state.products.find(prod => String(prod.id) === String(id));
    const name = p ? p.product_name : 'this product';
    this.openConfirmModal('Delete Product / পণ্য মুছুন', `Are you sure you want to delete "${name}" permanently from Product Master?`, async () => {
      try {
        await API.deleteProduct(id);
        this.showToast(`Deleted product "${name}"`, 'info');
        this.state.products = await API.getProducts();
        this.renderProductsTable();
        this.updateCounters();

        // Clear deleted product from invoice line items if present
        if (this.state.currentInvoice && this.state.currentInvoice.items) {
          let touched = false;
          this.state.currentInvoice.items.forEach(itm => {
            if (String(itm.product_id) === String(id)) {
              itm.product_id = '';
              itm.product_name = '';
              itm.product_code = '';
              itm.mrp = 0;
              itm.rate = 0;
              touched = true;
            }
          });
          if (touched) {
            this.renderInvoiceItemsTable();
            this.recalculateAndRenderSummary();
          }
        }
      } catch (err) {
        this.showToast('Failed to delete product: ' + err.message, 'error');
      }
    });
  },

  // Stock Adjustment Modal
  openAdjustStockModal(id) {
    const p = this.state.products.find(prod => String(prod.id) === String(id));
    if (!p) return;

    this.state.editingProductId = id;
    document.getElementById('stockModalTitle').textContent = `Adjust Stock: ${p.product_name} (${p.product_code})`;
    document.getElementById('stockCurrentDisplay').textContent = `${p.current_stock} ${p.unit}`;
    document.getElementById('stockAdjustQty').value = '';
    document.getElementById('stockAdjustType').value = 'add';
    document.getElementById('stockAdjustReason').value = 'Stock In / Shipment Received';

    document.getElementById('stockModal').classList.add('active');
  },

  closeStockModal() {
    document.getElementById('stockModal').classList.remove('active');
  },

  async saveStockAdjustment() {
    const pId = this.state.editingProductId;
    const type = document.getElementById('stockAdjustType').value;
    const rawQty = parseFloat(document.getElementById('stockAdjustQty').value) || 0;
    const reason = document.getElementById('stockAdjustReason').value.trim();

    if (rawQty <= 0) {
      this.showToast('Please enter a valid quantity greater than zero.', 'error');
      return;
    }

    const changeQty = type === 'add' ? rawQty : -rawQty;

    try {
      await API.adjustStock(pId, changeQty, reason);
      this.showToast('Stock updated successfully!', 'success');
      this.closeStockModal();
      this.state.products = await API.getProducts();
      this.renderProductsTable();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  // Export products to CSV
  exportProductsCsv() {
    window.location.href = '/api/products/export/csv';
  },

  // ----------------------------------------------------
  // CUSTOMER MASTER MANAGEMENT
  // ----------------------------------------------------
  renderCustomersTable(filterText = '') {
    const tbody = document.getElementById('customersTableTbody');
    if (!tbody) return;

    const q = (filterText || '').toLowerCase().trim();
    const list = this.state.customers.filter(c => {
      return (
        c.customer_name.toLowerCase().includes(q) ||
        (c.company_name && c.company_name.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (c.gstin && c.gstin.toLowerCase().includes(q))
      );
    });

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: #64748b;">No customers found.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(c => `
      <tr>
        <td>
          <strong>${this.escapeHtml(c.customer_name)}</strong>
          ${c.company_name ? `<div style="font-size: 0.775rem; color: #475569;">${this.escapeHtml(c.company_name)}</div>` : ''}
        </td>
        <td>${this.escapeHtml(c.phone || '-')}</td>
        <td>${this.escapeHtml(c.email || '-')}</td>
        <td><code>${this.escapeHtml(c.gstin || 'Unregistered')}</code></td>
        <td>${this.escapeHtml(c.state || '-')}</td>
        <td style="max-width: 250px; font-size: 0.8rem; color: #475569;">${this.escapeHtml(c.billing_address || '-')}</td>
        <td style="text-align: right; white-space: nowrap;">
          <button class="btn btn-secondary btn-sm" onclick="App.openEditCustomerModal(${c.id})">Edit</button>
          <button class="btn btn-outline-danger btn-sm" onclick="App.deleteCustomer(${c.id})">Delete</button>
        </td>
      </tr>
    `).join('');
  },

  openAddCustomerModal() {
    this.state.editingCustomerId = null;
    document.getElementById('customerModalTitle').textContent = 'Add New Customer';
    document.getElementById('cmName').value = '';
    document.getElementById('cmCompany').value = '';
    document.getElementById('cmPhone').value = '';
    document.getElementById('cmEmail').value = '';
    document.getElementById('cmBillingAddress').value = '';
    document.getElementById('cmShippingAddress').value = '';
    document.getElementById('cmGSTIN').value = '';
    document.getElementById('cmState').value = this.state.settings.company_state || 'Andhra Pradesh';

    document.getElementById('customerModal').classList.add('active');
  },

  openEditCustomerModal(id) {
    const c = this.state.customers.find(cust => String(cust.id) === String(id));
    if (!c) {
      console.warn('Customer not found for id:', id);
      return;
    }

    this.state.editingCustomerId = id;
    document.getElementById('customerModalTitle').textContent = `Edit Customer: ${c.customer_name}`;
    document.getElementById('cmName').value = c.customer_name;
    document.getElementById('cmCompany').value = c.company_name || '';
    document.getElementById('cmPhone').value = c.phone || '';
    document.getElementById('cmEmail').value = c.email || '';
    document.getElementById('cmBillingAddress').value = c.billing_address || '';
    document.getElementById('cmShippingAddress').value = c.shipping_address || '';
    document.getElementById('cmGSTIN').value = c.gstin || '';
    document.getElementById('cmState').value = c.state || '';

    document.getElementById('customerModal').classList.add('active');
  },

  closeCustomerModal() {
    document.getElementById('customerModal').classList.remove('active');
  },

  async saveCustomerModal() {
    const name = document.getElementById('cmName').value.trim();
    if (!name) {
      this.showToast('Customer Name is required.', 'error');
      return;
    }

    const payload = {
      customer_name: name,
      company_name: document.getElementById('cmCompany').value.trim(),
      phone: document.getElementById('cmPhone').value.trim(),
      email: document.getElementById('cmEmail').value.trim(),
      billing_address: document.getElementById('cmBillingAddress').value.trim(),
      shipping_address: document.getElementById('cmShippingAddress').value.trim(),
      gstin: document.getElementById('cmGSTIN').value.trim(),
      state: document.getElementById('cmState').value.trim(),
      country: 'India'
    };

    try {
      if (this.state.editingCustomerId) {
        await API.updateCustomer(this.state.editingCustomerId, payload);
        this.showToast(`Updated customer "${name}"`, 'success');
      } else {
        const created = await API.createCustomer(payload);
        this.showToast(`Added customer "${name}"`, 'success');

        // If currently in creator, auto-select this newly created customer
        if (this.state.activeTab === 'invoice-creator') {
          this.state.customers = await API.getCustomers();
          this.populateCustomerDropdown(created.id);
          this.onCustomerSelectChange(created.id);
        }
      }

      this.closeCustomerModal();
      this.state.customers = await API.getCustomers();
      this.renderCustomersTable();
      this.updateCounters();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  deleteCustomer(id) {
    const c = this.state.customers.find(cust => String(cust.id) === String(id));
    const name = c ? c.customer_name : 'customer';
    this.openConfirmModal('Delete Customer', `Are you sure you want to delete customer "${name}"?`, async () => {
      try {
        await API.deleteCustomer(id);
        this.showToast(`Deleted customer "${name}"`, 'info');
        this.state.customers = await API.getCustomers();
        this.renderCustomersTable();
        this.updateCounters();
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    });
  },

  // ----------------------------------------------------
  // INVOICE LIST & HISTORY
  // ----------------------------------------------------
  async loadInvoicesList() {
    const statusFilter = document.getElementById('invListFilterStatus')?.value || 'all';
    const searchFilter = document.getElementById('invListSearchInput')?.value || '';

    try {
      const invoices = await API.getInvoices({
        status: statusFilter,
        search: searchFilter
      });
      this.state.invoices = invoices || [];
      this.renderInvoicesTable();
    } catch (err) {
      this.showToast('Failed to load invoices: ' + err.message, 'error');
    }
  },

  renderInvoicesTable() {
    const tbody = document.getElementById('invoicesTableTbody');
    if (!tbody) return;

    const list = this.state.invoices || [];
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 2rem; color: #64748b;">No invoices found. Click "Create Invoice" to issue a new bill.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(inv => {
      const cust = inv.customer_data || {};
      const statusClass = (inv.status || 'draft').toLowerCase().replace(' ', '-');

      return `
        <tr>
          <td><strong style="color: #1e40af; font-family: var(--font-mono);">${this.escapeHtml(inv.invoice_number)}</strong></td>
          <td>
            <strong>${this.escapeHtml(cust.customer_name || 'Cash Customer')}</strong>
            ${cust.company_name ? `<div style="font-size: 0.75rem; color: #64748b;">${this.escapeHtml(cust.company_name)}</div>` : ''}
          </td>
          <td>${this.escapeHtml(inv.invoice_date)}</td>
          <td>${this.escapeHtml(inv.due_date)}</td>
          <td style="text-align: right; font-family: var(--font-mono); font-weight: 700;">₹${Number(inv.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td style="text-align: right; font-family: var(--font-mono); color: #059669;">₹${Number(inv.amount_paid).toFixed(2)}</td>
          <td style="text-align: right; font-family: var(--font-mono); font-weight: 700; color: ${inv.balance_due > 0 ? '#dc2626' : '#059669'};">₹${Number(inv.balance_due).toFixed(2)}</td>
          <td style="text-align: center;">
            <span class="status-badge ${statusClass}">${this.escapeHtml(inv.status)}</span>
          </td>
          <td style="text-align: right; white-space: nowrap;">
            <button class="btn btn-secondary btn-sm" onclick="App.viewExistingInvoice(${inv.id})">View/Print</button>
            <button class="btn btn-secondary btn-sm" onclick="App.editExistingInvoice(${inv.id})">Edit</button>
            <button class="btn btn-secondary btn-sm" onclick="App.openRecordPaymentModal(${inv.id})">Pay</button>
            <button class="btn btn-secondary btn-sm" onclick="App.duplicateExistingInvoice(${inv.id})" title="Duplicate">Copy</button>
            <button class="btn btn-outline-danger btn-sm" onclick="App.deleteExistingInvoice(${inv.id})">Delete</button>
          </td>
        </tr>
      `;
    }).join('');
  },

  async viewExistingInvoice(id) {
    try {
      const invoice = await API.getInvoice(id);
      this.state.currentInvoice = invoice;
      this.openInvoicePreview(invoice);
    } catch (err) {
      this.showToast('Failed to load invoice: ' + err.message, 'error');
    }
  },

  async editExistingInvoice(id) {
    try {
      const invoice = await API.getInvoice(id);
      this.state.editingInvoiceId = invoice.id;
      this.state.currentInvoice = invoice;
      this.switchTab('invoice-creator');
      this.populateInvoiceForm();
      this.recalculateAndRenderSummary();
      this.showToast(`Editing Invoice ${invoice.invoice_number}`, 'info');
    } catch (err) {
      this.showToast('Failed to load invoice for editing: ' + err.message, 'error');
    }
  },

  async duplicateExistingInvoice(id) {
    try {
      const invoice = await API.getInvoice(id);
      const numRes = await API.getNextInvoiceNumber();
      const cloned = JSON.parse(JSON.stringify(invoice));
      cloned.id = undefined;
      cloned.invoice_number = numRes.invoice_number;
      cloned.invoice_date = new Date().toISOString().split('T')[0];
      cloned.amount_paid = 0;
      cloned.balance_due = cloned.grand_total;
      cloned.status = 'Draft';

      this.state.editingInvoiceId = null;
      this.state.currentInvoice = cloned;
      this.switchTab('invoice-creator');
      this.populateInvoiceForm();
      this.recalculateAndRenderSummary();
      this.showToast(`Duplicated into new Invoice ${cloned.invoice_number}`, 'info');
    } catch (err) {
      this.showToast('Failed to duplicate: ' + err.message, 'error');
    }
  },

  deleteExistingInvoice(id) {
    this.openConfirmModal('Delete Invoice', 'Are you sure you want to delete this invoice? If inventory tracking is enabled, stock will be restored.', async () => {
      try {
        await API.deleteInvoice(id);
        this.showToast('Invoice deleted successfully.', 'info');
        this.loadInvoicesList();
        this.state.products = await API.getProducts();
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    });
  },

  // Record Payment Modal
  openRecordPaymentModal(invoiceId) {
    const inv = this.state.invoices.find(i => i.id === invoiceId);
    if (!inv) return;

    this.state.editingInvoiceId = invoiceId;
    document.getElementById('payModalTitle').textContent = `Record Payment for ${inv.invoice_number}`;
    document.getElementById('payInvoiceTotal').textContent = `₹${Number(inv.grand_total).toFixed(2)}`;
    document.getElementById('payAlreadyPaid').textContent = `₹${Number(inv.amount_paid).toFixed(2)}`;
    document.getElementById('payBalanceDue').textContent = `₹${Number(inv.balance_due).toFixed(2)}`;
    document.getElementById('payAmountInput').value = inv.balance_due;
    document.getElementById('payDateInput').value = new Date().toISOString().split('T')[0];
    document.getElementById('payMethodInput').value = 'Bank Transfer';
    document.getElementById('payRefInput').value = '';
    document.getElementById('payNotesInput').value = '';

    document.getElementById('paymentModal').classList.add('active');
  },

  closeRecordPaymentModal() {
    document.getElementById('paymentModal').classList.remove('active');
  },

  async saveRecordPayment() {
    const invId = this.state.editingInvoiceId;
    const amount = parseFloat(document.getElementById('payAmountInput').value) || 0;
    const date = document.getElementById('payDateInput').value;
    const method = document.getElementById('payMethodInput').value;
    const ref = document.getElementById('payRefInput').value.trim();
    const notes = document.getElementById('payNotesInput').value.trim();

    if (amount <= 0) {
      this.showToast('Please enter a valid payment amount.', 'error');
      return;
    }

    try {
      await API.addPayment(invId, {
        amount,
        payment_date: date,
        payment_method: method,
        reference_no: ref,
        notes
      });

      this.showToast(`Recorded payment of ₹${amount.toFixed(2)}`, 'success');
      this.closeRecordPaymentModal();
      this.loadInvoicesList();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  // ----------------------------------------------------
  // DASHBOARD DATA
  // ----------------------------------------------------
  async loadDashboardData() {
    try {
      const stats = await API.getDashboardStats();
      document.getElementById('statTotalSales').textContent = `₹${Number(stats.totalSales || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      document.getElementById('statTotalPaid').textContent = `₹${Number(stats.totalPaid || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      document.getElementById('statTotalDue').textContent = `₹${Number(stats.totalOutstanding || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      document.getElementById('statTotalInvoices').textContent = stats.totalInvoices || 0;
      document.getElementById('statProductsCount').textContent = stats.totalProducts || 0;
      document.getElementById('statLowStockCount').textContent = stats.lowStockCount || 0;

      // Recent Invoices table
      const recentTbody = document.getElementById('dashboardRecentInvoicesTbody');
      if (recentTbody) {
        if (!stats.recentInvoices || stats.recentInvoices.length === 0) {
          recentTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #64748b; padding: 1.5rem;">No invoices created yet.</td></tr>`;
        } else {
          recentTbody.innerHTML = stats.recentInvoices.map(inv => `
            <tr>
              <td><strong style="color: #1e40af; font-family: var(--font-mono);">${this.escapeHtml(inv.invoice_number)}</strong></td>
              <td>${this.escapeHtml(inv.customer_data?.customer_name || 'Cash Customer')}</td>
              <td>${this.escapeHtml(inv.invoice_date)}</td>
              <td style="text-align: right; font-family: var(--font-mono); font-weight: 700;">₹${Number(inv.grand_total).toFixed(2)}</td>
              <td style="text-align: center;"><span class="status-badge ${(inv.status || 'draft').toLowerCase().replace(' ', '-')}">${inv.status}</span></td>
              <td style="text-align: right;"><button class="btn btn-secondary btn-sm" onclick="App.viewExistingInvoice(${inv.id})">View</button></td>
            </tr>
          `).join('');
        }
      }

      // Low Stock items list
      const lowStockBox = document.getElementById('dashboardLowStockList');
      if (lowStockBox) {
        if (!stats.lowStockItems || stats.lowStockItems.length === 0) {
          lowStockBox.innerHTML = `<div style="color: #059669; font-size: 0.85rem; padding: 0.5rem 0;">✓ All inventory items are adequately stocked.</div>`;
        } else {
          lowStockBox.innerHTML = stats.lowStockItems.map(p => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid #e2e8f0;">
              <div>
                <strong>${this.escapeHtml(p.product_name)}</strong>
                <span class="code-badge" style="margin-left: 6px;">${this.escapeHtml(p.product_code)}</span>
              </div>
              <div style="color: #dc2626; font-weight: 700;">
                ${p.current_stock} ${p.unit} (Min: ${p.min_stock})
              </div>
            </div>
          `).join('');
        }
      }
    } catch (err) {
      this.showToast('Failed to load dashboard: ' + err.message, 'error');
    }
  },

  // ----------------------------------------------------
  // SETTINGS FORM
  // ----------------------------------------------------
  populateSettingsForm() {
    const s = this.state.settings || {};
    document.getElementById('setCompanyName').value = s.company_name || '';
    document.getElementById('setCompanyTagline').value = s.company_tagline || '';
    document.getElementById('setCompanyAddress').value = s.company_address || '';
    document.getElementById('setCompanyPhone').value = s.company_phone || '';
    document.getElementById('setCompanyEmail').value = s.company_email || '';
    document.getElementById('setCompanyGSTIN').value = s.company_gstin || '';
    document.getElementById('setCompanyState').value = s.company_state || '';
    document.getElementById('setInvoicePrefix').value = s.invoice_prefix || 'INV-';
    document.getElementById('setBankDetails').value = s.bank_details || '';
    document.getElementById('setDefaultNotes').value = s.default_notes || '';
    document.getElementById('setDefaultTerms').value = s.default_terms || '';
    document.getElementById('setTrackStock').checked = (s.enable_stock_tracking !== 'false');
  },

  async saveSettings() {
    const payload = {
      company_name: document.getElementById('setCompanyName').value.trim(),
      company_tagline: document.getElementById('setCompanyTagline').value.trim(),
      company_address: document.getElementById('setCompanyAddress').value.trim(),
      company_phone: document.getElementById('setCompanyPhone').value.trim(),
      company_email: document.getElementById('setCompanyEmail').value.trim(),
      company_gstin: document.getElementById('setCompanyGSTIN').value.trim(),
      company_state: document.getElementById('setCompanyState').value.trim(),
      invoice_prefix: document.getElementById('setInvoicePrefix').value.trim(),
      bank_details: document.getElementById('setBankDetails').value.trim(),
      default_notes: document.getElementById('setDefaultNotes').value.trim(),
      default_terms: document.getElementById('setDefaultTerms').value.trim(),
      enable_stock_tracking: document.getElementById('setTrackStock').checked ? 'true' : 'false'
    };

    try {
      await API.updateSettings(payload);
      this.state.settings = await API.getSettings();
      this.updateHeaderBrand();
      this.showToast('Company settings saved successfully!', 'success');
    } catch (err) {
      this.showToast('Failed to save settings: ' + err.message, 'error');
    }
  },

  // ----------------------------------------------------
  // UTILITIES
  // ----------------------------------------------------
  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  },

  escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
