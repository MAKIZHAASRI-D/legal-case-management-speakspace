/**
 * ============================================
 * AUTHENTICATION MIDDLEWARE
 * Gatekeeper for all protected routes
 * ============================================
 */

const { getUserById, getUserByApiKey } = require('../auth/userRegistry');
const { logger } = require('../utils/logger');
const { AppError } = require('../utils/errors');

/**
 * Authentication Middleware
 * 
 * Supports multiple authentication methods:
 * 1. x-api-key header (API Key authentication)
 * 2. x-user-id header (Direct user ID)
 * 3. Authorization header (Bearer token)
 */
const authMiddleware = async (req, res, next) => {
    try {
        let user = null;
        let authMethod = null;
        
        // Method 1: API Key Authentication
        const apiKey = req.headers['x-api-key'];
        if (apiKey) {
            user = getUserByApiKey(apiKey);
            authMethod = 'api-key';
        }
        
        // Method 2: Direct User ID (for SpeakSpace integration)
        if (!user) {
            const userId = req.headers['x-user-id'];
            if (userId) {
                user = getUserById(userId);
                authMethod = 'user-id';
            }
        }
        
        // Method 3: Bearer Token (extract user ID from token)
        if (!user) {
            const authHeader = req.headers['authorization'];
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.substring(7);
                // In production, validate JWT and extract user ID
                // For hackathon, we treat the token as a user ID
                user = getUserById(token);
                authMethod = 'bearer';
            }
        }
        
        // Authentication failed
        if (!user) {
            logger.warn('Authentication failed', {
                ip: req.ip,
                path: req.path,
                headers: {
                    hasApiKey: !!apiKey,
                    hasUserId: !!req.headers['x-user-id'],
                    hasBearer: !!req.headers['authorization']
                }
            });
            
            throw new AppError('Unauthorized. Please provide valid authentication credentials.', 401);
        }
        
        // Authentication successful
        logger.info(`User authenticated: ${user.name}`, {
            userId: user.id,
            role: user.role,
            method: authMethod
        });
        
        // Attach user to request object
        req.user = user;
        req.authMethod = authMethod;
        
        // Apply role-based constraints
        applyRoleConstraints(req);
        
        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Apply role-based constraints to the request
 * Prevents juniors from having junior-related fields
 */
const applyRoleConstraints = (req) => {
    const user = req.user;
    
    if (user.role === 'JUNIOR') {
        // Juniors cannot have juniors - ensure this is null
        req.user = {
            ...user,
            junior_email: null,
            junior_name: null,
            preferences: {
                ...user.preferences,
                auto_assign_to_junior: false
            }
        };
    }
};

/**
 * Optional auth middleware - doesn't fail if not authenticated
 * Useful for endpoints that work differently based on auth status
 */
const optionalAuthMiddleware = async (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'];
        const userId = req.headers['x-user-id'];
        
        if (apiKey) {
            req.user = getUserByApiKey(apiKey);
        } else if (userId) {
            req.user = getUserById(userId);
        }
        
        if (req.user) {
            applyRoleConstraints(req);
        }
        
        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Role-based access control middleware
 * @param {Array} allowedRoles - Array of allowed roles
 */
const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return next(new AppError('Authentication required', 401));
        }
        
        if (!allowedRoles.includes(req.user.role)) {
            logger.warn('Access denied - insufficient role', {
                userId: req.user.id,
                userRole: req.user.role,
                requiredRoles: allowedRoles
            });
            
            return next(new AppError('Access denied. Insufficient permissions.', 403));
        }
        
        next();
    };
};

/**
 * Validate that user can perform specific action
 */
const requireAction = (action) => {
    return (req, res, next) => {
        const { validateUserAction } = require('../auth/userRegistry');
        const result = validateUserAction(req.user, action);
        
        if (!result.valid) {
            return next(new AppError(result.reason, 403));
        }
        
        next();
    };
};

module.exports = {
    authMiddleware,
    optionalAuthMiddleware,
    requireRole,
    requireAction
};
