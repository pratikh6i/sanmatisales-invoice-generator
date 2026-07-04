/**
 * Reusable Bill Generator - Google Apps Script Backend
 * 
 * Instructions:
 * 1. Create a Google Sheet.
 * 2. Create the following sheets (tabs) in it:
 *    - "Invoices" (Columns: Invoice No, Date, Customer Name, Billing Address, Shipping Address, GSTIN, Place of Supply, Subtotal, Discount, Tax Amount, Grand Total, Created By, Created At)
 *    - "InvoiceItems" (Columns: Invoice No, S.No., Item Description, HSN/SAC, Qty, Unit, Rate, Taxable Value, GST Rate (%), CGST Rate, CGST Amount, SGST Rate, SGST Amount, IGST Rate, IGST Amount, Total Amount)
 *    - "Products" (Columns: Product Name, HSN/SAC, Unit, Default Rate, GST Rate (%))
 *    - "Customers" (Columns: Customer Name, Billing Address, Shipping Address, GSTIN, State, State Code)
 *    - "Whitelist" (Columns: Email Address, Role)
 * 3. Open Extensions > Apps Script, paste this script, and update GOOGLE_CLIENT_ID if checking audience.
 * 4. Click "Deploy" > "New deployment" > Select "Web app".
 *    - Execute as: "Me" (your account)
 *    - Who has access: "Anyone"
 * 5. Copy the deployed Web App URL and paste it into the application connection settings.
 */

// Set this to your Google Cloud OAuth 2.0 Web Client ID to verify token audience
// If left blank, script will verify token validity with Google but bypass Client ID validation
var GOOGLE_CLIENT_ID = ""; 

function doPost(e) {
  var corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return errorResponse("Empty request payload", corsHeaders);
    }
    
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;
    var idToken = payload.idToken;
    
    if (!action) {
      return errorResponse("Missing 'action' parameter", corsHeaders);
    }
    
    // 1. Authenticate user using the Google ID Token
    var email = "";
    if (action === "verifyAuth" && !idToken) {
      // Allow logging in for setup or check if we can bypass. If no token, reject.
      return errorResponse("ID Token is required for authentication", corsHeaders);
    }
    
    if (idToken) {
      email = verifyGoogleIdToken(idToken);
      if (!email) {
        return errorResponse("Unauthorized: Google ID token verification failed", corsHeaders);
      }
    } else {
      return errorResponse("Unauthorized: Missing ID token", corsHeaders);
    }
    
    // 2. Authorize user against the Whitelist sheet
    var whitelist = getWhitelistEmails();
    var normalizedEmail = email.toLowerCase();
    
    // Automatically whitelist the owner/creator of the script
    var ownerEmail = Session.getEffectiveUser().getEmail().toLowerCase();
    var isAuthorized = (normalizedEmail === ownerEmail) || whitelist.indexOf(normalizedEmail) !== -1;
    
    if (!isAuthorized) {
      return errorResponse("Access denied: " + email + " is not on the whitelisted emails list.", corsHeaders);
    }

    // Determine user role (Owner has Admin, check whitelist for others)
    var role = (normalizedEmail === ownerEmail) ? "Admin" : getEmailRole(normalizedEmail);

    // 3. Route Actions
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var res = { success: true };
    
    switch (action) {
      case "verifyAuth":
        res.user = { email: email, role: role };
        break;
        
      case "getProducts":
        res.products = getSheetRowsAsJson(ss.getSheetByName("Products"));
        break;
        
      case "saveProduct":
        saveProductRow(ss.getSheetByName("Products"), payload.product);
        break;
        
      case "getCustomers":
        res.customers = getSheetRowsAsJson(ss.getSheetByName("Customers"));
        break;
        
      case "saveCustomer":
        saveCustomerRow(ss.getSheetByName("Customers"), payload.customer);
        break;
        
      case "getInvoices":
        res.invoices = getInvoicesWithItems(ss);
        break;
        
      case "saveInvoice":
        saveInvoiceData(ss, payload.invoice, email);
        break;
        
      case "deleteInvoice":
        deleteInvoiceData(ss, payload.invoiceNo);
        break;
        
      case "getWhitelist":
        res.whitelist = whitelist;
        break;
        
      case "addToWhitelist":
        if (role !== "Admin") return errorResponse("Requires Admin permissions", corsHeaders);
        addToWhitelistSheet(ss.getSheetByName("Whitelist"), payload.email, payload.role);
        break;
        
      case "removeFromWhitelist":
        if (role !== "Admin") return errorResponse("Requires Admin permissions", corsHeaders);
        removeFromWhitelistSheet(ss.getSheetByName("Whitelist"), payload.email);
        break;
        
      default:
        return errorResponse("Unknown action: " + action, corsHeaders);
    }
    
    return successResponse(res, corsHeaders);
    
  } catch (err) {
    return errorResponse("Server Error: " + err.toString(), corsHeaders);
  }
}

