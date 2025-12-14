/**
 * ============================================
 * NOTION SERVICE - THE MEMORY
 * Case database management with Notion API
 * AUTO-CREATES DATABASE IF NOT EXISTS!
 * Always operates on ONE specific database only.
 * ============================================
 */

const { Client } = require('@notionhq/client');
const { config } = require('../config');
const { logger } = require('../utils/logger');
const { 
    CaseNotFoundError, 
    DuplicateCaseError, 
    CaseAlreadyExistsError,
    ExternalServiceError 
} = require('../utils/errors');
const { 
    generateCaseNumber, 
    formatDateForNotion, 
    calculateSimilarity 
} = require('../utils/helpers');

// The EXACT name of our database - only this database will be used
const DATABASE_NAME = 'Legal Cases - SpeakSpace';

// Database schema - what properties our Legal Cases database needs
const DATABASE_SCHEMA = {
    name: DATABASE_NAME,
    properties: {
        'Case Name': { title: {} },
        'Case Number': { rich_text: {} },
        'Status': { 
            select: { 
                options: [
                    { name: 'Draft', color: 'gray' },
                    { name: 'Active', color: 'blue' },
                    { name: 'Pending', color: 'yellow' },
                    { name: 'Closed', color: 'green' },
                    { name: 'Archived', color: 'brown' }
                ]
            }
        },
        'Client Name': { rich_text: {} },
        'Client Email': { email: {} },
        'Summary': { rich_text: {} },
        'Latest Outcome': { rich_text: {} },
        'Next Hearing': { date: {} },
        'Hearing Count': { number: {} },
        'Documents Needed': { rich_text: {} },
        'Assigned To': { rich_text: {} },
        'Junior Name': { rich_text: {} },
        'Junior Email': { email: {} },
        'Created By': { rich_text: {} },
        'Last Updated': { rich_text: {} },
        'Client Welcome Sent': { checkbox: {} }
    }
};

/**
 * Notion Service Class
 * Handles all Notion database operations
 * AUTO-CREATES the "Legal Cases - SpeakSpace" database if it doesn't exist
 * ALWAYS operates on this ONE database only - never touches other databases
 */
class NotionService {
    constructor(notionToken = null, databaseId = null) {
        this.client = new Client({
            auth: notionToken || config.notion.apiKey
        });
        // If user provides a database ID, use that (locked to one database)
        // Otherwise, we'll find or create our specific database
        this.databaseId = databaseId || config.notion.databaseId || null;
        this.props = config.notion.properties;
        this.initialized = false;
    }
    
    /**
     * Initialize - Ensure we have our ONE database ready
     * Creates "Legal Cases - SpeakSpace" if it doesn't exist
     * All operations will ONLY use this database
     */
    async initialize() {
        if (this.initialized && this.databaseId) {
            return this.databaseId;
        }
        
        logger.info('Notion: Initializing service...');
        
        try {
            // PRIORITY 1: If database ID is configured, verify and use it ONLY
            if (this.databaseId) {
                try {
                    const db = await this.client.databases.retrieve({ database_id: this.databaseId });
                    logger.info('Notion: Using configured database', { 
                        databaseId: this.databaseId,
                        name: db.title?.[0]?.plain_text 
                    });
                    this.initialized = true;
                    return this.databaseId;
                } catch (error) {
                    logger.error('Notion: Configured database not accessible', { 
                        databaseId: this.databaseId,
                        error: error.message 
                    });
                    throw new ExternalServiceError('Notion', 
                        `Database ${this.databaseId} not found. Please check if it exists and is shared with your integration.`
                    );
                }
            }
            
            // PRIORITY 2: Find our EXACT database by name
            const existingDb = await this.findOurDatabase();
            if (existingDb) {
                this.databaseId = existingDb;
                // Ensure database has all required properties
                await this.ensureDatabaseProperties();
                this.initialized = true;
                logger.info('Notion: Found our database', { databaseId: existingDb });
                return this.databaseId;
            }
            
            // PRIORITY 3: Create our database (first time setup)
            const newDb = await this.createOurDatabase();
            this.databaseId = newDb;
            this.initialized = true;
            logger.info('Notion: Created our database', { databaseId: newDb });
            return this.databaseId;
            
        } catch (error) {
            logger.error('Notion: Initialization failed', { error: error.message });
            throw new ExternalServiceError('Notion', `Failed to initialize: ${error.message}`);
        }
    }
    
