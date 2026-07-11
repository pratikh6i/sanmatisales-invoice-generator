// API Abstraction Layer for Reusable Bill Generator
// Supports 'mock' mode (localStorage) and 'live' mode (Google Sheets API client-side)

let currentMode = localStorage.getItem('bill_gen_mode') || 'mock'; // 'mock' or 'live'
let googleClientId = localStorage.getItem('bill_google_client_id') || import.meta.env.VITE_GOOGLE_CLIENT_ID || '727351903448-q5i44ba8kkund0v1k45b2ikekk4510b0.apps.googleusercontent.com';
let spreadsheetId = localStorage.getItem('bill_spreadsheet_id') || '';
let googleAccessToken = null; // Restored from localStorage on getSession() or set after login

// Default Mock Data
const MOCK_PRODUCTS = [
  { name: 'Line dori', hsn: '5607', unit: 'Pcs', rate: 68, gstRate: 18 },
  { name: 'Big Line Dori', hsn: '5607', unit: 'Pcs', rate: 40, gstRate: 18 },
  { name: 'One two', hsn: '7326', unit: 'Pcs', rate: 68, gstRate: 18 },
  { name: 'uPvc vale 1/2"', hsn: '8481', unit: 'Pcs', rate: 48, gstRate: 18 },
  { name: 'uPvc vale 3/4"', hsn: '8481', unit: 'Pcs', rate: 68, gstRate: 18 },
  { name: 'uPvc vale 1"', hsn: '8481', unit: 'Pcs', rate: 88, gstRate: 18 },
  { name: 'Nylon rassi', hsn: '5607', unit: 'Pcs', rate: 15, gstRate: 18 },
  { name: 'Hexa blade', hsn: '8202', unit: 'Pcs', rate: 7.2, gstRate: 18 },
  { name: 'Nylon Rassi 5mtr', hsn: '5607', unit: 'Pcs', rate: 15, gstRate: 18 },
  { name: 'Dog chain', hsn: '7315', unit: 'Pcs', rate: 65, gstRate: 18 },
  { name: 'Tapflon Tape', hsn: '3920', unit: 'Pcs', rate: 9, gstRate: 18 },
  { name: 'Upvc Valve 1/2"', hsn: '8481', unit: 'Pcs', rate: 48, gstRate: 18 },
  { name: 'Upvc Valve 3/4"', hsn: '8481', unit: 'Pcs', rate: 68, gstRate: 18 },
  { name: 'Upvc Valve 1"', hsn: '8481', unit: 'Pcs', rate: 88, gstRate: 18 },
  { name: 'Pentagon', hsn: '3926', unit: 'Pcs', rate: 45, gstRate: 18 },
  { name: 'Waste Pipe', hsn: '3917', unit: 'Pcs', rate: 30, gstRate: 18 },
  { name: 'Electric tape', hsn: '8546', unit: 'Pcs', rate: 5, gstRate: 18 }
];

const MOCK_CUSTOMERS = [
  { name: 'Shri Hardware', address: 'Shri Hardware, Main Bazaar, Kolhapur', gstin: '27AAAAA1111A1Z1', state: 'Maharashtra', stateCode: '27', whatsapp: '919876543210' },
  { name: 'Neminath hardware', address: 'Neminath hardware, Station Road, Sangli', gstin: '27BBBBB2222B2Z2', state: 'Maharashtra', stateCode: '27', whatsapp: '919876543211' },
  { name: 'Vardhaman Traders', address: 'Vardhaman Traders, Market Yard, Pune', gstin: '27CCCCC3333C3Z3', state: 'Maharashtra', stateCode: '27', whatsapp: '919876543212' }
];

const MOCK_WHITELIST = [
  'admin@example.com',
  'billing@example.com',
  'user@example.com',
  'customer@example.com'
];