// Enable OPTIONS preflight requests if needed (Vite dev server might send them)
function doOptions(e) {
  var output = ContentService.createTextOutput("");
  output.setMimeType(ContentService.MimeType.TEXT);
  return output;
}

// Google OAuth ID Token Verification
function verifyGoogleIdToken(idToken) {
  try {
    var response = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + idToken, {
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() !== 200) {
      return null;
    }
    
    var tokenInfo = JSON.parse(response.getContentText());
    
    // Optional Audience Verification
    if (GOOGLE_CLIENT_ID && tokenInfo.aud !== GOOGLE_CLIENT_ID) {
      Logger.log("Token audience mismatch. Expected: " + GOOGLE_CLIENT_ID + " but got: " + tokenInfo.aud);
      return null;
    }
    
    return tokenInfo.email;
  } catch (e) {
    Logger.log("Error in token verification: " + e.toString());
    return null;
  }
}

// Database helper functions
function getWhitelistEmails() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Whitelist");
  if (!sheet) return [];
  
  var data = sheet.getDataRange().getValues();
  var emails = [];
  for (var i = 1; i < data.length; i++) { // Skip header row
    if (data[i][0]) {
      emails.push(data[i][0].toString().toLowerCase().trim());
    }
  }
  return emails;
}

function getEmailRole(email) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Whitelist");
  if (!sheet) return "User";
  
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString().toLowerCase().trim() === email) {
      return data[i][1] || "User";
    }
  }
  return "User";
}

function getSheetRowsAsJson(sheet) {
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  var headers = data[0];
  var result = [];
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var key = toCamelCase(headers[j]);
      obj[key] = row[j];
    }
    result.push(obj);
  }
  return result;
}

function toCamelCase(str) {
  return str.replace(/(?:^\w|[A-Z]|\b\w)/g, function(word, index) {
    return index === 0 ? word.toLowerCase() : word.toUpperCase();
  }).replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');
}

// Product Management
function saveProductRow(sheet, product) {
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  var foundIndex = -1;
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString().toLowerCase().trim() === product.name.toLowerCase().trim()) {
      foundIndex = i + 1; // 1-indexed row number
      break;
    }
  }
  
  var rowValues = [product.name, product.hsn, product.unit, product.rate, product.gstRate];
  if (foundIndex > -1) {
    sheet.getRange(foundIndex, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
}

// Customer Management
function saveCustomerRow(sheet, customer) {
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  var foundIndex = -1;
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString().toLowerCase().trim() === customer.name.toLowerCase().trim()) {
      foundIndex = i + 1;
      break;
    }
  }
  
  var rowValues = [customer.name, customer.address, customer.address, customer.gstin, customer.state, customer.stateCode];
  if (foundIndex > -1) {
    sheet.getRange(foundIndex, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
}

// Whitelist configuration
function addToWhitelistSheet(sheet, email, role) {
  if (!sheet) return;
  var emails = getWhitelistEmails();
  if (emails.indexOf(email.toLowerCase().trim()) === -1) {
    sheet.appendRow([email.toLowerCase().trim(), role || "User"]);
  }
}

function removeFromWhitelistSheet(sheet, email) {
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  var targetEmail = email.toLowerCase().trim();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString().toLowerCase().trim() === targetEmail) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
}

