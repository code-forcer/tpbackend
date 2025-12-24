// ===============================================
// utils/transactionHelpers.js
// ===============================================
const crypto = require("crypto");
// Generate secure transaction reference
const generateTransactionReference = () => {
  const timestamp = Date.now().toString();
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `FLD${timestamp.slice(-8)}${random}`;
};

// Calculate transaction fees (if applicable)
const calculateTransactionFees = (amount, transactionType = "payment") => {
  // Free for now, but you can implement fee structure here
  const feeStructure = {
    payment: 0, // No fees for peer-to-peer payments
    topup: 0, // No fees for top-ups
    withdrawal: (amount) => Math.max(amount * 0.01, 50), // 1% fee, minimum ₦50
  };

  return feeStructure[transactionType] || 0;
};

// Format currency for display
const formatCurrency = (amount, currency = "₦") => {
  return `${currency}${amount.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

// Validate wallet ID format
const isValidWalletId = (walletId) => {
  // Wallet ID should start with 'FLD' followed by 8-12 alphanumeric characters
  const walletIdRegex = /^FLD[A-Z0-9]{8,12}$/;
  return walletIdRegex.test(walletId);
};

// Generate QR code data structure
const generateQRData = (user, amount = null) => {
  return JSON.stringify({
    walletId: user.walletId,
    name: user.name,
    type: "payment_request",
    amount: amount,
    timestamp: Date.now(),
    version: "1.0",
  });
};

// Parse and validate QR code data
const parseQRData = (qrString) => {
  try {
    const data = JSON.parse(qrString);

    // Validate required fields
    if (!data.walletId || !data.name || data.type !== "payment_request") {
      throw new Error("Invalid QR code format");
    }

    // Check if QR code is not too old (valid for 24 hours)
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    if (Date.now() - data.timestamp > maxAge) {
      throw new Error("QR code has expired");
    }
    return data;
  } catch (error) {
    throw new Error("Invalid QR code data");
  }
};
// Log transaction for audit trail
const logTransaction = (transaction, action, userId, metadata = {}) => {
  console.log(`[TRANSACTION ${action.toUpperCase()}]`, {
    transactionId: transaction.transactionId,
    userId: userId,
    amount: transaction.amount,
    type: transaction.type,
    status: transaction.status,
    timestamp: new Date().toISOString(),
    ...metadata,
  });
};
module.exports = {
  generateTransactionReference,
  calculateTransactionFees,
  formatCurrency,
  isValidWalletId,
  generateQRData,
  parseQRData,
  logTransaction,
};
