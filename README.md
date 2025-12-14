# ⚖️ Intelligent Legal Case Management System

> **SpeakSpace Annual Hackathon 2025 - Sponsored by Alpha AI**

**One-line description:** Voice-to-action workflow that transforms lawyer voice notes into automated case management — creating cases in Notion, scheduling court dates, and sending client communications.

---

## 🎯 Problem Statement

**Lawyers spend 2-3 hours daily** on administrative tasks after court hearings:
- Manually creating/updating case files
- Scheduling next hearing dates
- Drafting client emails
- Assigning tasks to junior lawyers

This repetitive work takes time away from actual legal practice.

---

## 💡 Our Solution

**Speak once, execute everywhere.**

Lawyers simply speak their case updates after a hearing, and our system:
1. ✅ Creates/updates case records in Notion
2. ✅ Schedules calendar reminders for next hearing
3. ✅ Sends email notifications to clients
4. ✅ Assigns tasks to junior lawyers

**Example:**  
🎙️ _"Update Sharma case - bail granted. Next hearing January 15th. Email client."_  
✅ → Case updated in Notion → Calendar event created → Client email sent

---

## 📁 Project Structure

```
├── src/
│   ├── index.js                     # Express server entry point
│   ├── routes/
│   │   └── speakspace.js            # Main SpeakSpace API endpoint
│   ├── services/
│   │   ├── workflowOrchestrator.js  # Core workflow logic
│   │   ├── notionService.js         # Notion database operations
│   │   ├── calendarService.js       # Google Calendar integration
│   │   └── emailService.js          # Email notifications
│   ├── agents/
│   │   └── aiAgent.js               # AI entity extraction (Groq/GPT)
│   ├── auth/
│   │   └── userRegistry.js          # User management
│   ├── middleware/
│   │   ├── auth.js                  # Authentication middleware
│   │   └── errorHandler.js          # Error handling
│   └── utils/
│       ├── logger.js                # Winston logging
│       └── helpers.js               # Utility functions
├── tests/
│   └── api.test.js                  # Jest API tests
├── .env.example                     # Environment template
├── package.json                     # Dependencies
├── Procfile                         # Heroku deployment
└── render.yaml                      # Render deployment config
```

---

## 🔧 Setup Instructions

### Dependencies

```bash
npm install
```

**Key packages:**
- `express` - Web server
- `@notionhq/client` - Notion API
- `googleapis` - Google Calendar
- `nodemailer` - Email service
- `openai` - AI integration (works with Groq too)

### Environment Variables

```bash
cp .env.example .env
# Edit .env with your actual API keys
```

**Required variables:**
```env
NODE_ENV=production
AI_PROVIDER=groq
GROQ_API_KEY=your-groq-api-key
NOTION_API_KEY=your-notion-api-key
NOTION_DATABASE_ID=your-notion-database-id
```

### Start Server

```bash
npm start
```

---

## 🚀 Deployment Guide (For Judges)

### Live API (Already Deployed)

**Base URL:** `https://legal-case-management-production.up.railway.app`

**Test health endpoint:**
```
https://legal-case-management-production.up.railway.app/health
```

### Test the API

**Using curl:**
```bash
curl -X POST https://legal-case-management-production.up.railway.app/api/speakspace/action \
  -H "Content-Type: application/json" \
  -H "x-user-id: lawyer_senior_01" \
  -d '{"transcription": "Create new case for John Smith regarding property dispute. Email john@example.com"}'
```

**Using PowerShell:**
```powershell
$body = '{"transcription": "Create new case for John Smith regarding property dispute"}';
Invoke-RestMethod -Uri "https://legal-case-management-production.up.railway.app/api/speakspace/action" -Method Post -Headers @{"x-user-id"="lawyer_senior_01"; "Content-Type"="application/json"} -Body $body
```

---

## 🔌 API Endpoint & Authorization

### Endpoint URL
```
https://legal-case-management-production.up.railway.app/api/speakspace/action
```

### Authorization Header
| Type | Header | Value |
|------|--------|-------|
| Custom Header | `x-user-id` | `lawyer_senior_01` |

### Available User IDs
| User ID | Role | Description |
|---------|------|-------------|
| `lawyer_senior_01` | Senior | Can assign cases to junior |
| `lawyer_junior_01` | Junior | Self-assigns cases |

