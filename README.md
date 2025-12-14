# ⚖️ Intelligent Legal Case Management System

> **SpeakSpace Annual Hackathon 2025 - Sponsored by Alpha AI**

Voice-to-action workflow that transforms lawyer voice notes into automated case management — creating cases in Notion, scheduling court dates, and sending client communications.

---

## 🎯 What It Does

Lawyers speak their case updates, and the system executes automatically:

🎙️ _"Create new case for John Smith, property dispute, email john@example.com"_  
✅ → Case created in Notion → Junior notified → Client email queued

---

## 📁 Project Structure

```
├── src/
│   ├── index.js                 # Express server entry point
│   ├── routes/speakspace.js     # Main API endpoint
│   ├── services/
│   │   ├── workflowOrchestrator.js  # Core workflow logic
│   │   ├── notionService.js         # Notion database operations
│   │   ├── calendarService.js       # Google Calendar integration
│   │   └── emailService.js          # Email notifications
│   └── agents/aiAgent.js        # AI entity extraction (GPT/Groq)
├── .env.example                 # Environment template
├── package.json
└── Procfile                     # Heroku deployment
```

---

## 🔧 Setup

```bash
npm install
cp .env.example .env
# Edit .env with your API keys
npm start
```

**Required Environment Variables:**
```env
OPENAI_API_KEY=sk-your-key      # Or GROQ_API_KEY for free tier
NOTION_API_KEY=secret_your-key
NOTION_DATABASE_ID=your-db-id
```

---

## 🔌 SpeakSpace Configuration

| Field | Value |
|-------|-------|
| **Title** | Legal Case Manager |
| **Description** | Automate legal case management from voice notes |
| **API URL** | `https://your-server.com/api/speakspace/action` |
| **Method** | POST |

---

## 🔐 Authorization

| Type | Header | Value |
|------|--------|-------|
| Custom Header | `x-user-id` | `lawyer_senior_01` |

**Available User IDs:**
- `lawyer_senior_01` - Senior Lawyer (can assign to junior)
- `lawyer_junior_01` - Junior Lawyer

---

## 📥 Input Format

**Request:**
```http
POST /api/speakspace/action
Content-Type: application/json
x-user-id: lawyer_senior_01
```

```json
{
  "transcription": "Create new case for John Smith regarding property dispute. Email john@example.com"
}
```

---

## 📤 Output Format

**Success Response:**
```json
{
  "success": true,
  "status": "CREATED",
  "message": "✅ Case created: John Smith Property Dispute",
  "case_name": "John Smith Property Dispute",
  "case_number": "CASE-2025-ABC12",
  "notion_url": "https://notion.so/..."
}
```

**Draft Response (missing info):**
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
SpeakSpace → POST /api/speakspace/action → AI extracts entities → Workflow executes
                                                    ↓
                                    ┌───────────────┼───────────────┐
                                    ↓               ↓               ↓
                              Notion DB      Google Calendar    Email Service
                            (Create/Update)    (Reminders)     (Notifications)
```

1. **SpeakSpace** sends transcribed voice note to our API
2. **AI Agent** extracts case details (name, client, dates, etc.)
3. **Workflow Engine** routes to appropriate action (create/update)
4. **Services** execute (Notion, Calendar, Email)
5. **Response** confirms success or requests missing info

---

##  License

MIT License
