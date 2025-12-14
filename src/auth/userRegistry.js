/**
 * ============================================
 * USER REGISTRY
 * Identity Database for Lawyers
 * ============================================
 * 
 * This module manages user identities and their
 * associated configurations. In production, this
 * would be replaced with a proper database.
 * 
 * ============================================
 * SPEAKSPACE HACKATHON - QUICK START
 * ============================================
 * 
 * Use this header in your SpeakSpace app:
 *   x-user-id: demo_user
 * 
 * Or use the full user IDs:
 *   x-user-id: lawyer_senior_01
 *   x-user-id: lawyer_junior_01
 * 
 * API Endpoint for SpeakSpace:
 *   POST /api/speakspace/action
 *   Header: x-user-id: demo_user
 *   Body: { "transcription": "your voice note text" }
 * 
 * ============================================
 */

/**
 * User Registry - The Identity Database
 * 
 * Each user has:
 * - name: Display name
 * - role: SENIOR or JUNIOR
 * - email: User's email address
 * - notion_db_id: Their Notion workspace database ID
 * - notion_token: Their Notion API token (for multi-workspace support)
 * - junior_email: Email of assigned junior (null for juniors)
 * - junior_name: Name of assigned junior (null for juniors)
 * - google_calendar_id: Their Google Calendar ID
 * - google_refresh_token: Their Google OAuth refresh token
 */
const USER_REGISTRY = {
    // ============================================
    // DEMO USER - For SpeakSpace Hackathon
    // Use: x-user-id: demo_user
    // ============================================
    "demo_user": {
        id: "demo_user",
        name: "Demo Lawyer",
        role: "SENIOR",
        email: process.env.DEMO_USER_EMAIL || "demo@legalfirm.com",
        notion_db_id: process.env.NOTION_DATABASE_ID,
        notion_token: process.env.NOTION_API_KEY,
        junior_email: process.env.DEMO_JUNIOR_EMAIL || "junior@legalfirm.com",
        junior_name: "Demo Junior",
        google_calendar_id: "primary",
        google_refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
        preferences: {
            auto_assign_to_junior: true,
            send_client_emails: true,
            reminder_hours_before: 24
        }
    },
    
    // Senior Lawyer Account
    "lawyer_senior_01": {
        id: "lawyer_senior_01",
        name: "Advocate Priya Sharma",
        role: "SENIOR",
        email: "priya.sharma@legalfirm.com",
        notion_db_id: process.env.NOTION_DATABASE_ID || "senior_database_id",
        notion_token: process.env.NOTION_API_KEY,
        junior_email: "rahul.kumar@legalfirm.com",
        junior_name: "Advocate Rahul Kumar",
        google_calendar_id: "primary",
        google_refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
        preferences: {
            auto_assign_to_junior: true,
            send_client_emails: true,
            reminder_hours_before: 24
        }
    },
    
    // Junior Lawyer Account
    "lawyer_junior_01": {
        id: "lawyer_junior_01",
        name: "Advocate Rahul Kumar",
        role: "JUNIOR",
        email: "rahul.kumar@legalfirm.com",
        notion_db_id: process.env.NOTION_DATABASE_ID || "junior_database_id",
        notion_token: process.env.NOTION_API_KEY,
        junior_email: null, // Juniors don't have juniors
        junior_name: null,
        google_calendar_id: "primary",
        google_refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
        senior_email: "priya.sharma@legalfirm.com",
        senior_name: "Advocate Priya Sharma",
        preferences: {
            auto_assign_to_junior: false,
            send_client_emails: true,
            reminder_hours_before: 24
        }
    },
    
    // Another Senior Lawyer
    "lawyer_senior_02": {
        id: "lawyer_senior_02",
        name: "Advocate Vikram Singh",
        role: "SENIOR",
        email: "vikram.singh@legalfirm.com",
        notion_db_id: process.env.NOTION_DATABASE_ID || "vikram_database_id",
        notion_token: process.env.NOTION_API_KEY,
        junior_email: "neha.patel@legalfirm.com",
        junior_name: "Advocate Neha Patel",
        google_calendar_id: "primary",
        google_refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
        preferences: {
            auto_assign_to_junior: true,
            send_client_emails: true,
            reminder_hours_before: 48
        }
    },
    
    // Another Junior Lawyer
    "lawyer_junior_02": {
        id: "lawyer_junior_02",
        name: "Advocate Neha Patel",
        role: "JUNIOR",
        email: "neha.patel@legalfirm.com",
        notion_db_id: process.env.NOTION_DATABASE_ID || "neha_database_id",
        notion_token: process.env.NOTION_API_KEY,
        junior_email: null,
        junior_name: null,
        google_calendar_id: "primary",
        google_refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
        senior_email: "vikram.singh@legalfirm.com",
        senior_name: "Advocate Vikram Singh",
        preferences: {
            auto_assign_to_junior: false,
            send_client_emails: true,
            reminder_hours_before: 24
        }
    }
};

