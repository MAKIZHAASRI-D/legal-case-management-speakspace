/**
 * ============================================
 * AUTH ROUTES
 * Authentication and user management
 * ============================================
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { authMiddleware } = require('../middleware/auth');
const { CalendarService } = require('../services/calendarService');
const { 
    getUserById, 
    getUserByApiKey, 
    getAllUsers 
} = require('../auth/userRegistry');
const { logger } = require('../utils/logger');

/**
 * GET /auth/users
 * Get list of available users (for testing/demo)
 */
router.get('/users', asyncHandler(async (req, res) => {
    const users = getAllUsers().map(user => ({
        id: user.id,
        name: user.name,
        role: user.role,
        email: user.email,
        has_junior: !!user.junior_email
    }));
    
    res.json({
        success: true,
        data: {
            count: users.length,
            users
        }
    });
}));

/**
 * GET /auth/me
 * Get current user profile
 */
router.get('/me', authMiddleware, asyncHandler(async (req, res) => {
    const user = req.user;
    
    res.json({
        success: true,
        data: {
            id: user.id,
            name: user.name,
            role: user.role,
            email: user.email,
            junior_name: user.junior_name,
            junior_email: user.junior_email,
            preferences: user.preferences
        }
    });
}));

/**
 * POST /auth/validate
 * Validate authentication credentials
 */
router.post('/validate', asyncHandler(async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    const userId = req.headers['x-user-id'];
    
    let user = null;
    let method = null;
    
    if (apiKey) {
        user = getUserByApiKey(apiKey);
        method = 'api-key';
    } else if (userId) {
        user = getUserById(userId);
        method = 'user-id';
    }
    
    if (!user) {
        return res.status(401).json({
            success: false,
            error: 'Invalid credentials'
        });
    }
    
    logger.info('Auth: Credentials validated', {
        userId: user.id,
        method
    });
    
    res.json({
        success: true,
        data: {
            valid: true,
            user: {
                id: user.id,
                name: user.name,
                role: user.role
            },
            method
        }
    });
}));

/**
 * GET /auth/google
 * Get Google OAuth authorization URL
 */
router.get('/google', asyncHandler(async (req, res) => {
    const calendar = new CalendarService();
    const authUrl = calendar.getAuthUrl();
    
    res.json({
        success: true,
        data: {
            auth_url: authUrl
        }
    });
}));

/**
 * GET /auth/google/callback
 * Handle Google OAuth callback
 */
router.get('/google/callback', asyncHandler(async (req, res) => {
    const { code } = req.query;
    
    if (!code) {
        return res.status(400).json({
            success: false,
            error: 'Authorization code required'
        });
    }
    
    try {
        const calendar = new CalendarService();
        const tokens = await calendar.getTokensFromCode(code);
        
        logger.info('Auth: Google OAuth tokens received');
        
        // In production, store these tokens securely
        res.json({
            success: true,
            data: {
                message: 'Authorization successful',
                refresh_token: tokens.refresh_token,
                note: 'Store this refresh_token in your .env file'
            }
        });
        
    } catch (error) {
        logger.error('Auth: Google OAuth failed', { error: error.message });
        res.status(400).json({
            success: false,
            error: 'Authorization failed: ' + error.message
        });
    }
}));

module.exports = router;
