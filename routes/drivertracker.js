//Import Essentials
const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const requireAuth = require("../middlewares/requireAuth");

// ===============================================
// MODELS - Defined inline to avoid import issues
// ===============================================

// Driver Expense Schema
const driverExpenseSchema = new mongoose.Schema(
  {
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: ["fuel", "maintenance", "food", "toll", "insurance", "other"],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [0.01, "Amount must be greater than 0"],
    },
    description: {
      type: String,
      required: true,
      maxlength: 200,
    },
    notes: {
      type: String,
      maxlength: 500,
      default: "",
    },
    receiptImage: {
      type: String,
      default: null,
    },
    location: {
      latitude: Number,
      longitude: Number,
      address: String,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved",
    },
  },
  {
    timestamps: true,
  }
);

// Driver Earning Schema
const driverEarningSchema = new mongoose.Schema(
  {
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["trip", "bonus", "tip", "fuel_allowance", "other"],
      required: true,
      default: "trip",
    },
    amount: {
      type: Number,
      required: true,
      min: [0.01, "Amount must be greater than 0"],
    },
    description: {
      type: String,
      required: true,
      maxlength: 200,
    },
    notes: {
      type: String,
      maxlength: 500,
      default: "",
    },
    tripDetails: {
      tripId: String,
      distance: Number,
      duration: Number,
      pickupLocation: String,
      dropoffLocation: String,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "cancelled"],
      default: "completed",
    },
  },
  {
    timestamps: true,
  }
);

// Create models
const DriverExpense =
  mongoose.models.DriverExpense ||
  mongoose.model("DriverExpense", driverExpenseSchema);

const DriverEarning =
  mongoose.models.DriverEarning ||
  mongoose.model("DriverEarning", driverEarningSchema);

// User model reference (assuming it exists)
const User =
  mongoose.models.User ||
  mongoose.model(
    "User",
    new mongoose.Schema({
      name: String,
      email: String,
      role: String,
      walletId: String,
      walletBalance: { type: Number, default: 0 }, // Added wallet balance field
    })
  );

// ===============================================
// MIDDLEWARE
// ===============================================

// Driver role check
const ensureDriver = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.role !== "driver") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Driver role required.",
      });
    }
    next();
  } catch (error) {
    console.error("Driver check error:", error);
    res.status(500).json({
      success: false,
      message: "Error verifying user role",
    });
  }
};

// Validation middleware
const validateExpense = [
  body("category")
    .isIn(["fuel", "maintenance", "food", "toll", "insurance", "other"])
    .withMessage("Invalid expense category"),
  body("amount")
    .isFloat({ min: 0.01, max: 1000000 })
    .withMessage("Amount must be between ₦0.01 and ₦1,000,000"),
  body("description")
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage("Description must be between 1 and 200 characters"),
  body("notes")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Notes cannot exceed 500 characters"),
];

const validateEarning = [
  body("type")
    .isIn(["trip", "bonus", "tip", "fuel_allowance", "other"])
    .withMessage("Invalid earning type"),
  body("amount")
    .isFloat({ min: 0.01, max: 1000000 })
    .withMessage("Amount must be between ₦0.01 and ₦1,000,000"),
  body("description")
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage("Description must be between 1 and 200 characters"),
];

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array(),
    });
  }
  next();
};

// ===============================================
// EXPENSE ROUTES
// ===============================================

// Get all expenses for a driver
router.get("/expenses", requireAuth, ensureDriver, async (req, res) => {
  try {
    const driverId = req.user.id;
    const { page = 1, limit = 50, category, startDate, endDate } = req.query;

    // Build query
    const query = { driver: driverId };

    if (category && category !== "all") {
      query.category = category;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Get expenses with pagination
    const expenses = await DriverExpense.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .lean();

    const total = await DriverExpense.countDocuments(query);

    res.json({
      success: true,
      expenses,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
      },
    });
  } catch (error) {
    console.error("Error fetching expenses:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch expenses",
      error: error.message,
    });
  }
});

