/**
 * ============================================
 * ERROR HANDLER MIDDLEWARE
 * Centralized error handling
 * ============================================
 */

const { logger } = require('../utils/logger');
const { AppError } = require('../utils/errors');

/**
 * Global error handler
 */
const errorHandler = (err, req, res, next) => {
    // Default error values
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal Server Error';
    let errorCode = err.errorCode || 'INTERNAL_ERROR';
    
    // Log the error
    logger.error(`Error: ${message}`, {
        statusCode,
        errorCode,
        stack: err.stack,
        path: req.path,
        method: req.method,
        userId: req.user?.id
    });
    
    // Handle specific error types
    if (err.name === 'ValidationError') {
        statusCode = 400;
        errorCode = 'VALIDATION_ERROR';
    }
    
    if (err.name === 'MulterError') {
        statusCode = 400;
        errorCode = 'FILE_UPLOAD_ERROR';
        message = `File upload error: ${err.message}`;
    }
    
    if (err.code === 'ECONNREFUSED') {
        statusCode = 503;
        errorCode = 'SERVICE_UNAVAILABLE';
        message = 'External service is unavailable';
    }
    
    // OpenAI specific errors
    if (err.message?.includes('OpenAI')) {
        statusCode = 502;
        errorCode = 'AI_SERVICE_ERROR';
        message = 'AI service error. Please try again.';
    }
    
    // Notion specific errors
    if (err.message?.includes('Notion') || err.code === 'notionhq-client') {
        statusCode = 502;
        errorCode = 'NOTION_SERVICE_ERROR';
        message = 'Notion service error. Please try again.';
    }
    
    // Don't expose internal errors in production
    if (process.env.NODE_ENV === 'production' && statusCode === 500) {
        message = 'An unexpected error occurred. Please try again later.';
    }
    
    // SIMPLIFIED error response for hackathon judges
    res.status(statusCode).json({
        success: false,
        error: message
    });
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res, next) => {
    const error = new AppError(`Resource not found: ${req.originalUrl}`, 404);
    error.errorCode = 'NOT_FOUND';
    next(error);
};

/**
 * Async handler wrapper
 * Wraps async route handlers to catch errors
 */
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

module.exports = {
    errorHandler,
    notFoundHandler,
    asyncHandler
};
