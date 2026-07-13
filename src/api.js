// API Abstraction Layer for Reusable Bill Generator using Firebase Firestore
import { db, auth, googleProvider } from './firebase';
import { 
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, 
  query, where, orderBy, writeBatch 
} from 'firebase/firestore';
import { signInWithPopup, signOut } from 'firebase/auth';

// Helper to determine if we are running in localhost or production
const isProd = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

// Default products to seed if database collections are empty
const DEFAULT_PRODUCTS = [
  { name: 'Line dori', hsn: '5607', unit: 'Pcs', rate: 68, gstRate: 0, inStock: true },
  { name: 'Big Line Dori', hsn: '5607', unit: 'Pcs', rate: 40, gstRate: 0, inStock: true },
  { name: 'One two', hsn: '7326', unit: 'Pcs', rate: 68, gstRate: 0, inStock: true },
  { name: 'uPvc vale 1/2"', hsn: '8481', unit: 'Pcs', rate: 48, gstRate: 0, inStock: true },
  { name: 'uPvc vale 3/4"', hsn: '8481', unit: 'Pcs', rate: 68, gstRate: 0, inStock: true },
  { name: 'uPvc vale 1"', hsn: '8481', unit: 'Pcs', rate: 88, gstRate: 0, inStock: true },
  { name: 'Nylon rassi', hsn: '5607', unit: 'Pcs', rate: 15, gstRate: 0, inStock: true },
  { name: 'Hexa blade', hsn: '8202', unit: 'Pcs', rate: 7.2, gstRate: 0, inStock: true },
  { name: 'Nylon Rassi 5mtr', hsn: '5607', unit: 'Pcs', rate: 15, gstRate: 0, inStock: true },
  { name: 'Dog chain', hsn: '7315', unit: 'Pcs', rate: 65, gstRate: 0, inStock: true },
  { name: 'Tapflon Tape', hsn: '3920', unit: 'Pcs', rate: 9, gstRate: 0, inStock: true },
  { name: 'Upvc Valve 1/2"', hsn: '8481', unit: 'Pcs', rate: 48, gstRate: 0, inStock: true },
  { name: 'Upvc Valve 3/4"', hsn: '8481', unit: 'Pcs', rate: 68, gstRate: 0, inStock: true },
  { name: 'Upvc Valve 1"', hsn: '8481', unit: 'Pcs', rate: 88, gstRate: 0, inStock: true },
  { name: 'Pentagon', hsn: '3926', unit: 'Pcs', rate: 45, gstRate: 0, inStock: true },
  { name: 'Waste Pipe', hsn: '3917', unit: 'Pcs', rate: 30, gstRate: 0, inStock: true },
  { name: 'Electric tape', hsn: '8546', unit: 'Pcs', rate: 5, gstRate: 0, inStock: true }
];

