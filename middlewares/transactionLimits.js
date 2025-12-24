// ===============================================
// middleware/transactionLimits.js
// ===============================================
const Transaction = require('../models/Transaction');
const User = require('../models/User');
// Daily transaction limits
const DAILY_LIMITS = {
  payment: 100000, // ₦100,000 per day
  topup: 50000,    // ₦50,000 per day
  totalTransactions: 50 // Maximum 50 transactions per day
};
const checkDailyLimits = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { amount, type = 'payment' } = req.body;
    // Get start of current day
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    // Get user's transactions for today
    const todayTransactions = await Transaction.find({
      sender: userId,
      timestamp: { $gte: startOfDay },
      status: { $in: ['completed', 'pending'] }
    });
    // Check transaction count limit
    if (todayTransactions.length >= DAILY_LIMITS.totalTransactions) {
      return res.status(429).json({
        success: false,
        message: 'Daily transaction limit reached. Please try again tomorrow.'
      });
    }
    // Calculate today's total for the transaction type
    const todayTotal = todayTransactions
      .filter(txn => txn.type === type)
      .reduce((sum, txn) => sum + txn.amount, 0);
    // Check amount limit
    const dailyLimit = DAILY_LIMITS[type] || DAILY_LIMITS.payment;
    if (todayTotal + amount > dailyLimit) {
      return res.status(429).json({
        success: false,
        message: `Daily ${type} limit of ₦${dailyLimit.toLocaleString()} would be exceeded.`
      });
    }
    next();
  } catch (error) {
    console.error('Error checking daily limits:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to verify transaction limits'
    });
  }
};
// Rate limiting for API calls
const rateLimit = require('express-rate-limit');
const transactionRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Maximum 10 transaction requests per minute
  message: {
    success: false,
    message: 'Too many transaction requests. Please slow down.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
module.exports = {
  checkDailyLimits,
  transactionRateLimit
};
