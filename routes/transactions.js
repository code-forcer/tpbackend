// routes/transactions.js
const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const auth = require("../middlewares/requireAuth");
const { sendEmail } = require("../utils/emailService");
const { v4: uuidv4 } = require("uuid");
const PDFDocument = require("pdfkit");

function calculateTransactionFees(amount, type) {
  // Fixed fee of 10 naira for all payment transactions
  if (type === "payment") {
    return 10;
  }
  // No fees for top-ups
  return 0;
}
// Get transaction history
router.get("/history", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Find all transactions where user is sender or recipient
    const transactions = await Transaction.find({
      $or: [{ sender: userId }, { recipient: userId }],
    })
      .populate("sender", "name walletId")
      .populate("recipient", "name walletId")
      .sort({ timestamp: -1 })
      .limit(50);

    const formattedTransactions = transactions.map((transaction) => {
      const isSender = transaction.sender._id.toString() === userId;

      return {
        id: transaction._id,
        transactionId: transaction.transactionId,
        type: transaction.type,
        fees: transaction.fees || 0,
        amount: isSender ? -transaction.amount : transaction.amount,
        description: transaction.description,
        note: transaction.note,
        time: formatTime(transaction.timestamp),
        timestamp: transaction.timestamp,
        date: new Date(transaction.timestamp).toLocaleDateString(),
        status: transaction.status,
        recipientWalletId: transaction.recipientWalletId,
        senderWalletId: transaction.senderWalletId,
        sender: {
          name: transaction.sender.name,
          walletId: transaction.sender.walletId,
        },
        recipient: transaction.recipient
          ? {
            name: transaction.recipient.name,
            walletId: transaction.recipient.walletId,
          }
          : null,
        userRole: isSender ? "sender" : "recipient",
      };
    });

    res.json(formattedTransactions);
  } catch (error) {
    console.error("Error fetching transaction history:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch transaction history",
    });
  }
});

