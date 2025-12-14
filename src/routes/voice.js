/**
 * ============================================
 * VOICE ROUTES
 * Handle voice note processing endpoints
 * ============================================
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { asyncHandler } = require('../middleware/errorHandler');
const { WorkflowOrchestrator } = require('../services/workflowOrchestrator');
const { logger } = require('../utils/logger');

/**
 * POST /api/voice/process
 * Process a voice note file
 */
router.post('/process', asyncHandler(async (req, res) => {
    const upload = req.app.get('upload');
    
    upload.single('audio')(req, res, async (err) => {
        if (err) {
            logger.error('Voice: File upload error', { error: err.message });
            return res.status(400).json({
                success: false,
                error: err.message
            });
        }
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No audio file provided'
            });
        }
        
        logger.info('Voice: Processing audio file', {
            filename: req.file.filename,
            size: req.file.size,
            userId: req.user.id
        });
        
        try {
            // Initialize orchestrator with user context
            const orchestrator = new WorkflowOrchestrator(req.user);
            
            // Process the voice note
            const result = await orchestrator.processVoiceNote({
                audioFilePath: req.file.path
            });
            
            // Clean up uploaded file
            fs.unlink(req.file.path, (unlinkErr) => {
                if (unlinkErr) {
                    logger.warn('Voice: Failed to delete temp file', { error: unlinkErr.message });
                }
            });
            
            res.json({
                success: result.success,
                data: result
            });
            
        } catch (error) {
            // Clean up on error
            if (req.file?.path) {
                fs.unlink(req.file.path, () => {});
            }
            throw error;
        }
    });
}));

/**
 * POST /api/voice/text
 * Process text input (for testing or text-based input)
 */
router.post('/text', asyncHandler(async (req, res) => {
    const { text } = req.body;
    
    if (!text || typeof text !== 'string') {
        return res.status(400).json({
            success: false,
            error: 'Text input is required'
        });
    }
    
    logger.info('Voice: Processing text input', {
        textLength: text.length,
        userId: req.user.id
    });
    
    // Initialize orchestrator with user context
    const orchestrator = new WorkflowOrchestrator(req.user);
    
    // Process the text
    const result = await orchestrator.processVoiceNote({
        text: text
    });
    
    res.json({
        success: result.success,
        data: result
    });
}));

/**
 * POST /api/voice/transcribe
 * Transcribe audio only (without processing)
 */
router.post('/transcribe', asyncHandler(async (req, res) => {
    const upload = req.app.get('upload');
    
    upload.single('audio')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({
                success: false,
                error: err.message
            });
        }
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No audio file provided'
            });
        }
        
        try {
            const { transcribeAudio } = require('../agents/aiAgent');
            const transcription = await transcribeAudio(req.file.path);
            
            // Clean up
            fs.unlink(req.file.path, () => {});
            
            res.json({
                success: true,
                data: {
                    transcription
                }
            });
            
        } catch (error) {
            if (req.file?.path) {
                fs.unlink(req.file.path, () => {});
            }
            throw error;
        }
    });
}));

/**
 * POST /api/voice/analyze
 * Analyze text and extract entities (without creating/updating cases)
 */
router.post('/analyze', asyncHandler(async (req, res) => {
    const { text } = req.body;
    
    if (!text) {
        return res.status(400).json({
            success: false,
            error: 'Text input is required'
        });
    }
    
    const { extractCaseInformation } = require('../agents/aiAgent');
    const extraction = await extractCaseInformation(text, req.user);
    
    res.json({
        success: true,
        data: {
            cases: extraction.cases,
            summary: extraction.overall_summary,
            requires_clarification: extraction.requires_clarification,
            clarification_message: extraction.clarification_message
        }
    });
}));

module.exports = router;