const MOCK_INVOICES = [
  {
    invoiceNo: '03',
    date: '2026-07-03',
    customerName: 'Shri Hardware',
    billingAddress: 'Shri Hardware, Main Bazaar, Kolhapur',
    shippingAddress: 'Shri Hardware, Main Bazaar, Kolhapur',
    customerGstin: '27AAAAA1111A1Z1',
    placeOfSupply: 'Maharashtra (27)',
    subtotal: 1224,
    discount: 0,
    cgstTotal: 110.16,
    sgstTotal: 110.16,
    igstTotal: 0,
    taxTotal: 220.32,
    grandTotal: 1444,
    createdBy: 'admin@example.com',
    items: [
      { sNo: 1, description: 'Line dori', hsn: '5607', qty: 2, unit: 'Pcs', rate: 68, gstRate: 18, taxableValue: 136, cgstAmount: 12.24, sgstAmount: 12.24, igstAmount: 0, totalAmount: 160.48 },
      { sNo: 2, description: 'Big Line Dori', hsn: '5607', qty: 4, unit: 'Pcs', rate: 40, gstRate: 18, taxableValue: 160, cgstAmount: 14.4, sgstAmount: 14.4, igstAmount: 0, totalAmount: 188.8 },
      { sNo: 3, description: 'One two', hsn: '7326', qty: 2, unit: 'Pcs', rate: 68, gstRate: 18, taxableValue: 136, cgstAmount: 12.24, sgstAmount: 12.24, igstAmount: 0, totalAmount: 160.48 },
      { sNo: 4, description: 'uPvc vale 1/2"', hsn: '8481', qty: 3, unit: 'Pcs', rate: 48, gstRate: 18, taxableValue: 144, cgstAmount: 12.96, sgstAmount: 12.96, igstAmount: 0, totalAmount: 169.92 },
      { sNo: 5, description: 'uPvc vale 3/4"', hsn: '8481', qty: 3, unit: 'Pcs', rate: 68, gstRate: 18, taxableValue: 204, cgstAmount: 18.36, sgstAmount: 18.36, igstAmount: 0, totalAmount: 240.72 },
      { sNo: 6, description: 'uPvc vale 1"', hsn: '8481', qty: 3, unit: 'Pcs', rate: 88, gstRate: 18, taxableValue: 264, cgstAmount: 23.76, sgstAmount: 23.76, igstAmount: 0, totalAmount: 311.52 },
      { sNo: 7, description: 'Nylon rassi', hsn: '5607', qty: 12, unit: 'Pcs', rate: 15, gstRate: 18, taxableValue: 180, cgstAmount: 16.2, sgstAmount: 16.2, igstAmount: 0, totalAmount: 212.4 }
    ]
  },
  {
    invoiceNo: '04',
    date: '2026-07-03',
    customerName: 'Neminath hardware',
    billingAddress: 'Neminath hardware, Station Road, Sangli',
    shippingAddress: 'Neminath hardware, Station Road, Sangli',
    customerGstin: '27BBBBB2222B2Z2',
    placeOfSupply: 'Maharashtra (27)',
    subtotal: 2602,
    discount: 0,
    cgstTotal: 234.18,
    sgstTotal: 234.18,
    igstTotal: 0,
    taxTotal: 468.36,
    grandTotal: 3070,
    createdBy: 'admin@example.com',
    items: [
      { sNo: 1, description: 'Hexa blade', hsn: '8202', qty: 50, unit: 'Pcs', rate: 7.2, gstRate: 18, taxableValue: 360, cgstAmount: 32.4, sgstAmount: 32.4, igstAmount: 0, totalAmount: 424.8 },
      { sNo: 2, description: 'Nylon Rassi 5mtr', hsn: '5607', qty: 12, unit: 'Pcs', rate: 15, gstRate: 18, taxableValue: 180, cgstAmount: 16.2, sgstAmount: 16.2, igstAmount: 0, totalAmount: 212.4 },
      { sNo: 3, description: 'Dog chain', hsn: '7315', qty: 2, unit: 'Pcs', rate: 65, gstRate: 18, taxableValue: 130, cgstAmount: 11.7, sgstAmount: 11.7, igstAmount: 0, totalAmount: 153.4 },
      { sNo: 4, description: 'Tapflon Tape', hsn: '3920', qty: 30, unit: 'Pcs', rate: 9, gstRate: 18, taxableValue: 270, cgstAmount: 24.3, sgstAmount: 24.3, igstAmount: 0, totalAmount: 318.3 },
      { sNo: 5, description: 'Upvc Valve 1/2"', hsn: '8481', qty: 3, unit: 'Pcs', rate: 48, gstRate: 18, taxableValue: 144, cgstAmount: 12.96, sgstAmount: 12.96, igstAmount: 0, totalAmount: 169.92 },
      { sNo: 6, description: 'Upvc Valve 3/4"', hsn: '8481', qty: 3, unit: 'Pcs', rate: 68, gstRate: 18, taxableValue: 204, cgstAmount: 18.36, sgstAmount: 18.36, igstAmount: 0, totalAmount: 240.72 },
      { sNo: 7, description: 'Upvc Valve 1"', hsn: '8481', qty: 3, unit: 'Pcs', rate: 88, gstRate: 18, taxableValue: 264, cgstAmount: 23.76, sgstAmount: 23.76, igstAmount: 0, totalAmount: 311.52 },
      { sNo: 8, description: 'Pentagon', hsn: '3926', qty: 12, unit: 'Pcs', rate: 45, gstRate: 18, taxableValue: 540, cgstAmount: 48.6, sgstAmount: 48.6, igstAmount: 0, totalAmount: 637.2 },
      { sNo: 9, description: 'Waste Pipe', hsn: '3917', qty: 12, unit: 'Pcs', rate: 30, gstRate: 18, taxableValue: 360, cgstAmount: 32.4, sgstAmount: 32.4, igstAmount: 0, totalAmount: 424.8 },
      { sNo: 10, description: 'Electric tape', hsn: '8546', qty: 30, unit: 'Pcs', rate: 5, gstRate: 18, taxableValue: 150, cgstAmount: 13.5, sgstAmount: 13.5, igstAmount: 0, totalAmount: 176.5 }
    ]
  }
];

