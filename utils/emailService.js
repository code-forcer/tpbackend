// utils/emailService.js
require('dotenv').config();
const nodemailer = require('nodemailer');

// Create transporter (configure with your email service)
const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: parseInt(process.env.MAIL_PORT) || 587,
  secure: parseInt(process.env.MAIL_PORT) === 465, // true for 465, false otherwise
  auth: {
    user: process.env.MAIL_USER, // must match below 'from'
    pass: process.env.MAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false, // prevents some self-signed cert issues
  },
  connectionTimeout: 10000, // 10s timeout
});

// Email templates
const emailTemplates = {
  paymentSent: (data) => ({
    subject: `Payment Sent - ₦${data.amount} to ${data.recipientName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #3B82F6, #06B6D4); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">Payment Sent Successfully</h1>
        </div>
        
        <div style="padding: 30px; background: #f9fafb;">
          <h2 style="color: #1f2937;">Transaction Details</h2>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px 0; font-weight: bold;">Transaction ID:</td>
                <td style="padding: 10px 0;">${data.transactionId}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px 0; font-weight: bold;">Amount:</td>
                <td style="padding: 10px 0; color: #dc2626; font-weight: bold;">-₦${data.amount}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px 0; font-weight: bold;">Transaction Fee:</td>
                <td style="padding: 10px 0;">₦${data.fees}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px 0; font-weight: bold;">Total Deducted:</td>
                <td style="padding: 10px 0; font-weight: bold;">₦${data.totalAmount}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px 0; font-weight: bold;">Recipient:</td>
                <td style="padding: 10px 0;">${data.recipientName}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px 0; font-weight: bold;">Recipient Wallet:</td>
                <td style="padding: 10px 0;">${data.recipientWalletId}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px 0; font-weight: bold;">Date & Time:</td>
                <td style="padding: 10px 0;">${data.timestamp}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px 0; font-weight: bold;">New Balance:</td>
                <td style="padding: 10px 0; color: #059669; font-weight: bold;">₦${data.newBalance}</td>
              </tr>
              ${data.note ? `
              <tr>
                <td style="padding: 10px 0; font-weight: bold;">Note:</td>
                <td style="padding: 10px 0;">${data.note}</td>
              </tr>
              ` : ''}
            </table>
          </div>
          
          <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #92400e;">
              <strong>Keep this receipt for your records.</strong> If you have any questions about this transaction, please contact our support team.
            </p>
          </div>
        </div>
        
        <div style="background: #374151; padding: 20px; text-align: center;">
          <p style="color: #9ca3af; margin: 0;">FluidIt - Digital Wallet</p>
          <p style="color: #6b7280; margin: 5px 0 0 0; font-size: 12px;">This is an automated message. Please do not reply.</p>
        </div>
      </div>
    `,
  }),

  paymentReceived: (data) => ({
    subject: `Payment Received - ₦${data.amount} from ${data.senderName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #059669, #10b981); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">Payment Received</h1>
        </div>
        
        <div style="padding: 30px; background: #f9fafb;">
          <h2 style="color: #1f2937;">Transaction Details</h2>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px 0; font-weight: bold;">Transaction ID:</td>
                <td style="padding: 10px 0;">${data.transactionId}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px 0; font-weight: bold;">Amount:</td>
                <td style="padding: 10px 0; color: #059669; font-weight: bold;">+₦${data.amount}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px 0; font-weight: bold;">From:</td>
                <td style="padding: 10px 0;">${data.senderName}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px 0; font-weight: bold;">Sender Wallet:</td>
                <td style="padding: 10px 0;">${data.senderWalletId}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px 0; font-weight: bold;">Date & Time:</td>
                <td style="padding: 10px 0;">${data.timestamp}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px 0; font-weight: bold;">New Balance:</td>
                <td style="padding: 10px 0; color: #059669; font-weight: bold;">₦${data.newBalance}</td>
              </tr>
              ${data.note ? `
              <tr>
                <td style="padding: 10px 0; font-weight: bold;">Note:</td>
                <td style="padding: 10px 0;">${data.note}</td>
              </tr>
              ` : ''}
            </table>
          </div>
        </div>
        
        <div style="background: #374151; padding: 20px; text-align: center;">
          <p style="color: #9ca3af; margin: 0;">FluidIt - Digital Wallet</p>
          <p style="color: #6b7280; margin: 5px 0 0 0; font-size: 12px;">This is an automated message. Please do not reply.</p>
        </div>
      </div>
    `,
  }),

  topUp: (data) => ({
    subject: `Wallet Top-up Successful - ₦${data.amount}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #7c3aed, #a855f7); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">Wallet Top-up Successful</h1>
        </div>
        
        <div style="padding: 30px; background: #f9fafb;">
          <h2 style="color: #1f2937;">Transaction Details</h2>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px 0; font-weight: bold;">Transaction ID:</td>
                <td style="padding: 10px 0;">${data.transactionId}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px 0; font-weight: bold;">Amount Added:</td>
                <td style="padding: 10px 0; color: #059669; font-weight: bold;">+₦${data.amount}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px 0; font-weight: bold;">Date & Time:</td>
                <td style="padding: 10px 0;">${data.timestamp}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; font-weight: bold;">New Balance:</td>
                <td style="padding: 10px 0; color: #059669; font-weight: bold;">₦${data.newBalance}</td>
              </tr>
            </table>
          </div>
        </div>
        
        <div style="background: #374151; padding: 20px; text-align: center;">
          <p style="color: #9ca3af; margin: 0;">FluidIt - Digital Wallet</p>
          <p style="color: #6b7280; margin: 5px 0 0 0; font-size: 12px;">This is an automated message. Please do not reply.</p>
        </div>
      </div>
    `,
  }),
};

// Send email function
const sendEmail = async (to, template, data) => {
  try {
    const emailContent = emailTemplates[template](data);
    
    const mailOptions = {
      from: `"FluidIt Wallet" <${process.env.SMTP_USER}>`,
      to: to,
      subject: emailContent.subject,
      html: emailContent.html,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Email sending failed:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendEmail,
  emailTemplates,
};