// Invoice Correlator
function getInvoicesWithItems(ss) {
  var invoicesSheet = ss.getSheetByName("Invoices");
  var itemsSheet = ss.getSheetByName("InvoiceItems");
  
  var invoices = getSheetRowsAsJson(invoicesSheet);
  var items = getSheetRowsAsJson(itemsSheet);
  
  // Index items by Invoice No
  var itemsMap = {};
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var invNo = item.invoiceNo.toString().trim();
    if (!itemsMap[invNo]) itemsMap[invNo] = [];
    itemsMap[invNo].push(item);
  }
  
  // Attach items to invoice
  for (var j = 0; j < invoices.length; j++) {
    var inv = invoices[j];
    var invNoKey = inv.invoiceNo.toString().trim();
    inv.items = itemsMap[invNoKey] || [];
  }
  
  // Return descending by invoice creation / number
  return invoices.reverse();
}

function saveInvoiceData(ss, invoice, creatorEmail) {
  var invoicesSheet = ss.getSheetByName("Invoices");
  var itemsSheet = ss.getSheetByName("InvoiceItems");
  
  // 1. Save or Update Invoice Meta
  var invData = invoicesSheet.getDataRange().getValues();
  var invoiceNo = invoice.invoiceNo.toString().trim();
  var foundMetaRow = -1;
  
  for (var i = 1; i < invData.length; i++) {
    if (invData[i][0].toString().trim() === invoiceNo) {
      foundMetaRow = i + 1;
      break;
    }
  }
  
  var nowStr = new Date().toISOString();
  var metaValues = [
    invoiceNo,
    invoice.date,
    invoice.customerName,
    invoice.billingAddress,
    invoice.shippingAddress || invoice.billingAddress,
    invoice.customerGstin,
    invoice.placeOfSupply,
    invoice.subtotal,
    invoice.discount,
    invoice.taxTotal,
    invoice.grandTotal,
    creatorEmail,
    foundMetaRow > -1 ? invData[foundMetaRow-1][12] : nowStr // Keep original createdAt if updating
  ];
  
  if (foundMetaRow > -1) {
    invoicesSheet.getRange(foundMetaRow, 1, 1, metaValues.length).setValues([metaValues]);
    
    // 2. Clear old items for this invoice number
    var itemData = itemsSheet.getDataRange().getValues();
    // Delete in reverse order to keep indices correct
    for (var j = itemData.length - 1; j >= 1; j--) {
      if (itemData[j][0].toString().trim() === invoiceNo) {
        itemsSheet.deleteRow(j + 1);
      }
    }
  } else {
    invoicesSheet.appendRow(metaValues);
  }
  
  // 3. Insert items
  for (var k = 0; k < invoice.items.length; k++) {
    var item = invoice.items[k];
    var itemValues = [
      invoiceNo,
      item.sNo,
      item.description,
      item.hsn,
      item.qty,
      item.unit,
      item.rate,
      item.taxableValue,
      item.gstRate,
      item.cgstRate || 0,
      item.cgstAmount || 0,
      item.sgstRate || 0,
      item.sgstAmount || 0,
      item.igstRate || 0,
      item.igstAmount || 0,
      item.totalAmount || 0
    ];
    itemsSheet.appendRow(itemValues);
  }
}

function deleteInvoiceData(ss, invoiceNo) {
  var invoicesSheet = ss.getSheetByName("Invoices");
  var itemsSheet = ss.getSheetByName("InvoiceItems");
  
  var invoiceNoStr = invoiceNo.toString().trim();
  
  // Delete metadata row
  var invData = invoicesSheet.getDataRange().getValues();
  for (var i = invData.length - 1; i >= 1; i--) {
    if (invData[i][0].toString().trim() === invoiceNoStr) {
      invoicesSheet.deleteRow(i + 1);
    }
  }
  
  // Delete item rows
  var itemData = itemsSheet.getDataRange().getValues();
  for (var j = itemData.length - 1; j >= 1; j--) {
    if (itemData[j][0].toString().trim() === invoiceNoStr) {
      itemsSheet.deleteRow(j + 1);
    }
  }
}

// Web App responses formats
function successResponse(data, headers) {
  data.success = true;
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorResponse(message, headers) {
  var data = { success: false, error: message };
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
