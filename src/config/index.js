/**
 * ============================================
 * APPLICATION CONFIGURATION
 * Centralized configuration management
 * ============================================
 */

const config = {
    // Server
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    
    // AI Provider (FREE options)
    aiProvider: process.env.AI_PROVIDER || 'gemini', // 'gemini', 'groq', or 'huggingface'
    
    // Google Gemini (FREE - 1500 req/day)
    gemini: {
        apiKey: process.env.GEMINI_API_KEY
    },
    
    // Groq (FREE - Llama 3.1)
    groq: {
        apiKey: process.env.GROQ_API_KEY
    },
    
    // OpenAI (PAID - kept for backward compatibility)
    openai: {
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4o',
        temperature: 0,
        maxTokens: 4096
    },
    
    // Notion
    notion: {
        apiKey: process.env.NOTION_API_KEY,  // Default for single-user mode
        databaseId: process.env.NOTION_DATABASE_ID,
        // OAuth for multi-user mode
        oauthClientId: process.env.NOTION_OAUTH_CLIENT_ID,
        oauthClientSecret: process.env.NOTION_OAUTH_CLIENT_SECRET,
        oauthRedirectUri: process.env.NOTION_OAUTH_REDIRECT_URI || 'http://localhost:3000/api/oauth/notion/callback',
        // Notion property names (customize based on your database schema)
        properties: {
            caseNumber: 'Case Number',
            caseName: 'Case Name',
            status: 'Status',
            clientName: 'Client Name',
            clientEmail: 'Client Email',
            juniorName: 'Junior Name',
            juniorEmail: 'Junior Email',
            summary: 'Summary',
            latestOutcome: 'Latest Outcome',
            documentsNeeded: 'Documents Needed',
            hearingCount: 'Hearing Count',
            nextHearing: 'Next Hearing',
            clientWelcomeSent: 'Client Welcome Sent',
            assignedTo: 'Assigned To',
            createdBy: 'Created By',
            lastUpdated: 'Last Updated'
        }
    },
    
    // Base URL for OAuth callbacks
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
    
    // Google Calendar & Gmail OAuth
    google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/oauth/google/callback',
        refreshToken: process.env.GOOGLE_REFRESH_TOKEN  // Default for single-user mode
    },
    
    // Email
    email: {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        },
        from: process.env.EMAIL_FROM || 'noreply@legalfirm.com'
    },
    
    // Security
    security: {
        apiKeySecret: process.env.API_KEY_SECRET
    },
    
    // Case Status Options
    caseStatuses: {
        DRAFT: 'Draft',
        ACTIVE: 'Active',
        CONTINUING: 'Continuing',
        FINALIZED: 'Finalized',
        CLOSED: 'Closed',
        ACTION_REQUIRED: 'Action Required'
    },
    
    // Required fields for new cases
    requiredFieldsForNewCase: ['case_name', 'client_name', 'client_email'],
    
    // Logging
    logging: {
        level: process.env.LOG_LEVEL || 'info'
    }
};

// Validation
const validateConfig = () => {
    const required = [
        'openai.apiKey',
        'notion.apiKey',
        'notion.databaseId'
    ];
    
    const missing = required.filter(key => {
        const keys = key.split('.');
        let value = config;
        for (const k of keys) {
            value = value?.[k];
        }
        return !value;
    });
    
    if (missing.length > 0 && process.env.NODE_ENV === 'production') {
        throw new Error(`Missing required configuration: ${missing.join(', ')}`);
    }
    
    return true;
};

module.exports = { config, validateConfig };
