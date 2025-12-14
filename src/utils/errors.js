/**
 * ============================================
 * CUSTOM ERROR CLASSES
 * Structured error handling
 * ============================================
 */

/**
 * Base Application Error
 */
class AppError extends Error {
    constructor(message, statusCode = 500, errorCode = 'INTERNAL_ERROR') {
        super(message);
        this.statusCode = statusCode;
        this.errorCode = errorCode;
        this.isOperational = true;
        
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Authentication Error
 */
class AuthenticationError extends AppError {
    constructor(message = 'Authentication failed') {
        super(message, 401, 'AUTHENTICATION_ERROR');
    }
}

/**
 * Authorization Error
 */
class AuthorizationError extends AppError {
    constructor(message = 'Access denied') {
        super(message, 403, 'AUTHORIZATION_ERROR');
    }
}

/**
 * Validation Error
 */
class ValidationError extends AppError {
    constructor(message, fields = []) {
        super(message, 400, 'VALIDATION_ERROR');
        this.fields = fields;
    }
}

/**
 * Not Found Error
 */
class NotFoundError extends AppError {
    constructor(resource = 'Resource') {
        super(`${resource} not found`, 404, 'NOT_FOUND');
    }
}

/**
 * Case Not Found Error
 */
class CaseNotFoundError extends AppError {
    constructor(identifier) {
        super(`Case not found: ${identifier}`, 404, 'CASE_NOT_FOUND');
        this.identifier = identifier;
    }
}

/**
 * Duplicate Case Error
 */
class DuplicateCaseError extends AppError {
    constructor(matches) {
        super('Multiple cases found. Please specify case number for clarity.', 400, 'DUPLICATE_CASE');
        this.matches = matches;
    }
}

/**
 * Missing Data Error
 */
class MissingDataError extends AppError {
    constructor(missingFields) {
        super(`Missing required data: ${missingFields.join(', ')}`, 400, 'MISSING_DATA');
        this.missingFields = missingFields;
    }
}

/**
 * External Service Error
 */
class ExternalServiceError extends AppError {
    constructor(service, message) {
        super(`${service} error: ${message}`, 502, 'EXTERNAL_SERVICE_ERROR');
        this.service = service;
    }
}

/**
 * AI Processing Error
 */
class AIProcessingError extends AppError {
    constructor(message = 'AI processing failed') {
        super(message, 502, 'AI_PROCESSING_ERROR');
    }
}

/**
 * Rate Limit Error
 */
class RateLimitError extends AppError {
    constructor(message = 'Too many requests') {
        super(message, 429, 'RATE_LIMIT_ERROR');
    }
}

/**
 * Case Already Exists Error
 */
class CaseAlreadyExistsError extends AppError {
    constructor(existingCase) {
        super(
            `A similar case already exists: "${existingCase.case_name}" (${existingCase.case_number}). ` +
            `Please update the existing case instead of creating a new one.`,
            409,
            'CASE_ALREADY_EXISTS'
        );
        this.existingCase = existingCase;
    }
}

module.exports = {
    AppError,
    AuthenticationError,
    AuthorizationError,
    ValidationError,
    NotFoundError,
    CaseNotFoundError,
    DuplicateCaseError,
    CaseAlreadyExistsError,
    MissingDataError,
    ExternalServiceError,
    AIProcessingError,
    RateLimitError
};