export const api = {
  // Legacy support compatibility
  getMode() {
    return 'live';
  },
  setMode() {},
  getGoogleClientId() { return ''; },
  setGoogleClientId() {},
  getSpreadsheetId() { return 'firestore-db'; },
  setSpreadsheetId() {},
  setGoogleToken() {},
  hasGoogleToken() {
    return !!auth.currentUser;
  },

  // Auth Operations
  async loginWithGoogle() {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    return {
      email: user.email,
      name: user.displayName,
      picture: user.photoURL
    };
  },

  async logout() {
    await signOut(auth);
    localStorage.removeItem('company_gstin');
  },

  getSession() {
    const user = auth.currentUser;
    if (!user) return null;
    return {
      email: user.email,
      name: user.displayName,
      picture: user.photoURL
    };
  },

  saveUserSession() {},
  getUserSession() {
    return this.getSession();
  },
  clearSession() {
    signOut(auth);
  },

  // Whitelist/User check
  async verifyUser(email) {
    const cleanEmail = email.toLowerCase().trim();
    
    // Auto-authorize owners as Admins
    if (cleanEmail === 'pratikpshetti45@gmail.com' || cleanEmail === 'sanmatisales9027@gmail.com') {
      try {
        await setDoc(doc(db, 'whitelist', cleanEmail), { role: 'Admin' });
      } catch (e) {
        console.warn('Persisting owner to database whitelist failed (continuing sign-in):', e);
      }
      return { email: cleanEmail, role: 'Admin' };
    }

    const whitelistDoc = await getDoc(doc(db, 'whitelist', cleanEmail));
    if (whitelistDoc.exists()) {
      return { email: cleanEmail, role: whitelistDoc.data().role || 'User' };
    }
    throw new Error(`Access Denied: ${cleanEmail} is not whitelisted in the system.`);
  },

  async getWhitelist() {
    const querySnapshot = await getDocs(collection(db, 'whitelist'));
    const list = [];
    querySnapshot.forEach((doc) => {
      list.push(doc.id);
    });
    return list;
  },

  async addToWhitelist(email, role = 'User') {
    await setDoc(doc(db, 'whitelist', email.toLowerCase().trim()), {
      role,
      addedAt: new Date().toISOString()
    });
    return { success: true };
  },

  async removeFromWhitelist(email) {
    await deleteDoc(doc(db, 'whitelist', email.toLowerCase().trim()));
    return { success: true };
  },

  // Products
  async getProducts() {
    const querySnapshot = await getDocs(collection(db, 'products'));
    let productsList = [];
    querySnapshot.forEach((doc) => {
      productsList.push({
        id: doc.id,
        ...doc.data()
      });
    });

    // Seed defaults if empty
    if (productsList.length === 0) {
      const batch = writeBatch(db);
      DEFAULT_PRODUCTS.forEach((prod) => {
        const docRef = doc(collection(db, 'products'));
        batch.set(docRef, prod);
        productsList.push({ id: docRef.id, ...prod });
      });
      await batch.commit();
    }

    return productsList;
  },

  async saveProduct(product) {
    const prodId = product.id || doc(collection(db, 'products')).id;
    const payload = {
      name: product.name.trim(),
      hsn: product.hsn ? product.hsn.trim() : '',
      unit: product.unit ? product.unit.trim() : 'Pcs',
      rate: parseFloat(product.rate) || 0,
      gstRate: parseInt(product.gstRate, 10) || 0,
      stockQty: product.stockQty !== undefined && product.stockQty !== '' ? parseFloat(product.stockQty) : '',
      inStock: product.inStock !== undefined ? product.inStock : true,
      updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, 'products', prodId), payload, { merge: true });
    return { success: true };
  },

  async deleteProduct(productId) {
    await deleteDoc(doc(db, 'products', productId));
    return { success: true };
  },

  // Customers
  async getCustomers() {
    const querySnapshot = await getDocs(collection(db, 'customers'));
    const customersList = [];
    querySnapshot.forEach((doc) => {
      customersList.push({
        id: doc.id,
        ...doc.data()
      });
    });
    return customersList;
  },

  async saveCustomer(customer) {
    const custId = customer.id || doc(collection(db, 'customers')).id;
    const payload = {
      name: customer.name.trim(),
      address: customer.address ? customer.address.trim() : '',
      gstin: customer.gstin ? customer.gstin.trim() : '',
      whatsapp: customer.whatsapp ? customer.whatsapp.trim() : '',
      state: customer.state ? customer.state.trim() : 'Maharashtra',
      stateCode: customer.stateCode ? customer.stateCode.trim() : '27',
      updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, 'customers', custId), payload, { merge: true });
    return { success: true };
  },

  async deleteCustomer(customerId) {
    await deleteDoc(doc(db, 'customers', customerId));
    return { success: true };
  },

  // Invoices
  async getInvoices() {
    const q = query(collection(db, 'invoices'), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    const invoicesList = [];
    querySnapshot.forEach((doc) => {
      invoicesList.push(doc.data());
    });
    return invoicesList;
  },

  async saveInvoice(invoice) {
    const cleanInvoiceNo = invoice.invoiceNo.toString().trim();
    const payload = {
      ...invoice,
      invoiceNo: cleanInvoiceNo,
      updatedAt: new Date().toISOString(),
      createdAt: invoice.createdAt || new Date().toISOString()
    };
    await setDoc(doc(db, 'invoices', cleanInvoiceNo), payload);
    return { success: true };
  },

  async deleteInvoice(invoiceNo) {
    await deleteDoc(doc(db, 'invoices', invoiceNo.toString().trim()));
    return { success: true };
  },

  // Company Settings
  async getCompanyGstin() {
    return '27GHEPP3279P1ZE';
  },

  async saveCompanyGstin(gstin) {
    return { success: true };
  }
};
