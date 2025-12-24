const mongoose = require('mongoose');

/* ================= COACH BLOG ================= */
const coachBlogSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },
  },
  { timestamps: true, _id: false }
);

/* ================= USER ================= */
const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true
    },

    profileImage: String,

    email: {
      type: String,
      required: true,
      unique: true
    },

    phone: {
      type: String,
      required: true,
      unique: true
    },

    password: {
      type: String,
      select: false
    },

    role: {
      type: String,
      enum: ['user', 'coach', 'admin'],
      default: 'user'
    },

    /* ================= WALLET ================= */
    balance: {
      type: Number,
      default: 0,
      min: 0
    },

    walletId: {
      type: String,
      unique: true,
      index: true
    },

    transactionPin: {
      type: String,
      select: false
    },

    walletSettings: {
      dailyLimit: { type: Number, default: 100000 },
      requirePinForTransactions: { type: Boolean, default: false },
      allowIncomingPayments: { type: Boolean, default: true }
    },

    /* ================= VERIFICATION ================= */
    isVerified: {
      type: Boolean,
      default: false
    },

    otp: String,
    otpExpires: Date,

    resetPasswordToken: String,
    resetPasswordExpires: Date,

    /* ================= COACH ONBOARDING ================= */
    coachInfo: {
      displayName: String,
      yearsExperience: Number,
      specialization: String,
      skillLevel: String,
      hourlyRate: Number,
      bio: String,
      pokerPlatforms: String,

      profilePhoto: String,
      governmentId: String,
      experienceProof: String,

      onboardingStatus: {
        type: String,
        enum: ['not_started', 'pending', 'approved', 'rejected'],
        default: 'not_started'
      },

      submittedAt: Date
    },

    /* ================= FIND-A-COACH BLOG ================= */
    coachBlog: coachBlogSchema
  },
  { timestamps: true }
);

/* ================= WALLET ID GENERATOR ================= */
UserSchema.methods.generateWalletId = function () {
  if (!this.walletId) {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.walletId = `TP${timestamp.slice(-6)}${random}`;
  }
  return this.walletId;
};

/* ================= PRE-SAVE ================= */
UserSchema.pre('save', function (next) {
  if (this.isNew && !this.walletId) {
    this.generateWalletId();
  }
  next();
});

module.exports = mongoose.model('User', UserSchema);
