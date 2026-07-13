import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Plus, Trash2, Edit, Printer, Save, Settings, User, LogIn, LogOut, 
  Sun, Moon, Database, Users, PlusCircle, CheckCircle, RefreshCw, 
  Sparkles, FileText, ChevronRight, X, AlertCircle, FilePlus, Download,
  ChevronDown, ToggleLeft, ToggleRight
} from 'lucide-react';
import { api } from './api';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

// Production environment detector
const isProd = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

// Default empty invoice template
const EMPTY_INVOICE = {
  invoiceNo: '',
  date: new Date().toISOString().split('T')[0],
  customerName: '',
  billingAddress: '',
  shippingAddress: '',
  customerGstin: '',
  customerWhatsapp: '',
  placeOfSupply: 'Maharashtra (27)',
  transportMode: 'A-SELF',
  vehicleNo: '',
  items: [
    { sNo: 1, description: '', hsn: '', qty: 1, unit: 'Pcs', rate: 0, gstRate: 0 }
  ],
  discount: 0,
  terms: [
    'Goods once sold will not be taken back.',
    'Subject to local jurisdiction.'
  ]
};

// Official green WhatsApp SVG logo
const WhatsAppIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.863-9.736.001-2.599-1.01-5.043-2.848-6.883-1.838-1.84-4.286-2.85-6.887-2.852-5.441 0-9.867 4.371-9.87 9.737 0 1.682.445 3.326 1.292 4.787L1.875 22.1l4.772-1.246zM17.472 14.382c-.32-.16-1.89-.933-2.185-1.04-.294-.11-.51-.16-.723.16-.21.32-.8.933-.98 1.14-.18.206-.363.23-.683.07-3.04-1.36-4.31-2.313-5.76-4.802-.38-.653.38-.606.98-1.812.18-.32.09-.6-.045-.76-.135-.16-1.133-2.733-1.55-3.738-.406-1.002-.82-.857-1.126-.87-.29-.015-.62-.015-.95-.015-.33 0-.86.124-1.31.62-.45.496-1.72 1.68-1.72 4.103 0 2.424 1.76 4.76 2.01 5.093.25.33 3.47 5.3 8.41 7.424 4.116 1.769 5.01 1.48 6.8 1.32.597-.053 1.89-.773 2.155-1.52.266-.747.266-1.387.186-1.52-.08-.133-.294-.21-.615-.37z"/>
  </svg>
);

// Standard Indian Currency Number-to-Words Converter
const numberToWords = (num) => {
  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const g = (n) => {
    if (n < 20) return a[n];
    const digit = n % 10;
    return b[Math.floor(n / 10)] + (digit ? '-' + a[digit].trim() : '') + ' ';
  };

  const h = (n) => {
    let str = '';
    if (n > 99) {
      str += a[Math.floor(n / 100)] + 'Hundred ';
      n %= 100;
    }
    if (n > 0) {
      if (str !== '') str += 'and ';
      str += g(n);
    }
    return str;
  };

  if (!num || num === 0) return 'Zero Rupees Only';

  let rupees = Math.floor(num);
  let paise = Math.round((num - rupees) * 100);

  let str = '';

  if (rupees > 9999999) {
    str += h(Math.floor(rupees / 10000000)) + 'Crore ';
    rupees %= 10000000;
  }
  if (rupees > 99999) {
    str += h(Math.floor(rupees / 100000)) + 'Lakh ';
    rupees %= 100000;
  }
  if (rupees > 999) {
    str += h(Math.floor(rupees / 1000)) + 'Thousand ';
    rupees %= 1000;
  }
  if (rupees > 0) {
    str += h(rupees);
  }

  let finalStr = str.trim() + ' Rupees';

  if (paise > 0) {
    finalStr += ' and ' + h(paise).trim() + ' Paise';
  }

  return finalStr + ' Only';
};

