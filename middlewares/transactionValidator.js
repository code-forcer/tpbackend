// ===============================================
// middleware/transactionValidator.js
// ===============================================
const { body, validationResult } = require('express-validator');
// Validation rules for transfer
const validateTransfer = [
  body('recipientWalletId')
    .notEmpty()
    .withMessage('Recipient wallet ID is required')
    .isLength({ min: 6, max: 20 })
    .withMessage('Invalid wallet ID format'),
  body('amount')
    .isFloat({ min: 0.01, max: 1000000 })
    .withMessage('Amount must be between ₦0.01 and ₦1,000,000'),
  body('note')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Note cannot exceed 500 characters')
];
// Validation rules for top-up
const validateTopUp = [
  body('amount')
    .isFloat({ min: 1, max: 50000 })
    .withMessage('Top-up amount must be between ₦1 and ₦50,000')
];
// Middleware to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};
module.exports = {
  validateTransfer,
  validateTopUp,
  handleValidationErrors
};
