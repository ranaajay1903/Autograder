const nodemailer = require('nodemailer');
require('dotenv').config();

const smtpUser = process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_USER;
const smtpPass = process.env.BREVO_SMTP_KEY;
const smtpHost = process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com';
const smtpPort = Number(process.env.BREVO_SMTP_PORT || 587);
const smtpSecure = String(process.env.BREVO_SMTP_SECURE || '').toLowerCase() === 'true' || smtpPort === 465;

const buildTransporter = (port, secure) => nodemailer.createTransport({
  host: smtpHost,
  port,
  secure,
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
  connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 15000),
  greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 15000),
  socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 20000),
});

const primaryTransporter = buildTransporter(smtpPort, smtpSecure);
const fallbackTransporter = smtpPort === 587
  ? buildTransporter(465, true)
  : buildTransporter(587, false);
const brevoApiKey = process.env.BREVO_API_KEY;
const brevoSenderName = process.env.BREVO_SENDER_NAME || 'Autograder';

const sendEmail = async (mailOptions) => {
  try {
    const shouldLogOnly =
      String(process.env.EMAIL_LOG_ONLY || "").toLowerCase() === "true" ||
      (!process.env.BREVO_SMTP_KEY && process.env.NODE_ENV !== "production");

    if (shouldLogOnly) {
      console.log('Email would be sent in production:');
      console.log('To:', mailOptions.to);
      console.log('Subject:', mailOptions.subject);
      console.log('Body:', mailOptions.html);
      return { messageId: 'dev-mode' };
    }

    const mailData = {
      from: smtpUser,
      to: mailOptions.to,
      subject: mailOptions.subject,
      html: mailOptions.html,
      text: mailOptions.text,
    };

    if (brevoApiKey) {
      const senderEmail = smtpUser;
      if (!senderEmail) {
        throw new Error('Missing BREVO_SENDER_EMAIL/EMAIL_USER for Brevo sender');
      }

      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': brevoApiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: {
            name: brevoSenderName,
            email: senderEmail,
          },
          to: [{ email: mailOptions.to }],
          subject: mailOptions.subject,
          htmlContent: mailOptions.html,
          textContent: mailOptions.text,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Brevo API error ${response.status}: ${body}`);
      }

      const data = await response.json();
      return { messageId: data.messageId || data.messageIds?.[0] || 'brevo-api' };
    }

    try {
      return await primaryTransporter.sendMail(mailData);
    } catch (error) {
      const isTimeout = ['ETIMEDOUT', 'ESOCKET', 'ECONNECTION'].includes(error?.code) ||
        String(error?.message || '').toLowerCase().includes('timeout');
      if (!isTimeout) throw error;

      console.warn(`Primary SMTP connection failed (${error.code || 'unknown'}). Retrying with fallback port.`);
      return await fallbackTransporter.sendMail(mailData);
    }
  } catch (error) {
    console.error('Brevo SMTP error:', error);
    throw error;
  }
};

const getFrontendUrl = (req) => {
  if (process.env.FRONTEND_URL) {
    return process.env.FRONTEND_URL;
  }

  if (req) {
    const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
    const host = req.headers["x-forwarded-host"] || req.get("host");
    if (host) {
      return `${proto}://${host}`;
    }
  }

  return "http://localhost:5173";
};

module.exports = {
  sendEmail,
  getFrontendUrl,
};
