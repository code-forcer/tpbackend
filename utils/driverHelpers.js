
// ===============================================
// utils/driverHelpers.js
// ===============================================
const DriverExpense = require('../models/DriverExpense');
const DriverEarning = require('../models/DriverEarning');
// Calculate driver performance metrics
const calculateDriverMetrics = async (driverId, period = 'month') => {
  const now = new Date();
  let startDate;
  switch (period) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'week':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - now.getDay());
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    default:
      startDate = new Date(0); // Beginning of time
  }

  try {
    // Get earnings
    const earnings = await DriverEarning.aggregate([
      {
        $match: {
          driver: mongoose.Types.ObjectId(driverId),
          date: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: '$amount' },
          tripCount: { $sum: { $cond: [{ $eq: ['$type', 'trip'] }, 1, 0] } },
          avgPerTrip: { $avg: { $cond: [{ $eq: ['$type', 'trip'] }, '$amount', null] } }
        }
      }
    ]);

    // Get expenses
    const expenses = await DriverExpense.aggregate([
      {
        $match: {
          driver: mongoose.Types.ObjectId(driverId),
          date: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          totalExpenses: { $sum: '$amount' }
        }
      }
    ]);

    const totalEarnings = earnings[0]?.totalEarnings || 0;
    const totalExpenses = expenses[0]?.totalExpenses || 0;
    const netIncome = totalEarnings - totalExpenses;
    const tripCount = earnings[0]?.tripCount || 0;
    const avgPerTrip = earnings[0]?.avgPerTrip || 0;

    // Calculate efficiency metrics
    const expenseRatio = totalEarnings > 0 ? (totalExpenses / totalEarnings) * 100 : 0;
    const profitMargin = totalEarnings > 0 ? (netIncome / totalEarnings) * 100 : 0;

    return {
      totalEarnings,
      totalExpenses,
      netIncome,
      tripCount,
      avgPerTrip,
      expenseRatio: Math.round(expenseRatio * 100) / 100,
      profitMargin: Math.round(profitMargin * 100) / 100,
      period
    };
  } catch (error) {
    console.error('Error calculating driver metrics:', error);
    throw error;
  }
};

// Generate driver report
const generateDriverReport = async (driverId, startDate, endDate) => {
  try {
    const matchConditions = {
      driver: mongoose.Types.ObjectId(driverId),
      date: { $gte: new Date(startDate), $lte: new Date(endDate) }
    };

    // Get detailed earnings breakdown
    const earningsBreakdown = await DriverEarning.aggregate([
      { $match: matchConditions },
      {
        $group: {
          _id: '$type',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
          avgAmount: { $avg: '$amount' }
        }
      }
    ]);

    // Get expenses breakdown
    const expensesBreakdown = await DriverExpense.aggregate([
      { $match: matchConditions },
      {
        $group: {
          _id: '$category',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
          avgAmount: { $avg: '$amount' }
        }
      }
    ]);

    // Get daily trends
    const dailyTrends = await DriverEarning.aggregate([
      { $match: matchConditions },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          earnings: { $sum: '$amount' },
          trips: { $sum: { $cond: [{ $eq: ['$type', 'trip'] }, 1, 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    return {
      earningsBreakdown,
      expensesBreakdown,
      dailyTrends,
      period: { startDate, endDate }
    };
  } catch (error) {
    console.error('Error generating driver report:', error);
    throw error;
  }
};

// Predict future earnings based on historical data
const predictEarnings = async (driverId, days = 30) => {
  try {
    // Get last 90 days of data for prediction
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 90);

    const historicalData = await DriverEarning.aggregate([
      {
        $match: {
          driver: mongoose.Types.ObjectId(driverId),
          date: { $gte: startDate, $lte: endDate },
          type: 'trip'
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          dailyEarnings: { $sum: '$amount' },
          tripCount: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    if (historicalData.length === 0) {
      return { predictedEarnings: 0, confidence: 0 };
    }

    // Simple moving average prediction
    const totalEarnings = historicalData.reduce((sum, day) => sum + day.dailyEarnings, 0);
    const avgDailyEarnings = totalEarnings / historicalData.length;
    const predictedEarnings = avgDailyEarnings * days;

    // Calculate confidence based on data consistency
    const variance = historicalData.reduce((sum, day) => {
      return sum + Math.pow(day.dailyEarnings - avgDailyEarnings, 2);
    }, 0) / historicalData.length;
    
    const standardDeviation = Math.sqrt(variance);
    const coefficientOfVariation = standardDeviation / avgDailyEarnings;
    const confidence = Math.max(0, Math.min(100, 100 - (coefficientOfVariation * 100)));

    return {
      predictedEarnings: Math.round(predictedEarnings),
      avgDailyEarnings: Math.round(avgDailyEarnings),
      confidence: Math.round(confidence),
      basedOnDays: historicalData.length
    };
  } catch (error) {
    console.error('Error predicting earnings:', error);
    throw error;
  }
};

module.exports = {
  calculateDriverMetrics,
  generateDriverReport,
  predictEarnings
};