// models/Transaction.js
const mongoose = require("mongoose");
const transactionSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, // For top-ups, recipient can be null
    },
    senderWalletId: {
      type: String,
      required: true,
      index: true,
    },
    recipientWalletId: {
      type: String,
      required: false,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [0.01, "Amount must be greater than 0"],
    },
    type: {
      type: String,
      enum: ["payment", "topup", "refund", "withdrawal", "received"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "cancelled"],
      default: "pending",
      index: true,
    },
    description: {
      type: String,
      required: true,
      maxlength: 200,
    },
    note: {
      type: String,
      maxlength: 500,
      default: "",
    },
    transactionId: {
      type: String,
      unique: true, // Automatically indexed
      required: true,
    },
    metadata: {
      ipAddress: String,
      userAgent: String,
      location: {
        latitude: Number,
        longitude: Number,
      },
    },
    fees: {
      type: Number,
      default: 0,
      min: 0,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);
// Indexes for efficient queries
transactionSchema.index({ sender: 1, timestamp: -1 });
transactionSchema.index({ recipient: 1, timestamp: -1 });
transactionSchema.index({ status: 1, timestamp: -1 });
// Pre-save middleware to update `updatedAt`
transactionSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});
// Instance method to check if transaction can be cancelled
transactionSchema.methods.canBeCancelled = function () {
  return (
    this.status === "pending" &&
    this.type === "payment" &&
    Date.now() - this.timestamp < 5 * 60 * 1000 // 5 minutes
  );
};
// Static method to generate transaction ID
transactionSchema.statics.generateTransactionId = function (type = "TXN") {
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substr(2, 5).toUpperCase();
  return `${type}${timestamp.slice(-8)}${random}`;
};
// Static method to get user transaction summary
transactionSchema.statics.getUserSummary = async function (
  userId,
  startDate = null,
  endDate = null
) {
  const matchConditions = {
    $or: [
      { sender: mongoose.Types.ObjectId(userId) },
      { recipient: mongoose.Types.ObjectId(userId) },
    ],
    status: "completed",
  };
  if (startDate && endDate) {
    matchConditions.timestamp = {
      $gte: startDate,
      $lte: endDate,
    };
  }
  const summary = await this.aggregate([
    { $match: matchConditions },
    {
      $group: {
        _id: null,
        totalTransactions: { $sum: 1 },
        totalSent: {
          $sum: {
            $cond: [
              { $eq: ["$sender", mongoose.Types.ObjectId(userId)] },
              "$amount",
              0,
            ],
          },
        },
        totalReceived: {
          $sum: {
            $cond: [
              { $eq: ["$recipient", mongoose.Types.ObjectId(userId)] },
              "$amount",
              0,
            ],
          },
        },
        totalTopUps: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$sender", mongoose.Types.ObjectId(userId)] },
                  { $eq: ["$type", "topup"] },
                ],
              },
              "$amount",
              0,
            ],
          },
        },
      },
    },
  ]);
  return (
    summary[0] || {
      totalTransactions: 0,
      totalSent: 0,
      totalReceived: 0,
      totalTopUps: 0,
    }
  );
};
const Transaction = mongoose.model("Transaction", transactionSchema);
module.exports = Transaction;