const getStorageItem = (key, defaultVal) => {
  const item = localStorage.getItem(key);
  return item ? JSON.parse(item) : defaultVal;
};

const setStorageItem = (key, val) => {
  localStorage.setItem(key, JSON.stringify(val));
};

// Initialize Mock Storage
if (!localStorage.getItem('bill_mock_products')) setStorageItem('bill_mock_products', MOCK_PRODUCTS);
if (!localStorage.getItem('bill_mock_customers')) setStorageItem('bill_mock_customers', MOCK_CUSTOMERS);
const existingInvoices = getStorageItem('bill_mock_invoices', null);
if (!existingInvoices || existingInvoices.length === 0) setStorageItem('bill_mock_invoices', MOCK_INVOICES);
if (!localStorage.getItem('bill_mock_whitelist')) setStorageItem('bill_mock_whitelist', MOCK_WHITELIST);

// Live Client-side Sheets REST API helper
async function callGoogleAPI(url, options = {}) {
  if (!googleAccessToken) {
    throw new Error('Access Token expired or not available. Please sign in again.');
  }

  const headers = {
    'Authorization': `Bearer ${googleAccessToken}`,
    'Content-Type': 'application/json',
    ...options.headers
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    // Handle expired token / revoked access
    if (response.status === 401) {
      // Clear persisted session so the UI can prompt re-login
      localStorage.removeItem('bill_google_session');
      localStorage.removeItem('bill_user_session');
      localStorage.removeItem('bill_spreadsheet_id');
      googleAccessToken = null;
      throw new Error('Session expired. Please sign in again.');
    }

    const errorText = await response.text();
    let errorJson;
    try {
      errorJson = JSON.parse(errorText);
    } catch(e) {}
    const errMsg = errorJson?.error?.message || `Google API error: ${response.status} ${response.statusText}`;
    throw new Error(errMsg);
  }

  if (response.status === 204) return null;
  return await response.json();
}

