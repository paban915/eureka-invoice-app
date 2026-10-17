/**
 * Professional Invoicing API Client
 */

const API = {
  baseUrl: window.location.origin,

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    try {
      const response = await fetch(url, { ...options, headers });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `HTTP error ${response.status}`);
      }
      return data;
    } catch (err) {
      console.error(`API Request Error [${endpoint}]:`, err);
      throw err;
    }
  },

  // Products
  async getProducts(search = '') {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    return this.request(`/api/products${q}`);
  },

  async getProduct(id) {
    return this.request(`/api/products/${id}`);
  },

  async createProduct(productData) {
    return this.request('/api/products', {
      method: 'POST',
      body: JSON.stringify(productData)
    });
  },

  async updateProduct(id, productData) {
    return this.request(`/api/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(productData)
    });
  },

  async deleteProduct(id) {
    return this.request(`/api/products/${id}`, {
      method: 'DELETE'
    });
  },

  async adjustStock(id, changeQty, reason, referenceId = '') {
    return this.request(`/api/products/${id}/adjust-stock`, {
      method: 'POST',
      body: JSON.stringify({
        change_qty: changeQty,
        reason,
        reference_id: referenceId
      })
    });
  },

  // Customers
  async getCustomers(search = '') {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    return this.request(`/api/customers${q}`);
  },

  async getCustomer(id) {
    return this.request(`/api/customers/${id}`);
  },

  async createCustomer(customerData) {
    return this.request('/api/customers', {
      method: 'POST',
      body: JSON.stringify(customerData)
    });
  },

  async updateCustomer(id, customerData) {
    return this.request(`/api/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(customerData)
    });
  },

  async deleteCustomer(id) {
    return this.request(`/api/customers/${id}`, {
      method: 'DELETE'
    });
  },

  // Invoices
  async getNextInvoiceNumber() {
    return this.request('/api/invoices/next-number');
  },

  async getInvoices(filters = {}) {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.search) params.append('search', filters.search);
    if (filters.from_date) params.append('from_date', filters.from_date);
    if (filters.to_date) params.append('to_date', filters.to_date);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/invoices${qs}`);
  },

  async getInvoice(id) {
    return this.request(`/api/invoices/${id}`);
  },

  async createInvoice(invoiceData) {
    return this.request('/api/invoices', {
      method: 'POST',
      body: JSON.stringify(invoiceData)
    });
  },

  async updateInvoice(id, invoiceData) {
    return this.request(`/api/invoices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(invoiceData)
    });
  },

  async deleteInvoice(id) {
    return this.request(`/api/invoices/${id}`, {
      method: 'DELETE'
    });
  },

  async addPayment(invoiceId, paymentData) {
    return this.request(`/api/invoices/${invoiceId}/payments`, {
      method: 'POST',
      body: JSON.stringify(paymentData)
    });
  },

  // Dashboard Stats
  async getDashboardStats() {
    return this.request('/api/dashboard/stats');
  },

  // Settings
  async getSettings() {
    return this.request('/api/settings');
  },

  async updateSettings(settings) {
    return this.request('/api/settings', {
      method: 'POST',
      body: JSON.stringify(settings)
    });
  }
};
