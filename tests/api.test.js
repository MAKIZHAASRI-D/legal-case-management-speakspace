/**
 * ============================================
 * API TESTS
 * Jest test suite for the Legal Case Management API
 * ============================================
 */

const request = require('supertest');
const { app } = require('../src/index');

describe('Health Endpoints', () => {
    test('GET /health should return healthy status', async () => {
        const response = await request(app)
            .get('/health')
            .expect(200);
        
        expect(response.body.success).toBe(true);
        expect(response.body.status).toBe('healthy');
    });
    
    test('GET /health/live should return alive status', async () => {
        const response = await request(app)
            .get('/health/live')
            .expect(200);
        
        expect(response.body.success).toBe(true);
        expect(response.body.status).toBe('alive');
        expect(response.body.uptime).toBeDefined();
    });
});

describe('Authentication', () => {
    test('GET /auth/users should return list of users', async () => {
        const response = await request(app)
            .get('/auth/users')
            .expect(200);
        
        expect(response.body.success).toBe(true);
        expect(response.body.data.users).toBeInstanceOf(Array);
        expect(response.body.data.users.length).toBeGreaterThan(0);
    });
    
    test('POST /auth/validate with valid user-id should succeed', async () => {
        const response = await request(app)
            .post('/auth/validate')
            .set('x-user-id', 'lawyer_senior_01')
            .expect(200);
        
        expect(response.body.success).toBe(true);
        expect(response.body.data.valid).toBe(true);
        expect(response.body.data.user.role).toBe('SENIOR');
    });
    
    test('POST /auth/validate with invalid credentials should fail', async () => {
        const response = await request(app)
            .post('/auth/validate')
            .set('x-user-id', 'invalid_user')
            .expect(401);
        
        expect(response.body.success).toBe(false);
    });
    
    test('GET /auth/me should return user profile', async () => {
        const response = await request(app)
            .get('/auth/me')
            .set('x-user-id', 'lawyer_senior_01')
            .expect(200);
        
        expect(response.body.success).toBe(true);
        expect(response.body.data.name).toBe('Advocate Priya Sharma');
        expect(response.body.data.role).toBe('SENIOR');
        expect(response.body.data.junior_email).toBeDefined();
    });
    
    test('GET /auth/me for junior should not have junior_email', async () => {
        const response = await request(app)
            .get('/auth/me')
            .set('x-user-id', 'lawyer_junior_01')
            .expect(200);
        
        expect(response.body.success).toBe(true);
        expect(response.body.data.role).toBe('JUNIOR');
        expect(response.body.data.junior_email).toBeNull();
    });
});

describe('Protected Routes', () => {
    test('GET /api/cases without auth should fail', async () => {
        const response = await request(app)
            .get('/api/cases')
            .expect(401);
        
        expect(response.body.success).toBe(false);
    });
    
    test('POST /api/voice/text without auth should fail', async () => {
        const response = await request(app)
            .post('/api/voice/text')
            .send({ text: 'Test voice note' })
            .expect(401);
        
        expect(response.body.success).toBe(false);
    });
});

describe('Voice Processing', () => {
    test('POST /api/voice/text without text should fail', async () => {
        const response = await request(app)
            .post('/api/voice/text')
            .set('x-user-id', 'lawyer_senior_01')
            .send({})
            .expect(400);
        
        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('Text input is required');
    });
    
    test('POST /api/voice/analyze without text should fail', async () => {
        const response = await request(app)
            .post('/api/voice/analyze')
            .set('x-user-id', 'lawyer_senior_01')
            .send({})
            .expect(400);
        
        expect(response.body.success).toBe(false);
    });
});

describe('Case Management', () => {
    test('POST /api/cases without case_name should fail', async () => {
        const response = await request(app)
            .post('/api/cases')
            .set('x-user-id', 'lawyer_senior_01')
            .send({
                client_name: 'Test Client'
            })
            .expect(400);
        
        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('Case name is required');
    });
    
    test('GET /api/cases/search without query should fail', async () => {
        const response = await request(app)
            .get('/api/cases/search')
            .set('x-user-id', 'lawyer_senior_01')
            .expect(400);
        
        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('Search query');
    });
});

