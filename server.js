require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');

const app = express();

// ===== Middleware =====
app.use(cors({
  origin: `http://${process.env.HOST_NAME}:3000`,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ===== Static Files =====
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ===== Routes =====
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '/web/info.html'));
});

// Centralized route handler
const apiRoutes = require('./routes');
app.use('/api/', apiRoutes);

// ===== MongoDB Connection =====
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB error:', err));

// ===== Start Server =====
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://${process.env.HOST_NAME}:${PORT} 🔥`);
});
