import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Trash2, Edit, Printer, Save, Settings, User, LogIn, LogOut, 
  Sun, Moon, Database, Users, PlusCircle, CheckCircle, RefreshCw, 
  Sparkles, FileText, ChevronRight, X, AlertCircle, FilePlus, Download,
  ChevronDown
} from 'lucide-react';
import { api } from './api';

// Default empty invoice template
const EMPTY_INVOICE = {
  invoiceNo: '',
  date: new Date().toISOString().split('T')[0],
  customerName: '',
  billingAddress: '',
  shippingAddress: '',
  customerGstin: '',
  placeOfSupply: 'Maharashtra (27)',
  items: [
    { sNo: 1, description: '', hsn: '', qty: 1, unit: 'Pcs', rate: 0, gstRate: 18 }
  ],
  discount: 0,
  terms: [
    'Goods once sold will not be taken back.',
    'Subject to local jurisdiction.'
  ]
};

export default function App() {
  // Theme & Mode Settings
  const [theme, setTheme] = useState(localStorage.getItem('bill_theme') || 'light');
  const [mode, setMode] = useState(api.getMode());
  const [googleClientId, setGoogleClientId] = useState(api.getGoogleClientId());
  const [spreadsheetId, setSpreadsheetId] = useState(api.getSpreadsheetId() || '');
  const [printSize, setPrintSize] = useState('a4');

  // Auth State
  const [user, setUser] = useState(null);
  const [authEmailInput, setAuthEmailInput] = useState('');
  const [isVerifyingAuth, setIsVerifyingAuth] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(true);

  // App States
  const [activeTab, setActiveTab] = useState('dashboard');
  const [invoices, setInvoices] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [whitelist, setWhitelist] = useState([]);
  const [statusMessage, setStatusMessage] = useState(null);

  // Form State
  const [invoiceForm, setInvoiceForm] = useState({ ...EMPTY_INVOICE });
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Auto-complete Helper States
  const [productSearchIndex, setProductSearchIndex] = useState(-1);
  const [activeProductSearchRow, setActiveProductSearchRow] = useState(null);
  const [customerSearchDropdown, setCustomerSearchDropdown] = useState(false);

  // Whitelist/Settings States
  const [newWhitelistEmail, setNewWhitelistEmail] = useState('');
  const [newProductForm, setNewProductForm] = useState({ name: '', hsn: '', unit: 'Pcs', rate: 0, gstRate: 18 });
  const [newCustomerForm, setNewCustomerForm] = useState({ name: '', address: '', gstin: '', state: 'Maharashtra', stateCode: '27' });

  // Refs for Print
  const printRef = useRef(null);

  // Synchronize Theme & Mode
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('bill_theme', theme);
  }, [theme]);

  // Restore Persisted Session on Startup (Google OAuth persistence)
  useEffect(() => {
    const restoreSession = async () => {
      setIsRestoringSession(true);
      try {
        if (mode === 'mock') {
          const session = localStorage.getItem('bill_mock_session');
          if (session) {
            setUser(JSON.parse(session));
          } else {
            const defaultSession = { email: 'admin@example.com', role: 'Admin' };
            setUser(defaultSession);
            localStorage.setItem('bill_mock_session', JSON.stringify(defaultSession));
          }
        } else {
          // Try restoring a saved Google OAuth session
          const savedUser = api.getSession();
          if (savedUser && savedUser.email) {
            // Token is still valid — restore user state
            const savedSpreadsheet = api.getSpreadsheetId();
            if (savedSpreadsheet) {
              setSpreadsheetId(savedSpreadsheet);
            }
            // Verify the user is still whitelisted
            try {
              const session = await api.verifyUser(savedUser.email);
              setUser({ ...savedUser, ...session });
            } catch {
              // Verification failed (token expired, sheet deleted, etc.)
              setUser(savedUser); // Still show the restored user; API errors will trigger re-login
            }
          }
        }
      } catch (err) {
        console.warn('Session restore failed:', err);
      } finally {
        setIsRestoringSession(false);
      }
    };
    restoreSession();
  }, [mode]);

  // Load data when user changes
  useEffect(() => {
    if (user) {
      loadAllData();
    } else {
      setInvoices([]);
      setProducts([]);
      setCustomers([]);
      setWhitelist([]);
    }
  }, [user, mode]);

  // Auto-generate invoice number based on history
  useEffect(() => {
    if (invoices.length > 0 && !isEditing && !invoiceForm.invoiceNo) {
      // Find highest numeric invoice number
      const numbers = invoices.map(inv => parseInt(inv.invoiceNo, 10)).filter(n => !isNaN(n));
      const nextNo = numbers.length > 0 ? Math.max(...numbers) + 1 : invoices.length + 1;
      const formattedNo = nextNo.toString().padStart(2, '0');
      setInvoiceForm(prev => ({ ...prev, invoiceNo: formattedNo }));
    } else if (invoices.length === 0 && !isEditing && !invoiceForm.invoiceNo) {
      setInvoiceForm(prev => ({ ...prev, invoiceNo: '01' }));
    }
  }, [invoices, isEditing, invoiceForm.invoiceNo]);

  // Duplicate prompts and OAuth Flow States
  const [duplicateSheets, setDuplicateSheets] = useState([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [authTempToken, setAuthTempToken] = useState(null);

  const showStatus = (text, type = 'success') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const loadAllData = async () => {
    try {
      const [prods, custs, invs, wl] = await Promise.all([
        api.getProducts(),
        api.getCustomers(),
        api.getInvoices(),
        api.getWhitelist()
      ]);
      
      setProducts(prods);
      setCustomers(custs);
      setInvoices(invs);
      setWhitelist(wl);
    } catch (err) {
      // Handle session expiry gracefully
      if (err.message.includes('Session expired')) {
        setUser(null);
        api.clearSession();
      }
      showStatus(err.message, 'danger');
    }
  };

  // Auth Handling
  const handleSimulatedLogin = async (e) => {
    e.preventDefault();
    if (!authEmailInput.trim()) return;
    setIsVerifyingAuth(true);
    try {
      const session = await api.verifyUser(authEmailInput.trim());
      setUser(session);
      localStorage.setItem('bill_mock_session', JSON.stringify(session));
      showStatus(`Simulated Login successful as ${session.email}`);
    } catch (err) {
      showStatus(err.message, 'danger');
    } finally {
      setIsVerifyingAuth(false);
    }
  };

  const handleGoogleLogin = () => {
    setIsVerifyingAuth(true);
    try {
      /* global google */
      if (!window.google) {
        throw new Error('Google Identity Services script not loaded. Please check your internet connection.');
      }
      
      const client = google.accounts.oauth2.initTokenClient({
        client_id: googleClientId || api.getGoogleClientId(),
        scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file email profile openid',
        callback: async (tokenResponse) => {
          if (tokenResponse.error !== undefined) {
            setIsVerifyingAuth(false);
            showStatus(tokenResponse.error_description || 'OAuth authorization failed', 'danger');
            return;
          }
          // Pass expiresIn from the token response for accurate session expiry tracking
          const expiresIn = tokenResponse.expires_in ? parseInt(tokenResponse.expires_in, 10) : 3600;
          api.setGoogleToken(tokenResponse.access_token, expiresIn);
          await handleAuthSuccess(tokenResponse.access_token);
        }
      });
      client.requestAccessToken();
    } catch (err) {
      setIsVerifyingAuth(false);
      showStatus(err.message, 'danger');
    }
  };

  const handleAuthSuccess = async (accessToken) => {
    setIsVerifyingAuth(true);
    try {
      // Fetch User Info and persist it for session restoration
      const userInfo = await api.fetchUserInfo(accessToken);
      api.saveUserSession(userInfo);
      
      // Search for database sheets in Drive
      showStatus('Scanning Google Drive for existing databases...');
      const sheets = await api.searchDatabases();
      
      if (sheets.length === 0) {
        // Run first time setup
        showStatus('Creating database and initializing sheets...');
        const newSheetId = await api.createNewDatabase();
        api.setSpreadsheetId(newSheetId);
        setSpreadsheetId(newSheetId);
        
        const session = await api.verifyUser(userInfo.email);
        const fullUser = { ...userInfo, ...session };
        setUser(fullUser);
        showStatus('Setup completed! New database created in your Google Drive.');
      } else if (sheets.length === 1) {
        // Connect to the single existing database
        const sheet = sheets[0];
        api.setSpreadsheetId(sheet.id);
        setSpreadsheetId(sheet.id);
        
        const session = await api.verifyUser(userInfo.email);
        const fullUser = { ...userInfo, ...session };
        setUser(fullUser);
        showStatus(`Connected successfully! Database: ${sheet.name}`);
      } else {
        // Duplicate files found! Prompt the user
        setDuplicateSheets(sheets);
        setAuthTempToken({ accessToken, email: userInfo.email, userInfo });
        setShowDuplicateModal(true);
        setIsVerifyingAuth(false);
      }
    } catch (err) {
      showStatus(err.message, 'danger');
      setUser(null);
      api.clearSession();
    } finally {
      if (!showDuplicateModal) {
        setIsVerifyingAuth(false);
      }
    }
  };

  const handleSelectDuplicateSheet = async (sheetId, name) => {
    setShowDuplicateModal(false);
    setIsVerifyingAuth(true);
    try {
      api.setSpreadsheetId(sheetId);
      setSpreadsheetId(sheetId);
      const session = await api.verifyUser(authTempToken.email);
      setUser(session);
      showStatus(`Connected successfully to database: ${name}`);
    } catch (err) {
      showStatus(err.message, 'danger');
      setUser(null);
    } finally {
      setIsVerifyingAuth(false);
      setAuthTempToken(null);
    }
  };

  const handleCreateNewFromDuplicate = async () => {
    setShowDuplicateModal(false);
    setIsVerifyingAuth(true);
    try {
      showStatus('Provisioning new database instance...');
      const newSheetId = await api.createNewDatabase();
      api.setSpreadsheetId(newSheetId);
      setSpreadsheetId(newSheetId);
      
      const session = await api.verifyUser(authTempToken.email);
      setUser(session);
      showStatus('Created and connected to new database!');
    } catch (err) {
      showStatus(err.message, 'danger');
      setUser(null);
    } finally {
      setIsVerifyingAuth(false);
      setAuthTempToken(null);
    }
  };

  const handleLogout = () => {
    setUser(null);
    api.clearSession();
    localStorage.removeItem('bill_mock_session');
    setSpreadsheetId('');
    setInvoices([]);
    setProducts([]);
    setCustomers([]);
    setWhitelist([]);
    showStatus('Logged out successfully');
  };

  // Connection settings update
  const handleSaveConnection = (e) => {
    e.preventDefault();
    api.setGoogleClientId(googleClientId);
    showStatus('Connection settings updated. App reloaded in ' + mode + ' mode.');
    window.location.reload();
  };

  // Invoice calculations
  const calculateInvoiceMetrics = (form) => {
    const isInterstate = !form.placeOfSupply.includes('(27)') && !form.placeOfSupply.toLowerCase().includes('maharashtra');
    
    let subtotal = 0;
    const itemsWithCalculations = form.items.map(item => {
      const taxableValue = Math.round((item.qty * item.rate) * 100) / 100;
      subtotal += taxableValue;

      const totalTaxRate = item.gstRate || 0;
      const totalTaxAmount = Math.round((taxableValue * (totalTaxRate / 100)) * 100) / 100;
      
      let cgstRate = 0, cgstAmount = 0;
      let sgstRate = 0, sgstAmount = 0;
      let igstRate = 0, igstAmount = 0;

      if (isInterstate) {
        igstRate = totalTaxRate;
        igstAmount = totalTaxAmount;
      } else {
        cgstRate = totalTaxRate / 2;
        cgstAmount = Math.round((totalTaxAmount / 2) * 100) / 100;
        sgstRate = totalTaxRate / 2;
        sgstAmount = Math.round((totalTaxAmount / 2) * 100) / 100;
      }

      return {
        ...item,
        taxableValue,
        cgstRate,
        cgstAmount,
        sgstRate,
        sgstAmount,
        igstRate,
        igstAmount,
        totalTaxAmount,
        totalAmount: taxableValue + totalTaxAmount
      };
    });

    const subtotalRounded = Math.round(subtotal * 100) / 100;
    const discount = parseFloat(form.discount) || 0;
    const taxableAfterDiscount = Math.max(0, subtotalRounded - discount);
    
    // Distribute discount proportionally to recalculate actual taxes
    let cgstTotal = 0;
    let sgstTotal = 0;
    let igstTotal = 0;

    const itemsFinal = itemsWithCalculations.map(item => {
      const itemRatio = subtotalRounded > 0 ? (item.taxableValue / subtotalRounded) : 0;
      const itemDiscount = discount * itemRatio;
      const finalTaxable = Math.max(0, item.taxableValue - itemDiscount);
      
      const finalTaxAmount = Math.round((finalTaxable * (item.gstRate / 100)) * 100) / 100;
      let cgst = 0, sgst = 0, igst = 0;

      if (isInterstate) {
        igst = finalTaxAmount;
        igstTotal += igst;
      } else {
        cgst = Math.round((finalTaxAmount / 2) * 100) / 100;
        sgst = Math.round((finalTaxAmount / 2) * 100) / 100;
        cgstTotal += cgst;
        sgstTotal += sgst;
      }

      return {
        ...item,
        discountedTaxableValue: Math.round(finalTaxable * 100) / 100,
        cgstAmount: cgst,
        sgstAmount: sgst,
        igstAmount: igst,
        totalTaxAmount: finalTaxAmount,
        totalAmount: Math.round((finalTaxable + finalTaxAmount) * 100) / 100
      };
    });

    const taxTotal = cgstTotal + sgstTotal + igstTotal;
    const grandTotal = Math.round((taxableAfterDiscount + taxTotal));

    return {
      items: itemsFinal,
      subtotal: subtotalRounded,
      discount,
      cgstTotal: Math.round(cgstTotal * 100) / 100,
      sgstTotal: Math.round(sgstTotal * 100) / 100,
      igstTotal: Math.round(igstTotal * 100) / 100,
      taxTotal: Math.round(taxTotal * 100) / 100,
      grandTotal: Math.round(grandTotal)
    };
  };

  const calculatedInvoice = calculateInvoiceMetrics(invoiceForm);

  // Form Handlers
  const handleFormChange = (field, val) => {
    setInvoiceForm(prev => ({ ...prev, [field]: val }));
  };

  const handleItemChange = (index, field, val) => {
    const newItems = [...invoiceForm.items];
    newItems[index] = { ...newItems[index], [field]: val };
    setInvoiceForm(prev => ({ ...prev, items: newItems }));
  };

  const addItemRow = () => {
    setInvoiceForm(prev => ({
      ...prev,
      items: [
        ...prev.items,
        { sNo: prev.items.length + 1, description: '', hsn: '', qty: 1, unit: 'Pcs', rate: 0, gstRate: 18 }
      ]
    }));
  };

  const removeItemRow = (index) => {
    if (invoiceForm.items.length === 1) return;
    const newItems = invoiceForm.items
      .filter((_, i) => i !== index)
      .map((item, i) => ({ ...item, sNo: i + 1 }));
    setInvoiceForm(prev => ({ ...prev, items: newItems }));
  };

  // Product Auto-complete Search
  const handleProductSearch = (index, searchStr) => {
    handleItemChange(index, 'description', searchStr);
    setActiveProductSearchRow(index);
    setProductSearchIndex(0);
  };

  const selectProduct = (rowIndex, prod) => {
    const newItems = [...invoiceForm.items];
    newItems[rowIndex] = {
      ...newItems[rowIndex],
      description: prod.name,
      hsn: prod.hsn || '',
      unit: prod.unit || 'Pcs',
      rate: prod.rate || 0,
      gstRate: prod.gstRate || 18
    };
    setInvoiceForm(prev => ({ ...prev, items: newItems }));
    setActiveProductSearchRow(null);
  };

  // Customer Auto-complete Selection
  const selectCustomer = (cust) => {
    setInvoiceForm(prev => ({
      ...prev,
      customerName: cust.name,
      billingAddress: cust.address,
      shippingAddress: cust.address, // Default shipping same as billing
      customerGstin: cust.gstin,
      placeOfSupply: cust.state ? `${cust.state} (${cust.stateCode || ''})` : prev.placeOfSupply
    }));
    setCustomerSearchDropdown(false);
  };

  // Actions
  const handleSaveInvoice = async () => {
    // 1. Basic required fields validation
    if (!invoiceForm.invoiceNo || !invoiceForm.customerName) {
      showStatus('Invoice Number and Customer Name are required!', 'danger');
      return;
    }
    if (!invoiceForm.billingAddress || !invoiceForm.billingAddress.trim()) {
      showStatus('Billing Address is required!', 'danger');
      return;
    }
    if (!invoiceForm.placeOfSupply) {
      showStatus('Place of Supply is required!', 'danger');
      return;
    }

    // 2. GSTIN Format validation
    if (invoiceForm.customerGstin && invoiceForm.customerGstin.trim().length !== 15) {
      showStatus('GSTIN must be exactly 15 characters (e.g., 27AAAAA1111A1Z1)!', 'danger');
      return;
    }

    // 3. Items validation
    const validItems = invoiceForm.items.filter(item => item.description && item.description.trim() !== '');
    if (validItems.length === 0) {
      showStatus('At least one item with a valid description is required!', 'danger');
      return;
    }
    for (const item of validItems) {
      if (item.qty <= 0) {
        showStatus(`Quantity for "${item.description}" must be greater than 0!`, 'danger');
        return;
      }
      if (item.rate < 0) {
        showStatus(`Rate for "${item.description}" cannot be negative!`, 'danger');
        return;
      }
    }

    setIsSaving(true);
    try {
      // 4. Auto-save New Customer to Catalog database if they don't exist
      const existingCust = customers.find(c => c.name.trim().toLowerCase() === invoiceForm.customerName.trim().toLowerCase());
      if (!existingCust) {
        showStatus(`Adding new customer "${invoiceForm.customerName}" to catalog database...`);
        await api.saveCustomer({
          name: invoiceForm.customerName.trim(),
          address: invoiceForm.billingAddress.trim(),
          gstin: invoiceForm.customerGstin.trim(),
          state: invoiceForm.placeOfSupply.split(' (')[0],
          stateCode: invoiceForm.placeOfSupply.includes('(') ? invoiceForm.placeOfSupply.split('(')[1].replace(')', '') : '27'
        });
      }

      const payload = {
        ...invoiceForm,
        items: validItems, // save only valid items
        ...calculatedInvoice
      };

      const res = await api.saveInvoice(payload);
      if (res.success) {
        showStatus(`Invoice #${payload.invoiceNo} saved successfully!`);
        setIsEditing(false);
        // Clear form and reload invoices
        setInvoiceForm({ ...EMPTY_INVOICE });
        loadAllData();
      }
    } catch (err) {
      showStatus(err.message, 'danger');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditInvoice = (invoice) => {
    setInvoiceForm({
      invoiceNo: invoice.invoiceNo,
      date: invoice.date,
      customerName: invoice.customerName,
      billingAddress: invoice.billingAddress,
      shippingAddress: invoice.shippingAddress || invoice.billingAddress,
      customerGstin: invoice.customerGstin || '',
      placeOfSupply: invoice.placeOfSupply || 'Maharashtra (27)',
      items: invoice.items.map(item => ({
        sNo: item.sNo,
        description: item.description,
        hsn: item.hsn || '',
        qty: parseFloat(item.qty),
        unit: item.unit || 'Pcs',
        rate: parseFloat(item.rate),
        gstRate: parseFloat(item.gstRate) || 18
      })),
      discount: invoice.discount || 0,
      terms: invoice.terms || [
        'Goods once sold will not be taken back.',
        'Subject to local jurisdiction.'
      ]
    });
    setIsEditing(true);
    setActiveTab('dashboard');
  };

  const handleDeleteInvoice = async (invoiceNo) => {
    if (!window.confirm(`Are you sure you want to delete Invoice #${invoiceNo}?`)) return;
    try {
      const res = await api.deleteInvoice(invoiceNo);
      if (res.success) {
        showStatus(`Invoice #${invoiceNo} deleted successfully.`);
        loadAllData();
      }
    } catch (err) {
      showStatus(err.message, 'danger');
    }
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!newProductForm.name || !newProductForm.rate) return;
    try {
      const res = await api.saveProduct(newProductForm);
      if (res.success) {
        showStatus(`Product ${newProductForm.name} saved!`);
        setNewProductForm({ name: '', hsn: '', unit: 'Pcs', rate: 0, gstRate: 18 });
        loadAllData();
      }
    } catch (err) {
      showStatus(err.message, 'danger');
    }
  };

  const handleAddCustomer = async (e) => {
    e.preventDefault();
    if (!newCustomerForm.name) return;
    try {
      const res = await api.saveCustomer(newCustomerForm);
      if (res.success) {
        showStatus(`Customer ${newCustomerForm.name} saved!`);
        setNewCustomerForm({ name: '', address: '', gstin: '', state: 'Maharashtra', stateCode: '27' });
        loadAllData();
      }
    } catch (err) {
      showStatus(err.message, 'danger');
    }
  };

  const handleAddWhitelist = async (e) => {
    e.preventDefault();
    if (!newWhitelistEmail.trim()) return;
    try {
      const res = await api.addToWhitelist(newWhitelistEmail.trim());
      if (res.success) {
        showStatus(`Added ${newWhitelistEmail} to whitelist`);
        setNewWhitelistEmail('');
        loadAllData();
      }
    } catch (err) {
      showStatus(err.message, 'danger');
    }
  };

  const handleRemoveWhitelist = async (email) => {
    try {
      const res = await api.removeFromWhitelist(email);
      if (res.success) {
        showStatus(`Removed ${email} from whitelist`);
        loadAllData();
      }
    } catch (err) {
      showStatus(err.message, 'danger');
    }
  };

  const triggerPrint = () => {
    window.print();
  };

  // Helper to filter products on type
  const getFilteredProducts = (searchStr) => {
    if (!searchStr) return [];
    return products.filter(p => p.name.toLowerCase().includes(searchStr.toLowerCase()));
  };

  return (
    <div className="app-container">
      {/* Dynamic Alert Banner */}
      {statusMessage && (
        <div className={`toast fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-xl text-white font-semibold transition-all duration-300 transform scale-100 ${
          statusMessage.type === 'danger' ? 'bg-rose-500' : 'bg-emerald-500'
        }`}>
          {statusMessage.type === 'danger' ? <AlertCircle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Header (Hidden on Print) */}
      <header className="app-header glass-panel no-print">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-xl shadow-lg">
            S
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Sanmati Sales</h1>
            <p className="text-xs text-slate-400 font-medium">Professional Bill Generator</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-4">
          {/* Mode Badge */}
          <button 
            onClick={() => {
              const nextMode = mode === 'mock' ? 'live' : 'mock';
              api.setMode(nextMode);
              setMode(nextMode);
              showStatus(`Switched to ${nextMode} mode. App refreshed.`);
            }} 
            className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors flex items-center gap-1.5 ${
              mode === 'live' 
                ? 'bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800' 
                : 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Mode: {mode.toUpperCase()}</span>
          </button>

          {/* Theme Toggle */}
          <button 
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {theme === 'light' ? <Moon className="w-5 h-5 text-slate-600" /> : <Sun className="w-5 h-5 text-slate-300" />}
          </button>

          {/* User Section */}
          {user ? (
            <div className="flex items-center gap-3 pl-3 border-l border-slate-200 dark:border-slate-800">
              <div className="text-right">
                <p className="text-xs font-semibold text-slate-400">Logged in as</p>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{user.email}</p>
              </div>
              <button 
                onClick={handleLogout}
                className="p-2 rounded-full text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 transition-colors"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <span className="text-sm text-slate-400 font-semibold flex items-center gap-1.5">
              <User className="w-4 h-4" /> Guest Mode
            </span>
          )}
        </div>
      </header>

      {/* Main Layout Container */}
      {isRestoringSession ? (
        /* Session Restoration Loading Spinner */
        <div className="flex-1 flex items-center justify-center p-6 no-print">
          <div className="text-center animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-3xl shadow-xl mx-auto mb-6 animate-pulse">
              S
            </div>
            <h2 className="text-lg font-bold tracking-tight mb-2">Restoring Session...</h2>
            <p className="text-slate-400 text-sm flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> Checking authentication
            </p>
          </div>
        </div>
      ) : !user ? (
        /* Login Screen if unauthorized */
        <div className="flex-1 flex items-center justify-center p-6 no-print">
          <div className="w-full max-w-md glass-panel p-8 animate-fade-in text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-3xl shadow-xl mx-auto mb-6">
              S
            </div>
            <h2 className="text-2xl font-bold tracking-tight mb-2">Sanmati Sales Billing</h2>
            <p className="text-slate-500 text-sm mb-6">
              Authorized personnel only. Please sign in to access the invoice engine.
            </p>

            {mode === 'mock' ? (
              <form onSubmit={handleSimulatedLogin} className="space-y-4 text-left">
                <div className="form-group">
                  <label className="form-label">Gmail Address (Mock Authentication)</label>
                  <input 
                    type="email" 
                    className="form-input" 
                    placeholder="Enter email to simulate login..."
                    value={authEmailInput}
                    onChange={e => setAuthEmailInput(e.target.value)}
                    required
                  />
                  <p className="text-[11px] text-amber-600 font-medium mt-1">
                    * Mock mode will auto-authorize any email for testing. Default whitelisted emails: <code>admin@example.com</code>, <code>billing@example.com</code>
                  </p>
                </div>
                <button 
                  type="submit" 
                  disabled={isVerifyingAuth}
                  className="w-full btn btn-primary flex justify-center py-2.5"
                >
                  {isVerifyingAuth ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'Simulate Google Sign-In'}
                </button>
              </form>
            ) : (
              <div className="space-y-4">
                {googleClientId ? (
                  <div className="flex flex-col items-center justify-center">
                    <button 
                      onClick={handleGoogleLogin}
                      disabled={isVerifyingAuth}
                      className="w-full btn btn-primary flex justify-center py-3 text-sm shadow-lg hover:shadow-indigo-500/10 relative"
                    >
                      {isVerifyingAuth ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      ) : (
                        <span className="flex items-center gap-2">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#ffffff"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#ffffff"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#ffffff"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#ffffff"/>
                          </svg>
                          <span>Sign in with Google</span>
                        </span>
                      )}
                    </button>
                    <p className="text-[11px] text-slate-400 font-medium mt-3">
                      Authentication uses Google Sheets REST API directly inside your browser.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 bg-rose-50 dark:bg-rose-950 rounded-lg text-rose-600 dark:text-rose-300 text-sm font-medium flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 flex-shrink-0" />
                      <span>Google Client ID is not configured!</span>
                    </div>
                    <button 
                      onClick={() => setMode('mock')}
                      className="mt-2 text-xs font-bold underline text-left hover:text-rose-800"
                    >
                      Switch to Mock Mode to test without config
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      ) : (
        /* Authenticated Dashboard Workspace */
        <div className="flex-1 flex flex-col md:flex-row app-content gap-6">
          
          {/* Sidebar Tab Navigation (Hidden on Print) */}
          <nav className="w-full md:w-64 flex-shrink-0 flex flex-row md:flex-col gap-1.5 no-print overflow-x-auto md:overflow-visible pb-2 md:pb-0">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`flex-1 md:flex-initial flex items-center gap-2.5 px-4 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${
                activeTab === 'dashboard' 
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg' 
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              <FilePlus className="w-5 h-5" />
              <span>Generate Invoice</span>
            </button>
            <button 
              onClick={() => setActiveTab('invoices')}
              className={`flex-1 md:flex-initial flex items-center gap-2.5 px-4 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${
                activeTab === 'invoices' 
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg' 
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              <FileText className="w-5 h-5" />
              <span>Invoices History</span>
            </button>
            <button 
              onClick={() => setActiveTab('products')}
              className={`flex-1 md:flex-initial flex items-center gap-2.5 px-4 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${
                activeTab === 'products' 
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg' 
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              <Database className="w-5 h-5" />
              <span>Products List</span>
            </button>
            <button 
              onClick={() => setActiveTab('customers')}
              className={`flex-1 md:flex-initial flex items-center gap-2.5 px-4 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${
                activeTab === 'customers' 
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg' 
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              <Users className="w-5 h-5" />
              <span>Customers Db</span>
            </button>
            <button 
              onClick={() => setActiveTab('settings')}
              className={`flex-1 md:flex-initial flex items-center gap-2.5 px-4 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${
                activeTab === 'settings' 
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg' 
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              <Settings className="w-5 h-5" />
              <span>Access & System</span>
            </button>
          </nav>

          {/* Main workspace panels */}
          <div className="flex-1 flex flex-col min-w-0">
            {activeTab === 'dashboard' && (
              /* Generate / Edit Invoice Form side-by-side with Preview */
              <div className="flex-1 grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                
                {/* Form column (5 columns out of 12) */}
                <div className="xl:col-span-5 glass-panel p-6 space-y-6">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                    <h2 className="text-lg font-bold flex items-center gap-1.5">
                      <Sparkles className="w-5 h-5 text-indigo-500" />
                      {isEditing ? `Edit Invoice #${invoiceForm.invoiceNo}` : 'New Invoice'}
                    </h2>
                    {isEditing && (
                      <button 
                        onClick={() => {
                          setIsEditing(false);
                          setInvoiceForm({ ...EMPTY_INVOICE });
                        }}
                        className="text-xs text-rose-500 font-bold hover:underline"
                      >
                        Cancel Edit
                      </button>
                    )}
                  </div>

                  {/* Customer Block */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Customer Details</h3>
                    <div className="grid grid-cols-1 gap-3 relative">
                      <div className="form-group mb-0">
                        <label className="form-label">Customer Search / Name</label>
                        <div className="relative">
                          <input 
                            type="text" 
                            className="form-input pr-8"
                            placeholder="Type customer name..."
                            value={invoiceForm.customerName}
                            onChange={e => {
                              handleFormChange('customerName', e.target.value);
                              setCustomerSearchDropdown(true);
                            }}
                            onFocus={() => setCustomerSearchDropdown(true)}
                          />
                          <button 
                            type="button"
                            onClick={() => {
                              if (invoiceForm.customerName) {
                                handleFormChange('customerName', '');
                                handleFormChange('billingAddress', '');
                                handleFormChange('shippingAddress', '');
                                handleFormChange('customerGstin', '');
                              } else {
                                setCustomerSearchDropdown(!customerSearchDropdown);
                              }
                            }}
                            className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600"
                          >
                            {invoiceForm.customerName ? <X className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                        {/* Auto-complete Dropdown */}
                        {customerSearchDropdown && (
                          <div className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto glass-panel p-1 shadow-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                            <div className="flex justify-between items-center px-2 py-1.5 border-b border-slate-100 dark:border-slate-800 mb-1">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">Select Customer</span>
                              <button onClick={() => setCustomerSearchDropdown(false)} className="text-[10px] text-indigo-500 hover:underline">Close</button>
                            </div>
                            {customers
                              .filter(c => c.name.toLowerCase().includes(invoiceForm.customerName.toLowerCase()))
                              .map(c => (
                                <button
                                  key={c.name}
                                  onClick={() => selectCustomer(c)}
                                  className="w-full text-left px-2 py-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors"
                                >
                                  {c.name} ({c.stateCode})
                                </button>
                              ))
                            }
                            {customers.filter(c => c.name.toLowerCase().includes(invoiceForm.customerName.toLowerCase())).length === 0 && (
                              <div className="text-center py-3 text-xs text-slate-400 font-medium">No customers found. Enter custom details.</div>
                            )}
                          </div>
                        )}
                      </div>
                      
                      <div className="form-group mb-0">
                        <label className="form-label">Billing Address</label>
                        <textarea 
                          rows="2"
                          className="form-input py-2"
                          placeholder="Full billing address..."
                          value={invoiceForm.billingAddress}
                          onChange={e => handleFormChange('billingAddress', e.target.value)}
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div className="form-group mb-0">
                          <label className="form-label">GSTIN</label>
                          <input 
                            type="text" 
                            className="form-input py-2 font-mono uppercase"
                            placeholder="GSTIN (optional)..."
                            value={invoiceForm.customerGstin}
                            onChange={e => handleFormChange('customerGstin', e.target.value.toUpperCase())}
                          />
                        </div>
                        <div className="form-group mb-0">
                          <label className="form-label">Place of Supply</label>
                          <select 
                            className="form-input py-2"
                            value={invoiceForm.placeOfSupply}
                            onChange={e => handleFormChange('placeOfSupply', e.target.value)}
                          >
                            <option value="Maharashtra (27)">Maharashtra (27)</option>
                            <option value="Karnataka (29)">Karnataka (29)</option>
                            <option value="Gujarat (24)">Gujarat (24)</option>
                            <option value="Delhi (07)">Delhi (07)</option>
                            <option value="Tamil Nadu (33)">Tamil Nadu (33)</option>
                            <option value="Other Interstate (99)">Other Interstate (99)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Invoice Meta Block */}
                  <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Invoice Meta</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="form-group mb-0">
                        <label className="form-label">Invoice Number</label>
                        <input 
                          type="text" 
                          className="form-input py-2 font-semibold"
                          placeholder="e.g. 03"
                          value={invoiceForm.invoiceNo}
                          onChange={e => handleFormChange('invoiceNo', e.target.value)}
                        />
                      </div>
                      <div className="form-group mb-0">
                        <label className="form-label">Date</label>
                        <input 
                          type="date" 
                          className="form-input py-2"
                          value={invoiceForm.date}
                          onChange={e => handleFormChange('date', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Items Grid Editor */}
                  <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex justify-between items-center">
                      <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Items Table</h3>
                      <button 
                        onClick={addItemRow}
                        className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:hover:bg-indigo-900 rounded-lg text-xs font-bold flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Row
                      </button>
                    </div>

                    <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                      {invoiceForm.items.map((item, idx) => (
                        <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-xl relative space-y-3">
                          
                          {/* Row Header delete button */}
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-slate-400"># {item.sNo}</span>
                            {invoiceForm.items.length > 1 && (
                              <button 
                                onClick={() => removeItemRow(idx)}
                                className="text-rose-500 hover:text-rose-600 p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/30"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>

                          {/* Product Search & HSN */}
                          <div className="grid grid-cols-12 gap-2 relative">
                            <div className="col-span-8 relative">
                              <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Item Description</label>
                              <input 
                                type="text"
                                className="form-input pr-8 py-1.5 px-2 text-xs font-semibold"
                                placeholder="Search or select description..."
                                value={item.description}
                                onChange={e => handleProductSearch(idx, e.target.value)}
                                onFocus={() => setActiveProductSearchRow(idx)}
                              />

                              {/* Product Autocomplete Dropdown */}
                              {activeProductSearchRow === idx && (
                                <div className="absolute left-0 right-0 z-50 mt-1 max-h-40 overflow-y-auto glass-panel p-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                                  <div className="flex justify-between items-center px-2 py-1 border-b border-slate-100 dark:border-slate-800 mb-1">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase">Select Product</span>
                                    <button 
                                      type="button"
                                      onClick={() => setActiveProductSearchRow(null)} 
                                      className="text-[9px] text-indigo-500 hover:underline font-bold"
                                    >
                                      Close
                                    </button>
                                  </div>
                                  {(item.description ? getFilteredProducts(item.description) : products).map(prod => (
                                    <button
                                      type="button"
                                      key={prod.name}
                                      onClick={() => selectProduct(idx, prod)}
                                      className="w-full text-left px-2 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors"
                                    >
                                      {prod.name} - ₹{prod.rate} ({prod.unit})
                                    </button>
                                  ))}
                                  {(item.description ? getFilteredProducts(item.description) : products).length === 0 && (
                                    <div className="text-center py-2 text-xs text-slate-400 font-medium">New product. Enter manually.</div>
                                  )}
                                </div>
                              )}
                            </div>

                            <div className="col-span-4">
                              <label className="text-[10px] font-bold text-slate-400 block mb-0.5">HSN Code</label>
                              <input 
                                type="text"
                                className="form-input py-1.5 px-2 text-xs font-mono"
                                placeholder="HSN..."
                                value={item.hsn}
                                onChange={e => handleItemChange(idx, 'hsn', e.target.value)}
                              />
                            </div>
                          </div>

                          {/* Qty, Unit, Rate, GST */}
                          <div className="grid grid-cols-4 gap-2">
                            <div>
                              <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Qty</label>
                              <input 
                                type="number"
                                step="any"
                                className="form-input py-1.5 px-2 text-xs"
                                value={item.qty}
                                onChange={e => handleItemChange(idx, 'qty', parseFloat(e.target.value) || 0)}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Unit</label>
                              <select 
                                className="form-input py-1.5 px-2 text-xs"
                                value={item.unit}
                                onChange={e => handleItemChange(idx, 'unit', e.target.value)}
                              >
                                <option value="Pcs">Pcs</option>
                                <option value="Mtr">Mtr</option>
                                <option value="Box">Box</option>
                                <option value="Kg">Kg</option>
                                <option value="Dzn">Dzn</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Rate (₹)</label>
                              <input 
                                type="number"
                                step="any"
                                className="form-input py-1.5 px-2 text-xs"
                                value={item.rate}
                                onChange={e => handleItemChange(idx, 'rate', parseFloat(e.target.value) || 0)}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-slate-400 block mb-0.5">GST Rate (%)</label>
                              <select
                                className="form-input py-1.5 px-1.5 text-xs"
                                value={item.gstRate}
                                onChange={e => handleItemChange(idx, 'gstRate', parseInt(e.target.value, 10))}
                              >
                                <option value={0}>0%</option>
                                <option value={5}>5%</option>
                                <option value={12}>12%</option>
                                <option value={18}>18%</option>
                                <option value={28}>28%</option>
                              </select>
                            </div>
                          </div>

                        </div>
                      ))}
                    </div>

                    {/* Quick Catalog Adder */}
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                      <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-2">
                        Quick Add Catalog Items (One-Click)
                      </h4>
                      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1 bg-slate-50 dark:bg-slate-900/30 rounded-lg">
                        {products.map(prod => (
                          <button
                            type="button"
                            key={prod.name}
                            onClick={() => {
                              const isFirstRowEmpty = invoiceForm.items.length === 1 && !invoiceForm.items[0].description;
                              if (isFirstRowEmpty) {
                                const newItems = [{
                                  sNo: 1,
                                  description: prod.name,
                                  hsn: prod.hsn || '',
                                  qty: 1,
                                  unit: prod.unit || 'Pcs',
                                  rate: prod.rate || 0,
                                  gstRate: prod.gstRate || 18
                                }];
                                setInvoiceForm(prev => ({ ...prev, items: newItems }));
                              } else {
                                setInvoiceForm(prev => ({
                                  ...prev,
                                  items: [
                                    ...prev.items,
                                    {
                                      sNo: prev.items.length + 1,
                                      description: prod.name,
                                      hsn: prod.hsn || '',
                                      qty: 1,
                                      unit: prod.unit || 'Pcs',
                                      rate: prod.rate || 0,
                                      gstRate: prod.gstRate || 18
                                    }
                                  ]
                                }));
                              }
                              showStatus(`Added ${prod.name} to invoice`);
                            }}
                            className="px-2 py-1 bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 rounded-md border border-slate-200 dark:border-slate-700 flex items-center gap-1 transition-colors"
                          >
                            <Plus className="w-3 h-3 text-emerald-500" />
                            <span>{prod.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Discount Block */}
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-3 items-center">
                    <div className="form-group mb-0">
                      <label className="form-label">Discount Amount (₹)</label>
                      <input 
                        type="number"
                        className="form-input py-2"
                        placeholder="Discount ₹..."
                        value={invoiceForm.discount}
                        onChange={e => handleFormChange('discount', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    
                    <div className="text-right pt-4">
                      <span className="text-xs text-slate-400 font-bold block">Taxable Subtotal</span>
                      <span className="text-lg font-black text-slate-800 dark:text-slate-100">₹{calculatedInvoice.subtotal}</span>
                    </div>
                  </div>

                  {/* Action row */}
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex gap-3">
                    <button 
                      onClick={handleSaveInvoice}
                      disabled={isSaving}
                      className="flex-1 btn btn-primary py-2.5 text-sm"
                    >
                      {isSaving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                      <span>{isEditing ? 'Update Invoice' : 'Save Invoice'}</span>
                    </button>
                    <button 
                      onClick={triggerPrint}
                      className="btn btn-secondary py-2.5 px-4"
                      title="Print Invoice"
                    >
                      <Printer className="w-5 h-5" />
                    </button>
                  </div>

                </div>

                {/* Preview Column (7 columns out of 12) */}
                <div className="xl:col-span-7 space-y-4">
                  <div className="flex justify-between items-center no-print flex-wrap gap-2">
                    <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" /> Real-time Live Bill Preview
                    </h3>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-400">Size:</span>
                        <select
                          value={printSize}
                          onChange={e => setPrintSize(e.target.value)}
                          className="form-input py-1 px-2 text-xs font-bold text-slate-700 bg-white border border-slate-200"
                          style={{ width: 'auto', padding: '0.25rem 0.5rem' }}
                        >
                          <option value="a4">A4 Page</option>
                          <option value="a5">A5 Half-Page</option>
                          <option value="thermal">Thermal POS</option>
                        </select>
                      </div>
                      <button 
                        onClick={triggerPrint}
                        className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-md hover:bg-slate-800"
                      >
                        <Printer className="w-4 h-4" /> Print PDF
                      </button>
                    </div>
                  </div>

                  {/* Render exact paper template matching Excel format */}
                  <div className="bill-paper-container" ref={printRef}>
                    <div className={`bill-paper print-size-${printSize}`}>
                      <div className="bill-border-box">
                        
                        {/* Company Header Block */}
                        <div className="bill-header-logo-section">
                          {/* Logo SVG matching the screenshot's SS orange circular logo */}
                          <svg className="w-12 h-12 mb-1" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="50" cy="50" r="45" fill="#f97316" />
                            <path d="M25 45 C25 30, 75 30, 75 45 C75 55, 25 55, 25 65 C25 75, 75 75, 75 60" stroke="white" strokeWidth="10" strokeLinecap="round" fill="none" />
                          </svg>
                          <div className="bill-company-title">
                            SANMATI SALES
                          </div>
                        </div>

                        {/* Customer Information Block */}
                        <div className="bill-meta-grid">
                          <div className="bill-meta-col">
                            <div className="bill-meta-row">
                              <span className="bill-meta-label">Bill To:</span>
                              <span>{invoiceForm.customerName || '__________________'}</span>
                            </div>
                            <div className="bill-meta-row">
                              <span className="bill-meta-label">Customer Name:</span>
                              <span>{invoiceForm.customerName || '__________________'}</span>
                            </div>
                            {invoiceForm.billingAddress && (
                              <div className="bill-meta-row">
                                <span className="bill-meta-label">Address:</span>
                                <span>{invoiceForm.billingAddress}</span>
                              </div>
                            )}
                            {invoiceForm.customerGstin && (
                              <div className="bill-meta-row">
                                <span className="bill-meta-label">GSTIN:</span>
                                <span className="font-mono">{invoiceForm.customerGstin}</span>
                              </div>
                            )}
                          </div>
                          
                          <div className="bill-meta-col">
                            <div className="bill-meta-row">
                              <span className="bill-meta-label">Date:</span>
                              {/* Display date formatted as DD/MM/YYYY */}
                              <span>{invoiceForm.date ? invoiceForm.date.split('-').reverse().join(' / ') : '__ / __ / ____'}</span>
                            </div>
                            <div className="bill-meta-row">
                              <span className="bill-meta-label">Invoice no:</span>
                              <span className="font-bold">{invoiceForm.invoiceNo || '___'}</span>
                            </div>
                            <div className="bill-meta-row">
                              <span className="bill-meta-label">Place of Supply:</span>
                              <span>{invoiceForm.placeOfSupply}</span>
                            </div>
                          </div>
                        </div>

                        {/* Table items */}
                        <table className="bill-items-table">
                          <thead>
                            <tr>
                              <th style={{ width: '8%' }} className="text-center">S.No.</th>
                              <th style={{ width: '42%' }}>Item Description</th>
                              {invoiceForm.items.some(i => i.hsn) && <th style={{ width: '12%' }} className="text-center">HSN</th>}
                              <th style={{ width: '10%' }} className="text-center">Qty</th>
                              <th style={{ width: '8%' }} className="text-center">Unit</th>
                              <th style={{ width: '10%' }} className="text-right">Rate (₹)</th>
                              <th style={{ width: '10%' }} className="text-right">Amount (₹)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {calculatedInvoice.items.map((item, idx) => (
                              <tr key={idx} className="item-row">
                                <td className="text-center">{item.sNo}</td>
                                <td>{item.description || 'Custom Item'}</td>
                                {invoiceForm.items.some(i => i.hsn) && <td className="text-center font-mono text-xs">{item.hsn || '-'}</td>}
                                <td className="text-center">{item.qty}</td>
                                <td className="text-center">{item.unit}</td>
                                <td className="text-right">
                                  {item.rate.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                </td>
                                <td className="text-right font-semibold">
                                  {item.taxableValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                            ))}
                            {/* Empty spacing rows if items are short */}
                            {Array.from({ length: Math.max(0, 6 - calculatedInvoice.items.length) }).map((_, i) => (
                              <tr key={`empty-${i}`} style={{ height: '24px' }}>
                                <td colSpan={invoiceForm.items.some(item => item.hsn) ? 7 : 6}>&nbsp;</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        {/* Totals Section */}
                        <div className="bill-totals-section">
                          <div className="bill-terms-box">
                            <div className="bill-terms-title">Terms & Conditions:</div>
                            <ol style={{ paddingLeft: '14px', margin: 0 }}>
                              {invoiceForm.terms.map((t, idx) => (
                                <li key={idx}>{t}</li>
                              ))}
                            </ol>
                          </div>
                          
                          <div>
                            <table className="bill-totals-table">
                              <tbody>
                                <tr>
                                  <td className="label">Total</td>
                                  <td className="value">₹{calculatedInvoice.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                </tr>
                                {calculatedInvoice.discount > 0 && (
                                  <tr>
                                    <td className="label">Discount</td>
                                    <td className="value">-₹{calculatedInvoice.discount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                  </tr>
                                )}
                                
                                {/* GST Breakdowns */}
                                {calculatedInvoice.cgstTotal > 0 && (
                                  <>
                                    <tr>
                                      <td className="label" style={{ fontSize: '11px', fontWeight: 'normal', color: '#666' }}>CGST Amount</td>
                                      <td className="value" style={{ fontSize: '11px', color: '#666' }}>₹{calculatedInvoice.cgstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    </tr>
                                    <tr>
                                      <td className="label" style={{ fontSize: '11px', fontWeight: 'normal', color: '#666' }}>SGST Amount</td>
                                      <td className="value" style={{ fontSize: '11px', color: '#666' }}>₹{calculatedInvoice.sgstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    </tr>
                                  </>
                                )}
                                {calculatedInvoice.igstTotal > 0 && (
                                  <tr>
                                    <td className="label" style={{ fontSize: '11px', fontWeight: 'normal', color: '#666' }}>IGST Amount</td>
                                    <td className="value" style={{ fontSize: '11px', color: '#666' }}>₹{calculatedInvoice.igstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                  </tr>
                                )}
                                
                                <tr className="grand-total">
                                  <td className="label">Grand Total</td>
                                  {/* Format as standard positive integer, though we support formula display matching Excel negative formatting if desired, let's keep it correct as positive */}
                                  <td className="value">₹{calculatedInvoice.grandTotal.toLocaleString('en-IN')}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Signatory Box */}
                        <div className="bill-footer">
                          <div className="bill-signature-block">
                            <div className="bill-signature-line">Authorized Signatory</div>
                          </div>
                        </div>

                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {activeTab === 'invoices' && (
              /* Invoices History list */
              <div className="glass-panel p-6 space-y-4 animate-fade-in">
                <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <FileText className="w-5 h-5 text-indigo-500" />
                    <span>Invoices History</span>
                  </h2>
                  <button 
                    onClick={loadAllData} 
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title="Reload data"
                  >
                    <RefreshCw className="w-4 h-4 text-slate-500" />
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="edit-table">
                    <thead>
                      <tr>
                        <th>Invoice No</th>
                        <th>Date</th>
                        <th>Customer Name</th>
                        <th>State</th>
                        <th className="text-right">Grand Total (₹)</th>
                        <th>Created By</th>
                        <th className="text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map(inv => (
                        <tr key={inv.invoiceNo} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                          <td className="font-bold py-3">{inv.invoiceNo}</td>
                          <td>{inv.date ? inv.date.split('-').reverse().join(' / ') : ''}</td>
                          <td className="font-semibold text-slate-700 dark:text-slate-300">{inv.customerName}</td>
                          <td><span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-xs font-semibold text-slate-600 dark:text-slate-400">{inv.placeOfSupply}</span></td>
                          <td className="text-right font-black text-slate-800 dark:text-slate-200">₹{inv.grandTotal ? inv.grandTotal.toLocaleString('en-IN') : '0'}</td>
                          <td className="text-xs text-slate-400 font-mono">{inv.createdBy || 'Unknown'}</td>
                          <td className="text-center">
                            <div className="inline-flex gap-1.5">
                              <button 
                                onClick={() => handleEditInvoice(inv)}
                                className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:hover:bg-indigo-900 rounded-lg transition-colors"
                                title="Edit invoice"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => {
                                  setInvoiceForm({
                                    ...inv,
                                    items: inv.items.map(item => ({ ...item }))
                                  });
                                  setIsEditing(true);
                                  // Open dashboard which displays print preview instantly
                                  setActiveTab('dashboard');
                                  setTimeout(triggerPrint, 300);
                                }}
                                className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-950 dark:hover:bg-blue-900 rounded-lg transition-colors"
                                title="Print invoice PDF"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleDeleteInvoice(inv.invoiceNo)}
                                className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950 dark:hover:bg-rose-900 rounded-lg transition-colors"
                                title="Delete invoice"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {invoices.length === 0 && (
                        <tr>
                          <td colSpan="7" className="text-center py-8 text-slate-400 font-semibold">
                            No invoices generated yet. Go to Dashboard to create one!
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'products' && (
              /* Products database crud */
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                {/* Form to add */}
                <div className="glass-panel p-6 space-y-4">
                  <h2 className="text-base font-bold pb-2 border-b border-slate-100 dark:border-slate-800">Add Default Product</h2>
                  <form onSubmit={handleAddProduct} className="space-y-4">
                    <div className="form-group">
                      <label className="form-label">Product Name</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="e.g. Line dori" 
                        value={newProductForm.name}
                        onChange={e => setNewProductForm({...newProductForm, name: e.target.value})}
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="form-group">
                        <label className="form-label">HSN Code</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          placeholder="e.g. 5607" 
                          value={newProductForm.hsn}
                          onChange={e => setNewProductForm({...newProductForm, hsn: e.target.value})}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Unit</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          placeholder="e.g. Pcs" 
                          value={newProductForm.unit}
                          onChange={e => setNewProductForm({...newProductForm, unit: e.target.value})}
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="form-group">
                        <label className="form-label">Default Rate (₹)</label>
                        <input 
                          type="number" 
                          step="any"
                          className="form-input" 
                          value={newProductForm.rate}
                          onChange={e => setNewProductForm({...newProductForm, rate: parseFloat(e.target.value) || 0})}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">GST Rate (%)</label>
                        <select 
                          className="form-input"
                          value={newProductForm.gstRate}
                          onChange={e => setNewProductForm({...newProductForm, gstRate: parseInt(e.target.value, 10)})}
                        >
                          <option value={0}>0%</option>
                          <option value={5}>5%</option>
                          <option value={12}>12%</option>
                          <option value={18}>18%</option>
                          <option value={28}>28%</option>
                        </select>
                      </div>
                    </div>
                    <button type="submit" className="w-full btn btn-primary py-2 text-sm flex items-center justify-center gap-1">
                      <PlusCircle className="w-4 h-4" /> Save to Database
                    </button>
                  </form>
                </div>

                {/* List of products */}
                <div className="lg:col-span-2 glass-panel p-6 space-y-4">
                  <h2 className="text-base font-bold pb-2 border-b border-slate-100 dark:border-slate-800">Autocomplete Product Catalog</h2>
                  <div className="overflow-x-auto max-h-[500px]">
                    <table className="edit-table">
                      <thead>
                        <tr>
                          <th>Product Name</th>
                          <th>HSN</th>
                          <th>Unit</th>
                          <th className="text-right">Default Rate (₹)</th>
                          <th className="text-center">GST</th>
                        </tr>
                      </thead>
                      <tbody>
                        {products.map(prod => (
                          <tr key={prod.name}>
                            <td className="font-semibold">{prod.name}</td>
                            <td className="font-mono text-xs">{prod.hsn || '-'}</td>
                            <td>{prod.unit}</td>
                            <td className="text-right font-mono">₹{prod.rate}</td>
                            <td className="text-center"><span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300 rounded text-xs font-bold">{prod.gstRate}%</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'customers' && (
              /* Customers list */
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                {/* Form to add */}
                <div className="glass-panel p-6 space-y-4">
                  <h2 className="text-base font-bold pb-2 border-b border-slate-100 dark:border-slate-800">Add New Customer</h2>
                  <form onSubmit={handleAddCustomer} className="space-y-4">
                    <div className="form-group">
                      <label className="form-label">Customer Legal Name</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="e.g. Shri Hardware" 
                        value={newCustomerForm.name}
                        onChange={e => setNewCustomerForm({...newCustomerForm, name: e.target.value})}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Billing Address</label>
                      <textarea 
                        rows="2"
                        className="form-input py-2" 
                        placeholder="Customer address..." 
                        value={newCustomerForm.address}
                        onChange={e => setNewCustomerForm({...newCustomerForm, address: e.target.value})}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">GSTIN</label>
                      <input 
                        type="text" 
                        className="form-input font-mono uppercase" 
                        placeholder="15-digit GSTIN (optional)..." 
                        value={newCustomerForm.gstin}
                        onChange={e => setNewCustomerForm({...newCustomerForm, gstin: e.target.value.toUpperCase()})}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="form-group">
                        <label className="form-label">State</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          value={newCustomerForm.state}
                          onChange={e => setNewCustomerForm({...newCustomerForm, state: e.target.value})}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">State Code</label>
                        <input 
                          type="text" 
                          className="form-input font-mono" 
                          value={newCustomerForm.stateCode}
                          onChange={e => setNewCustomerForm({...newCustomerForm, stateCode: e.target.value})}
                          required
                        />
                      </div>
                    </div>
                    <button type="submit" className="w-full btn btn-primary py-2 text-sm flex items-center justify-center gap-1">
                      <PlusCircle className="w-4 h-4" /> Save Customer
                    </button>
                  </form>
                </div>

                {/* List of customers */}
                <div className="lg:col-span-2 glass-panel p-6 space-y-4">
                  <h2 className="text-base font-bold pb-2 border-b border-slate-100 dark:border-slate-800">Autocomplete Customer Database</h2>
                  <div className="overflow-x-auto max-h-[500px]">
                    <table className="edit-table">
                      <thead>
                        <tr>
                          <th>Customer Name</th>
                          <th>GSTIN</th>
                          <th>Place of Supply</th>
                          <th>Address</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customers.map(cust => (
                          <tr key={cust.name}>
                            <td className="font-semibold">{cust.name}</td>
                            <td className="font-mono text-xs">{cust.gstin || 'Unregistered'}</td>
                            <td><span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-xs font-semibold text-slate-600 dark:text-slate-400">{cust.state} ({cust.stateCode})</span></td>
                            <td className="text-xs max-w-xs truncate" title={cust.address}>{cust.address}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              /* Connection configuration & Whitelist manager */
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
                
                {/* Connection Form */}
                <div className="glass-panel p-6 space-y-4">
                  <h2 className="text-base font-bold pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5">
                    <Database className="w-5 h-5 text-indigo-500" />
                    <span>Connection Settings</span>
                  </h2>
                  <form onSubmit={handleSaveConnection} className="space-y-4">
                    <div className="form-group">
                      <label className="form-label">Google OAuth Client ID</label>
                      <input 
                        type="text" 
                        className="form-input font-mono text-xs" 
                        placeholder="xxxx.apps.googleusercontent.com" 
                        value={googleClientId}
                        onChange={e => setGoogleClientId(e.target.value)}
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        Google Cloud OAuth 2.0 Web Client ID to trigger Google Identity Login.
                      </p>
                    </div>

                    {spreadsheetId && (
                      <div className="form-group">
                        <label className="form-label">Connected Google Sheets Database</label>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            className="form-input font-mono text-xs bg-slate-50 dark:bg-slate-900/50 text-slate-500" 
                            readOnly 
                            value={spreadsheetId}
                          />
                          <a 
                            href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="btn btn-secondary text-xs px-3 flex items-center justify-center gap-1 flex-shrink-0"
                          >
                            Open Sheet
                          </a>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">
                          This is the spreadsheet automatically provisioned inside your Google Drive.
                        </p>
                      </div>
                    )}

                    <button type="submit" className="btn btn-primary py-2 text-sm flex items-center gap-1.5">
                      <Save className="w-4 h-4" /> Save Connection Configuration
                    </button>
                  </form>
                </div>

                {/* Whitelist Panel */}
                <div className="glass-panel p-6 space-y-4">
                  <h2 className="text-base font-bold pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5">
                    <Users className="w-5 h-5 text-indigo-500" />
                    <span>Access Whitelist Management</span>
                  </h2>

                  <form onSubmit={handleAddWhitelist} className="flex gap-2">
                    <input 
                      type="email" 
                      className="form-input text-xs font-semibold py-1.5"
                      placeholder="Add Gmail email to whitelist..." 
                      value={newWhitelistEmail}
                      onChange={e => setNewWhitelistEmail(e.target.value)}
                      required
                    />
                    <button type="submit" className="btn btn-secondary px-3 py-1.5 text-xs flex items-center gap-1">
                      <Plus className="w-3.5 h-3.5" /> Add
                    </button>
                  </form>

                  <div className="max-h-[300px] overflow-y-auto pr-1">
                    <ul className="space-y-2">
                      {whitelist.map(email => (
                        <li 
                          key={email}
                          className="flex justify-between items-center px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-lg text-xs font-semibold"
                        >
                          <span className="font-mono text-slate-700 dark:text-slate-300">{email}</span>
                          <button 
                            onClick={() => handleRemoveWhitelist(email)}
                            className="p-1 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 transition-colors"
                            title="Remove from whitelist"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                      {whitelist.length === 0 && (
                        <li className="text-center py-6 text-xs text-slate-400 font-medium">Whitelist is empty.</li>
                      )}
                    </ul>
                  </div>
                </div>

              </div>
            )}

          </div>

        </div>
      )}

      {/* Footer copyright section (Hidden on Print) */}
      <footer className="py-6 border-t border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400 font-semibold no-print">
        © 2026 Sanmati Sales Billing Engine. Built on Google Sheets directly. Secure, serverless, standard-compliant.
      </footer>

      {/* Duplicate Sheets Choice Dialog */}
      {showDuplicateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in no-print">
          <div className="w-full max-w-md glass-panel p-6 shadow-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 text-left">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
              <AlertCircle className="w-6 h-6 text-amber-500 flex-shrink-0" />
              <h3 className="text-lg font-bold tracking-tight">Duplicate Databases Found</h3>
            </div>
            
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              We found multiple existing billing databases named <strong>"Sanmati Sales - Billing Database"</strong> inside your Google Drive. 
              Please choose whether you want to connect to one of these existing databases or create a brand new one.
            </p>
            
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {duplicateSheets.map(sheet => (
                <button
                  type="button"
                  key={sheet.id}
                  onClick={() => handleSelectDuplicateSheet(sheet.id, sheet.name)}
                  className="w-full p-3 text-left rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex justify-between items-center bg-white dark:bg-slate-950 shadow-sm"
                >
                  <div className="min-w-0 pr-2">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">Database (Google Sheet)</p>
                    <p className="text-[10px] text-slate-400 font-mono truncate">{sheet.id}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[9px] text-slate-450 uppercase font-extrabold">Modified</p>
                    <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      {new Date(sheet.modifiedTime).toLocaleDateString()}
                    </p>
                  </div>
                </button>
              ))}
            </div>
            
            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleCreateNewFromDuplicate}
                className="w-full btn btn-primary py-2 text-xs flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Create a Brand New Database
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDuplicateModal(false);
                  setIsVerifyingAuth(false);
                  setAuthTempToken(null);
                }}
                className="w-full text-center text-xs font-bold text-rose-500 hover:underline py-1"
              >
                Cancel Sign-In
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