// Add new expense
router.post(
  "/expenses",
  requireAuth,
  ensureDriver,
  validateExpense,
  handleValidationErrors,
  async (req, res) => {
    try {
      const driverId = req.user.id;
      const { category, amount, description, notes, location } = req.body;

      const expenseData = {
        driver: driverId,
        category,
        amount: parseFloat(amount),
        description: description.trim(),
        notes: notes ? notes.trim() : "",
      };

      if (location) {
        expenseData.location = location;
      }

      const expense = new DriverExpense(expenseData);
      await expense.save();

      res.status(201).json({
        success: true,
        message: "Expense added successfully",
        expense,
      });
    } catch (error) {
      console.error("Error adding expense:", error);
      res.status(500).json({
        success: false,
        message: "Failed to add expense",
        error: error.message,
      });
    }
  }
);

// Update expense
router.put(
  "/expenses/:id",
  requireAuth,
  ensureDriver,
  validateExpense,
  handleValidationErrors,
  async (req, res) => {
    try {
      const driverId = req.user.id;
      const expenseId = req.params.id;
      const { category, amount, description, notes } = req.body;

      // Validate ObjectId
      if (!mongoose.Types.ObjectId.isValid(expenseId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid expense ID",
        });
      }

      const expense = await DriverExpense.findOne({
        _id: expenseId,
        driver: driverId,
      });

      if (!expense) {
        return res.status(404).json({
          success: false,
          message: "Expense not found",
        });
      }

      // Update expense
      expense.category = category;
      expense.amount = parseFloat(amount);
      expense.description = description.trim();
      expense.notes = notes ? notes.trim() : "";

      await expense.save();

      res.json({
        success: true,
        message: "Expense updated successfully",
        expense,
      });
    } catch (error) {
      console.error("Error updating expense:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update expense",
        error: error.message,
      });
    }
  }
);

// Delete expense
router.delete("/expenses/:id", requireAuth, ensureDriver, async (req, res) => {
  try {
    const driverId = req.user.id;
    const expenseId = req.params.id;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(expenseId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid expense ID",
      });
    }

    const expense = await DriverExpense.findOneAndDelete({
      _id: expenseId,
      driver: driverId,
    });

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: "Expense not found",
      });
    }

    res.json({
      success: true,
      message: "Expense deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting expense:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete expense",
      error: error.message,
    });
  }
});

// ===============================================
// EARNINGS ROUTES
// ===============================================

// Get all earnings for a driver
router.get("/earnings", requireAuth, ensureDriver, async (req, res) => {
  try {
    const driverId = req.user.id;
    const { page = 1, limit = 50, type, startDate, endDate } = req.query;

    // Build query
    const query = { driver: driverId };

    if (type && type !== "all") {
      query.type = type;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Get earnings with pagination
    const earnings = await DriverEarning.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .lean();

    const total = await DriverEarning.countDocuments(query);

    res.json({
      success: true,
      earnings,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
      },
    });
  } catch (error) {
    console.error("Error fetching earnings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch earnings",
      error: error.message,
    });
  }
});

// Add new earning
router.post(
  "/earnings",
  requireAuth,
  ensureDriver,
  validateEarning,
  handleValidationErrors,
  async (req, res) => {
    try {
      const driverId = req.user.id;
      const { type, amount, description, tripDetails, notes } = req.body;

      const earning = new DriverEarning({
        driver: driverId,
        type,
        amount: parseFloat(amount),
        description: description.trim(),
        notes: notes ? notes.trim() : "",
        tripDetails: tripDetails || {},
      });

      await earning.save();

      res.status(201).json({
        success: true,
        message: "Earning added successfully",
        earning,
      });
    } catch (error) {
      console.error("Error adding earning:", error);
      res.status(500).json({
        success: false,
        message: "Failed to add earning",
        error: error.message,
      });
    }
  }
);

// ===============================================
// STATISTICS ROUTES (FIXED)
// ===============================================