    /**
     * Ensure database has all required properties (add missing ones)
     */
    async ensureDatabaseProperties() {
        try {
            const db = await this.client.databases.retrieve({ database_id: this.databaseId });
            const existingProps = Object.keys(db.properties);
            const requiredProps = DATABASE_SCHEMA.properties;
            
            const missingProps = {};
            for (const [propName, propConfig] of Object.entries(requiredProps)) {
                if (!existingProps.includes(propName)) {
                    missingProps[propName] = propConfig;
                    logger.info('Notion: Missing property, will add', { property: propName });
                }
            }
            
            if (Object.keys(missingProps).length > 0) {
                await this.client.databases.update({
                    database_id: this.databaseId,
                    properties: missingProps
                });
                logger.info('Notion: Added missing properties to database', { 
                    properties: Object.keys(missingProps) 
                });
            }
        } catch (error) {
            logger.warn('Notion: Could not update database properties', { error: error.message });
            // Non-fatal - continue anyway
        }
    }
    
    /**
     * Find our EXACT database by name: "Legal Cases - SpeakSpace"
     * Will NOT match any other database
     */
    async findOurDatabase() {
        try {
            const response = await this.client.search({
                query: DATABASE_NAME,
                filter: { property: 'object', value: 'database' }
            });
            
            // Find EXACT match only
            for (const db of response.results) {
                const title = db.title?.[0]?.plain_text || '';
                // Must be EXACT match
                if (title === DATABASE_NAME) {
                    logger.info('Notion: Found our exact database', { title, id: db.id });
                    return db.id;
                }
            }
            
            logger.info('Notion: Our database not found, will create it');
            return null;
        } catch (error) {
            logger.warn('Notion: Search failed', { error: error.message });
            return null;
        }
    }
    
    /**
     * Create our specific database: "Legal Cases - SpeakSpace"
     */
    async createOurDatabase() {
        logger.info('Notion: Creating our database...', { name: DATABASE_NAME });
        
        try {
            // Find a parent page
            const parentPageId = await this.findParentPage();
            
            const database = await this.client.databases.create({
                parent: { page_id: parentPageId },
                title: [{ type: 'text', text: { content: DATABASE_NAME } }],
                properties: DATABASE_SCHEMA.properties
            });
            
            logger.info('Notion: Database created successfully', { 
                databaseId: database.id,
                name: DATABASE_NAME,
                url: database.url 
            });
            
            // Add a note to the first page explaining this database
            console.log(`\n${'='.repeat(60)}`);
            console.log(`✅ NOTION DATABASE CREATED!`);
            console.log(`   Name: ${DATABASE_NAME}`);
            console.log(`   ID: ${database.id}`);
            console.log(`   URL: ${database.url}`);
            console.log(`\n   Add this to your .env for faster startup:`);
            console.log(`   NOTION_DATABASE_ID=${database.id}`);
            console.log(`${'='.repeat(60)}\n`);
            
            return database.id;
            
        } catch (error) {
            logger.error('Notion: Failed to create database', { error: error.message });
            throw new ExternalServiceError('Notion', `Failed to create database: ${error.message}`);
        }
    }
    
    /**
     * Find a parent page for the database
     */
    async findParentPage() {
        try {
            const response = await this.client.search({
                filter: { property: 'object', value: 'page' },
                page_size: 10
            });
            
            if (response.results.length > 0) {
                const page = response.results[0];
                logger.info('Notion: Using page as parent', { pageId: page.id });
                return page.id;
            }
            
            throw new Error(
                'No accessible pages found. Please share at least one Notion page with your integration. ' +
                'Go to a Notion page → Click Share → Invite your integration.'
            );
            
        } catch (error) {
            throw new Error(
                `Cannot find parent page: ${error.message}. ` +
                'Make sure you have shared a Notion page with your integration.'
            );
        }
    }
    
