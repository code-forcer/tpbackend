const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const coachUploadMiddleware = require('../middlewares/multerUpload');

const router = express.Router();

/* ================= AUTH MIDDLEWARE ================= */
const authenticateCoach = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // More flexible user ID extraction
    const userId = decoded.userId || decoded.id || decoded._id || decoded.sub;
    
    if (!userId) {
      return res.status(401).json({ 
        message: 'Invalid token: No user identifier found' 
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(401).json({ 
        message: 'User not found. Please login again.' 
      });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    return res.status(401).json({ message: 'Authentication failed' });
  }
};

/* ================= COACH ONBOARDING ================= */
router.post(
  '/onboarding',
  authenticateCoach,
  coachUploadMiddleware,
  async (req, res) => {
    try {
      const {
        displayName,
        yearsExperience,
        specialization,
        skillLevel,
        hourlyRate,
        bio,
        pokerPlatforms
      } = req.body;

      /* ---------- VALIDATION ---------- */
      const requiredFields = {
        displayName,
        yearsExperience,
        specialization,
        skillLevel,
        hourlyRate,
        bio
      };

      const missingFields = Object.entries(requiredFields)
        .filter(([_, value]) => !value)
        .map(([key]) => key);

      if (missingFields.length > 0) {
        return res.status(400).json({
          message: 'Missing required fields',
          missingFields
        });
      }

      const files = req.files || {};

      if (!files.profilePhoto || !files.governmentId) {
        return res.status(400).json({
          message: 'Profile photo and government ID are required'
        });
      }

      /* ---------- SAVE COACH INFO ---------- */
      const user = req.user;

      user.role = 'coach';

      user.coachInfo = {
        displayName,
        yearsExperience,
        specialization,
        skillLevel,
        hourlyRate,
        bio,
        pokerPlatforms,

        profilePhoto: files.profilePhoto[0].path,
        governmentId: files.governmentId[0].path,
        experienceProof: files.experienceProof?.[0]?.path || null,

        onboardingStatus: 'pending',
        submittedAt: new Date()
      };

      await user.save();

      return res.status(200).json({
        message: 'Coach onboarding submitted successfully',
        status: 'pending'
      });
    } catch (error) {
      console.error('Coach onboarding error:', error);
      return res.status(500).json({
        message: 'Server error during coach onboarding'
      });
    }
  }
);

/* ================= STATUS CHECK ================= */
router.get('/onboarding-status', authenticateCoach, async (req, res) => {
  const coachInfo = req.user.coachInfo;

  res.json({
    status: coachInfo?.onboardingStatus || 'not_started',
    submittedAt: coachInfo?.submittedAt || null
  });
});

module.exports = router;
