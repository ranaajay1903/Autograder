# Brevo Email Provider Setup Guide

## Overview
This guide explains how to configure Brevo for Autograder email delivery using the Brevo API.

---

## Environment Variables Setup

Update your `.env` file with the following variables:

### Required Variables
```env
# Brevo API configuration
BREVO_API_KEY=your_brevo_api_key_here
BREVO_SENDER_EMAIL=your_verified_sender@domain.com
BREVO_SENDER_NAME=Autograder

# App configuration
NODE_ENV=production
```

### Optional Variables
```env
EMAIL_LOG_ONLY=true   # Set to 'true' in development to log emails instead of sending
```

---

## Steps to Set Up Brevo

### 1. Create a Brevo Account
- Visit https://www.brevo.com
- Sign up for a free account
- Verify your account email address

### 2. Generate a Brevo API Key
- Log in to the Brevo Dashboard
- Open **SMTP & API** or **API & SMTP** settings
- Create a new API key
- Copy the API key into `BREVO_API_KEY` in your `.env` file

### 3. Verify a Sender Email
- In the Brevo Dashboard, navigate to **Senders** or **Sender Identity**
- Add the email address you want to send from
- Verify the email by following the confirmation link sent by Brevo
- Set the verified address in `BREVO_SENDER_EMAIL`

### 4. Configure Your Backend Environment
- Copy `backend/.env.example` to `backend/.env`
- Fill in your Brevo values:
  - `BREVO_API_KEY`
  - `BREVO_SENDER_EMAIL`
  - `BREVO_SENDER_NAME`
- Set `NODE_ENV=production` for real sending

### 5. Restart the Backend
- Restart your backend server so environment variables are loaded correctly
- Example:
  ```bash
  cd backend
  npm start
  ```

---

## Testing Email Functionality

### Development Mode
```env
EMAIL_LOG_ONLY=true
NODE_ENV=development
```
In development mode, email content is logged to the console instead of being sent.

### Production Mode
```env
EMAIL_LOG_ONLY=false
NODE_ENV=production
BREVO_API_KEY=your_brevo_api_key_here
BREVO_SENDER_EMAIL=verified-email@domain.com
BREVO_SENDER_NAME=Autograder
```
Emails are sent through the Brevo API.

### Test Endpoint
Use the invite endpoint to verify email sending:
```bash
POST /api/admin/invite-students
Body: {
  "emails": ["test@example.com"],
  "courseId": 1
}
```

---

## Important Notes

- `BREVO_API_KEY` is required for Brevo API email sending.
- `BREVO_SENDER_EMAIL` must be a verified sender in Brevo.
- `BREVO_SENDER_NAME` is optional and used as the display sender name.
- For production email delivery, set `NODE_ENV=production`.

---

## Troubleshooting

### Missing or Invalid API Key
- Confirm `BREVO_API_KEY` is set in `backend/.env`
- Verify the key is copied exactly, with no extra spaces
- If the key is invalid, create a new one in Brevo

### Unverified Sender Email
- Make sure `BREVO_SENDER_EMAIL` is verified in Brevo
- Resend verification from the Brevo Sender settings if needed

### Emails Not Sending
- Ensure `NODE_ENV=production` and `EMAIL_LOG_ONLY` is not `true`
- Restart the backend after changing `.env`
- Check backend logs for Brevo API errors

---

## Quick Reference - Environment Variables

| Variable | Description |
|----------|-------------|
| `BREVO_API_KEY` | Brevo API key used for sending email via the Brevo API |
| `BREVO_SENDER_EMAIL` | Verified sender email address |
| `BREVO_SENDER_NAME` | Optional sender display name |
| `EMAIL_LOG_ONLY` | If `true`, logs emails instead of sending them |
| `NODE_ENV` | Set to `production` to enable actual email delivery |

---

## Additional Resources

- Brevo Support: https://help.brevo.com
- Brevo API Docs: https://developers.brevo.com/docs