    /**
     * Search for cases by name or number (Fuzzy Search)
     * @param {string} query - Search query
     * @returns {Array} Matching cases
     */
    async searchCases(query) {
        // Ensure database is initialized
        await this.initialize();
        
        logger.info('Notion: Searching for cases', { query });
        
        try {
            // Extract keywords from query for better matching
            const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
            
            // Search by case name (full query)
            const nameResults = await this.client.databases.query({
                database_id: this.databaseId,
                filter: {
                    property: this.props.caseName,
                    title: {
                        contains: query
                    }
                }
            });
            
            // Search by case number
            const numberResults = await this.client.databases.query({
                database_id: this.databaseId,
                filter: {
                    property: this.props.caseNumber,
                    rich_text: {
                        contains: query
                    }
                }
            });
            
            // Search by client name
            const clientResults = await this.client.databases.query({
                database_id: this.databaseId,
                filter: {
                    property: this.props.clientName,
                    rich_text: {
                        contains: query
                    }
                }
            });
            
            // Also search by first keyword (often the client name like "Meera")
            let keywordResults = { results: [] };
            if (keywords.length > 0 && keywords[0].length > 3) {
                keywordResults = await this.client.databases.query({
                    database_id: this.databaseId,
                    filter: {
                        or: [
                            {
                                property: this.props.caseName,
                                title: { contains: keywords[0] }
                            },
                            {
                                property: this.props.clientName,
                                rich_text: { contains: keywords[0] }
                            }
                        ]
                    }
                });
            }
            
            // Combine and deduplicate results
            const allResults = [...nameResults.results, ...numberResults.results, ...clientResults.results, ...keywordResults.results];
            const uniqueResults = allResults.filter((item, index, self) =>
                index === self.findIndex(t => t.id === item.id)
            );
            
            logger.info('Notion: Search complete', { 
                query, 
                resultsCount: uniqueResults.length,
                keywords: keywords.slice(0, 3)
            });
            
            return uniqueResults.map(page => this.parseNotionPage(page));
            
        } catch (error) {
            logger.error('Notion: Search failed', { error: error.message });
            throw new ExternalServiceError('Notion', error.message);
        }
    }
    
    /**
     * Find a single case (with duplicate detection)
     * @param {string} lookupKey - Case name or number to find
     * @returns {Object} Case data or throws error
     */
    async findCase(lookupKey) {
        const results = await this.searchCases(lookupKey);
        
        if (results.length === 0) {
            throw new CaseNotFoundError(lookupKey);
        }
        
        if (results.length > 1) {
            const searchLower = lookupKey.toLowerCase().trim();
            const searchWords = searchLower.split(/\s+/).filter(w => w.length > 1);
            
            // Calculate match scores for each result
            const scoredResults = results.map(r => {
                const caseName = (r.case_name || '').toLowerCase();
                const clientName = (r.client_name || '').toLowerCase();
                const caseNumber = (r.case_number || '').toUpperCase();
                
                // Check for exact case number match
                if (lookupKey.toUpperCase().includes(caseNumber) && caseNumber.length > 5) {
                    return { ...r, similarity: 1.0, matchType: 'case_number' };
                }
                
                // Check if ALL search words are in case name or client name
                const caseNameWords = caseName.split(/\s+/);
                const clientNameWords = clientName.split(/\s+/);
                const allTargetWords = [...caseNameWords, ...clientNameWords];
                
                const matchingWords = searchWords.filter(sw => 
                    allTargetWords.some(tw => tw.includes(sw) || sw.includes(tw))
                );
                
                // If ALL search words match, high score
                if (matchingWords.length === searchWords.length && searchWords.length >= 2) {
                    return { ...r, similarity: 0.95, matchType: 'full_name_match' };
                }
                
                // Partial match score
                const matchRatio = searchWords.length > 0 ? matchingWords.length / searchWords.length : 0;
                return { ...r, similarity: matchRatio * 0.7, matchType: 'partial' };
            });
            
            // Sort by similarity (highest first)
            scoredResults.sort((a, b) => b.similarity - a.similarity);
            
            const bestMatch = scoredResults[0];
            const secondBest = scoredResults[1];
            const gap = bestMatch.similarity - secondBest.similarity;
            
            logger.info('Notion: Disambiguation scores', {
                search: lookupKey,
                best: { name: bestMatch.case_name, sim: bestMatch.similarity, type: bestMatch.matchType },
                second: { name: secondBest.case_name, sim: secondBest.similarity }
            });
            
            // Auto-select if best match is significantly better OR high confidence
            if (bestMatch.similarity >= 0.9 || (bestMatch.similarity >= 0.7 && gap >= 0.2)) {
                logger.info('Notion: Auto-selected best match', {
                    selected: bestMatch.case_name,
                    similarity: bestMatch.similarity,
                    gap: gap
                });
                return bestMatch;
            }
            
            // Otherwise, throw duplicate error for user clarification
            throw new DuplicateCaseError(results.map(r => ({
                id: r.id,
                case_name: r.case_name,
                case_number: r.case_number
            })));
        }
        
        // Single result - but verify it's a good match before returning
        const singleResult = results[0];
        const searchLower = lookupKey.toLowerCase().trim();
        const searchWords = searchLower.split(/\s+/).filter(w => w.length > 1);
        
        // Check if search words match the single result
        const caseName = (singleResult.case_name || '').toLowerCase();
        const clientName = (singleResult.client_name || '').toLowerCase();
        const caseNumber = (singleResult.case_number || '').toUpperCase();
        
        // Exact case number match is always valid
        if (lookupKey.toUpperCase().includes(caseNumber) && caseNumber.length > 5) {
            return singleResult;
        }
        
        // Check word matching
        const allTargetWords = [...caseName.split(/\s+/), ...clientName.split(/\s+/)];
        const matchingWords = searchWords.filter(sw => 
            allTargetWords.some(tw => tw.includes(sw) || sw.includes(tw))
        );
        
        // If at least 2 search words and ALL match, it's valid
        if (searchWords.length >= 2 && matchingWords.length === searchWords.length) {
            return singleResult;
        }
        
        // If only 1 search word OR not all words match, the case wasn't found
        // (e.g., "Priya Sharma" found "Priya Patel" - only "Priya" matches)
        if (searchWords.length >= 2 && matchingWords.length < searchWords.length) {
            logger.info('Notion: Single result does not fully match search', {
                search: lookupKey,
                found: singleResult.case_name,
                matchingWords: matchingWords.length,
                totalSearchWords: searchWords.length
            });
            throw new CaseNotFoundError(lookupKey);
        }
        
        return singleResult;
    }

