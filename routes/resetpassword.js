require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const User = require('../models/User');

const router = express.Router();

// Setup Nodemailer
const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

// Check transporter
transporter.verify((err) => {
  if (err) console.error('Email transporter error:', err);
  else console.log('Email transporter is ready');
});

// 1. Forgot Password Route
router.post('/forgot-password', async (req, res) => {
  try {
    const email = req.body.email?.toLowerCase();
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email });
    if (!user) {
      // Avoid revealing user existence
      return res.status(200).json({
        message: 'If the email is registered, a reset token has been sent.',
      });
    }

    // Generate secure token
    const resetToken = crypto.randomBytes(20).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Save to user
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // HTML Email Template
    const html = `
      <div style="font-family: Arial, sans-serif; background-color: #f4f6f9; padding: 30px;">
        <div style="max-width: 500px; margin: auto; background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
          <h2 style="color: #0A66C2; text-align: center;">🔐 Password Reset Token</h2>
          <p>Hello <strong>${user.firstName || 'User'}</strong>,</p>
          <p>You recently requested a password reset for your Fluidit account.</p>
          <p><strong style="font-size: 18px;">Your Reset Token:</strong></p>
          <div style="background-color: #f0f0f0; padding: 15px; border-radius: 5px; text-align: center; font-size: 20px; letter-spacing: 2px; font-weight: bold;">
            ${resetToken}
          </div>
          <p style="margin-top: 20px;">This token is valid for <strong>1 hour</strong>.</p>
          <p>If you didn't request this, please ignore this email.</p>
          <hr style="margin: 30px 0;">
          <p style="text-align: center; color: #888;">— The Fluidit Team</p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"Fluidit Team" <${process.env.MAIL_USER}>`,
      to: email,
      subject: 'Your Fluidit Password Reset Token',
      html,
    });

    res.status(200).json({ message: 'Reset token sent to email.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// 2. Reset Password Route
router.post('/reset-password', async (req, res) => {
  try {
    const { email, token, password } = req.body;
    if (!email || !token || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }); // 
    if (!user) return res.status(400).json({ message: 'Invalid email or token' });

    const hashedToken = crypto.createHash('sha256').update(token.trim()).digest('hex'); //

    console.log("Received:", token);
    console.log("Hashed:", hashedToken);
    console.log("Stored:", user.resetPasswordToken);

    if (
      user.resetPasswordToken !== hashedToken ||
      !user.resetPasswordExpires ||
      user.resetPasswordExpires < Date.now()
    ) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    user.password = await bcrypt.hash(password, 12);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({ message: 'Password reset successful' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
