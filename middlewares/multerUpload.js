// middleware/multerUpload.js
const multer = require("multer");
const path = require("path");
const fs = require("fs");

/* ================= UPLOAD DIRECTORY ================= */
const uploadDir = path.join(__dirname, "..", "uploads", "coaches");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/* ================= STORAGE CONFIG ================= */
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const safeName = file.fieldname.replace(/\s+/g, "_");
    const filename = `${safeName}-${Date.now()}${ext}`;
    cb(null, filename);
  },
});

/* ================= FILE FILTER ================= */
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/jpg",
    "application/pdf",
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file type. Only images and PDF files are allowed."
      ),
      false
    );
  }
};

/* ================= MULTER INSTANCE ================= */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
  },
});

/* ================= COACH UPLOAD FIELDS ================= */
const coachUploadMiddleware = upload.fields([
  { name: "profilePhoto", maxCount: 1 },
  { name: "governmentId", maxCount: 1 },
  { name: "experienceProof", maxCount: 1 }, // optional
]);

module.exports = coachUploadMiddleware;