    /**
     * Get case by Notion page ID
     * @param {string} pageId - Notion page ID
     * @returns {Object} Case data
     */
    async getCaseById(pageId) {
        try {
            const page = await this.client.pages.retrieve({ page_id: pageId });
            return this.parseNotionPage(page);
        } catch (error) {
            logger.error('Notion: Failed to get case', { pageId, error: error.message });
            throw new CaseNotFoundError(pageId);
        }
    }
    
    /**
     * Check if a similar case already exists (before creating new case)
     * Checks for matching client name + case type/name pattern
     * @param {Object} caseData - New case data to check
     * @returns {Object|null} Existing case if found, null otherwise
     */
    async checkDuplicateCase(caseData) {
        if (!caseData.client_name && !caseData.case_name) {
            return null; // Nothing to check
        }
        
        try {
            // Search by client name first (most reliable)
            let searchKey = caseData.client_name;
            if (!searchKey && caseData.case_name) {
                // Extract first two words from case name (often client name)
                const words = caseData.case_name.split(/\s+/).filter(w => w.length > 2);
                searchKey = words.slice(0, 2).join(' ');
            }
            
            if (!searchKey || searchKey.length < 3) return null;
            
            const results = await this.searchCases(searchKey);
            
            if (results.length === 0) return null;
            
            // Check for exact or very close matches
            for (const existing of results) {
                const existingClientName = (existing.client_name || '').toLowerCase().trim();
                const existingCaseName = (existing.case_name || '').toLowerCase().trim();
                const newClientName = (caseData.client_name || '').toLowerCase().trim();
                const newCaseName = (caseData.case_name || '').toLowerCase().trim();
                
                // Skip "Unknown Case" entries
                if (existingCaseName.startsWith('unknown case')) continue;
                
                // ==============================================
                // CRITICAL: If client names match EXACTLY, this is a duplicate
                // Same client = update existing case, don't create new
                // ==============================================
                if (newClientName && existingClientName === newClientName) {
                    logger.info('Notion: Duplicate detected - same client name', {
                        existing: existing.case_name,
                        existingClient: existingClientName,
                        newCase: caseData.case_name
                    });
                    return existing;
                }
                
                // Check if client name is contained in case name (e.g., "Arun Mehta" in "Arun Mehta Contract Breach")
                if (newClientName && existingCaseName.includes(newClientName)) {
                    logger.info('Notion: Duplicate detected - client name in case name', {
                        existing: existing.case_name,
                        searchedClient: newClientName
                    });
                    return existing;
                }
                
                // Exact case name match = definitely duplicate
                if (newCaseName && existingCaseName === newCaseName) {
                    logger.info('Notion: Exact duplicate case name found', {
                        existing: existing.case_name
                    });
                    return existing;
                }
                
                // Very high similarity in case name = likely duplicate
                const nameSimilarity = calculateSimilarity(existingCaseName, newCaseName);
                if (nameSimilarity >= 0.85) {
                    logger.info('Notion: Very similar case name found', {
                        existing: existing.case_name,
                        new: caseData.case_name,
                        similarity: nameSimilarity
                    });
                    return existing;
                }
            }
            
            return null; // No duplicate found
            
        } catch (error) {
            // Don't block creation if duplicate check fails
            logger.warn('Notion: Duplicate check failed, proceeding with creation', { 
                error: error.message 
            });
            return null;
        }
    }
    