---

## 📋 SpeakSpace Action Configuration (Copy-Paste Ready)

```
Title: Legal Case Manager
Description: Automate legal case management from voice notes
API URL: https://legal-case-management-production.up.railway.app/api/speakspace/action
Method: POST
Authorization Type: Custom Header
Header Name: x-user-id
Header Value: lawyer_senior_01
```

---

## 📥 Input Format

**Request:**
```http
POST /api/speakspace/action
Content-Type: application/json
x-user-id: lawyer_senior_01
```

**Body:**
```json
{
  "transcription": "Create new case for John Smith regarding property dispute. Email john@example.com"
}
```

---

## 📤 Output Format

**Success - Case Created:**
```json
{
  "status": "complete",
  "notion": "done - https://notion.so/...",
  "message": "✅ Case created: John Smith Property Dispute"
}
```

**Success - Case Updated with Calendar:**
```json
{
  "status": "complete",
  "notion": "done - https://notion.so/...",
  "calendar_reminder": "done - https://www.google.com/calendar/event?eid=...",
  "email": "sent"
}
```

**Draft (Missing Info):**
```json
{
  "success": true,
  "status": "CREATED_AS_DRAFT",
  "message": "📝 Draft created: Property Dispute",
  "missing_fields": ["client_email"]
}
```

---

## 🔄 How It Works

```
SpeakSpace Voice Note
        ↓
POST /api/speakspace/action
        ↓
┌─────────────────────────────┐
│   AI Agent (Groq/GPT)       │
│   - Extract case name       │
│   - Extract client details  │
│   - Identify intent         │
│   - Parse dates             │
└─────────────────────────────┘
        ↓
┌─────────────────────────────┐
│   Workflow Orchestrator     │
│   - Route to CREATE/UPDATE  │
│   - Validate data           │
│   - Coordinate services     │
└─────────────────────────────┘
        ↓
┌───────────┬───────────┬───────────┐
│  Notion   │  Calendar │   Email   │
│  Database │  Events   │  Notify   │
└───────────┴───────────┴───────────┘
        ↓
Response to SpeakSpace
```

---

## 🎬 Demo Scenarios

### Scenario 1: Create New Case
**Voice:** _"New case for TechCorp, client Rajesh Kumar, email rajesh@tech.com, corporate merger"_

**Result:** Case created in Notion → Junior assigned → Confirmation returned

### Scenario 2: Update Existing Case
**Voice:** _"Update Sharma case, bail granted, next hearing January 15th"_

**Result:** Case updated → Calendar event created → Client email sent

### Scenario 3: Multi-Case Update
**Voice:** _"Sharma case bail granted. Patel case adjourned. New case for XYZ Corp."_

**Result:** All 3 cases processed in one request

---

## 📄 Environment File Template (.env.example)

```env
# Server
PORT=3000
NODE_ENV=production

# AI Provider (groq is FREE)
AI_PROVIDER=groq
GROQ_API_KEY=gsk_your-groq-api-key-here

# Notion (Required)
NOTION_API_KEY=secret_your-notion-key-here
NOTION_DATABASE_ID=your-32-char-database-id

# Google Calendar (Optional)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token

# Email (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=your-email@gmail.com
```

---

## 🏆 Key Features

- **AI-Powered:** Uses Groq Llama 3.3 (FREE) for entity extraction
- **Multi-Case Support:** Process multiple cases in one voice note
- **Smart Drafts:** Creates drafts when data is incomplete
- **Full Audit Trail:** All updates logged in Notion
- **Role-Based:** Different workflows for senior/junior lawyers
- **Auto-Scheduling:** Calendar events for hearings
- **Email Automation:** Client and team notifications

---

## 📞 Quick Test Links

| Endpoint | URL |
|----------|-----|
| Health Check | https://legal-case-management-production.up.railway.app/health |
| API Endpoint | https://legal-case-management-production.up.railway.app/api/speakspace/action |
| GitHub Repo | https://github.com/MAKIZHAASRI-D/legal-case-management-speakspace |

---

## 📄 License

MIT License

---

**Built with ❤️ for SpeakSpace Annual Hackathon 2025**