// Get driver statistics
router.get("/stats", requireAuth, ensureDriver, async (req, res) => {
  try {
    const driverId = req.user.id;

    // Validate driver ID
    if (!mongoose.Types.ObjectId.isValid(driverId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid driver ID",
      });
    }

    const driverObjectId = new mongoose.Types.ObjectId(driverId);

    // Get current date info
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    try {
      // Get total earnings
      const totalEarningsResult = await DriverEarning.aggregate([
        { $match: { driver: driverObjectId, status: { $ne: "cancelled" } } },
        {
          $group: {
            _id: null,
            totalIncome: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]);

      // Get total expenses
      const totalExpensesResult = await DriverExpense.aggregate([
        { $match: { driver: driverObjectId, status: { $ne: "rejected" } } },
        {
          $group: {
            _id: null,
            totalExpenses: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]);

      // Get weekly earnings
      const weeklyEarningsResult = await DriverEarning.aggregate([
        {
          $match: {
            driver: driverObjectId,
            createdAt: { $gte: startOfWeek },
            status: { $ne: "cancelled" },
          },
        },
        {
          $group: {
            _id: null,
            weeklyEarnings: { $sum: "$amount" },
          },
        },
      ]);

      // Get monthly earnings
      const monthlyEarningsResult = await DriverEarning.aggregate([
        {
          $match: {
            driver: driverObjectId,
            createdAt: { $gte: startOfMonth },
            status: { $ne: "cancelled" },
          },
        },
        {
          $group: {
            _id: null,
            monthlyEarnings: { $sum: "$amount" },
          },
        },
      ]);

      // Get today's earnings
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);

      const todayEarningsResult = await DriverEarning.aggregate([
        {
          $match: {
            driver: driverObjectId,
            createdAt: { $gte: startOfDay, $lte: endOfDay },
            status: { $ne: "cancelled" },
          },
        },
        {
          $group: {
            _id: null,
            todayEarnings: { $sum: "$amount" },
          },
        },
      ]);

      const totalIncome = totalEarningsResult[0]?.totalIncome || 0;
      const totalExpenses = totalExpensesResult[0]?.totalExpenses || 0;
      const weeklyEarnings = weeklyEarningsResult[0]?.weeklyEarnings || 0;
      const monthlyEarnings = monthlyEarningsResult[0]?.monthlyEarnings || 0;
      const todayEarnings = todayEarningsResult[0]?.todayEarnings || 0;

      const stats = {
        totalIncome: Number(totalIncome.toFixed(2)),
        totalExpenses: Number(totalExpenses.toFixed(2)),
        balance: Number((totalIncome - totalExpenses).toFixed(2)),
        weeklyEarnings: Number(weeklyEarnings.toFixed(2)),
        monthlyEarnings: Number(monthlyEarnings.toFixed(2)),
        todayEarnings: Number(todayEarnings.toFixed(2)),
        totalTransactions: (totalEarningsResult[0]?.count || 0) + (totalExpensesResult[0]?.count || 0),
        dailyTarget: 15000, // You can make this configurable per user
      };

      res.json({
        success: true,
        stats,
      });
    } catch (aggregationError) {
      console.error("Aggregation error:", aggregationError);
      
      // Fallback to simple queries if aggregation fails
      const earnings = await DriverEarning.find({ 
        driver: driverId, 
        status: { $ne: "cancelled" } 
      });
      const expenses = await DriverExpense.find({ 
        driver: driverId, 
        status: { $ne: "rejected" } 
      });

      const totalIncome = earnings.reduce((sum, earning) => sum + earning.amount, 0);
      const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);

      // Calculate weekly/monthly earnings
      const weeklyEarnings = earnings
        .filter(e => new Date(e.createdAt) >= startOfWeek)
        .reduce((sum, earning) => sum + earning.amount, 0);

      const monthlyEarnings = earnings
        .filter(e => new Date(e.createdAt) >= startOfMonth)
        .reduce((sum, earning) => sum + earning.amount, 0);

      const stats = {
        totalIncome: Number(totalIncome.toFixed(2)),
        totalExpenses: Number(totalExpenses.toFixed(2)),
        balance: Number((totalIncome - totalExpenses).toFixed(2)),
        weeklyEarnings: Number(weeklyEarnings.toFixed(2)),
        monthlyEarnings: Number(monthlyEarnings.toFixed(2)),
        todayEarnings: 0,
        totalTransactions: earnings.length + expenses.length,
        dailyTarget: 15000,
      };

      res.json({
        success: true,
        stats,
      });
    }
  } catch (error) {
    console.error("Error fetching driver stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch statistics",
      error: error.message,
    });
  }
});