    /**
     * Create a new case
     * @param {Object} caseData - Case data to create
     * @param {Object} userContext - User context
     * @returns {Object} Created case
     */
    async createCase(caseData, userContext) {
        // Ensure database is initialized
        await this.initialize();
        
        logger.info('Notion: Creating new case', { 
            caseName: caseData.case_name,
            userId: userContext.id 
        });
        
        // ============================================
        // DUPLICATE CHECK: Before creating, check if similar case exists
        // ============================================
        const existingCase = await this.checkDuplicateCase(caseData);
        if (existingCase) {
            throw new CaseAlreadyExistsError(existingCase);
        }
        
        const caseNumber = caseData.case_number || generateCaseNumber();
        const isDraft = caseData.missing_fields?.length > 0;
        const status = isDraft ? config.caseStatuses.DRAFT : config.caseStatuses.ACTIVE;
        
        try {
            const properties = {
                [this.props.caseName]: {
                    title: [{ text: { content: caseData.case_name || 'Untitled Case' } }]
                },
                [this.props.caseNumber]: {
                    rich_text: [{ text: { content: caseNumber } }]
                },
                [this.props.status]: {
                    select: { name: status }
                },
                [this.props.createdBy]: {
                    rich_text: [{ text: { content: userContext.name } }]
                },
                [this.props.hearingCount]: {
                    number: 0
                },
                [this.props.clientWelcomeSent]: {
                    checkbox: false
                }
            };
            
            // Add optional fields
            if (caseData.client_name) {
                properties[this.props.clientName] = {
                    rich_text: [{ text: { content: caseData.client_name } }]
                };
            }
            
            if (caseData.client_email) {
                properties[this.props.clientEmail] = {
                    email: caseData.client_email
                };
            }
            
            if (caseData.case_summary) {
                properties[this.props.summary] = {
                    rich_text: [{ text: { content: caseData.case_summary } }]
                };
            }
            
            // Handle junior assignment (only for seniors)
            if (userContext.role === 'SENIOR' && caseData.assign_to_junior) {
                if (caseData.junior_name || userContext.junior_name) {
                    properties[this.props.juniorName] = {
                        rich_text: [{ text: { content: caseData.junior_name || userContext.junior_name } }]
                    };
                }
                if (caseData.junior_email || userContext.junior_email) {
                    properties[this.props.juniorEmail] = {
                        email: caseData.junior_email || userContext.junior_email
                    };
                }
            }
            
            if (caseData.documents_needed?.length > 0) {
                properties[this.props.documentsNeeded] = {
                    rich_text: [{ text: { content: caseData.documents_needed.join(', ') } }]
                };
            }
            
            if (caseData.next_hearing_date) {
                properties[this.props.nextHearing] = {
                    date: { start: formatDateForNotion(caseData.next_hearing_date) }
                };
            }
            
            // Assigned to (self or junior)
            const assignedTo = caseData.assign_to_junior && userContext.junior_name 
                ? userContext.junior_name 
                : userContext.name;
            properties[this.props.assignedTo] = {
                rich_text: [{ text: { content: assignedTo } }]
            };
            
            const page = await this.client.pages.create({
                parent: { database_id: this.databaseId },
                properties: properties
            });
            
            // Add initial content block
            await this.addHistoryEntry(page.id, `Case created by ${userContext.name}`, userContext);
            
            // If draft, add missing fields note
            if (isDraft && caseData.missing_fields?.length > 0) {
                await this.addHistoryEntry(
                    page.id, 
                    `⚠️ Missing information: ${caseData.missing_fields.join(', ')}`,
                    userContext
                );
            }
            
            logger.info('Notion: Case created', { 
                pageId: page.id, 
                caseNumber,
                isDraft 
            });
            
            return {
                id: page.id,
                case_number: caseNumber,
                case_name: caseData.case_name,
                status: status,
                is_draft: isDraft,
                missing_fields: caseData.missing_fields || []
            };
            
        } catch (error) {
            logger.error('Notion: Failed to create case', { error: error.message });
            throw new ExternalServiceError('Notion', error.message);
        }
    }
    