// Transfer money between users
router.post("/transfer", auth, async (req, res) => {
  try {
    const { recipientWalletId, amount, note = "" } = req.body;
    const senderId = req.user.id;

    if (!recipientWalletId || !amount) {
      return res.status(400).json({ success: false, message: "Recipient wallet ID and amount are required" });
    }
    if (amount <= 0) {
      return res.status(400).json({ success: false, message: "Amount must be greater than 0" });
    }

    const sender = await User.findById(senderId);
    if (!sender) return res.status(404).json({ success: false, message: "Sender not found" });

    const recipient = await User.findOne({ walletId: recipientWalletId });
    if (!recipient) return res.status(404).json({ success: false, message: "Recipient not found" });

    if (sender.walletId === recipientWalletId) {
      return res.status(400).json({ success: false, message: "Cannot transfer to your own wallet" });
    }

    const fees = calculateTransactionFees(amount, "payment");
    const totalAmount = amount + fees;

    if (sender.balance < totalAmount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient balance. You need ₦${totalAmount} (₦${amount} + ₦${fees} fee)`,
      });
    }

    const transactionId = Transaction.generateTransactionId("TXN");

    // Create + SAVE transaction
    const transaction = await Transaction.create({
      sender: sender._id,
      recipient: recipient._id,
      senderWalletId: sender.walletId,
      recipientWalletId,
      amount,
      fees,
      type: "payment",
      status: "completed",
      description: `Transfer to ${recipient.firstName || recipient.name || recipient.username}`,
      note,
      transactionId,
    });

    // Update balances and save users
    sender.balance -= totalAmount;
    recipient.balance += amount;
    await sender.save();
    await recipient.save();

    // Populate sender/recipient for response
    const populatedTx = await Transaction.findById(transaction._id)
      .populate("sender", "fullName name username walletId")
      .populate("recipient", "fullName name username walletId");

    // Safe display names
    const senderName = populatedTx.sender?.firstName || populatedTx.sender?.name || populatedTx.sender?.username || "Sender";
    const recipientName = populatedTx.recipient?.firstName || populatedTx.recipient?.name || populatedTx.recipient?.username || "Recipient";

    // Notifications
    if (sender.fcmToken) {
      sendPushNotification(
        sender.fcmToken,
        "Payment Sent ✅",
        `You sent ₦${amount.toFixed(2)} to ${recipientName}`
      ).catch(console.error);
    }
    if (recipient.fcmToken) {
      sendPushNotification(
        recipient.fcmToken,
        "Payment Received 🎉",
        `You received ₦${amount.toFixed(2)} from ${senderName}`
      ).catch(console.error);
    }
    // Send email notifications asynchronously (don't wait for them)
    const timestamp = new Date().toLocaleString();

    // Email to sender
    if (sender.email) {
      sendEmail(sender.email, "paymentSent", {
        transactionId,
        amount: amount.toFixed(2),
        fees: fees.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        recipientName,           // ✅ safe name captured above
        recipientWalletId,
        timestamp,
        newBalance: sender.balance.toFixed(2),
        note,
      }).catch(err => console.error("Failed to send sender email:", err));
    }

    // Email to recipient
    if (recipient.email) {
      sendEmail(recipient.email, "paymentReceived", {
        transactionId,
        amount: amount.toFixed(2),
        senderName,              // ✅ safe name captured above
        senderWalletId: sender.walletId,
        timestamp,
        newBalance: recipient.balance.toFixed(2),
        note,
      }).catch(err => console.error("Failed to send recipient email:", err));
    }

    // Response
    res.json({
      success: true,
      message: "Transfer completed successfully",
      transaction: populatedTx,
      newBalance: sender.balance,
    });
  } catch (error) {
    console.error("Transfer error:", error);
    res.status(500).json({ success: false, message: "Transfer failed. Please try again." });
  }
});


// Top up wallet
router.post("/topup", auth, async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.user.id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "Valid amount is required" });
    }

    const MAX_TOPUP = 50000;
    if (amount > MAX_TOPUP) {
      return res.status(400).json({ success: false, message: `Maximum top-up amount is ₦${MAX_TOPUP}` });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const transactionId = `TOP${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

    const transaction = new Transaction({
      sender: userId,
      recipient: null,
      senderWalletId: user.walletId,
      recipientWalletId: null,
      amount,
      fees: 0,
      type: "topup",
      status: "completed",
      description: "Wallet Top-up",
      note: "Funds added to wallet",
      transactionId,
    });

    // Update balance
    user.balance += amount;

    // ✅ Save both transaction + user
    await transaction.save();
    await user.save();

    // Fire notifications but don't block response
    if (user.fcmToken) {
      sendPushNotification(
        user.fcmToken,
        "Wallet Topped Up 💰",
        `Your wallet was credited with ₦${amount.toFixed(2)}`
      ).catch(console.error);
    }

    if (user.email) {
      const timestamp = new Date().toLocaleString();
      sendEmail(user.email, "topUp", {
        transactionId,
        amount: amount.toFixed(2),
        timestamp,
        newBalance: user.balance.toFixed(2),
      }).catch(err => console.error("Failed to send top-up email:", err));
    }

    res.json({
      success: true,
      message: "Wallet topped up successfully",
      transaction: {
        id: transaction._id,
        transactionId,
        amount,
        timestamp: transaction.createdAt, // use createdAt from timestamps:true
      },
      newBalance: user.balance,
    });
  } catch (error) {
    console.error("Top-up error:", error);
    res.status(500).json({ success: false, message: "Top-up failed. Please try again." });
  }
});

// Generate transaction receipt (PDF/HTML/JSON)
router.get("/receipt/:transactionId", auth, async (req, res) => {
  try {
    const { transactionId } = req.params;
    const userId = req.user.id;
    const { format = "html" } = req.query; // html, json, pdf

    const transaction = await Transaction.findOne({
      transactionId: transactionId,
      $or: [{ sender: userId }, { recipient: userId }],
    })
      .populate("sender", "name walletId email")
      .populate("recipient", "name walletId email");

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    const isSender = transaction.sender._id.toString() === userId;
    const timestamp = new Date(transaction.timestamp).toLocaleString();

    // Prepare receipt data
    const receiptData = {
      transactionId: transaction.transactionId,
      type: transaction.type,
      amount: transaction.amount,
      fees: transaction.fees || 0,
      totalAmount:
        transaction.type === "payment" && isSender
          ? transaction.amount + (transaction.fees || 0)
          : transaction.amount,
      description: transaction.description,
      note: transaction.note,
      status: transaction.status,
      timestamp: timestamp,
      sender: transaction.sender
        ? {
          name: transaction.sender.name,
          walletId: transaction.sender.walletId,
        }
        : null,
      recipient: transaction.recipient
        ? {
          name: transaction.recipient.name,
          walletId: transaction.recipient.walletId,
        }
        : null,
      userRole: isSender ? "sender" : "recipient",
    };

    // ======= 1. JSON Response =======
    if (format === "json") {
      return res.json({
        success: true,
        receipt: receiptData,
      });
    }

    // ======= 2. PDF Generation =======
    if (format === "pdf") {
      const doc = new PDFDocument({ margin: 30 });
      let buffers = [];

      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => {
        const pdfData = Buffer.concat(buffers);
        res
          .writeHead(200, {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename=receipt_${transaction.transactionId}.pdf`,
            "Content-Length": pdfData.length,
          })
          .end(pdfData);
      });

      // PDF Title
      doc.fontSize(20).fillColor("#3B82F6").text("Transaction Receipt", { align: "center" });
      doc.moveDown(1);

      // Transaction details
      doc.fontSize(12).fillColor("#000").text(`Transaction ID: ${receiptData.transactionId}`);
      doc.text(`Date & Time: ${receiptData.timestamp}`);
      doc.text(`Type: ${receiptData.type}`);
      doc.text(`Status: ${receiptData.status}`);
      doc.moveDown();

      // Parties
      if (receiptData.sender) {
        doc.text(`From: ${receiptData.sender.name} (${receiptData.sender.walletId})`);
      }
      if (receiptData.recipient) {
        doc.text(`To: ${receiptData.recipient.name} (${receiptData.recipient.walletId})`);
      }

      doc.moveDown();
      doc.fontSize(16).fillColor(isSender ? "#dc2626" : "#059669")
        .text(`${isSender ? "-" : "+"}₦${receiptData.amount.toFixed(2)}`);
      if (receiptData.fees > 0) {
        doc.fontSize(12).fillColor("#000").text(`Fee: ₦${receiptData.fees.toFixed(2)}`);
      }
      if (receiptData.note) {
        doc.text(`Note: ${receiptData.note}`);
      }
      doc.text(`Description: ${receiptData.description}`);

      doc.moveDown(2);
      doc.fontSize(10).fillColor("#666").text("This is a computer-generated receipt. No signature required.");
      doc.text("Support: support@fluidit.com");

      doc.end();
      return;
    }

    // ======= 3. HTML (default) =======
    const receiptHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Transaction Receipt - ${transaction.transactionId}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
          .receipt { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #3B82F6, #06B6D4); color: white; padding: 30px; text-align: center; }
          .content { padding: 30px; }
          .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
          .row:last-child { border-bottom: none; }
          .label { font-weight: bold; color: #374151; }
          .value { color: #6b7280; }
          .amount { font-size: 24px; font-weight: bold; color: ${transaction.type === "payment" && isSender ? "#dc2626" : "#059669"
      }; }
          .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
          .status { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; text-transform: uppercase; }
          .status.completed { background: #d1fae5; color: #065f46; }
          @media print { body { background: white; } .receipt { box-shadow: none; } }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="header">
            <h1>Transaction Receipt</h1>
            <p>FluidIt Digital Wallet</p>
          </div>
          <div class="content">
            <div class="row">
              <span class="label">Transaction ID:</span>
              <span class="value">${transaction.transactionId}</span>
            </div>
            <div class="row">
              <span class="label">Date & Time:</span>
              <span class="value">${timestamp}</span>
            </div>
            <div class="row">
              <span class="label">Type:</span>
              <span class="value">${transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)}</span>
            </div>
            <div class="row">
              <span class="label">Status:</span>
              <span class="status completed">${transaction.status}</span>
            </div>
            ${transaction.sender ? `
            <div class="row">
              <span class="label">From:</span>
              <span class="value">${transaction.sender.name} (${transaction.sender.walletId})</span>
            </div>` : ""}
            ${transaction.recipient ? `
            <div class="row">
              <span class="label">To:</span>
              <span class="value">${transaction.recipient.name} (${transaction.recipient.walletId})</span>
            </div>` : ""}
            <div class="row">
              <span class="label">Amount:</span>
              <span class="amount">${isSender && transaction.type === "payment" ? "-" : "+"}₦${transaction.amount.toFixed(2)}</span>
            </div>
            ${transaction.fees > 0 ? `
            <div class="row">
              <span class="label">Transaction Fee:</span>
              <span class="value">₦${transaction.fees.toFixed(2)}</span>
            </div>` : ""}
            ${transaction.note ? `
            <div class="row">
              <span class="label">Note:</span>
              <span class="value">${transaction.note}</span>
            </div>` : ""}
            <div class="row">
              <span class="label">Description:</span>
              <span class="value">${transaction.description}</span>
            </div>
          </div>
          <div class="footer">
            <p>This is a computer-generated receipt. No signature required.</p>
            <p>For support, contact: support@fluidit.com</p>
          </div>
        </div>
      </body>
      </html>
    `;

    res.setHeader("Content-Type", "text/html");
    res.send(receiptHTML);
  } catch (error) {
    console.error("Error generating receipt:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate receipt",
    });
  }
});


// Get transaction details by ID
router.get("/:transactionId", auth, async (req, res) => {
  try {
    const { transactionId } = req.params;
    const userId = req.user.id;

    const transaction = await Transaction.findOne({
      transactionId: transactionId,
      $or: [{ sender: userId }, { recipient: userId }],
    })
      .populate("sender", "name walletId")
      .populate("recipient", "name walletId");

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    const isSender = transaction.sender._id.toString() === userId;

    res.json({
      success: true,
      transaction: {
        id: transaction._id,
        transactionId: transaction.transactionId,
        type: transaction.type,
        amount: transaction.amount,
        fees: transaction.fees || 0,
        description: transaction.description,
        note: transaction.note,
        status: transaction.status,
        timestamp: transaction.timestamp,
        sender: {
          name: transaction.sender.name,
          walletId: transaction.sender.walletId,
        },
        recipient: transaction.recipient
          ? {
            name: transaction.recipient.name,
            walletId: transaction.recipient.walletId,
          }
          : null,
        userRole: isSender ? "sender" : "recipient",
      },
    });
  } catch (error) {
    console.error("Error fetching transaction details:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch transaction details",
    });
  }
});

// Get wallet balance
router.get("/wallet/balance", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId, "balance walletId name");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      balance: user.balance,
      walletId: user.walletId,
      name: user.name,
    });
  } catch (error) {
    console.error("Error fetching wallet balance:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch wallet balance",
    });
  }
});