// Get expense summary by category (FIXED)
router.get("/expenses/summary", requireAuth, ensureDriver, async (req, res) => {
  try {
    const driverId = req.user.id;
    const { startDate, endDate, period = "all" } = req.query;

    if (!mongoose.Types.ObjectId.isValid(driverId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid driver ID",
      });
    }

    const driverObjectId = new mongoose.Types.ObjectId(driverId);
    let matchConditions = { 
      driver: driverObjectId, 
      status: { $ne: "rejected" } 
    };

    // Handle date filtering
    if (startDate || endDate || period !== "all") {
      const now = new Date();
      matchConditions.createdAt = {};

      if (period === "today") {
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);
        matchConditions.createdAt = { $gte: startOfDay, $lte: endOfDay };
      } else if (period === "week") {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        matchConditions.createdAt.$gte = startOfWeek;
      } else if (period === "month") {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        matchConditions.createdAt.$gte = startOfMonth;
      } else {
        if (startDate) matchConditions.createdAt.$gte = new Date(startDate);
        if (endDate) matchConditions.createdAt.$lte = new Date(endDate);
      }
    }

    try {
      // Summary by category
      const summary = await DriverExpense.aggregate([
        { $match: matchConditions },
        {
          $group: {
            _id: "$category",
            totalAmount: { $sum: "$amount" },
            count: { $sum: 1 },
            avgAmount: { $avg: "$amount" },
            maxAmount: { $max: "$amount" },
            minAmount: { $min: "$amount" },
          },
        },
        {
          $sort: { totalAmount: -1 }
        }
      ]);

      // Overall total
      const total = await DriverExpense.aggregate([
        { $match: matchConditions },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
            count: { $sum: 1 },
            avgAmount: { $avg: "$amount" },
          },
        },
      ]);

      // Format the response
      const formattedSummary = summary.map(item => ({
        category: item._id,
        totalAmount: Number(item.totalAmount.toFixed(2)),
        count: item.count,
        avgAmount: Number(item.avgAmount.toFixed(2)),
        maxAmount: Number(item.maxAmount.toFixed(2)),
        minAmount: Number(item.minAmount.toFixed(2)),
        percentage: total[0] ? Number(((item.totalAmount / total[0].total) * 100).toFixed(1)) : 0
      }));

      res.json({
        success: true,
        summary: {
          byCategory: formattedSummary,
          total: total[0] ? {
            total: Number(total[0].total.toFixed(2)),
            count: total[0].count,
            avgAmount: Number(total[0].avgAmount.toFixed(2))
          } : { total: 0, count: 0, avgAmount: 0 },
          period: period,
          dateRange: {
            startDate: startDate || null,
            endDate: endDate || null
          }
        },
      });
    } catch (aggregationError) {
      console.error("Summary aggregation error:", aggregationError);
      
      // Fallback to simple query
      const expenses = await DriverExpense.find(matchConditions);
      
      // Group by category manually
      const categoryTotals = {};
      let totalAmount = 0;
      
      expenses.forEach(expense => {
        if (!categoryTotals[expense.category]) {
          categoryTotals[expense.category] = {
            totalAmount: 0,
            count: 0,
            amounts: []
          };
        }
        categoryTotals[expense.category].totalAmount += expense.amount;
        categoryTotals[expense.category].count += 1;
        categoryTotals[expense.category].amounts.push(expense.amount);
        totalAmount += expense.amount;
      });

      const formattedSummary = Object.keys(categoryTotals).map(category => {
        const amounts = categoryTotals[category].amounts;
        return {
          category,
          totalAmount: Number(categoryTotals[category].totalAmount.toFixed(2)),
          count: categoryTotals[category].count,
          avgAmount: Number((categoryTotals[category].totalAmount / categoryTotals[category].count).toFixed(2)),
          maxAmount: Number(Math.max(...amounts).toFixed(2)),
          minAmount: Number(Math.min(...amounts).toFixed(2)),
          percentage: totalAmount > 0 ? Number(((categoryTotals[category].totalAmount / totalAmount) * 100).toFixed(1)) : 0
        };
      }).sort((a, b) => b.totalAmount - a.totalAmount);

      res.json({
        success: true,
        summary: {
          byCategory: formattedSummary,
          total: {
            total: Number(totalAmount.toFixed(2)),
            count: expenses.length,
            avgAmount: expenses.length > 0 ? Number((totalAmount / expenses.length).toFixed(2)) : 0
          },
          period: period,
          dateRange: {
            startDate: startDate || null,
            endDate: endDate || null
          }
        },
      });
    }
  } catch (error) {
    console.error("Error fetching expense summary:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch expense summary",
      error: error.message,
    });
  }
});

// ===============================================
// EXPORT ROUTES (FIXED)
// ===============================================

