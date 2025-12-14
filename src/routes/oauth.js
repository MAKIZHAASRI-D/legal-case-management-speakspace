/**
 * ============================================
 * OAUTH ROUTES - User Account Connection
 * Allows each user to connect their own:
 * - Notion workspace
 * - Google Calendar
 * - Email (via Gmail or SMTP)
 * ============================================
 */

const express = require('express');
const router = express.Router();
const { OAuthService } = require('../services/oauthService');
const { logger } = require('../utils/logger');
const { asyncHandler } = require('../utils/helpers');

/**
 * GET /api/oauth/status
 * Check which services the current user has connected
 */
router.get('/status', asyncHandler(async (req, res) => {
    const userId = req.headers['x-user-id'] || req.user?.id;
    
    if (!userId) {
        return res.status(401).json({
            success: false,
            error: 'User ID required'
        });
    }
    
    const connected = await OAuthService.getUserConnectedServices(userId);
    
    res.json({
        success: true,
        userId: userId,
        connected: connected,
        setup_required: !connected.notion || !connected.google,
        message: getSetupMessage(connected)
    });
}));

/**
 * GET /api/oauth/notion/authorize
 * Start Notion OAuth flow - redirects user to Notion login
 */
router.get('/notion/authorize', asyncHandler(async (req, res) => {
    const userId = req.headers['x-user-id'] || req.query.user_id;
    
    if (!userId) {
        return res.status(400).json({
            success: false,
            error: 'User ID required. Pass x-user-id header or user_id query param'
        });
    }
    
    const authUrl = OAuthService.getNotionAuthUrl(userId);
    
    logger.info('OAuth: Starting Notion authorization', { userId });
    
    // Option 1: Redirect directly
    // res.redirect(authUrl);
    
    // Option 2: Return URL for frontend to handle
    res.json({
        success: true,
        message: 'Redirect user to this URL to connect their Notion',
        auth_url: authUrl,
        instructions: [
            '1. Open the auth_url in a browser',
            '2. User logs into their Notion account',
            '3. User selects which pages/databases to share',
            '4. User is redirected back with access granted'
        ]
    });
}));

/**
 * GET /api/oauth/notion/callback
 * Notion redirects here after user authorizes
 */
router.get('/notion/callback', asyncHandler(async (req, res) => {
    const { code, state: userId, error } = req.query;
    
    if (error) {
        logger.warn('OAuth: Notion authorization denied', { error });
        return res.status(400).json({
            success: false,
            error: 'Authorization denied by user'
        });
    }
    
    if (!code || !userId) {
        return res.status(400).json({
            success: false,
            error: 'Missing authorization code or user ID'
        });
    }
    
    try {
        const result = await OAuthService.handleNotionCallback(code, userId);
        
        // Option 1: Return JSON
        res.json({
            success: true,
            message: result.message,
            next_step: 'Now connect Google Calendar at /api/oauth/google/authorize'
        });
        
        // Option 2: Redirect to success page
        // res.redirect('/setup/success?service=notion');
        
    } catch (error) {
        logger.error('OAuth: Notion callback failed', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to connect Notion account'
        });
    }
}));

/**
 * GET /api/oauth/google/authorize
 * Start Google OAuth flow - for Calendar and Gmail
 */
router.get('/google/authorize', asyncHandler(async (req, res) => {
    const userId = req.headers['x-user-id'] || req.query.user_id;
    
    if (!userId) {
        return res.status(400).json({
            success: false,
            error: 'User ID required'
        });
    }
    
    const authUrl = OAuthService.getGoogleAuthUrl(userId);
    
    logger.info('OAuth: Starting Google authorization', { userId });
    
    res.json({
        success: true,
        message: 'Redirect user to this URL to connect their Google account',
        auth_url: authUrl,
        permissions_requested: [
            'Google Calendar - Create and manage events',
            'Gmail - Send emails on behalf of user'
        ],
        instructions: [
            '1. Open the auth_url in a browser',
            '2. User logs into their Google account',
            '3. User grants calendar and email permissions',
            '4. User is redirected back with access granted'
        ]
    });
}));

/**
 * GET /api/oauth/google/callback
 * Google redirects here after user authorizes
 */
router.get('/google/callback', asyncHandler(async (req, res) => {
    const { code, state: userId, error } = req.query;
    
    if (error) {
        logger.warn('OAuth: Google authorization denied', { error });
        return res.status(400).json({
            success: false,
            error: 'Authorization denied by user'
        });
    }
    
    if (!code || !userId) {
        return res.status(400).json({
            success: false,
            error: 'Missing authorization code or user ID'
        });
    }
    
    try {
        const result = await OAuthService.handleGoogleCallback(code, userId);
        
        res.json({
            success: true,
            message: 'Google account connected successfully!',
            services_enabled: ['Google Calendar', 'Gmail'],
            setup_complete: true
        });
        
    } catch (error) {
        logger.error('OAuth: Google callback failed', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to connect Google account'
        });
    }
}));

/**
 * POST /api/oauth/email/configure
 * Configure custom SMTP email (if not using Gmail)
 */
router.post('/email/configure', asyncHandler(async (req, res) => {
    const userId = req.headers['x-user-id'];
    const { smtp_host, smtp_port, smtp_user, smtp_pass, from_address } = req.body;
    
    if (!userId) {
        return res.status(401).json({
            success: false,
            error: 'User ID required'
        });
    }
    
    await OAuthService.saveUserEmailConfig(userId, {
        address: from_address,
        smtp: {
            host: smtp_host,
            port: smtp_port || 587,
            secure: smtp_port === 465,
            user: smtp_user,
            pass: smtp_pass
        }
    });
    
    res.json({
        success: true,
        message: 'Email configuration saved'
    });
}));

/**
 * DELETE /api/oauth/disconnect/:service
 * Disconnect a service (notion, google, email)
 */
router.delete('/disconnect/:service', asyncHandler(async (req, res) => {
    const userId = req.headers['x-user-id'];
    const { service } = req.params;
    
    if (!userId) {
        return res.status(401).json({
            success: false,
            error: 'User ID required'
        });
    }
    
    if (!['notion', 'google', 'email'].includes(service)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid service. Use: notion, google, or email'
        });
    }
    
    const result = await OAuthService.disconnectService(userId, service);
    
    res.json(result);
}));

/**
 * Helper: Generate setup message based on connected services
 */
function getSetupMessage(connected) {
    const missing = [];
    
    if (!connected.notion) missing.push('Notion');
    if (!connected.google) missing.push('Google Calendar & Email');
    
    if (missing.length === 0) {
        return '✅ All services connected! You are ready to use the app.';
    }
    
    return `⚠️ Please connect: ${missing.join(', ')}. Visit /api/oauth/{service}/authorize`;
}

module.exports = router;