export default function App() {
  // Theme & Mode Settings
  const [theme, setTheme] = useState(localStorage.getItem('bill_theme') || 'light');
  const [mode, setMode] = useState('live'); // Always live mode in Firestore database
  const [googleClientId, setGoogleClientId] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState('firestore-db');
  const [printSize, setPrintSize] = useState('a4');
  const [currentTemplate, setCurrentTemplate] = useState('bill'); // 'bill' (original) or 'tax' (Tally-style Tax Invoice)

  // Seller GSTIN Constant (Hardcoded as requested)
  const COMPANY_GSTIN = import.meta.env.VITE_COMPANY_GSTIN || '27GHEPP3279P1ZE';

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
  const [newProductForm, setNewProductForm] = useState({ name: '', hsn: '', unit: 'Pcs', rate: 0, gstRate: 0 }); // Default GST is 0%
  const [newCustomerForm, setNewCustomerForm] = useState({ name: '', address: '', gstin: '', whatsapp: '', state: 'Maharashtra', stateCode: '27' });

  const latestInvoiceNo = useMemo(() => {
    if (!invoices || invoices.length === 0) return '00';
    const numbers = invoices.map(inv => parseInt(inv.invoiceNo, 10)).filter(n => !isNaN(n));
    if (numbers.length === 0) {
      const sorted = [...invoices].sort((a, b) => (b.invoiceNo || '').localeCompare(a.invoiceNo || ''));
      return sorted[0]?.invoiceNo || '00';
    }
    const maxNum = Math.max(...numbers);
    return maxNum.toString().padStart(2, '0');
  }, [invoices]);

  // Refs for Print
  const printRef = useRef(null);

  // Synchronize Theme & Mode
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('bill_theme', theme);
  }, [theme]);

  // Setup Firebase Auth State Changed Listener for persistence
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setIsRestoringSession(true);
      if (firebaseUser) {
        try {
          const session = await api.verifyUser(firebaseUser.email);
          setUser({
            email: firebaseUser.email,
            name: firebaseUser.displayName,
            picture: firebaseUser.photoURL,
            role: session.role
          });
        } catch (err) {
          console.error('[Auth] Whitelist verification failed:', err);
          showStatus(err.message, 'danger');
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setIsRestoringSession(false);
    });
    return () => unsubscribe();
  }, []);

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
  }, [user]);

  // Auto-generate invoice number based on history
  useEffect(() => {
    if (invoices.length > 0 && !isEditing && !invoiceForm.invoiceNo) {
      const numbers = invoices.map(inv => parseInt(inv.invoiceNo, 10)).filter(n => !isNaN(n));
      const nextNo = numbers.length > 0 ? Math.max(...numbers) + 1 : invoices.length + 1;
      const formattedNo = nextNo.toString().padStart(2, '0');
      setInvoiceForm(prev => ({ ...prev, invoiceNo: formattedNo }));
    } else if (invoices.length === 0 && !isEditing && !invoiceForm.invoiceNo) {
      setInvoiceForm(prev => ({ ...prev, invoiceNo: '01' }));
    }
  }, [invoices, isEditing, invoiceForm.invoiceNo]);

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
      showStatus(`Simulated Login successful as ${session.email}`);
    } catch (err) {
      showStatus(err.message, 'danger');
    } finally {
      setIsVerifyingAuth(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsVerifyingAuth(true);
    try {
      const userInfo = await api.loginWithGoogle();
      console.log('[Auth] Google Login Succeeded, verifying whitelist email:', userInfo.email);
      const session = await api.verifyUser(userInfo.email);
      setUser({
        ...userInfo,
        role: session.role
      });
      showStatus(`Sign-in successful! Welcome, ${userInfo.name}`);
    } catch (err) {
      console.error('[Auth] Google Login or verification failed:', err);
      showStatus(`Login Error: ${err.message}`, 'danger');
      api.clearSession();
      setUser(null);
    } finally {
      setIsVerifyingAuth(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
      setUser(null);
      setSpreadsheetId('');
      setInvoices([]);
      setProducts([]);
      setCustomers([]);
      setWhitelist([]);
      showStatus('Logged out successfully');
    } catch (err) {
      showStatus(err.message, 'danger');
    }
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
    
    // Check if this product already exists in another row (excluding the current rowIndex)
    const existingIndex = newItems.findIndex((item, idx) => 
      idx !== rowIndex && 
      item.description.trim().toLowerCase() === prod.name.trim().toLowerCase()
    );
    
    if (existingIndex > -1) {
      newItems[existingIndex].qty += parseFloat(newItems[rowIndex].qty) || 1;
      
      if (newItems.length > 1) {
        newItems.splice(rowIndex, 1);
      } else {
        newItems[0] = { sNo: 1, description: '', hsn: '', qty: 1, unit: 'Pcs', rate: 0, gstRate: 0 };
      }
      
      newItems.forEach((item, i) => {
        item.sNo = i + 1;
      });
      
      showStatus(`Updated quantity for "${prod.name}"`);
    } else {
      newItems[rowIndex] = {
        ...newItems[rowIndex],
        description: prod.name,
        hsn: prod.hsn || '',
        unit: prod.unit || 'Pcs',
        rate: prod.rate || 0,
        gstRate: prod.gstRate || 0
      };
    }
    
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
      customerWhatsapp: cust.whatsapp || '',
      placeOfSupply: cust.state ? `${cust.state} (${cust.stateCode || ''})` : prev.placeOfSupply
    }));
    setCustomerSearchDropdown(false);
  };

  // Actions
  const handleSaveInvoice = async () => {
    // 1. Basic required fields validation
    if (!invoiceForm.invoiceNo || !invoiceForm.customerName) {
      showStatus('Invoice Number and Customer Name are required!', 'danger');
      return false;
    }
    if (!invoiceForm.billingAddress || !invoiceForm.billingAddress.trim()) {
      showStatus('Billing Address is required!', 'danger');
      return false;
    }
    if (!invoiceForm.placeOfSupply) {
      showStatus('Place of Supply is required!', 'danger');
      return false;
    }

    // Check for duplicate invoice number if creating a new invoice
    if (!isEditing) {
      const duplicate = invoices.some(inv => inv.invoiceNo.trim().toLowerCase() === invoiceForm.invoiceNo.trim().toLowerCase());
      if (duplicate) {
        showStatus(`Invoice #${invoiceForm.invoiceNo} already exists! Please use a unique invoice number.`, 'danger');
        return false;
      }
    }

    // 2. GSTIN Format validation
    if (invoiceForm.customerGstin && invoiceForm.customerGstin.trim().length !== 15) {
      showStatus('GSTIN must be exactly 15 characters (e.g., 27AAAAA1111A1Z1)!', 'danger');
      return false;
    }

    // 3. Items validation
    const validItems = invoiceForm.items.filter(item => item.description && item.description.trim() !== '');
    if (validItems.length === 0) {
      showStatus('At least one item with a valid description is required!', 'danger');
      return false;
    }
    for (const item of validItems) {
      if (item.qty <= 0) {
        showStatus(`Quantity for "${item.description}" must be greater than 0!`, 'danger');
        return false;
      }
      if (item.rate < 0) {
        showStatus(`Rate for "${item.description}" cannot be negative!`, 'danger');
        return false;
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
          whatsapp: invoiceForm.customerWhatsapp.trim(),
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
        // Hold the current state (do not clear the form)
        loadAllData();
        return true;
      }
    } catch (err) {
      showStatus(err.message, 'danger');
      return false;
    } finally {
      setIsSaving(false);
    }
    return false;
  };

  const handleEditInvoice = (invoice) => {
    setInvoiceForm({
      invoiceNo: invoice.invoiceNo,
      date: invoice.date,
      customerName: invoice.customerName,
      billingAddress: invoice.billingAddress,
      shippingAddress: invoice.shippingAddress || invoice.billingAddress,
      customerGstin: invoice.customerGstin || '',
      customerWhatsapp: customers.find(c => c.name.toLowerCase() === invoice.customerName.toLowerCase())?.whatsapp || '',
      placeOfSupply: invoice.placeOfSupply || 'Maharashtra (27)',
      transportMode: invoice.transportMode || '',
      vehicleNo: invoice.vehicleNo || '',
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
    if (!newProductForm.name || newProductForm.rate === undefined) return;
    try {
      const res = await api.saveProduct(newProductForm);
      if (res.success) {
        showStatus(`Product ${newProductForm.name} saved!`);
        setNewProductForm({ name: '', hsn: '', unit: 'Pcs', rate: 0, gstRate: 0 }); // Reset with default 0% GST
        loadAllData();
      }
    } catch (err) {
      showStatus(err.message, 'danger');
    }
  };

  const handleInlineProductEdit = async (productId, field, value) => {
    const originalProduct = products.find(p => p.id === productId);
    if (!originalProduct) return;
    
    let parsedValue = value;
    if (field === 'rate') parsedValue = parseFloat(value) || 0;
    if (field === 'gstRate') parsedValue = parseInt(value, 10) || 0;

    const updatedProduct = {
      ...originalProduct,
      [field]: parsedValue
    };

    try {
      await api.saveProduct(updatedProduct);
      setProducts(prev => prev.map(p => p.id === productId ? updatedProduct : p));
    } catch (err) {
      showStatus(err.message, 'danger');
    }
  };

  const handleProductDelete = async (productId, productName) => {
    if (!window.confirm(`Are you sure you want to delete "${productName}" from the catalog?`)) return;
    try {
      const res = await api.deleteProduct(productId);
      if (res.success) {
        showStatus(`Product "${productName}" deleted.`);
        setProducts(prev => prev.filter(p => p.id !== productId));
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
        setNewCustomerForm({ name: '', address: '', gstin: '', whatsapp: '', state: 'Maharashtra', stateCode: '27' });
        loadAllData();
      }
    } catch (err) {
      showStatus(err.message, 'danger');
    }
  };

  const handleCustomerDelete = async (customerId, customerName) => {
    if (!window.confirm(`Are you sure you want to delete "${customerName}" from the customer database?`)) return;
    try {
      const res = await api.deleteCustomer(customerId);
      if (res.success) {
        showStatus(`Customer "${customerName}" deleted.`);
        setCustomers(prev => prev.filter(c => c.id !== customerId));
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

  const triggerPrint = (template = 'bill') => {
    setCurrentTemplate(template);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const handleSaveAndPrint = async (template = 'bill') => {
    const saved = await handleSaveInvoice();
    if (saved) {
      triggerPrint(template);
    }
  };

  const handleShareWhatsApp = (invoice, calculated) => {
    // Prompt user to save as PDF first before redirecting to WhatsApp
    const proceedPrint = window.confirm(
      "To share the PDF invoice:\n\n" +
      "1. Save the invoice as a PDF first (via the print dialog).\n" +
      "2. Once saved, attach the PDF file in the WhatsApp window that will open now.\n\n" +
      "Would you like to open the Print Dialog now to save the PDF first?"
    );
    
    if (proceedPrint) {
      triggerPrint(currentTemplate);
    }

    let phone = invoice.customerWhatsapp || '';
    
    // Fallback: search in customer database if empty in invoice
    if (!phone && invoice.customerName) {
      const match = customers.find(c => c.name.toLowerCase() === invoice.customerName.toLowerCase());
      if (match && match.whatsapp) {
        phone = match.whatsapp;
      }
    }
    
    // If still empty, prompt the user for WhatsApp Number
    if (!phone || !phone.trim()) {
      const inputPhone = window.prompt("Enter Customer's WhatsApp Number (with country code, e.g., 919876543210):", "91");
      if (!inputPhone) return; // user cancelled
      phone = inputPhone;
      
      // Update form state if sharing the current invoice
      if (invoice.invoiceNo === invoiceForm.invoiceNo) {
        handleFormChange('customerWhatsapp', phone);
      }
    }
    
    // Strip everything except numbers
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      showStatus('Please enter a valid phone number with country code (e.g. 919876543210)!', 'danger');
      return;
    }
    
    // Generate beautiful formatted message text
    const isInterstate = !invoice.placeOfSupply.includes('(27)') && !invoice.placeOfSupply.toLowerCase().includes('maharashtra');
    
    let msg = `*INVOICE: #${invoice.invoiceNo}*\n`;
    msg += `*Sanmati Sales*\n`;
    msg += `--------------------------------------\n`;
    msg += `*Date:* ${invoice.date ? invoice.date.split('-').reverse().join('/') : ''}\n`;
    msg += `*Customer:* ${invoice.customerName}\n`;
    if (invoice.customerGstin) {
      msg += `*GSTIN:* ${invoice.customerGstin}\n`;
    }
    msg += `--------------------------------------\n`;
    msg += `*Items:*\n`;
    
    invoice.items.forEach((item, index) => {
      msg += `${index + 1}. *${item.description}*\n`;
      msg += `   ${item.qty} ${item.unit} @ ₹${item.rate.toFixed(2)} = ₹${(item.qty * item.rate).toFixed(2)} (${item.gstRate}% GST)\n`;
    });
    
    msg += `--------------------------------------\n`;
    msg += `*Subtotal:* ₹${calculated.subtotal.toFixed(2)}\n`;
    if (calculated.discount > 0) {
      msg += `*Discount:* -₹${calculated.discount.toFixed(2)}\n`;
    }
    
    if (isInterstate) {
      msg += `*IGST (Total):* ₹${calculated.igstTotal.toFixed(2)}\n`;
    } else {
      msg += `*CGST:* ₹${calculated.cgstTotal.toFixed(2)}\n`;
      msg += `*SGST:* ₹${calculated.sgstTotal.toFixed(2)}\n`;
    }
    msg += `*Grand Total:* ₹${calculated.grandTotal.toFixed(2)}\n`;
    msg += `--------------------------------------\n`;
    msg += `Thank you for your business! 🙏\n`;
    msg += `For any queries, contact Sanmati Sales.`;
    
    const encodedText = encodeURIComponent(msg);
    const url = `https://wa.me/${cleanPhone}?text=${encodedText}`;
    window.open(url, '_blank');
  };

  // Helper to filter products on type (exclude out-of-stock)
  const getFilteredProducts = (searchStr) => {
    const activeProducts = products.filter(p => p.inStock !== false);
    if (!searchStr) return activeProducts;
    return activeProducts.filter(p => p.name.toLowerCase().includes(searchStr.toLowerCase()));
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
          <img src="/sanmatisales-logo.jpeg" className="w-10 h-10 rounded-full shadow-md object-cover border border-slate-200 dark:border-slate-800" alt="Logo" />
          <div>
            <h1 className="text-xl font-bold tracking-tight">Sanmati Sales</h1>
            <p className="text-xs text-slate-400 font-medium">Professional Bill Generator</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-4">
          {/* Mode Badge (Hidden in Production) */}
          {!isProd && (
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
          )}

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
          ) : null}
        </div>
      </header>

      {/* Main Layout Container */}
      {isRestoringSession ? (
        /* Session Restoration Loading Spinner */
        <div className="flex-1 flex items-center justify-center p-6 no-print">
          <div className="text-center animate-fade-in">
            <img src="/sanmatisales-logo.jpeg" className="w-16 h-16 rounded-full shadow-xl mx-auto mb-6 animate-pulse object-cover border border-slate-200 dark:border-slate-800" alt="Logo" />
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
            <img src="/sanmatisales-logo.jpeg" className="w-16 h-16 rounded-full shadow-xl mx-auto mb-6 object-cover border border-slate-200 dark:border-slate-800" alt="Logo" />
            <h2 className="text-2xl font-bold tracking-tight mb-2">Sanmati Sales Billing</h2>
            <p className="text-slate-500 text-sm mb-6">
              Authorized personnel only. Please sign in with Google to access the invoice engine.
            </p>

            <div className="space-y-4">
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
                  Secure access is authenticated directly via Google Firebase console.
                </p>
              </div>
            </div>

          </div>
        </div>
      ) : (
        /* Authenticated Dashboard Workspace */
        <div className="flex-1 flex flex-col app-content gap-4">
          
          {/* Top Horizontal Tab Navigation (Hidden on Print) */}
          <nav className="tab-navigation no-print">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`tab-btn ${activeTab === 'dashboard' ? 'tab-btn-active' : ''}`}
            >
              <FilePlus className="w-4 h-4" />
              <span>Generate Invoice</span>
            </button>
            <button 
              onClick={() => setActiveTab('invoices')}
              className={`tab-btn ${activeTab === 'invoices' ? 'tab-btn-active' : ''}`}
            >
              <FileText className="w-4 h-4" />
              <span>Invoices History</span>
            </button>
            <button 
              onClick={() => setActiveTab('products')}
              className={`tab-btn ${activeTab === 'products' ? 'tab-btn-active' : ''}`}
            >
              <Database className="w-4 h-4" />
              <span>Products List</span>
            </button>
            <button 
              onClick={() => setActiveTab('customers')}
              className={`tab-btn ${activeTab === 'customers' ? 'tab-btn-active' : ''}`}
            >
              <Users className="w-4 h-4" />
              <span>Customers Db</span>
            </button>
            <button 
              onClick={() => setActiveTab('settings')}
              className={`tab-btn ${activeTab === 'settings' ? 'tab-btn-active' : ''}`}
            >
              <Settings className="w-4 h-4" />
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
                          <label className="form-label">WhatsApp Number</label>
                          <input 
                            type="text" 
                            className="form-input py-2 font-mono"
                            placeholder="e.g. 919876543210"
                            value={invoiceForm.customerWhatsapp}
                            onChange={e => handleFormChange('customerWhatsapp', e.target.value)}
                          />
                        </div>
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

                  {/* Invoice Meta Block */}
                  <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Invoice Meta</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="form-group mb-0">
                        <label className="form-label flex items-center justify-between">
                          <span>Invoice Number</span>
                          {!isEditing && latestInvoiceNo !== '00' && (
                            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">
                              Latest: #{latestInvoiceNo}
                            </span>
                          )}
                        </label>
                        <input 
                          type="text" 
                          className={`form-input py-2 font-semibold ${isEditing ? 'bg-slate-50 dark:bg-slate-900/50 text-slate-500 cursor-not-allowed' : ''}`}
                          placeholder="e.g. 03"
                          value={invoiceForm.invoiceNo}
                          onChange={e => handleFormChange('invoiceNo', e.target.value)}
                          disabled={isEditing}
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
                    <div className="grid grid-cols-2 gap-3">
                      <div className="form-group mb-0">
                        <label className="form-label">Transport Mode (optional)</label>
                        <input 
                          type="text" 
                          className="form-input py-2"
                          placeholder="e.g. A-SELF"
                          value={invoiceForm.transportMode || ''}
                          onChange={e => handleFormChange('transportMode', e.target.value)}
                        />
                      </div>
                      <div className="form-group mb-0">
                        <label className="form-label">Vehicle Number (optional)</label>
                        <input 
                          type="text" 
                          className="form-input py-2 font-mono"
                          placeholder="e.g. MH-09-XX-1234"
                          value={invoiceForm.vehicleNo || ''}
                          onChange={e => handleFormChange('vehicleNo', e.target.value)}
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
                                  {getFilteredProducts(item.description).map(prod => (
                                    <button
                                      type="button"
                                      key={prod.name}
                                      onClick={() => selectProduct(idx, prod)}
                                      className="w-full text-left px-2 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors"
                                    >
                                      {prod.name} - ₹{prod.rate} ({prod.unit})
                                    </button>
                                  ))}
                                  {getFilteredProducts(item.description).length === 0 && (
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
                        {products.filter(p => p.inStock !== false).map(prod => (
                          <button
                            type="button"
                            key={prod.name}
                            onClick={() => {
                              const existingIndex = invoiceForm.items.findIndex(item => 
                                item.description.trim().toLowerCase() === prod.name.trim().toLowerCase()
                              );

                              if (existingIndex > -1) {
                                const newItems = [...invoiceForm.items];
                                newItems[existingIndex].qty += 1;
                                setInvoiceForm(prev => ({ ...prev, items: newItems }));
                                showStatus(`Updated quantity for "${prod.name}"`);
                              } else {
                                const isFirstRowEmpty = invoiceForm.items.length === 1 && !invoiceForm.items[0].description;
                                if (isFirstRowEmpty) {
                                  const newItems = [{
                                    sNo: 1,
                                    description: prod.name,
                                    hsn: prod.hsn || '',
                                    qty: 1,
                                    unit: prod.unit || 'Pcs',
                                    rate: prod.rate || 0,
                                    gstRate: prod.gstRate || 0
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
                                        gstRate: prod.gstRate || 0
                                      }
                                    ]
                                  }));
                                }
                                showStatus(`Added ${prod.name} to invoice`);
                              }
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
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex gap-3 flex-wrap">
                    <button 
                      onClick={handleSaveInvoice}
                      disabled={isSaving}
                      className="flex-1 min-w-[140px] btn btn-primary py-2.5 text-sm"
                    >
                      {isSaving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                      <span>{isEditing ? 'Update Invoice' : 'Save Invoice'}</span>
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleSaveAndPrint('bill')}
                      className="btn btn-secondary py-2.5 px-3.5 flex items-center gap-1 text-xs font-bold"
                      title="Print Regular Bill"
                    >
                      <Printer className="w-4 h-4" />
                      <span>Print Bill</span>
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleSaveAndPrint('tax')}
                      className="btn bg-slate-700 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white py-2.5 px-3.5 flex items-center gap-1 text-xs font-bold transition-colors"
                      title="Print Tally Tax Invoice"
                    >
                      <Printer className="w-4 h-4 text-emerald-400" />
                      <span>Print Tax Invoice</span>
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleShareWhatsApp(invoiceForm, calculatedInvoice)}
                      className="btn bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-800 text-white py-2.5 px-4 flex items-center gap-2 shadow-md transition-colors"
                      title="Share Invoice on WhatsApp"
                    >
                      <WhatsAppIcon className="w-5 h-5" />
                      <span>Share WhatsApp</span>
                    </button>
                  </div>

                </div>

                {/* Preview Column (7 columns out of 12) */}
                <div className="xl:col-span-7 space-y-4">
                  <div className="flex justify-between items-center no-print flex-wrap gap-2">
                    <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" /> Real-time Live Bill Preview
                    </h3>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                        <button 
                          onClick={() => setCurrentTemplate('bill')}
                          className={`toggle-btn ${currentTemplate === 'bill' ? 'toggle-btn-active' : ''}`}
                        >
                          Bill
                        </button>
                        <button 
                          onClick={() => setCurrentTemplate('tax')}
                          className={`toggle-btn ${currentTemplate === 'tax' ? 'toggle-btn-active' : ''}`}
                        >
                          Tax Invoice
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-400">Size:</span>
                        <select
                          value={printSize}
                          onChange={e => setPrintSize(e.target.value)}
                          className="preview-size-select py-1 px-2 text-xs font-bold"
                          style={{ width: 'auto', padding: '0.25rem 0.5rem' }}
                        >
                          <option value="a4">A4 Page</option>
                          <option value="a5">A5 Half-Page</option>
                          <option value="thermal">Thermal POS</option>
                        </select>
                      </div>
                      <button 
                        onClick={() => handleSaveAndPrint(currentTemplate)}
                        className="px-3 py-1.5 btn-preview-print rounded-lg text-xs font-bold flex items-center gap-1 shadow-md transition-colors"
                      >
                        <Printer className="w-4 h-4" /> Print PDF
                      </button>
                      <button 
                        onClick={() => handleShareWhatsApp(invoiceForm, calculatedInvoice)}
                        className="px-3 py-1.5 btn-preview-whatsapp rounded-lg text-xs font-bold flex items-center gap-1 shadow-md transition-colors"
                        title="Share Invoice on WhatsApp"
                      >
                        <WhatsAppIcon className="w-4 h-4" /> Share WhatsApp
                      </button>
                    </div>
                  </div>

                  {/* Render exact paper template matching Excel format */}
                  <div className="bill-paper-container" ref={printRef}>
                    {currentTemplate === 'bill' ? (
                      <div className={`bill-paper print-size-${printSize}`}>
                        <div className="bill-border-box">
                          
                          {/* Company Header Block */}
                          <div className="bill-header-logo-section">
                             <img src="/sanmatisales-logo.jpeg" className="w-14 h-14 rounded-full object-cover border border-slate-200" alt="Logo" />
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
                    ) : (
                      <div className={`bill-paper tally-tax-invoice print-size-${printSize} tally-border p-0 bg-white`}>
                        {/* 1. Header Box */}
                        <div className="flex justify-between items-center p-2 tally-border-b tally-bg-grey text-black">
                          <span className="text-[9px] font-bold">Debit Memo</span>
                          <span className="tally-header-title text-center font-extrabold">TAX INVOICE</span>
                          <span className="text-[9px] font-bold">Original</span>
                        </div>

                        {/* 2. Seller Details */}
                         <div className="p-3 tally-border-b bg-white text-black flex items-center gap-4">
                           <img src="/sanmatisales-logo.jpeg" className="w-14 h-14 rounded-full object-cover border border-slate-200 flex-shrink-0" alt="Sanmati Sales Logo" />
                           <div className="flex-1 text-left">
                             <h1 className="tally-company-name uppercase font-black tracking-wide text-slate-900 leading-tight">SANMATI SALES</h1>
                             <p className="text-[9px] font-semibold text-slate-700 mt-1">
                               Rutvik Patil Udyog Samuh, Khangond Galli, Kumbhoj, 416 111 | Tal- Hatkalangle, Dist.- Kolhapur
                             </p>
                             <div className="flex gap-4 text-[9px] text-slate-700 font-semibold mt-0.5">
                               <span><strong>Mobile No.:</strong> 85305 15022</span>
                               <span><strong>Email:</strong> sanmatisales9027@gmail.com</span>
                             </div>
                             <div className="flex gap-4 text-[9px] text-slate-700 font-semibold mt-0.5">
                               <span><strong>PAN:</strong> GHEPP3279P</span>
                               <span><strong>GSTIN:</strong> {COMPANY_GSTIN}</span>
                             </div>
                           </div>
                         </div>

                        {/* 3. Reference and Party Grid */}
                        <div className="grid grid-cols-2 tally-border-b bg-white text-black">
                          {/* Buyer / Customer Column */}
                          <div className="p-3 tally-border-r space-y-1">
                            <span className="text-[8px] uppercase text-slate-400 font-bold block">Buyer (Bill to)</span>
                            <div className="text-[11px] font-extrabold text-slate-900">{invoiceForm.customerName || '__________________'}</div>
                            {invoiceForm.billingAddress && (
                              <div className="text-[9px] text-slate-700 leading-normal whitespace-pre-wrap">{invoiceForm.billingAddress}</div>
                            )}
                            <div className="pt-1 space-y-0.5 text-[9px] font-semibold text-slate-700">
                              <div><strong>GSTIN:</strong> <span className="font-mono">{invoiceForm.customerGstin || 'N/A'}</span></div>
                              <div><strong>Place of Supply:</strong> {invoiceForm.placeOfSupply}</div>
                            </div>
                          </div>

                          {/* Invoice Meta Column */}
                          <div className="grid grid-rows-4 text-[9px] font-semibold text-black">
                            <div className="grid grid-cols-2 tally-border-b">
                              <div className="p-2 tally-border-r bg-slate-50 text-slate-600">Invoice No.</div>
                              <div className="p-2 font-mono font-bold">{invoiceForm.invoiceNo || '__'}</div>
                            </div>
                            <div className="grid grid-cols-2 tally-border-b">
                              <div className="p-2 tally-border-r bg-slate-50 text-slate-600">Date</div>
                              <div className="p-2 font-bold">{invoiceForm.date ? invoiceForm.date.split('-').reverse().join(' / ') : '__ / __ / ____'}</div>
                            </div>
                            <div className="grid grid-cols-2 tally-border-b">
                              <div className="p-2 tally-border-r bg-slate-50 text-slate-600">Transport Mode</div>
                              <div className="p-2">{invoiceForm.transportMode || '-'}</div>
                            </div>
                            <div className="grid grid-cols-2">
                              <div className="p-2 tally-border-r bg-slate-50 text-slate-600">Vehicle No.</div>
                              <div className="p-2 font-mono font-bold">{invoiceForm.vehicleNo || '-'}</div>
                            </div>
                          </div>
                        </div>

                        {/* 4. Table Items */}
                        <table className="tally-table text-black">
                          <thead>
                            <tr>
                              <th style={{ width: '6%' }} className="text-center">Sl.</th>
                              <th style={{ width: '44%' }} className="text-left">Description of Goods</th>
                              <th style={{ width: '12%' }} className="text-center">HSN/SAC</th>
                              <th style={{ width: '10%' }} className="text-center">Quantity</th>
                              <th style={{ width: '8%' }} className="text-center">Rate</th>
                              <th style={{ width: '8%' }} className="text-center">per</th>
                              <th style={{ width: '12%' }} className="text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {calculatedInvoice.items.map((item, idx) => (
                              <tr key={idx} className="item-row">
                                <td className="text-center font-semibold">{item.sNo}</td>
                                <td className="font-bold text-slate-900">{item.description}</td>
                                <td className="text-center font-mono">{item.hsn || '-'}</td>
                                <td className="text-center font-bold">{item.qty}</td>
                                <td className="text-center">
                                  {item.rate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="text-center">{item.unit}</td>
                                <td className="text-right font-bold">
                                  {item.taxableValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                            ))}
                            {/* Empty spacer rows */}
                            {Array.from({ length: Math.max(0, 5 - calculatedInvoice.items.length) }).map((_, i) => (
                              <tr key={`empty-${i}`} className="item-row" style={{ height: '22px' }}>
                                <td className="text-center">&nbsp;</td>
                                <td>&nbsp;</td>
                                <td>&nbsp;</td>
                                <td>&nbsp;</td>
                                <td>&nbsp;</td>
                                <td>&nbsp;</td>
                                <td>&nbsp;</td>
                              </tr>
                            ))}

                            {/* CGST / SGST Breakdowns if applicable */}
                            {calculatedInvoice.cgstTotal > 0 && (
                              <>
                                <tr className="item-row border-t border-slate-200">
                                  <td>&nbsp;</td>
                                  <td className="text-right font-bold text-slate-500">CGST Amount</td>
                                  <td>&nbsp;</td>
                                  <td>&nbsp;</td>
                                  <td>&nbsp;</td>
                                  <td>&nbsp;</td>
                                  <td className="text-right font-bold text-slate-700">
                                    ₹{calculatedInvoice.cgstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                </tr>
                                <tr className="item-row">
                                  <td>&nbsp;</td>
                                  <td className="text-right font-bold text-slate-500">SGST Amount</td>
                                  <td>&nbsp;</td>
                                  <td>&nbsp;</td>
                                  <td>&nbsp;</td>
                                  <td>&nbsp;</td>
                                  <td className="text-right font-bold text-slate-700">
                                    ₹{calculatedInvoice.sgstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              </>
                            )}
                            {calculatedInvoice.igstTotal > 0 && (
                              <tr className="item-row border-t border-slate-200">
                                <td>&nbsp;</td>
                                <td className="text-right font-bold text-slate-500">IGST Amount</td>
                                <td>&nbsp;</td>
                                <td>&nbsp;</td>
                                <td>&nbsp;</td>
                                <td>&nbsp;</td>
                                <td className="text-right font-bold text-slate-700">
                                  ₹{calculatedInvoice.igstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                            )}

                            {/* Total Row */}
                            <tr className="total-row">
                              <td className="text-center">&nbsp;</td>
                              <td className="text-right font-extrabold text-black">Total</td>
                              <td>&nbsp;</td>
                              <td className="text-center font-extrabold text-black">
                                {calculatedInvoice.items.reduce((sum, item) => sum + item.qty, 0)}
                              </td>
                              <td>&nbsp;</td>
                              <td>&nbsp;</td>
                              <td className="text-right font-extrabold text-black">
                                ₹{calculatedInvoice.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          </tbody>
                        </table>

                        {/* 5. Amount in Words */}
                        <div className="p-3 tally-border-b bg-white text-[9px] text-black">
                          <span className="text-slate-400 font-bold block">Amount Chargeable (in words):</span>
                          <span className="font-extrabold text-slate-900 uppercase tracking-wide block mt-0.5">
                            {numberToWords(calculatedInvoice.grandTotal)}
                          </span>
                        </div>

                        {/* 6. Bank Details block */}
                        <div className="p-3 tally-border-b bg-white text-[9px] text-black grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-slate-400 font-bold block uppercase tracking-wider text-[8px] mb-1">Bank Details (NEFT / RTGS / IMPS)</span>
                            <div className="text-[9px] font-semibold text-slate-800 space-y-0.5">
                              <div>Bank Name: <strong className="text-slate-900">Nandani Sahakari Bank Ltd</strong></div>
                              <div>Branch Name: <strong className="text-slate-900">Kumbhoj</strong></div>
                              <div>Account No.: <strong className="text-slate-900 font-mono text-[10px]">0070002010000163</strong></div>
                              <div>IFSC Code: <strong className="text-slate-900 font-mono text-[10px]">HDFC0CNSBLN</strong></div>
                              <div>Account Holder: <strong className="text-slate-900">SANMATI SALES</strong></div>
                            </div>
                          </div>
                          <div className="text-right flex flex-col justify-end">
                            <p className="text-[8px] text-slate-400 italic">Please mention invoice number in payment remarks.</p>
                          </div>
                        </div>

                        {/* 7. Declaration & Signatures */}
                        <div className="grid grid-cols-2 bg-white text-black">
                          <div className="p-3 tally-border-r text-[8px] text-slate-500 leading-normal">
                            <strong>Declaration:</strong><br />
                            We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
                          </div>
                          <div className="p-3 flex flex-col justify-between items-end h-[75px]">
                            <div className="text-[9px] font-black text-slate-800">for SANMATI SALES</div>
                            <div className="text-[8px] text-slate-400 font-bold uppercase mr-1">Authorised Signatory</div>
                          </div>
                        </div>
                      </div>
                    )}
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
                        <th>Town/City</th>
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
                                onClick={() => {
                                  const metrics = calculateInvoiceMetrics(inv);
                                  handleShareWhatsApp(inv, metrics);
                                }}
                                className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:hover:bg-emerald-900 rounded-lg transition-colors"
                                title="Share invoice on WhatsApp"
                              >
                                <WhatsAppIcon className="w-4 h-4" />
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
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                    <h2 className="text-base font-bold">Autocomplete Product Catalog</h2>
                    
                    {/* Catalog Search Bar */}
                    <div className="relative w-full sm:w-64">
                      <input 
                        type="text" 
                        id="catalogSearch"
                        className="form-input py-1 px-3 text-xs w-full"
                        placeholder="Filter products list..."
                        onChange={(e) => {
                          const val = e.target.value.toLowerCase();
                          const rows = document.querySelectorAll('.catalog-item-row');
                          rows.forEach(row => {
                            const text = row.querySelector('.product-name-cell')?.value.toLowerCase() || '';
                            if (text.includes(val)) {
                              row.classList.remove('hidden');
                            } else {
                              row.classList.add('hidden');
                            }
                          });
                        }}
                      />
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto max-h-[500px]">
                    <table className="edit-table w-full text-xs">
                      <thead>
                        <tr>
                          <th style={{ width: '35%' }}>Product Name</th>
                          <th style={{ width: '15%' }} className="text-center">HSN</th>
                          <th style={{ width: '12%' }} className="text-center">Unit</th>
                          <th style={{ width: '15%' }} className="text-right">Rate (₹)</th>
                          <th style={{ width: '12%' }} className="text-center">GST</th>
                          <th style={{ width: '8%' }} className="text-center">Stock</th>
                          <th style={{ width: '3%' }} className="text-center">Del</th>
                        </tr>
                      </thead>
                      <tbody>
                        {products.map(prod => (
                          <tr key={prod.id || prod.name} className="catalog-item-row hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                            <td>
                              <input 
                                type="text"
                                className="w-full bg-transparent border-0 font-semibold text-slate-800 dark:text-slate-200 focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-indigo-500 rounded px-1 py-0.5 product-name-cell"
                                value={prod.name}
                                onChange={e => handleInlineProductEdit(prod.id, 'name', e.target.value)}
                              />
                            </td>
                            <td>
                              <input 
                                type="text"
                                className="w-full bg-transparent border-0 font-mono text-center text-slate-650 dark:text-slate-400 focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-indigo-500 rounded px-1 py-0.5"
                                value={prod.hsn || ''}
                                placeholder="-"
                                onChange={e => handleInlineProductEdit(prod.id, 'hsn', e.target.value)}
                              />
                            </td>
                            <td>
                              <select 
                                className="w-full bg-transparent border-0 text-center focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-indigo-500 rounded px-1 py-0.5"
                                value={prod.unit || 'Pcs'}
                                onChange={e => handleInlineProductEdit(prod.id, 'unit', e.target.value)}
                              >
                                <option value="Pcs">Pcs</option>
                                <option value="Mtr">Mtr</option>
                                <option value="Box">Box</option>
                                <option value="Kg">Kg</option>
                                <option value="Dzn">Dzn</option>
                              </select>
                            </td>
                            <td className="text-right font-mono">
                              <input 
                                type="number"
                                step="any"
                                className="w-20 bg-transparent border-0 text-right font-mono focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-indigo-500 rounded px-1 py-0.5"
                                value={prod.rate}
                                onChange={e => handleInlineProductEdit(prod.id, 'rate', e.target.value)}
                              />
                            </td>
                            <td className="text-center">
                              <select 
                                className="bg-transparent border-0 text-center text-[10px] font-bold focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-indigo-500 rounded px-1 py-0.5"
                                value={prod.gstRate}
                                onChange={e => handleInlineProductEdit(prod.id, 'gstRate', e.target.value)}
                              >
                                <option value={0}>0%</option>
                                <option value={5}>5%</option>
                                <option value={12}>12%</option>
                                <option value={18}>18%</option>
                                <option value={28}>28%</option>
                              </select>
                            </td>
                            <td className="text-center">
                              <button 
                                type="button"
                                onClick={() => handleInlineProductEdit(prod.id, 'inStock', prod.inStock === false ? true : false)}
                                className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase transition-all flex items-center gap-1 mx-auto ${
                                  prod.inStock !== false 
                                    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200' 
                                    : 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-450 border border-rose-200'
                                }`}
                                title="Toggle stock status"
                              >
                                {prod.inStock !== false ? 'In Stock' : 'Out of Stock'}
                              </button>
                            </td>
                            <td className="text-center">
                              <button 
                                onClick={() => handleProductDelete(prod.id, prod.name)}
                                className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 rounded transition-colors"
                                title="Delete product"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
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
                      <label className="form-label">WhatsApp Number</label>
                      <input 
                        type="text" 
                        className="form-input font-mono" 
                        placeholder="e.g. 919876543210" 
                        value={newCustomerForm.whatsapp}
                        onChange={e => setNewCustomerForm({...newCustomerForm, whatsapp: e.target.value})}
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
                        <label className="form-label">Town/City</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          value={newCustomerForm.state}
                          onChange={e => setNewCustomerForm({...newCustomerForm, state: e.target.value})}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Town/City Code</label>
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
                          <th>WhatsApp</th>
                          <th>GSTIN</th>
                          <th>Place of Supply</th>
                          <th>Address</th>
                          <th className="text-center w-[80px]">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customers.map(cust => (
                          <tr key={cust.id || cust.name}>
                            <td className="font-semibold">{cust.name}</td>
                            <td className="font-mono text-xs">{cust.whatsapp || '-'}</td>
                            <td className="font-mono text-xs">{cust.gstin || 'Unregistered'}</td>
                            <td><span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-xs font-semibold text-slate-600 dark:text-slate-400">{cust.state} ({cust.stateCode})</span></td>
                            <td className="text-xs max-w-xs truncate" title={cust.address}>{cust.address}</td>
                            <td className="text-center">
                               <button
                                 type="button"
                                 onClick={() => handleCustomerDelete(cust.id, cust.name)}
                                 className="p-1 text-rose-500 hover:bg-rose-50 hover:dark:bg-rose-950/30 rounded transition-colors inline-flex items-center justify-center"
                                 title="Delete Customer"
                               >
                                 <Trash2 className="w-4 h-4" />
                               </button>
                             </td>
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
                
                {/* Connection Info */}
                <div className="glass-panel p-6 space-y-4">
                  <h2 className="text-base font-bold pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5">
                    <Database className="w-5 h-5 text-indigo-500" />
                    <span>Database Status</span>
                  </h2>
                  <div className="space-y-4">
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 rounded-xl flex items-center gap-3 border border-emerald-100 dark:border-emerald-900/50">
                      <CheckCircle className="w-5 h-5 flex-shrink-0" />
                      <div className="text-xs font-semibold">
                        Connected to Cloud Firestore database: <strong>sanmati-sales</strong>
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Firebase Project ID</label>
                      <input 
                        type="text" 
                        className="form-input font-mono text-xs bg-slate-50 dark:bg-slate-900/50 text-slate-500" 
                        readOnly 
                        value="do-not-delete-apis-31161"
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Business GSTIN (Hardcoded)</label>
                      <input 
                        type="text" 
                        className="form-input font-mono text-xs bg-slate-50 dark:bg-slate-900/50 text-slate-500 font-bold" 
                        readOnly 
                        value={COMPANY_GSTIN}
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        Your business GSTIN is locked in the code.
                      </p>
                    </div>
                  </div>
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
        © 2026 Sanmati Sales Billing Engine. Powered by Google Cloud Firestore. Secure, serverless, standard-compliant.
      </footer>
    </div>
  );
}