    /**
     * Update an existing case
     * @param {string} pageId - Notion page ID
     * @param {Object} updates - Fields to update
     * @param {Object} userContext - User context
     * @returns {Object} Updated case
     */
    async updateCase(pageId, updates, userContext) {
        // Ensure database is initialized
        await this.initialize();
        
        logger.info('Notion: Updating case', { pageId, updates: Object.keys(updates) });
        
        try {
            const properties = {};
            
            // Update status
            if (updates.status) {
                properties[this.props.status] = {
                    select: { name: updates.status }
                };
            }
            
            // Update client info
            if (updates.client_name) {
                properties[this.props.clientName] = {
                    rich_text: [{ text: { content: updates.client_name } }]
                };
            }
            
            if (updates.client_email) {
                properties[this.props.clientEmail] = {
                    email: updates.client_email
                };
            }
            
            // Update summary
            if (updates.case_summary) {
                properties[this.props.summary] = {
                    rich_text: [{ text: { content: updates.case_summary } }]
                };
            }
            
            // Update next hearing
            if (updates.next_hearing_date) {
                properties[this.props.nextHearing] = {
                    date: { start: formatDateForNotion(updates.next_hearing_date) }
                };
            }
            
            // Update documents needed
            if (updates.documents_needed?.length > 0) {
                properties[this.props.documentsNeeded] = {
                    rich_text: [{ text: { content: updates.documents_needed.join(', ') } }]
                };
            }
            
            // Increment hearing count
            if (updates.increment_hearing) {
                const currentCase = await this.getCaseById(pageId);
                properties[this.props.hearingCount] = {
                    number: (currentCase.hearing_count || 0) + 1
                };
            }
            
            // Update latest outcome
            if (updates.latest_outcome) {
                properties[this.props.latestOutcome] = {
                    rich_text: [{ text: { content: updates.latest_outcome } }]
                };
            }
            
            // Update client welcome sent flag
            if (updates.client_welcome_sent !== undefined) {
                properties[this.props.clientWelcomeSent] = {
                    checkbox: updates.client_welcome_sent
                };
            }
            
            // Update last updated timestamp
            properties[this.props.lastUpdated] = {
                rich_text: [{ text: { content: new Date().toISOString() } }]
            };
            
            if (Object.keys(properties).length > 0) {
                await this.client.pages.update({
                    page_id: pageId,
                    properties: properties
                });
            }
            
            // Add outcome to history (append, don't overwrite)
            if (updates.outcome) {
                await this.addHistoryEntry(pageId, updates.outcome, userContext);
            }
            
            logger.info('Notion: Case updated', { pageId });
            
            return { id: pageId, ...updates };
            
        } catch (error) {
            logger.error('Notion: Failed to update case', { error: error.message });
            throw new ExternalServiceError('Notion', error.message);
        }
    }
    
