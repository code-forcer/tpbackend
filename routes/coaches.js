const express = require("express");
const router = express.Router();
const User = require("../models/User");

// Helper: transform absolute file paths to web URLs
const transformImagePath = (absolutePath) => {
  if (!absolutePath) return null;

  if (absolutePath.startsWith("http")) return absolutePath;

  if (absolutePath.includes("/uploads/")) {
    return `/uploads/${absolutePath.split("/uploads/")[1]}`;
  }

  if (absolutePath.includes("\\uploads\\")) {
    return `/uploads/${absolutePath
      .split("\\uploads\\")[1]
      .replace(/\\/g, "/")}`;
  }

  if (absolutePath.startsWith("/")) return absolutePath;

  return `/${absolutePath}`;
};

// GET /api/coaches
router.get("/", async (req, res) => {
  try {
    const coaches = await User.find({
      role: "coach",
      isVerified: true,
    })
      .select("username email phone coachInfo coachBlog rating totalSessions")
      .sort({ "coachInfo.yearsExperience": -1 })
      .lean();

    const transformed = coaches.map((coach) => {
      if (coach.coachInfo?.profilePhoto) {
        coach.coachInfo.profilePhoto = transformImagePath(
          coach.coachInfo.profilePhoto
        );
      }
      return coach;
    });

    res.json({
      success: true,
      count: transformed.length,
      data: transformed,
    });
  } catch {
    res.status(500).json({
      success: false,
      message: "Failed to fetch coaches",
    });
  }
});

// GET /api/coaches/:coachId
router.get("/:coachId", async (req, res) => {
  try {
    const coach = await User.findOne(
      { _id: req.params.coachId, role: "coach" },
      {
        username: 1,
        email: 1,
        phone: 1,
        coachInfo: 1,
        coachBlog: 1,
        rating: 1,
        totalSessions: 1,
      }
    ).lean();

    if (!coach) {
      return res.status(404).json({
        success: false,
        message: "Coach not found",
      });
    }

    if (coach.coachInfo?.profilePhoto) {
      coach.coachInfo.profilePhoto = transformImagePath(
        coach.coachInfo.profilePhoto
      );
    }
    if (coach.coachInfo?.governmentId) {
      coach.coachInfo.governmentId = transformImagePath(
        coach.coachInfo.governmentId
      );
    }
    if (coach.coachInfo?.experienceProof) {
      coach.coachInfo.experienceProof = transformImagePath(
        coach.coachInfo.experienceProof
      );
    }

    res.json({
      success: true,
      data: coach,
    });
  } catch {
    res.status(500).json({
      success: false,
      message: "Failed to fetch coach",
    });
  }
});

// POST /api/coaches/:coachId/blog
router.post("/:coachId/blog", async (req, res) => {
  try {
    const { title, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: "Title and content are required",
      });
    }

    const coach = await User.findOne({
      _id: req.params.coachId,
      role: "coach",
    });

    if (!coach) {
      return res.status(404).json({
        success: false,
        message: "Coach not found",
      });
    }

    coach.coachBlog = {
      title,
      content,
      createdAt: coach.coachBlog?.createdAt || new Date(),
      updatedAt: new Date(),
    };

    await coach.save();

    res.json({
      success: true,
      message: "Coach blog saved successfully",
      data: coach.coachBlog,
    });
  } catch {
    res.status(500).json({
      success: false,
      message: "Failed to save coach blog",
    });
  }
});

module.exports = router;