/**
 * API Key to User Mapping
 * Maps API keys to user IDs for authentication
 */
const API_KEY_MAP = {
    "sk_senior_priya_2024": "lawyer_senior_01",
    "sk_junior_rahul_2024": "lawyer_junior_01",
    "sk_senior_vikram_2024": "lawyer_senior_02",
    "sk_junior_neha_2024": "lawyer_junior_02"
};

/**
 * Get user by ID
 * @param {string} userId - The user ID
 * @returns {Object|null} User profile or null if not found
 */
const getUserById = (userId) => {
    return USER_REGISTRY[userId] || null;
};

/**
 * Get user by API key
 * @param {string} apiKey - The API key
 * @returns {Object|null} User profile or null if not found
 */
const getUserByApiKey = (apiKey) => {
    const userId = API_KEY_MAP[apiKey];
    if (!userId) return null;
    return USER_REGISTRY[userId] || null;
};

/**
 * Get user by email
 * @param {string} email - The user's email
 * @returns {Object|null} User profile or null if not found
 */
const getUserByEmail = (email) => {
    return Object.values(USER_REGISTRY).find(user => user.email === email) || null;
};

/**
 * Check if user is a senior lawyer
 * @param {Object} user - The user object
 * @returns {boolean} True if user is a senior
 */
const isSenior = (user) => {
    return user?.role === 'SENIOR';
};

/**
 * Check if user is a junior lawyer
 * @param {Object} user - The user object
 * @returns {boolean} True if user is a junior
 */
const isJunior = (user) => {
    return user?.role === 'JUNIOR';
};

/**
 * Check if user has a junior assigned
 * @param {Object} user - The user object
 * @returns {boolean} True if user has a junior
 */
const hasJunior = (user) => {
    return user?.junior_email !== null && user?.junior_email !== undefined;
};

/**
 * Get all users (for admin purposes)
 * @returns {Array} Array of all users
 */
const getAllUsers = () => {
    return Object.values(USER_REGISTRY);
};

/**
 * Validate user can perform action
 * @param {Object} user - The user object
 * @param {string} action - The action to validate
 * @returns {Object} Validation result
 */
const validateUserAction = (user, action) => {
    if (!user) {
        return { valid: false, reason: 'User not found' };
    }
    
    switch (action) {
        case 'ASSIGN_TO_JUNIOR':
            if (!hasJunior(user)) {
                return { valid: false, reason: 'User does not have a junior assigned' };
            }
            return { valid: true };
            
        case 'CREATE_CASE':
        case 'UPDATE_CASE':
        case 'VIEW_CASE':
            return { valid: true };
            
        default:
            return { valid: true };
    }
};

module.exports = {
    USER_REGISTRY,
    API_KEY_MAP,
    getUserById,
    getUserByApiKey,
    getUserByEmail,
    isSenior,
    isJunior,
    hasJunior,
    getAllUsers,
    validateUserAction
};