    /**
     * Add history entry to case page body (preserves audit trail)
     * @param {string} pageId - Notion page ID
     * @param {string} entry - History entry text
     * @param {Object} userContext - User context
     */
    async addHistoryEntry(pageId, entry, userContext) {
        const timestamp = new Date().toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            dateStyle: 'medium',
            timeStyle: 'short'
        });
        
        try {
            await this.client.blocks.children.append({
                block_id: pageId,
                children: [
                    {
                        object: 'block',
                        type: 'paragraph',
                        paragraph: {
                            rich_text: [
                                {
                                    type: 'text',
                                    text: { content: `[${timestamp}] ` },
                                    annotations: { bold: true, color: 'gray' }
                                },
                                {
                                    type: 'text',
                                    text: { content: `(${userContext.name}) ` },
                                    annotations: { italic: true }
                                },
                                {
                                    type: 'text',
                                    text: { content: entry }
                                }
                            ]
                        }
                    }
                ]
            });
            
            logger.info('Notion: History entry added', { pageId, entry: entry.substring(0, 50) });
            
        } catch (error) {
            logger.error('Notion: Failed to add history entry', { error: error.message });
            // Don't throw - history is non-critical
        }
    }
    
    /**
     * Create or get the Hearing History table inside a case page
     * Each case has its own hearing history table as a child database
     * @param {string} casePageId - The case page ID
     * @returns {string} The hearing table database ID
     */
    async getOrCreateHearingTable(casePageId) {
        try {
            // First, check if hearing table already exists as a child
            const children = await this.client.blocks.children.list({
                block_id: casePageId
            });
            
            // Look for existing child database named "Hearing History"
            for (const block of children.results) {
                if (block.type === 'child_database' && 
                    block.child_database?.title === 'Hearing History') {
                    logger.info('Notion: Found existing hearing table', { casePageId });
                    return block.id;
                }
            }
            
            // Create the hearing history table as a child database
            logger.info('Notion: Creating hearing table for case', { casePageId });
            
            const hearingDb = await this.client.databases.create({
                parent: { page_id: casePageId },
                title: [{ type: 'text', text: { content: 'Hearing History' } }],
                properties: {
                    'Hearing #': { title: {} },
                    'Date': { date: {} },
                    'Description': { rich_text: {} },
                    'Outcome': { rich_text: {} },
                    'Next Steps': { rich_text: {} },
                    'Documents Submitted': { rich_text: {} },
                    'Judge/Court': { rich_text: {} }
                }
            });
            
            logger.info('Notion: Hearing table created', { 
                casePageId, 
                hearingDbId: hearingDb.id 
            });
            
            return hearingDb.id;
            
        } catch (error) {
            logger.error('Notion: Failed to create hearing table', { error: error.message });
            throw new ExternalServiceError('Notion', `Failed to create hearing table: ${error.message}`);
        }
    }
    
    /**
     * Add a hearing record to a case's hearing history table
     * Also updates the main case with latest outcome
     * @param {string} casePageId - The case page ID
     * @param {Object} hearingData - Hearing details
     * @param {Object} userContext - User context
     * @returns {Object} Created hearing record
     */
    async addHearing(casePageId, hearingData, userContext) {
        try {
            // Get or create the hearing table
            const hearingDbId = await this.getOrCreateHearingTable(casePageId);
            
            // Get current case to determine hearing number
            const currentCase = await this.getCaseById(casePageId);
            const hearingNumber = (currentCase.hearing_count || 0) + 1;
            
            // Create the hearing record
            const hearingDate = hearingData.date || new Date().toISOString().split('T')[0];
            
            const hearingRecord = await this.client.pages.create({
                parent: { database_id: hearingDbId },
                properties: {
                    'Hearing #': {
                        title: [{ text: { content: `Hearing ${hearingNumber}` } }]
                    },
                    'Date': {
                        date: { start: hearingDate }
                    },
                    'Description': {
                        rich_text: [{ text: { content: hearingData.description || '' } }]
                    },
                    'Outcome': {
                        rich_text: [{ text: { content: hearingData.outcome || '' } }]
                    },
                    'Next Steps': {
                        rich_text: [{ text: { content: hearingData.next_steps || '' } }]
                    },
                    'Documents Submitted': {
                        rich_text: [{ text: { content: hearingData.documents || '' } }]
                    },
                    'Judge/Court': {
                        rich_text: [{ text: { content: hearingData.court || '' } }]
                    }
                }
            });
            
            // Update the main case with latest outcome and increment hearing count
            // Note: Summary is set when case is created (describes what case is about)
            // Latest Outcome tracks the most recent hearing result
            await this.updateCase(casePageId, {
                increment_hearing: true,
                latest_outcome: hearingData.outcome || `Hearing ${hearingNumber} completed`,
                next_hearing_date: hearingData.next_hearing_date
            }, userContext);
            
            // Add history entry
            await this.addHistoryEntry(
                casePageId,
                `📋 Hearing ${hearingNumber}: ${hearingData.outcome || 'Completed'}`,
                userContext
            );
            
            logger.info('Notion: Hearing added', { 
                casePageId, 
                hearingNumber,
                outcome: hearingData.outcome 
            });
            
            return {
                hearing_id: hearingRecord.id,
                hearing_number: hearingNumber,
                date: hearingDate,
                outcome: hearingData.outcome
            };
            
        } catch (error) {
            logger.error('Notion: Failed to add hearing', { error: error.message });
            throw new ExternalServiceError('Notion', `Failed to add hearing: ${error.message}`);
        }
    }
    
    /**
     * Get all hearings for a case
     * @param {string} casePageId - The case page ID
     * @returns {Array} List of hearings
     */
    async getHearings(casePageId) {
        try {
            const hearingDbId = await this.getOrCreateHearingTable(casePageId);
            
            const response = await this.client.databases.query({
                database_id: hearingDbId,
                sorts: [{ property: 'Date', direction: 'descending' }]
            });
            
            return response.results.map(page => ({
                id: page.id,
                hearing_number: page.properties['Hearing #']?.title?.[0]?.text?.content || '',
                date: page.properties['Date']?.date?.start || '',
                description: page.properties['Description']?.rich_text?.[0]?.text?.content || '',
                outcome: page.properties['Outcome']?.rich_text?.[0]?.text?.content || '',
                next_steps: page.properties['Next Steps']?.rich_text?.[0]?.text?.content || '',
                documents: page.properties['Documents Submitted']?.rich_text?.[0]?.text?.content || '',
                court: page.properties['Judge/Court']?.rich_text?.[0]?.text?.content || ''
            }));
            
        } catch (error) {
            logger.error('Notion: Failed to get hearings', { error: error.message });
            return [];
        }
    }

    /**
     * Archive/close a case
     * @param {string} pageId - Notion page ID
     * @param {Object} userContext - User context
     */
    async closeCase(pageId, userContext) {
        await this.updateCase(pageId, {
            status: config.caseStatuses.CLOSED
        }, userContext);
        
        await this.addHistoryEntry(pageId, '✅ Case closed/finalized', userContext);
    }
    
    /**
     * Parse Notion page to case object
     * @param {Object} page - Notion page object
     * @returns {Object} Parsed case data
     */
    parseNotionPage(page) {
        const props = page.properties;
        
        return {
            id: page.id,
            case_name: this.getTitle(props[this.props.caseName]),
            case_number: this.getRichText(props[this.props.caseNumber]),
            status: props[this.props.status]?.select?.name,
            client_name: this.getRichText(props[this.props.clientName]),
            client_email: props[this.props.clientEmail]?.email,
            junior_name: this.getRichText(props[this.props.juniorName]),
            junior_email: props[this.props.juniorEmail]?.email,
            summary: this.getRichText(props[this.props.summary]),
            documents_needed: this.getRichText(props[this.props.documentsNeeded])?.split(', ').filter(Boolean),
            hearing_count: props[this.props.hearingCount]?.number || 0,
            next_hearing: props[this.props.nextHearing]?.date?.start,
            client_welcome_sent: props[this.props.clientWelcomeSent]?.checkbox || false,
            assigned_to: this.getRichText(props[this.props.assignedTo]),
            created_by: this.getRichText(props[this.props.createdBy]),
            last_updated: this.getRichText(props[this.props.lastUpdated]),
            created_time: page.created_time,
            last_edited_time: page.last_edited_time
        };
    }
    
    /**
     * Helper: Get title text
     */
    getTitle(prop) {
        return prop?.title?.[0]?.text?.content || null;
    }
    
    /**
     * Helper: Get rich text content
     */
    getRichText(prop) {
        return prop?.rich_text?.[0]?.text?.content || null;
    }
    
    /**
     * Get all cases for a user
     * @param {Object} userContext - User context
     * @returns {Array} List of cases
     */
    async getAllCases(userContext) {
        // Ensure database is initialized
        await this.initialize();
        
        try {
            const response = await this.client.databases.query({
                database_id: this.databaseId,
                sorts: [
                    { property: 'Last Updated', direction: 'descending' }
                ]
            });
            
            return response.results.map(page => this.parseNotionPage(page));
            
        } catch (error) {
            logger.error('Notion: Failed to get all cases', { error: error.message });
            throw new ExternalServiceError('Notion', error.message);
        }
    }
}

module.exports = { NotionService };
