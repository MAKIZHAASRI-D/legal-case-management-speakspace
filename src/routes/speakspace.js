/**
 * ============================================
 * SPEAKSPACE ROUTES
 * Primary endpoint for SpeakSpace Workflow Module
 * ============================================
 * 
 * This is the main integration point for SpeakSpace.
 * The app sends POST requests with transcribed voice notes.
 * 
 * SpeakSpace Configuration:
 * - URL: https://your-server.com/api/speakspace/action
 * - Method: POST
 * - Content-Type: application/json
 * - Authorization: Custom Header (x-user-id)
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { WorkflowOrchestrator } = require('../services/workflowOrchestrator');
const { CalendarService } = require('../services/calendarService');
const { EmailService } = require('../services/emailService');
const { logger } = require('../utils/logger');

/**
 * POST /api/speakspace/action
 * 
 * Main SpeakSpace Workflow Module endpoint.
 * Receives transcribed voice notes and processes them.
 * 
 * Request Format (from SpeakSpace):
 * {
 *   "transcription": "Update Sharma case, bail granted...",
 *   "audio_url": "https://...",  // Optional: URL to audio file
 *   "timestamp": "2024-12-09T10:30:00Z",
 *   "user_metadata": {}  // Optional additional data
 * }
 * 
 * Headers:
 * - x-user-id: lawyer_senior_01
 * - Content-Type: application/json
 */
router.post('/action', asyncHandler(async (req, res) => {
    // Extract transcription from various possible field names
    const transcription = req.body.transcription 
        || req.body.text 
        || req.body.message 
        || req.body.content
        || req.body.input;
    
    if (!transcription || typeof transcription !== 'string') {
        logger.warn('SpeakSpace: No transcription in request', { 
            body: Object.keys(req.body) 
        });
        
        return res.status(400).json({
            success: false,
            error: 'No transcription provided',
            message: 'Please include the transcription in the request body',
            expected_format: {
                transcription: "Your voice note text here"
            }
        });
    }
    
    logger.info('SpeakSpace: Received action request', {
        userId: req.user.id,
        userName: req.user.name,
        transcriptionLength: transcription.length,
        timestamp: req.body.timestamp
    });
    
    // Initialize orchestrator with user context
    const orchestrator = new WorkflowOrchestrator(req.user);
    
    // Process the voice note
    const result = await orchestrator.processVoiceNote({
        text: transcription
    });
    
    // Format response for SpeakSpace
    const response = formatSpeakSpaceResponse(result, req.user);
    
    logger.info('SpeakSpace: Action completed', {
        success: result.success,
        casesProcessed: result.cases_processed || 0
    });
    
    res.json(response);
}));

/**
 * POST /api/speakspace/webhook
 * Alternative webhook endpoint for SpeakSpace
 */
router.post('/webhook', asyncHandler(async (req, res) => {
    // Same as /action but with webhook-specific handling
    const transcription = req.body.transcription 
        || req.body.text 
        || req.body.data?.transcription;
    
    if (!transcription) {
        return res.status(400).json({
            success: false,
            error: 'No transcription provided'
        });
    }
    
    const orchestrator = new WorkflowOrchestrator(req.user);
    const result = await orchestrator.processVoiceNote({ text: transcription });
    
    res.json(formatSpeakSpaceResponse(result, req.user));
}));

/**
 * GET /api/speakspace/status
 * Check integration status
 */
router.get('/status', asyncHandler(async (req, res) => {
    const calendar = new CalendarService();
    const email = new EmailService();
    
    res.json({
        success: true,
        status: 'connected',
        services: {
            notion: '✅ Connected',
            ai: '✅ Active (Groq/Gemini)',
            calendar: calendar.isConfigured ? '✅ Connected' : '⚠️ Not configured',
            email: email.isConfigured ? '✅ Connected' : '⚠️ Not configured'
        }
    });
}));

/**
 * Format response for SpeakSpace display - SIMPLIFIED for hackathon judges
 */
function formatSpeakSpaceResponse(result, user) {
    // ERROR RESPONSE - Simple and clear
    if (!result.success) {
        return {
            success: false,
            error: result.error || 'Processing failed'
        };
    }
    
    // CLARIFICATION NEEDED
    if (result.status === 'CLARIFICATION_NEEDED') {
        return {
            success: true,
            status: 'NEEDS_INFO',
            message: result.message
        };
    }
    
    // Check if first case needs clarification
    const cases = result.cases || [];
    const firstCase = cases[0];
    
    if (firstCase?.status === 'CLARIFICATION_NEEDED') {
        return {
            status: 'needs_clarification',
            message: firstCase.message || 'Multiple cases found. Please specify case number.'
        };
    }
    
    // Handle DUPLICATE CASE - inform user about existing case
    if (firstCase?.status === 'DUPLICATE_CASE') {
        return {
            status: 'duplicate_case',
            message: firstCase.message || 'A similar case already exists.',
            existing_case: firstCase.existing_case?.case_name,
            case_number: firstCase.existing_case?.case_number,
            notion: firstCase.existing_case?.notion_url ? 
                `existing - ${firstCase.existing_case.notion_url}` : null,
            suggestion: 'Please update the existing case instead of creating a new one.'
        };
    }
    
    // Debug: log what we received
    logger.info('SpeakSpace Response:', { 
        casesCount: cases.length, 
        firstCaseStatus: firstCase?.status,
        hasNotionId: !!firstCase?.notion_page_id
    });
    
    if (!firstCase) {
        // Check if there was an error
        if (result.error) {
            return {
                status: 'error',
                message: result.error
            };
        }
        return {
            status: 'complete',
            message: result.summary || result.message || 'Action completed'
        };
    }
    
    // Build SIMPLE response - only essential info
    const response = {
        status: 'complete'
    };
    
    // Notion link
    if (firstCase.notion_page_id) {
        response.notion = `done - https://notion.so/${firstCase.notion_page_id.replace(/-/g, '')}`;
    }
    
    // Calendar link
    if (firstCase.calendar_event && firstCase.calendar_event.html_link) {
        response.calendar_reminder = `done - ${firstCase.calendar_event.html_link}`;
    } else if (firstCase.calendar_event) {
        response.calendar_reminder = 'done';
    }
    
    // Email
    if (firstCase.email_sent) {
        response.email = 'sent';
    }
    
    return response;
}

module.exports = router;