// Validate wallet ID (for QR code scanning)
router.post("/validate-wallet", auth, async (req, res) => {
  try {
    const { walletId } = req.body;

    if (!walletId) {
      return res.status(400).json({
        success: false,
        message: "Wallet ID is required",
      });
    }

    const user = await User.findOne({ walletId }, "name walletId");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found",
      });
    }

    res.json({
      success: true,
      user: {
        name: user.name,
        walletId: user.walletId,
      },
    });
  } catch (error) {
    console.error("Error validating wallet:", error);
    res.status(500).json({
      success: false,
      message: "Failed to validate wallet",
    });
  }
});

// Get transaction statistics
router.get("/stats/monthly", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const stats = await Transaction.aggregate([
      {
        $match: {
          $or: [{ sender: userId }, { recipient: userId }],
          timestamp: { $gte: startOfMonth },
          status: "completed",
        },
      },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
    ]);

    const formattedStats = {
      totalTransactions: 0,
      totalSpent: 0,
      totalReceived: 0,
      totalTopUps: 0,
    };

    stats.forEach((stat) => {
      formattedStats.totalTransactions += stat.count;

      if (stat._id === "payment") {
        formattedStats.totalSpent = stat.totalAmount;
      } else if (stat._id === "topup") {
        formattedStats.totalTopUps = stat.totalAmount;
      }
    });

    res.json({
      success: true,
      stats: formattedStats,
    });
  } catch (error) {
    console.error("Error fetching transaction stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch transaction statistics",
    });
  }
});

