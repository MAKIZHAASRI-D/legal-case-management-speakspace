/**
 * ============================================
 * UTILITY HELPERS
 * Common utility functions
 * ============================================
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Generate a unique case number
 * Format: CASE-YYYY-XXXXX
 */
const generateCaseNumber = () => {
    const year = new Date().getFullYear();
    const random = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `CASE-${year}-${random}`;
};

/**
 * Generate a unique ID
 */
const generateId = () => {
    return uuidv4();
};

/**
 * Parse date from natural language
 * @param {string} dateStr - Natural language date
 * @returns {Date|null} Parsed date or null
 */
const parseDate = (dateStr) => {
    if (!dateStr) return null;
    
    // Try direct parsing first
    const directParse = new Date(dateStr);
    if (!isNaN(directParse.getTime())) {
        return directParse;
    }
    
    // Handle relative dates
    const today = new Date();
    const lowerStr = dateStr.toLowerCase();
    
    if (lowerStr.includes('tomorrow')) {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow;
    }
    
    if (lowerStr.includes('next week')) {
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);
        return nextWeek;
    }
    
    if (lowerStr.includes('next month')) {
        const nextMonth = new Date(today);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        return nextMonth;
    }
    
    // Try to extract date pattern (DD/MM/YYYY, DD-MM-YYYY, etc.)
    const datePatterns = [
        /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
        /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/
    ];
    
    for (const pattern of datePatterns) {
        const match = dateStr.match(pattern);
        if (match) {
            try {
                const parsed = new Date(match[0]);
                if (!isNaN(parsed.getTime())) {
                    return parsed;
                }
            } catch (e) {
                continue;
            }
        }
    }
    
    return null;
};

/**
 * Format date for display
 * @param {Date} date - Date object
 * @returns {string} Formatted date string
 */
const formatDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
};

/**
 * Format date for Notion
 * @param {Date} date - Date object
 * @returns {string} ISO date string
 */
const formatDateForNotion = (date) => {
    if (!date) return null;
    return new Date(date).toISOString().split('T')[0];
};

/**
 * Sanitize string for safe storage
 * @param {string} str - Input string
 * @returns {string} Sanitized string
 */
const sanitizeString = (str) => {
    if (!str) return '';
    return str
        .replace(/[<>]/g, '')
        .trim()
        .substring(0, 2000); // Limit length
};

/**
 * Extract email from string
 * @param {string} text - Input text
 * @returns {string|null} Extracted email or null
 */
const extractEmail = (text) => {
    if (!text) return null;
    const emailRegex = /[\w.-]+@[\w.-]+\.\w+/i;
    const match = text.match(emailRegex);
    return match ? match[0].toLowerCase() : null;
};

/**
 * Validate email format (basic format check only)
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid format
 */
const isValidEmail = (email) => {
    if (!email) return false;
    const emailRegex = /^[\w.-]+@[\w.-]+\.\w+$/i;
    return emailRegex.test(email);
};

/**
 * Check if email is a real valid email (not fake/dummy domains)
 * Use this to determine if we should send emails to this address
 * @param {string} email - Email to validate
 * @returns {boolean} True if real email that can receive mail
 */
const isRealEmail = (email) => {
    if (!email || typeof email !== 'string') return false;
    
    email = email.trim().toLowerCase();
    
    // Check basic format
    if (!email.includes('@') || !email.includes('.')) return false;
    
    const parts = email.split('@');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
    
    const localPart = parts[0];
    const domain = parts[1];
    
    // Fake domains commonly used for testing
    const fakeDomains = [
        'example.com', 'example.org', 'example.net',
        'test.com', 'test.org', 'test.net',
        'fake.com', 'fake.org',
        'dummy.com', 'dummy.org',
        'sample.com', 'sample.org',
        'placeholder.com', 'placeholder.org',
        'mailinator.com', 'tempmail.com',
        'localhost', 'localhost.com',
        'abc.com', 'xyz.com', 'aaa.com',
        'email.com', 'mail.com'
    ];
    
    // Fake local parts that indicate test/dummy emails
    const fakeLocalParts = [
        'test', 'demo', 'fake', 'dummy', 'sample', 'placeholder',
        'user', 'admin', 'info', 'contact', 'noreply', 'no-reply',
        'asdf', 'qwerty', 'abcd', 'xyz', 'abc', 'aaa', 'bbb'
    ];
    
    if (fakeDomains.includes(domain)) return false;
    if (fakeLocalParts.includes(localPart)) return false;
    
    // Obviously fake patterns (e.g., a@b.com, ab@c.com)
    if (/^[a-z]{1,3}@/.test(email)) return false;
    
    return true;
};

/**
 * Calculate similarity between two strings (improved for name matching)
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score between 0 and 1
 */
const calculateSimilarity = (str1, str2) => {
    if (!str1 || !str2) return 0;
    
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    // Exact match
    if (s1 === s2) return 1.0;
    
    // Normalize: remove extra spaces, common words
    const normalize = (s) => s.replace(/\s+/g, ' ').replace(/\b(case|matter|vs|v\.?|the)\b/gi, '').trim();
    const n1 = normalize(s1);
    const n2 = normalize(s2);
    
    if (n1 === n2) return 0.95;
    
    // One fully contains the other
    if (n1.includes(n2) || n2.includes(n1)) return 0.85;
    
    // Word-based matching (better for names like "Amit Kumar" vs "Amit Singh")
    const words1 = n1.split(/\s+/).filter(w => w.length > 1);
    const words2 = n2.split(/\s+/).filter(w => w.length > 1);
    
    if (words1.length === 0 || words2.length === 0) return 0;
    
    // Count matching words
    const matchingWords = words1.filter(w => words2.includes(w));
    
    // Calculate match ratio based on both sets
    const matchRatio1 = matchingWords.length / words1.length;
    const matchRatio2 = matchingWords.length / words2.length;
    
    // Use average of both ratios
    const avgRatio = (matchRatio1 + matchRatio2) / 2;
    
    // If ALL words from search term match target, give bonus (e.g., "amit kumar" matches "amit kumar property")
    if (matchRatio1 === 1.0 && words1.length >= 2) return Math.min(0.9, avgRatio + 0.2);
    
    return avgRatio;
};

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
const truncate = (text, maxLength = 100) => {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
};

/**
 * Deep merge objects
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} Merged object
 */
const deepMerge = (target, source) => {
    const output = { ...target };
    
    for (const key of Object.keys(source)) {
        if (source[key] instanceof Object && key in target) {
            output[key] = deepMerge(target[key], source[key]);
        } else {
            output[key] = source[key];
        }
    }
    
    return output;
};

/**
 * Retry function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum retries
 * @param {number} delay - Initial delay in ms
 */
const retryWithBackoff = async (fn, maxRetries = 3, delay = 1000) => {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
        }
    }
};

/**
 * Safe JSON parse
 * @param {string} str - JSON string
 * @param {*} defaultValue - Default value if parsing fails
 * @returns {*} Parsed value or default
 */
const safeJsonParse = (str, defaultValue = null) => {
    try {
        return JSON.parse(str);
    } catch (e) {
        return defaultValue;
    }
};

/**
 * Async handler wrapper for Express routes
 * Catches async errors and passes them to error handler
 * @param {Function} fn - Async route handler
 * @returns {Function} Wrapped handler
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
    generateCaseNumber,
    generateId,
    parseDate,
    formatDate,
    formatDateForNotion,
    sanitizeString,
    extractEmail,
    isValidEmail,
    isRealEmail,
    calculateSimilarity,
    truncate,
    deepMerge,
    retryWithBackoff,
    safeJsonParse,
    asyncHandler
};