describe('User Registry', () => {
    const { 
        getUserById, 
        getUserByApiKey, 
        isSenior, 
        isJunior, 
        hasJunior 
    } = require('./src/auth/userRegistry');
    
    test('getUserById should return correct user', () => {
        const user = getUserById('lawyer_senior_01');
        expect(user).toBeDefined();
        expect(user.name).toBe('Advocate Priya Sharma');
        expect(user.role).toBe('SENIOR');
    });
    
    test('getUserByApiKey should return correct user', () => {
        const user = getUserByApiKey('sk_senior_priya_2024');
        expect(user).toBeDefined();
        expect(user.id).toBe('lawyer_senior_01');
    });
    
    test('isSenior should correctly identify senior lawyers', () => {
        const senior = getUserById('lawyer_senior_01');
        const junior = getUserById('lawyer_junior_01');
        
        expect(isSenior(senior)).toBe(true);
        expect(isSenior(junior)).toBe(false);
    });
    
    test('isJunior should correctly identify junior lawyers', () => {
        const senior = getUserById('lawyer_senior_01');
        const junior = getUserById('lawyer_junior_01');
        
        expect(isJunior(junior)).toBe(true);
        expect(isJunior(senior)).toBe(false);
    });
    
    test('hasJunior should correctly check junior assignment', () => {
        const senior = getUserById('lawyer_senior_01');
        const junior = getUserById('lawyer_junior_01');
        
        expect(hasJunior(senior)).toBe(true);
        expect(hasJunior(junior)).toBe(false);
    });
});

describe('Utility Functions', () => {
    const {
        generateCaseNumber,
        parseDate,
        isValidEmail,
        calculateSimilarity,
        truncate
    } = require('./src/utils/helpers');
    
    test('generateCaseNumber should create valid case numbers', () => {
        const caseNumber = generateCaseNumber();
        expect(caseNumber).toMatch(/^CASE-\d{4}-[A-Z0-9]{5}$/);
    });
    
    test('parseDate should handle relative dates', () => {
        const tomorrow = parseDate('tomorrow');
        expect(tomorrow).toBeInstanceOf(Date);
        
        const nextWeek = parseDate('next week');
        expect(nextWeek).toBeInstanceOf(Date);
    });
    
    test('isValidEmail should validate emails correctly', () => {
        expect(isValidEmail('test@example.com')).toBe(true);
        expect(isValidEmail('invalid-email')).toBe(false);
        expect(isValidEmail('')).toBe(false);
        expect(isValidEmail(null)).toBe(false);
    });
    
    test('calculateSimilarity should work correctly', () => {
        expect(calculateSimilarity('sharma', 'sharma')).toBe(1);
        expect(calculateSimilarity('sharma case', 'sharma')).toBeGreaterThan(0.5);
        expect(calculateSimilarity('abc', 'xyz')).toBe(0);
    });
    
    test('truncate should limit string length', () => {
        const long = 'This is a very long string that should be truncated';
        const truncated = truncate(long, 20);
        expect(truncated.length).toBe(20);
        expect(truncated.endsWith('...')).toBe(true);
    });
});

describe('Error Classes', () => {
    const {
        AppError,
        CaseNotFoundError,
        DuplicateCaseError,
        ValidationError
    } = require('./src/utils/errors');
    
    test('AppError should have correct properties', () => {
        const error = new AppError('Test error', 400, 'TEST_ERROR');
        expect(error.message).toBe('Test error');
        expect(error.statusCode).toBe(400);
        expect(error.errorCode).toBe('TEST_ERROR');
        expect(error.isOperational).toBe(true);
    });
    
    test('CaseNotFoundError should have correct defaults', () => {
        const error = new CaseNotFoundError('Sharma');
        expect(error.statusCode).toBe(404);
        expect(error.errorCode).toBe('CASE_NOT_FOUND');
        expect(error.identifier).toBe('Sharma');
    });
    
    test('DuplicateCaseError should include matches', () => {
        const matches = [{ id: '1', name: 'Case 1' }, { id: '2', name: 'Case 2' }];
        const error = new DuplicateCaseError(matches);
        expect(error.statusCode).toBe(400);
        expect(error.matches).toEqual(matches);
    });
    
    test('ValidationError should include fields', () => {
        const error = new ValidationError('Invalid data', ['email', 'name']);
        expect(error.statusCode).toBe(400);
        expect(error.fields).toEqual(['email', 'name']);
    });
});
