// backend/routes/auth.js
require('dotenv').config();
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const router = express.Router();

// Setup Nodemailer transporter with enhanced configuration for better deliverability
const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  },
  secure: true,
  tls: {
    rejectUnauthorized: true
  },
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
  rateLimit: 14
});

// Verify transporter configuration
transporter.verify((error, success) => {
  if (error) {
    console.log('Email transporter error:', error);
  } else {
    console.log('Email server is ready to take our messages');
  }
});

// Generate unique wallet ID
const generateWalletId = async () => {
  const count = await User.countDocuments();
  const padded = String(1000 + count + 1).slice(-4);
  const year = new Date().getFullYear();
  return `TP${year}${padded}`;
};

// Generate random 6-digit OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Email template (keeping your existing template)
const getEmailTemplate = (name, otp, walletId) => {
return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to Territorio Poker</title>
    <style>
        body { margin: 0; padding: 0; background-color: #0a0a0a; font-family: Arial, sans-serif; }
        .container { max-width: 600px; margin: 0 auto; background: #1a1a1a; }
        .header { background: linear-gradient(135deg, #ce1212 0%, #8b0000 100%); padding: 40px 30px; text-align: center; }
        .logo { font-size: 28px; font-weight: bold; color: #ffffff; margin-bottom: 8px; }
        .content { padding: 40px 30px; color: #e5e5e5; }
        .otp-section { background-color: #2a2a2a; border: 2px solid #ce1212; border-radius: 8px; padding: 30px; text-align: center; margin: 30px 0; }
        .otp-code { font-size: 36px; font-weight: bold; color: #ce1212; font-family: 'Courier New', monospace; letter-spacing: 4px; margin: 16px 0; }
        .wallet-info { background-color: #2a2a2a; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #ce1212; }
        .wallet-id { font-family: 'Courier New', monospace; font-size: 18px; font-weight: bold; color: #ce1212; letter-spacing: 1px; }
        .footer { background-color: #0a0a0a; padding: 30px; text-align: center; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">TERRITORIO POKER</div>
        </div>
        <div class="content">
            <h1 style="color: #ffffff;">Welcome, ${name}!</h1>
            <p>Thank you for joining Territorio Poker. Verify your email to start playing.</p>
            <div class="otp-section">
                <div style="color: #999; margin-bottom: 10px;">VERIFICATION CODE</div>
                <div class="otp-code">${otp}</div>
                <div style="color: #999; font-size: 14px;">Expires in 10 minutes</div>
            </div>
            <div class="wallet-info">
                <div style="color: #999; margin-bottom: 8px;">Your Wallet ID</div>
                <div class="wallet-id">${walletId}</div>
            </div>
        </div>
        <div class="footer">
            <p>© 2025 Territorio Poker. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`;
};

// Send verification email
const sendVerificationEmail = async (userEmail, name, otp, walletId) => {
  try {
    const mailOptions = {
      from: {
        name: 'Territorio Poker',
        address: process.env.MAIL_USER
      },
      to: userEmail,
      subject: 'Verify Your Territorio Poker Account',
      html: getEmailTemplate(name, otp, walletId),
      text: `Welcome to Territorio Poker, ${name}! Your verification code: ${otp}. Wallet ID: ${walletId}`,
      headers: {
        'X-Entity-Ref-ID': crypto.randomUUID()
      }
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
    
  } catch (error) {
    console.error('Email sending failed:', error);
    throw new Error('Failed to send verification email');
  }
};

// FIXED: Enhanced registration route
router.post('/register', async (req, res) => {
  try {
    // FIXED: Extract all fields including address and email
    const { username, email, phone, address, password } = req.body;
    
    console.log('Registration attempt:', { username, email, phone, address, hasPassword: !!password });
    
    // FIXED: Validation for all required fields
    if (!username || !email || !phone || !address || !password) {
      return res.status(400).json({ 
        message: 'All fields are required',
        fields: { 
          username: !!username, 
          email: !!email, 
          phone: !!phone, 
          address: !!address,
          password: !!password
        }
      });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }

    // Password validation
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    // Check for existing user
    const existingUser = await User.findOne({ 
      $or: [{ email: email.toLowerCase().trim() }, { phone: phone.trim() }, { username: username.trim() }] 
    });
    
    if (existingUser) {
      let field = 'account';
      if (existingUser.email === email.toLowerCase().trim()) field = 'email';
      else if (existingUser.phone === phone.trim()) field = 'phone';
      else if (existingUser.username === username.trim()) field = 'username';
      
      return res.status(409).json({ 
        message: `This ${field} is already registered`,
        field 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);
    
    // Generate unique identifiers
    const walletId = await generateWalletId();
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // FIXED: Create new user with all fields
    const newUser = new User({
      username: username.trim(),     
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      address: address.trim(), // FIXED: Added address
      password: hashedPassword,
      // REMOVED: role (not needed unless you have different user types)
      walletId,
      otp,
      otpExpires,
      isVerified: false,
      createdAt: new Date()
    });

    await newUser.save();
    console.log('User saved successfully:', newUser._id);

    // Send verification email
    try {
      await sendVerificationEmail(email, username, otp, walletId);
      
      return res.status(201).json({ 
        message: 'Registration successful! Please check your email to verify your account.',
        userId: newUser._id.toString(), // ADDED: Return userId for frontend
        walletId,
        emailSent: true
      });
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      return res.status(201).json({ 
        message: 'User registered successfully, but verification email failed to send. Please try resending.',
        userId: newUser._id.toString(),
        walletId,
        emailSent: false
      });
    }

  } catch (error) {
    console.error('Registration error:', error);
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(409).json({ 
        message: `This ${field} is already registered` 
      });
    }

    return res.status(500).json({ 
      message: 'Registration failed. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Verify OTP route
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: 'Email and OTP are required' });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user || !user.otp) {
      return res.status(404).json({ message: 'User not found or OTP not generated' });
    }

    const now = new Date();

    if (user.otp !== otp) {
      return res.status(400).json({ message: 'Incorrect OTP' });
    }

    if (user.otpExpires < now) {
      return res.status(400).json({ message: 'OTP expired' });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    return res.status(200).json({ 
      message: 'Email verified successfully! You can now log in.',
      walletId: user.walletId
    });
  } catch (err) {
    console.error('OTP verification error:', err);
    return res.status(500).json({ message: 'Server error during verification' });
  }
});

// Resend OTP route
router.post('/resend-otp', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: 'Account is already verified' });
    }

    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();

    try {
      await sendVerificationEmail(email, user.username, otp, user.walletId);
      
      return res.status(200).json({ 
        message: 'Verification code sent successfully! Please check your email.',
        emailSent: true
      });
    } catch (emailError) {
      console.error('Resend email failed:', emailError);
      return res.status(500).json({ 
        message: 'Failed to send verification email. Please try again.',
        emailSent: false
      });
    }

  } catch (err) {
    console.error('Resend OTP error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Health check endpoint for email service
router.get('/email-health', async (req, res) => {
  try {
    await transporter.verify();
    res.json({ 
      status: 'healthy', 
      service: 'email',
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy', 
      service: 'email',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;