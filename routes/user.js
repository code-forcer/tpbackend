// ==================== FILE: routes/user.js - FIXED PROFILE IMAGE URL ====================
const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const path = require("path");

const router = express.Router();

/* ================= AUTH MIDDLEWARE ================= */
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const userId = decoded.userId || decoded.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(401).json({ message: "Invalid token - user not found" });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Auth error:", error.message);
    return res.status(401).json({ message: "Invalid token" });
  }
};

/* ================= HELPER FUNCTION TO FIX IMAGE PATHS ================= */
const fixImagePath = (imagePath, folder = 'drivers') => {
  if (!imagePath) return null;
  
  // If it's already a full URL, return as is
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  
  // If it's a full file system path with backslashes, extract filename
  if (imagePath.includes('\\')) {
    const filename = imagePath.split('\\').pop();
    return `/uploads/${folder}/${filename}`;
  }
  
  // If it's a forward slash path, extract filename
  if (imagePath.includes('/')) {
    const filename = imagePath.split('/').pop();
    return `/uploads/${folder}/${filename}`;
  }
  
  // If it's just a filename
  return `/uploads/${folder}/${imagePath}`;
};

/* ================= GET USER PROFILE ================= */
// GET /api/user/profile
router.get("/profile", authenticateUser, async (req, res) => {
  try {
    const user = req.user;

    // Fix profile image path
    const fixedProfileImage = fixImagePath(user.profileImage, 'drivers');

    const profileData = {
      id: user._id,
      username: user.username,
      email: user.email,
      phone: user.phone,
      role: user.role,
      profileImage: fixedProfileImage,
      walletId: user.walletId,
      balance: user.balance,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    /* ===== COACH INFO (IF APPLICABLE) ===== */
    if (user.role === "coach" && user.coachInfo) {
      // Fix coach profile photo path
      const fixedCoachPhoto = fixImagePath(user.coachInfo.profilePhoto, 'coaches');
      
      profileData.coachInfo = {
        onboardingStatus: user.coachInfo.onboardingStatus,
        submittedAt: user.coachInfo.submittedAt,
        displayName: user.coachInfo.displayName,
        yearsExperience: user.coachInfo.yearsExperience,
        specialization: user.coachInfo.specialization,
        skillLevel: user.coachInfo.skillLevel,
        hourlyRate: user.coachInfo.hourlyRate,
        bio: user.coachInfo.bio,
        pokerPlatforms: user.coachInfo.pokerPlatforms,
        profilePhoto: fixedCoachPhoto,
        hasProfilePhoto: !!user.coachInfo.profilePhoto,
        hasGovernmentId: !!user.coachInfo.governmentId,
        hasExperienceProof: !!user.coachInfo.experienceProof,
      };
    }

    res.status(200).json(profileData);
  } catch (error) {
    console.error("Profile fetch error:", error);
    res.status(500).json({
      message: "Server error fetching profile",
    });
  }
});

/* ================= UPDATE PROFILE ================= */
// PUT /api/user/profile
router.put("/profile", authenticateUser, async (req, res) => {
  try {
    const user = req.user;
    const { username, phone, profileImage } = req.body;

    if (username) user.username = username;
    if (phone) user.phone = phone;
    if (profileImage) user.profileImage = profileImage;

    await user.save();

    res.status(200).json({
      message: "Profile updated successfully",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: user.role,
        profileImage: fixImagePath(user.profileImage, 'drivers'),
      },
    });
  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({
      message: "Server error updating profile",
    });
  }
});

/* ================= GET WALLET ================= */
// GET /api/user/wallet
router.get("/wallet", authenticateUser, async (req, res) => {
  try {
    const user = req.user;

    res.status(200).json({
      walletId: user.walletId,
      balance: user.balance,
      currency: "NGN",
      lastUpdated: user.updatedAt,
    });
  } catch (error) {
    console.error("Wallet fetch error:", error);
    res.status(500).json({ message: "Server error fetching wallet" });
  }
});

/* ================= WALLET TOPUP (SIMULATION) ================= */
// POST /api/user/wallet/topup
router.post("/wallet/topup", authenticateUser, async (req, res) => {
  try {
    const { amount } = req.body;
    const user = req.user;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    user.balance += Number(amount);
    await user.save();

    res.status(200).json({
      message: "Wallet topped up successfully",
      newBalance: user.balance,
      amount: Number(amount),
    });
  } catch (error) {
    console.error("Wallet topup error:", error);
    res.status(500).json({ message: "Server error during topup" });
  }
});

/* ================= PUSH TOKEN ================= */
// POST /api/user/update-token
router.post("/update-token", authenticateUser, async (req, res) => {
  try {
    const { pushToken } = req.body;
    if (!pushToken) {
      return res.status(400).json({ message: "Push token required" });
    }

    const user = req.user;
    user.fcmToken = pushToken;
    await user.save();

    res.json({ success: true, message: "Token updated successfully" });
  } catch (error) {
    console.error("Push token error:", error);
    res.status(500).json({ message: "Server error updating token" });
  }
});

module.exports = router;