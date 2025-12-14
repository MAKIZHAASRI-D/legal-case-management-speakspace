/**
 * ============================================
 * HEALTH ROUTES
 * Health check and status endpoints
 * ============================================
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { config } = require('../config');

/**
 * GET /health
 * Basic health check
 */
router.get('/', asyncHandler(async (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development'
    });
}));

/**
 * GET /health/ready
 * Readiness check - verify all services are configured
 */
router.get('/ready', asyncHandler(async (req, res) => {
    const checks = {
        openai: !!config.openai.apiKey,
        notion: !!config.notion.apiKey && !!config.notion.databaseId,
        google: !!config.google.clientId,
        email: !!config.email.auth.user
    };
    
    const allReady = Object.values(checks).every(v => v);
    
    res.status(allReady ? 200 : 503).json({
        success: allReady,
        status: allReady ? 'ready' : 'not_ready',
        checks,
        timestamp: new Date().toISOString()
    });
}));

/**
 * GET /health/live
 * Liveness check
 */
router.get('/live', asyncHandler(async (req, res) => {
    res.json({
        success: true,
        status: 'alive',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
    });
}));

module.exports = router;
