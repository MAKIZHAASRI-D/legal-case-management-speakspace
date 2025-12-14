/**
 * ============================================
 * CASE ROUTES
 * Handle case management endpoints
 * ============================================
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { NotionService } = require('../services/notionService');
const { logger } = require('../utils/logger');

/**
 * GET /api/cases
 * Get all cases for the authenticated user
 */
router.get('/', asyncHandler(async (req, res) => {
    const notion = new NotionService(
        req.user.notion_token,
        req.user.notion_db_id
    );
    
    const cases = await notion.getAllCases(req.user);
    
    res.json({
        success: true,
        data: {
            count: cases.length,
            cases
        }
    });
}));

/**
 * GET /api/cases/search
 * Search for cases by name or number
 */
router.get('/search', asyncHandler(async (req, res) => {
    const { q } = req.query;
    
    if (!q) {
        return res.status(400).json({
            success: false,
            error: 'Search query (q) is required'
        });
    }
    
    const notion = new NotionService(
        req.user.notion_token,
        req.user.notion_db_id
    );
    
    const results = await notion.searchCases(q);
    
    res.json({
        success: true,
        data: {
            query: q,
            count: results.length,
            cases: results
        }
    });
}));

/**
 * GET /api/cases/:id
 * Get a specific case by ID
 */
router.get('/:id', asyncHandler(async (req, res) => {
    const notion = new NotionService(
        req.user.notion_token,
        req.user.notion_db_id
    );
    
    const caseData = await notion.getCaseById(req.params.id);
    
    res.json({
        success: true,
        data: caseData
    });
}));

/**
 * POST /api/cases
 * Create a new case manually
 */
router.post('/', asyncHandler(async (req, res) => {
    const { 
        case_name, 
        client_name, 
        client_email, 
        case_summary,
        junior_name,
        junior_email,
        documents_needed,
        next_hearing_date,
        assign_to_junior
    } = req.body;
    
    if (!case_name) {
        return res.status(400).json({
            success: false,
            error: 'Case name is required'
        });
    }
    
    const notion = new NotionService(
        req.user.notion_token,
        req.user.notion_db_id
    );
    
    const caseData = {
        case_name,
        client_name,
        client_email,
        case_summary,
        junior_name,
        junior_email,
        documents_needed,
        next_hearing_date,
        assign_to_junior: assign_to_junior || false,
        missing_fields: []
    };
    
    // Check for missing fields
    if (!client_name) caseData.missing_fields.push('client_name');
    if (!client_email) caseData.missing_fields.push('client_email');
    
    const result = await notion.createCase(caseData, req.user);
    
    logger.info('Cases: Created new case', {
        caseId: result.id,
        caseName: case_name,
        userId: req.user.id
    });
    
    res.status(201).json({
        success: true,
        data: result
    });
}));

/**
 * PATCH /api/cases/:id
 * Update an existing case
 */
router.patch('/:id', asyncHandler(async (req, res) => {
    const notion = new NotionService(
        req.user.notion_token,
        req.user.notion_db_id
    );
    
    const updates = req.body;
    
    const result = await notion.updateCase(req.params.id, updates, req.user);
    
    logger.info('Cases: Updated case', {
        caseId: req.params.id,
        updates: Object.keys(updates),
        userId: req.user.id
    });
    
    res.json({
        success: true,
        data: result
    });
}));

/**
 * POST /api/cases/:id/outcome
 * Add an outcome/history entry to a case
 */
router.post('/:id/outcome', asyncHandler(async (req, res) => {
    const { outcome, status, next_hearing_date, documents_needed } = req.body;
    
    if (!outcome) {
        return res.status(400).json({
            success: false,
            error: 'Outcome is required'
        });
    }
    
    const notion = new NotionService(
        req.user.notion_token,
        req.user.notion_db_id
    );
    
    await notion.updateCase(req.params.id, {
        outcome,
        status,
        next_hearing_date,
        documents_needed,
        increment_hearing: true
    }, req.user);
    
    logger.info('Cases: Added outcome', {
        caseId: req.params.id,
        userId: req.user.id
    });
    
    res.json({
        success: true,
        message: 'Outcome added successfully'
    });
}));

/**
 * POST /api/cases/:id/close
 * Close/archive a case
 */
router.post('/:id/close', asyncHandler(async (req, res) => {
    const notion = new NotionService(
        req.user.notion_token,
        req.user.notion_db_id
    );
    
    await notion.closeCase(req.params.id, req.user);
    
    logger.info('Cases: Closed case', {
        caseId: req.params.id,
        userId: req.user.id
    });
    
    res.json({
        success: true,
        message: 'Case closed successfully'
    });
}));

module.exports = router;
