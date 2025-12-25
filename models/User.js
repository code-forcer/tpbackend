const mongoose = require('mongoose');
const crypto = require('crypto');

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
      trim: true,
      unique: true
    },

    profileImage: String,

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true
    },

    phone: {
      type: String,
      required: true,
      trim: true,
      unique: true
    },

    address: {
      type: String,
      required: true,
      trim: true
    },

    password: {
      type: String,
      required: true,
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
      unique: true
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

    /* ================= BLOG ================= */
    coachBlog: coachBlogSchema
  },
  { timestamps: true }
);

/* ================= WALLET ID GENERATOR ================= */
UserSchema.pre('save', function (next) {
  if (this.isNew && !this.walletId) {
    this.walletId = `TP${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  }
  next();
});

module.exports = mongoose.model('User', UserSchema);