// Cancel pending transaction (if needed)
router.patch("/:transactionId/cancel", auth, async (req, res) => {
  try {
    const { transactionId } = req.params;
    const userId = req.user.id;

    const transaction = await Transaction.findOne({
      transactionId: transactionId,
      sender: userId,
      status: "pending",
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Pending transaction not found",
      });
    }

    transaction.status = "cancelled";
    await transaction.save();

    res.json({
      success: true,
      message: "Transaction cancelled successfully",
    });
  } catch (error) {
    console.error("Error cancelling transaction:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cancel transaction",
    });
  }
});

// Helper function to format time
function formatTime(timestamp) {
  const now = new Date();
  const transactionTime = new Date(timestamp);
  const diffInMilliseconds = now - transactionTime;
  const diffInMinutes = Math.floor(diffInMilliseconds / (1000 * 60));
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  if (diffInMinutes < 1) {
    return "Just now";
  } else if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes > 1 ? "s" : ""} ago`;
  } else if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours > 1 ? "s" : ""} ago`;
  } else if (diffInDays < 7) {
    return `${diffInDays} day${diffInDays > 1 ? "s" : ""} ago`;
  } else {
    return transactionTime.toLocaleDateString();
  }
}
const admin = require('firebase-admin'); // already initialized elsewhere

async function sendPushNotification(token, title, body) {
  if (!token || !title || !body) return;

  const message = {
    token,
    notification: { title, body },
    android: { priority: 'high' },
    apns: { headers: { 'apns-priority': '10' } },
  };

  try {
    const response = await admin.messaging().send(message);
    console.log('FCM notification sent:', response);
  } catch (err) {
    console.error('FCM notification error:', err);
  }
}

// Helper: Send FCM push notification
async function sendPushNotification(token, title, body) {
  if (!token || !title || !body) return;

  const message = {
    token,
    notification: { title, body },
    android: { priority: "high" },
    apns: { headers: { "apns-priority": "10" } },
  };

  try {
    const response = await admin.messaging().send(message);
    console.log("FCM notification sent:", response);
  } catch (err) {
    console.error("FCM notification error:", err);
  }
}


module.exports = router;