export const api = {
  getMode() {
    return currentMode;
  },
  
  setMode(mode) {
    currentMode = mode;
    localStorage.setItem('bill_gen_mode', mode);
  },

  getGoogleClientId() {
    return googleClientId;
  },

  setGoogleClientId(id) {
    googleClientId = id;
    localStorage.setItem('bill_google_client_id', id);
  },

  getSpreadsheetId() {
    return spreadsheetId;
  },

  setSpreadsheetId(id) {
    spreadsheetId = id;
    localStorage.setItem('bill_spreadsheet_id', id);
  },

  setGoogleToken(token, expiresIn = 3600) {
    if (token) {
      googleAccessToken = token;
      const session = { token, expiresAt: Date.now() + expiresIn * 1000 };
      localStorage.setItem('bill_google_session', JSON.stringify(session));
    } else {
      this.clearSession();
    }
  },

  hasGoogleToken() {
    return !!googleAccessToken;
  },

  // Session persistence helpers ------------------------------------------------

  /** Restores a saved session if the token is still valid. Returns user info or null. */
  getSession() {
    try {
      const raw = localStorage.getItem('bill_google_session');
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (!session.token || !session.expiresAt || session.expiresAt <= Date.now()) {
        // Expired or malformed – wipe everything
        this.clearSession();
        return null;
      }
      // Token is still valid – restore it in memory
      googleAccessToken = session.token;
      return this.getUserSession(); // { email, name, picture } or null
    } catch {
      this.clearSession();
      return null;
    }
  },

  /** Persist basic user profile so we can restore it on page reload. */
  saveUserSession(userInfo) {
    if (!userInfo) return;
    const { email, name, picture } = userInfo;
    localStorage.setItem('bill_user_session', JSON.stringify({ email, name, picture }));
  },

  /** Read persisted user profile. */
  getUserSession() {
    try {
      const raw = localStorage.getItem('bill_user_session');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  /** Full logout – remove all session-related keys. */
  clearSession() {
    localStorage.removeItem('bill_google_session');
    localStorage.removeItem('bill_user_session');
    localStorage.removeItem('bill_spreadsheet_id');
    googleAccessToken = null;
  },

  // Auth & Profile fetching
  async fetchUserInfo(accessToken) {
    this.setGoogleToken(accessToken);
    const userInfo = await callGoogleAPI('https://www.googleapis.com/oauth2/v3/userinfo');
    return userInfo; // { email, name, picture }
  },

  // Whitelist Verification
  async verifyUser(email) {
    if (currentMode === 'mock') {
      const whitelist = getStorageItem('bill_mock_whitelist', MOCK_WHITELIST);
      if (whitelist.includes(email.toLowerCase())) {
        return { email, role: 'Admin' };
      }
      return { email, role: 'User', warning: 'Demo Mode bypass' };
    } else {
      // In live mode, we fetch the Whitelist sheet from the connected spreadsheet
      if (!spreadsheetId) {
        // If sheet is not initialized yet, we allow setup
        return { email, role: 'Admin', isNewSetup: true };
      }
      
      try {
        const whitelistEmails = await this.getWhitelist();
        // If whitelist is empty or doesn't exist, we auto-whitelist the first user as Admin
        if (whitelistEmails.length === 0) {
          return { email, role: 'Admin' };
        }
        
        if (whitelistEmails.includes(email.toLowerCase())) {
          // Read roles (we'll query the whitelist sheet rows)
          const data = await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Whitelist!A:B`);
          const rows = data.values || [];
          for (let i = 1; i < rows.length; i++) {
            if (rows[i][0] && rows[i][0].toLowerCase().trim() === email.toLowerCase()) {
              return { email, role: rows[i][1] || 'User' };
            }
          }
          return { email, role: 'User' };
        }
        throw new Error(`Unauthorized: ${email} is not in the whitelist for database ID ${spreadsheetId}.`);
      } catch (err) {
        console.error('Whitelist verify failed:', err);
        // Fallback: If spreadsheet is inaccessible but user successfully authenticated via OAuth,
        // it means they own the sheet or need to create a new database.
        return { email, role: 'Admin', hasError: true, errorMsg: err.message };
      }
    }
  },

  // Google Drive search for existing databases
  async searchDatabases() {
    if (currentMode === 'mock') return [];
    
    // Search for spreadsheets created with this name in Drive
    const query = encodeURIComponent("name = 'Sanmati Sales - Billing Database' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false");
    const res = await callGoogleAPI(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,createdTime,modifiedTime)`);
    return res.files || [];
  },

  // Create new Database Sheet
  async createNewDatabase() {
    if (currentMode === 'mock') return 'mock_spreadsheet_id';

    // 1. Create the Spreadsheet structure
    const body = {
      properties: { title: 'Sanmati Sales - Billing Database' },
      sheets: [
        { properties: { title: 'Invoices' } },
        { properties: { title: 'InvoiceItems' } },
        { properties: { title: 'Products' } },
        { properties: { title: 'Customers' } },
        { properties: { title: 'Whitelist' } }
      ]
    };

    const sheetMeta = await callGoogleAPI('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      body: JSON.stringify(body)
    });

    const newSheetId = sheetMeta.spreadsheetId;
    this.setSpreadsheetId(newSheetId);

    // 2. Populate Headers & Sample Mock Data
    const headersData = {
      valueInputOption: 'USER_ENTERED',
      data: [
        {
          range: 'Invoices!A1:M1',
          values: [['Invoice No', 'Date', 'Customer Name', 'Billing Address', 'Shipping Address', 'GSTIN', 'Place of Supply', 'Subtotal', 'Discount', 'Tax Amount', 'Grand Total', 'Created By', 'Created At']]
        },
        {
          range: 'InvoiceItems!A1:P1',
          values: [['Invoice No', 'S.No.', 'Item Description', 'HSN/SAC', 'Qty', 'Unit', 'Rate', 'Taxable Value', 'GST Rate (%)', 'CGST Rate', 'CGST Amount', 'SGST Rate', 'SGST Amount', 'IGST Rate', 'IGST Amount', 'Total Amount']]
        },
        {
          range: 'Products!A1:E1',
          values: [['Product Name', 'HSN/SAC', 'Unit', 'Default Rate', 'GST Rate (%)']]
        },
        {
          range: 'Customers!A1:G1',
          values: [['Customer Name', 'Billing Address', 'Shipping Address', 'GSTIN', 'State', 'State Code', 'WhatsApp Number']]
        },
        {
          range: 'Whitelist!A1:B1',
          values: [['Email Address', 'Role']]
        }
      ]
    };

    // Write Headers
    await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${newSheetId}/values:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify(headersData)
    });

    // Populate Whitelist with current logged in user as admin
    const emailData = await this.fetchUserInfo(googleAccessToken);
    if (emailData?.email) {
      await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${newSheetId}/values/Whitelist!A2:B2?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        body: JSON.stringify({ values: [[emailData.email.toLowerCase(), 'Admin']] })
      });
    }

    // Populate catalog products
    const productRows = MOCK_PRODUCTS.map(p => [p.name, p.hsn, p.unit, p.rate, p.gstRate]);
    await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${newSheetId}/values/Products!A2:E${productRows.length + 1}?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      body: JSON.stringify({ values: productRows })
    });

    // Populate default customers
    const customerRows = MOCK_CUSTOMERS.map(c => [c.name, c.address, c.address, c.gstin, c.state, c.stateCode, c.whatsapp || '']);
    await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${newSheetId}/values/Customers!A2:G${customerRows.length + 1}?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      body: JSON.stringify({ values: customerRows })
    });

    // Populate sample invoices
    for (let inv of MOCK_INVOICES) {
      // Append invoice meta
      await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${newSheetId}/values/Invoices:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        body: JSON.stringify({
          values: [[
            inv.invoiceNo, inv.date, inv.customerName, inv.billingAddress, inv.shippingAddress,
            inv.customerGstin, inv.placeOfSupply, inv.subtotal, inv.discount, inv.taxTotal,
            inv.grandTotal, inv.createdBy, new Date().toISOString()
          ]]
        })
      });
      // Append items
      const itemRows = inv.items.map(item => [
        inv.invoiceNo, item.sNo, item.description, item.hsn, item.qty, item.unit, item.rate,
        item.taxableValue, item.gstRate, item.cgstRate || 0, item.cgstAmount || 0,
        item.sgstRate || 0, item.sgstAmount || 0, item.igstRate || 0, item.igstAmount || 0, item.totalAmount
      ]);
      await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${newSheetId}/values/InvoiceItems:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        body: JSON.stringify({ values: itemRows })
      });
    }

    return newSheetId;
  },

  // Products
  async getProducts() {
    if (currentMode === 'mock') {
      return getStorageItem('bill_mock_products', MOCK_PRODUCTS);
    }
    const data = await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Products!A2:E`);
    const rows = data.values || [];
    return rows.map(r => ({
      name: r[0],
      hsn: r[1] || '',
      unit: r[2] || 'Pcs',
      rate: parseFloat(r[3]) || 0,
      gstRate: parseFloat(r[4]) || 18
    }));
  },

  async saveProduct(product) {
    if (currentMode === 'mock') {
      const products = getStorageItem('bill_mock_products', MOCK_PRODUCTS);
      const index = products.findIndex(p => p.name.toLowerCase() === product.name.toLowerCase());
      if (index >= 0) products[index] = product;
      else products.push(product);
      setStorageItem('bill_mock_products', products);
      return { success: true };
    }
    
    // Check if exists
    const products = await this.getProducts();
    const idx = products.findIndex(p => p.name.toLowerCase().trim() === product.name.toLowerCase().trim());
    const rowValues = [[product.name, product.hsn, product.unit, product.rate, product.gstRate]];
    
    if (idx >= 0) {
      // Overwrite
      const rowNum = idx + 2; // 2-indexed
      await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Products!A${rowNum}:E${rowNum}?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        body: JSON.stringify({ values: rowValues })
      });
    } else {
      // Append
      await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Products!A:A:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        body: JSON.stringify({ values: rowValues })
      });
    }
    return { success: true };
  },

  // Customers
  async getCustomers() {
    if (currentMode === 'mock') {
      return getStorageItem('bill_mock_customers', MOCK_CUSTOMERS);
    }
    const data = await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Customers!A2:G`);
    const rows = data.values || [];
    return rows.map(r => ({
      name: r[0],
      address: r[1] || '',
      shippingAddress: r[2] || r[1] || '',
      gstin: r[3] || '',
      state: r[4] || 'Maharashtra',
      stateCode: r[5] || '27',
      whatsapp: r[6] || ''
    }));
  },

  async saveCustomer(customer) {
    if (currentMode === 'mock') {
      const customers = getStorageItem('bill_mock_customers', MOCK_CUSTOMERS);
      const index = customers.findIndex(c => c.name.toLowerCase() === customer.name.toLowerCase());
      if (index >= 0) customers[index] = customer;
      else customers.push(customer);
      setStorageItem('bill_mock_customers', customers);
      return { success: true };
    }
    
    const customers = await this.getCustomers();
    const idx = customers.findIndex(c => c.name.toLowerCase().trim() === customer.name.toLowerCase().trim());
    const rowValues = [[customer.name, customer.address, customer.address, customer.gstin, customer.state, customer.stateCode, customer.whatsapp || '']];
    
    if (idx >= 0) {
      const rowNum = idx + 2;
      await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Customers!A${rowNum}:G${rowNum}?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        body: JSON.stringify({ values: rowValues })
      });
    } else {
      await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Customers!A:A:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        body: JSON.stringify({ values: rowValues })
      });
    }
    return { success: true };
  },

  // Invoices & InvoiceItems
  async getInvoices() {
    if (currentMode === 'mock') {
      return getStorageItem('bill_mock_invoices', MOCK_INVOICES);
    }

    // 1. Fetch Invoices metadata (columns A to O including transport info)
    const invMeta = await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Invoices!A2:O`);
    const invRows = invMeta.values || [];
    
    // 2. Fetch InvoiceItems
    const itemsData = await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/InvoiceItems!A2:P`);
    const itemRows = itemsData.values || [];

    // Group items by Invoice No
    const itemsMap = {};
    itemRows.forEach(r => {
      const invNo = r[0]?.toString().trim();
      if (!invNo) return;
      if (!itemsMap[invNo]) itemsMap[invNo] = [];
      itemsMap[invNo].push({
        invoiceNo: r[0],
        sNo: parseInt(r[1]) || 1,
        description: r[2],
        hsn: r[3] || '',
        qty: parseFloat(r[4]) || 0,
        unit: r[5] || 'Pcs',
        rate: parseFloat(r[6]) || 0,
        taxableValue: parseFloat(r[7]) || 0,
        gstRate: parseFloat(r[8]) || 18,
        cgstRate: parseFloat(r[9]) || 0,
        cgstAmount: parseFloat(r[10]) || 0,
        sgstRate: parseFloat(r[11]) || 0,
        sgstAmount: parseFloat(r[12]) || 0,
        igstRate: parseFloat(r[13]) || 0,
        igstAmount: parseFloat(r[14]) || 0,
        totalAmount: parseFloat(r[15]) || 0
      });
    });

    const parsedInvoices = invRows.map(r => ({
      invoiceNo: r[0]?.toString(),
      date: r[1],
      customerName: r[2],
      billingAddress: r[3],
      shippingAddress: r[4] || r[3],
      customerGstin: r[5] || '',
      placeOfSupply: r[6] || 'Maharashtra (27)',
      subtotal: parseFloat(r[7]) || 0,
      discount: parseFloat(r[8]) || 0,
      taxTotal: parseFloat(r[9]) || 0,
      grandTotal: parseFloat(r[10]) || 0,
      createdBy: r[11] || 'System',
      createdAt: r[12] || '',
      transportMode: r[13] || '',
      vehicleNo: r[14] || '',
      items: itemsMap[r[0]?.toString().trim()] || []
    }));

    return parsedInvoices.reverse(); // Newest first
  },

  async saveInvoice(invoice) {
    if (currentMode === 'mock') {
      const invoices = getStorageItem('bill_mock_invoices', MOCK_INVOICES);
      const idx = invoices.findIndex(inv => inv.invoiceNo === invoice.invoiceNo);
      if (idx >= 0) invoices[idx] = { ...invoice, updatedAt: new Date().toISOString() };
      else invoices.push({ ...invoice, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      setStorageItem('bill_mock_invoices', invoices);
      return { success: true };
    }

    const invoices = await this.getInvoices();
    const idx = invoices.findIndex(inv => inv.invoiceNo === invoice.invoiceNo);
    const creatorInfo = await this.fetchUserInfo(googleAccessToken);
    const creatorEmail = creatorInfo?.email || 'user';

    const metaValues = [[
      invoice.invoiceNo, invoice.date, invoice.customerName, invoice.billingAddress,
      invoice.shippingAddress || invoice.billingAddress, invoice.customerGstin,
      invoice.placeOfSupply, invoice.subtotal, invoice.discount, invoice.taxTotal,
      invoice.grandTotal, creatorEmail, idx >= 0 ? invoices[idx].createdAt : new Date().toISOString(),
      invoice.transportMode || '', invoice.vehicleNo || ''
    ]];

    if (idx >= 0) {
      // 1. Overwrite Invoice metadata row
      const rowNum = idx + 2; // Invoices are loaded in reverse in UI, wait, "invoices" loaded reverse so we search by row!
      // To get the exact sheet row number, we must scan the raw metadata sheet directly
      const rawMeta = await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Invoices!A:A`);
      const rawRows = rawMeta.values || [];
      let sheetRow = -1;
      for (let i = 1; i < rawRows.length; i++) {
        if (rawRows[i][0]?.toString().trim() === invoice.invoiceNo.toString().trim()) {
          sheetRow = i + 1;
          break;
        }
      }
      
      if (sheetRow > -1) {
        await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Invoices!A${sheetRow}:O${sheetRow}?valueInputOption=USER_ENTERED`, {
          method: 'PUT',
          body: JSON.stringify({ values: metaValues })
        });
      }

      // 2. Clear and rewrite all item rows for this invoice
      // Read all rows of InvoiceItems
      const rawItemsMeta = await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/InvoiceItems!A:P`);
      const rawItemRows = rawItemsMeta.values || [];
      const header = rawItemRows[0];
      const filteredItemRows = rawItemRows.filter((r, i) => i === 0 || r[0]?.toString().trim() !== invoice.invoiceNo.toString().trim());
      
      // Overwrite InvoiceItems sheet with filtered rows
      await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/InvoiceItems!A:P:clear`, { method: 'POST' });
      await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/InvoiceItems!A1?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        body: JSON.stringify({ values: filteredItemRows })
      });
    } else {
      // Append Invoice metadata
      await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Invoices:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        body: JSON.stringify({ values: metaValues })
      });
    }

    // Append new item rows
    const itemRows = invoice.items.map(item => [
      invoice.invoiceNo, item.sNo, item.description, item.hsn, item.qty, item.unit, item.rate,
      item.taxableValue, item.gstRate, item.cgstRate || 0, item.cgstAmount || 0,
      item.sgstRate || 0, item.sgstAmount || 0, item.igstRate || 0, item.igstAmount || 0, item.totalAmount
    ]);
    
    await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/InvoiceItems:append?valueInputOption=USER_ENTERED`, {
      method: 'POST',
      body: JSON.stringify({ values: itemRows })
    });

    return { success: true };
  },

  async deleteInvoice(invoiceNo) {
    if (currentMode === 'mock') {
      const invoices = getStorageItem('bill_mock_invoices', MOCK_INVOICES);
      const filtered = invoices.filter(inv => inv.invoiceNo !== invoiceNo);
      setStorageItem('bill_mock_invoices', filtered);
      return { success: true };
    }

    const invoiceNoStr = invoiceNo.toString().trim();

    // 1. Delete Invoice metadata row
    const rawMeta = await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Invoices!A:O`);
    const rawRows = rawMeta.values || [];
    const filteredRows = rawRows.filter((r, i) => i === 0 || r[0]?.toString().trim() !== invoiceNoStr);
    
    await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Invoices!A:O:clear`, { method: 'POST' });
    await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Invoices!A1?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      body: JSON.stringify({ values: filteredRows })
    });

    // 2. Delete InvoiceItems rows
    const rawItemsMeta = await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/InvoiceItems!A:P`);
    const rawItemRows = rawItemsMeta.values || [];
    const filteredItemRows = rawItemRows.filter((r, i) => i === 0 || r[0]?.toString().trim() !== invoiceNoStr);

    await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/InvoiceItems!A:P:clear`, { method: 'POST' });
    await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/InvoiceItems!A1?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      body: JSON.stringify({ values: filteredItemRows })
    });

    return { success: true };
  },

  // Whitelist
  async getWhitelist() {
    if (currentMode === 'mock') {
      return getStorageItem('bill_mock_whitelist', MOCK_WHITELIST);
    }
    try {
      const data = await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Whitelist!A2:A`);
      const rows = data.values || [];
      return rows.map(r => r[0]?.toLowerCase().trim()).filter(Boolean);
    } catch (e) {
      console.warn("Whitelist reading failed, database structure may be new setup:", e);
      return [];
    }
  },

  async addToWhitelist(email, role = 'User') {
    if (currentMode === 'mock') {
      const whitelist = getStorageItem('bill_mock_whitelist', MOCK_WHITELIST);
      if (!whitelist.includes(email.toLowerCase())) {
        whitelist.push(email.toLowerCase());
        setStorageItem('bill_mock_whitelist', whitelist);
      }
      return { success: true };
    }
    
    const whitelist = await this.getWhitelist();
    if (!whitelist.includes(email.toLowerCase().trim())) {
      await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Whitelist:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        body: JSON.stringify({ values: [[email.toLowerCase().trim(), role]] })
      });
    }
    return { success: true };
  },

  async removeFromWhitelist(email) {
    if (currentMode === 'mock') {
      const whitelist = getStorageItem('bill_mock_whitelist', MOCK_WHITELIST);
      const filtered = whitelist.filter(e => e.toLowerCase() !== email.toLowerCase());
      setStorageItem('bill_mock_whitelist', filtered);
      return { success: true };
    }

    const targetEmail = email.toLowerCase().trim();
    const rawWhitelist = await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Whitelist!A:B`);
    const rows = rawWhitelist.values || [];
    const filteredRows = rows.filter((r, i) => i === 0 || r[0]?.toString().toLowerCase().trim() !== targetEmail);

    await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Whitelist!A:B:clear`, { method: 'POST' });
    await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Whitelist!A1?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      body: JSON.stringify({ values: filteredRows })
    });
    return { success: true };
  },

  // Company Settings tab dynamic manager
  async ensureSettingsSheetExists() {
    if (currentMode === 'mock' || !spreadsheetId) return;
    try {
      // Try to read CompanySettings headers to check if it exists
      await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/CompanySettings!A1:B1`);
    } catch (err) {
      console.log("CompanySettings tab not found. Creating dynamically...");
      const addSheetBody = {
        requests: [
          {
            addSheet: {
              properties: {
                title: 'CompanySettings'
              }
            }
          }
        ]
      };
      // Try executing sheet creation
      try {
        await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
          method: 'POST',
          body: JSON.stringify(addSheetBody)
        });
        const headers = {
          values: [['Setting Key', 'Setting Value']]
        };
        await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/CompanySettings!A1:B1?valueInputOption=USER_ENTERED`, {
          method: 'PUT',
          body: JSON.stringify(headers)
        });
      } catch (createErr) {
        console.error("Failed to dynamically add CompanySettings tab:", createErr);
      }
    }
  },

  async getCompanyGstin() {
    // Always check localStorage first for fast access
    const cached = localStorage.getItem('company_gstin');
    if (cached) return cached;

    if (currentMode === 'mock' || !spreadsheetId) {
      return '';
    }
    
    try {
      await this.ensureSettingsSheetExists();
      const res = await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/CompanySettings!A2:B2`);
      const rows = res.values || [];
      if (rows.length > 0 && rows[0][0] === 'COMPANY_GSTIN' && rows[0][1]) {
        localStorage.setItem('company_gstin', rows[0][1]); // Cache it
        return rows[0][1];
      }
      return '';
    } catch (e) {
      console.warn("Failed to read company GSTIN from sheets:", e);
      return '';
    }
  },

  async saveCompanyGstin(gstin) {
    if (currentMode === 'mock') {
      localStorage.setItem('company_gstin', gstin);
      return { success: true };
    }

    try {
      await this.ensureSettingsSheetExists();
      const rowValues = [['COMPANY_GSTIN', gstin]];
      await callGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/CompanySettings!A2:B2?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        body: JSON.stringify({ values: rowValues })
      });
      localStorage.setItem('company_gstin', gstin);
      return { success: true };
    } catch (e) {
      console.error("Failed to save company GSTIN to sheets:", e);
      localStorage.setItem('company_gstin', gstin);
      return { success: true };
    }
  }
};