// Export data
router.get("/export", requireAuth, ensureDriver, async (req, res) => {
  try {
    const driverId = req.user.id;
    const { type = "all", startDate, endDate, format = "json" } = req.query;

    if (!mongoose.Types.ObjectId.isValid(driverId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid driver ID",
      });
    }

    let data = [];
    const dateQuery = {};

    if (startDate || endDate) {
      if (startDate) dateQuery.$gte = new Date(startDate);
      if (endDate) dateQuery.$lte = new Date(endDate);
    }

    try {
      if (type === "expenses" || type === "all") {
        const query = { driver: driverId, status: { $ne: "rejected" } };
        if (Object.keys(dateQuery).length > 0) {
          query.createdAt = dateQuery;
        }

        const expenses = await DriverExpense.find(query)
          .sort({ createdAt: -1 })
          .lean();
          
        const expenseData = expenses.map((expense) => ({
          id: expense._id,
          type: "Expense",
          category: expense.category,
          amount: expense.amount,
          description: expense.description,
          notes: expense.notes || "",
          status: expense.status,
          date: expense.createdAt.toISOString().split("T")[0],
          time: expense.createdAt.toISOString().split("T")[1].split(".")[0],
          location: expense.location || null,
        }));
        data = [...data, ...expenseData];
      }

      if (type === "earnings" || type === "all") {
        const query = { driver: driverId, status: { $ne: "cancelled" } };
        if (Object.keys(dateQuery).length > 0) {
          query.createdAt = dateQuery;
        }

        const earnings = await DriverEarning.find(query)
          .sort({ createdAt: -1 })
          .lean();
          
        const earningData = earnings.map((earning) => ({
          id: earning._id,
          type: "Earning",
          category: earning.type,
          amount: earning.amount,
          description: earning.description,
          notes: earning.notes || "",
          status: earning.status,
          tripDetails: earning.tripDetails || null,
          date: earning.createdAt.toISOString().split("T")[0],
          time: earning.createdAt.toISOString().split("T")[1].split(".")[0],
        }));
        data = [...data, ...earningData];
      }

      // Sort by date (newest first)
      data.sort((a, b) => new Date(b.date + "T" + b.time) - new Date(a.date + "T" + a.time));

      // Calculate summary
      const summary = {
        totalRecords: data.length,
        totalExpenses: data.filter(d => d.type === "Expense").reduce((sum, d) => sum + d.amount, 0),
        totalEarnings: data.filter(d => d.type === "Earning").reduce((sum, d) => sum + d.amount, 0),
        expenseCount: data.filter(d => d.type === "Expense").length,
        earningCount: data.filter(d => d.type === "Earning").length,
        dateRange: {
          startDate: startDate || null,
          endDate: endDate || null,
        },
        exportedAt: new Date().toISOString(),
      };

      if (format === "csv") {
        // Convert to CSV format
        const csvHeader = "ID,Type,Category,Amount,Description,Notes,Status,Date,Time\n";
        const csvData = data.map(row => 
          `"${row.id}","${row.type}","${row.category}",${row.amount},"${row.description}","${row.notes}","${row.status}","${row.date}","${row.time}"`
        ).join("\n");
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="driver-data-${Date.now()}.csv"`);
        res.send(csvHeader + csvData);
      } else {
        // Return JSON format
        res.json({
          success: true,
          data,
          summary,
          meta: {
            type,
            format,
            generatedAt: new Date().toISOString(),
          }
        });
      }
    } catch (queryError) {
      console.error("Export query error:", queryError);
      res.status(500).json({
        success: false,
        message: "Failed to export data",
        error: queryError.message,
      });
    }
  } catch (error) {
    console.error("Error exporting data:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export data",
      error: error.message,
    });
  }
});

// ===============================================
// WALLET ROUTES (FIXED)
// ===============================================
router.get("/wallet-balance", requireAuth, ensureDriver, async (req, res) => {
  try {
    const driverId = req.user.id;

    const wallet = await User.findById(driverId); // ✅ fix here
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found",
      });
    }

    res.json({
      success: true,
      balance: wallet.balance, // assuming balance is a field in User schema
    });
  } catch (error) {
    console.error("Error fetching wallet balance:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch wallet balance",
      error: error.message,
    });
  }
});


// Update wallet balance (for testing purposes)
router.post("/wallet-balance/update", requireAuth, ensureDriver, async (req, res) => {
  try {
    const driverId = req.user.id;
    const { amount, type = "add" } = req.body; // type: 'add', 'subtract', 'set'

    if (!amount || isNaN(amount) || amount < 0) {
      return res.status(400).json({
        success: false,
        message: "Valid amount is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(driverId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid driver ID",
      });
    }

    const user = await User.findById(driverId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    const currentBalance = user.walletBalance || 0;
    let newBalance;

    switch (type) {
      case "add":
        newBalance = currentBalance + parseFloat(amount);
        break;
      case "subtract":
        newBalance = Math.max(0, currentBalance - parseFloat(amount)); // Don't allow negative balance
        break;
      case "set":
        newBalance = parseFloat(amount);
        break;
      default:
        return res.status(400).json({
          success: false,
          message: "Invalid operation type. Use 'add', 'subtract', or 'set'",
        });
    }

    user.walletBalance = newBalance;
    await user.save();

    res.json({
      success: true,
      message: "Wallet balance updated successfully",
      previousBalance: currentBalance,
      newBalance: newBalance,
      operation: type,
      amount: parseFloat(amount),
    });
  } catch (error) {
    console.error("Error updating wallet balance:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update wallet balance",
      error: error.message,
    });
  }
});

// ===============================================
// ANALYTICS ROUTES (NEW)
// ===============================================

// Get driver analytics
router.get("/analytics", requireAuth, ensureDriver, async (req, res) => {
  try {
    const driverId = req.user.id;
    const { period = "month" } = req.query; // month, week, year

    if (!mongoose.Types.ObjectId.isValid(driverId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid driver ID",
      });
    }

    const driverObjectId = new mongoose.Types.ObjectId(driverId);
    const now = new Date();
    let startDate, groupFormat;

    // Set date range and grouping format based on period
    switch (period) {
      case "week":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        groupFormat = "%Y-%m-%d";
        break;
      case "year":
        startDate = new Date(now.getFullYear(), 0, 1);
        groupFormat = "%Y-%m";
        break;
      default: // month
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        groupFormat = "%Y-%m-%d";
    }

    try {
      // Daily/Monthly earnings trend
      const earningsTrend = await DriverEarning.aggregate([
        {
          $match: {
            driver: driverObjectId,
            createdAt: { $gte: startDate },
            status: { $ne: "cancelled" }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: groupFormat, date: "$createdAt" } },
            totalEarnings: { $sum: "$amount" },
            count: { $sum: 1 }
          }
        },
        { $sort: { "_id": 1 } }
      ]);

      // Daily/Monthly expenses trend
      const expensesTrend = await DriverExpense.aggregate([
        {
          $match: {
            driver: driverObjectId,
            createdAt: { $gte: startDate },
            status: { $ne: "rejected" }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: groupFormat, date: "$createdAt" } },
            totalExpenses: { $sum: "$amount" },
            count: { $sum: 1 }
          }
        },
        { $sort: { "_id": 1 } }
      ]);

      // Top expense categories
      const topExpenseCategories = await DriverExpense.aggregate([
        {
          $match: {
            driver: driverObjectId,
            createdAt: { $gte: startDate },
            status: { $ne: "rejected" }
          }
        },
        {
          $group: {
            _id: "$category",
            totalAmount: { $sum: "$amount" },
            count: { $sum: 1 }
          }
        },
        { $sort: { totalAmount: -1 } },
        { $limit: 5 }
      ]);

      // Earning types breakdown
      const earningTypesBreakdown = await DriverEarning.aggregate([
        {
          $match: {
            driver: driverObjectId,
            createdAt: { $gte: startDate },
            status: { $ne: "cancelled" }
          }
        },
        {
          $group: {
            _id: "$type",
            totalAmount: { $sum: "$amount" },
            count: { $sum: 1 }
          }
        },
        { $sort: { totalAmount: -1 } }
      ]);

      res.json({
        success: true,
        analytics: {
          period,
          dateRange: {
            startDate: startDate.toISOString(),
            endDate: now.toISOString()
          },
          trends: {
            earnings: earningsTrend,
            expenses: expensesTrend
          },
          breakdown: {
            topExpenseCategories,
            earningTypes: earningTypesBreakdown
          }
        }
      });
    } catch (analyticsError) {
      console.error("Analytics aggregation error:", analyticsError);
      res.status(500).json({
        success: false,
        message: "Failed to generate analytics",
        error: analyticsError.message,
      });
    }
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch analytics",
      error: error.message,
    });
  }
});


module.exports = router;