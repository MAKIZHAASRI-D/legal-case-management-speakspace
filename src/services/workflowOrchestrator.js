/**
 * ============================================
 * WORKFLOW ORCHESTRATOR
 * The Traffic Cop - Coordinates all services
 * ============================================
 */

const { extractCaseInformation, transcribeAudio, generateCaseSummary } = require('../agents/aiAgent');
const { NotionService } = require('./notionService');
const { CalendarService } = require('./calendarService');
const { EmailService } = require('./emailService');
const { logger } = require('../utils/logger');
const { config } = require('../config');
const { CaseNotFoundError, DuplicateCaseError, CaseAlreadyExistsError } = require('../utils/errors');
const { isRealEmail } = require('../utils/helpers');

/**
 * Workflow Orchestrator Class
 * Processes voice notes and coordinates all actions
 */
class WorkflowOrchestrator {
    constructor(userContext) {
        this.user = userContext;
        this.notion = new NotionService(
            userContext.notion_token,
            userContext.notion_db_id
        );
        this.calendar = new CalendarService(userContext.google_refresh_token);
        this.email = new EmailService();
        
        // Track all operations performed
        this.operationLog = [];
    }
    
    /**
     * Process a voice note - Main entry point
     * @param {Object} input - Voice note input (file path or text)
     * @returns {Object} Processing result
     */
    async processVoiceNote(input) {
        logger.info('Orchestrator: Starting voice note processing', {
            userId: this.user.id
        });
        
        try {
            // Step 1: Get transcription
            let transcription;
            if (input.audioFilePath) {
                transcription = await transcribeAudio(input.audioFilePath);
            } else if (input.text) {
                transcription = input.text;
            } else {
                throw new Error('No input provided');
            }
            
            this.log('TRANSCRIPTION', 'Voice note transcribed successfully');
            
            // Step 2: Extract case information using AI
            const extraction = await extractCaseInformation(transcription, this.user);
            this.log('AI_EXTRACTION', `Extracted ${extraction.cases.length} case(s)`);
            
            // Step 3: Check if clarification is needed
            if (extraction.requires_clarification) {
                return {
                    success: true,
                    status: 'CLARIFICATION_NEEDED',
                    message: extraction.clarification_message,
                    cases_found: extraction.cases.length,
                    operations: this.operationLog
                };
            }
            
            // Step 4: Process each case
            const results = [];
            for (const caseData of extraction.cases) {
                const result = await this.processSingleCase(caseData);
                results.push(result);
            }
            
            // Step 5: Compile final response
            return {
                success: true,
                status: 'COMPLETED',
                summary: extraction.overall_summary,
                cases_processed: results.length,
                cases: results,
                operations: this.operationLog
            };
            
        } catch (error) {
            logger.error('Orchestrator: Processing failed', { error: error.message });
            this.log('ERROR', error.message);
            
            return {
                success: false,
                status: 'ERROR',
                error: error.message,
                operations: this.operationLog
            };
        }
    }
    
    /**
     * Process a single case
     * @param {Object} caseData - Extracted case data
     * @returns {Object} Processing result
     */
    async processSingleCase(caseData) {
        logger.info('Orchestrator: Processing case', {
            action: caseData.action_type,
            lookupKey: caseData.lookup_key || caseData.case_name
        });
        
        switch (caseData.action_type) {
            case 'UPDATE_EXISTING':
                return await this.handleExistingCase(caseData);
                
            case 'CREATE_NEW':
                return await this.handleNewCase(caseData);
                
            case 'CLARIFICATION_NEEDED':
                return {
                    status: 'CLARIFICATION_NEEDED',
                    case_name: caseData.lookup_key || caseData.case_name,
                    message: 'Could not determine if this is a new or existing case'
                };
                
            default:
                return {
                    status: 'UNKNOWN_ACTION',
                    case_name: caseData.case_name
                };
        }
    }
    
    /**
     * Handle existing case update (Branch A)
     * @param {Object} caseData - Case update data
     */
    async handleExistingCase(caseData) {
        const lookupKey = caseData.lookup_key || caseData.case_name;
        
        try {
            // Step 1: Find the case in Notion
            let existingCase;
            try {
                existingCase = await this.notion.findCase(lookupKey);
                this.log('NOTION_SEARCH', `Found case: ${existingCase.case_name}`);
            } catch (error) {
                if (error instanceof CaseNotFoundError) {
                    // Case not found - convert to draft
                    this.log('CASE_NOT_FOUND', `Case "${lookupKey}" not found, creating draft`);
                    return await this.createDraftFromUnknown(caseData, lookupKey);
                }
                
                if (error instanceof DuplicateCaseError) {
                    // Multiple cases found - filter out "Unknown Case" entries and try again
                    const realCases = error.matches.filter(m => !m.case_name.startsWith('Unknown Case'));
                    
                    if (realCases.length === 1) {
                        // Only one real case, use it
                        try {
                            existingCase = await this.notion.getCaseById(realCases[0].id);
                            this.log('NOTION_SEARCH', `Found case after filtering: ${existingCase.case_name}`);
                        } catch (getErr) {
                            logger.error('Failed to get case by ID', { error: getErr.message });
                            throw getErr;
                        }
                    } else if (realCases.length === 0) {
                        // All are unknown cases - create a new draft
                        this.log('CASE_NOT_FOUND', `Only Unknown Cases found for "${lookupKey}", creating draft`);
                        return await this.createDraftFromUnknown(caseData, lookupKey);
                    } else {
                        // Multiple real cases - need clarification
                        this.log('DUPLICATE_CASES', `Multiple cases found for "${lookupKey}"`);
                        return {
                            status: 'CLARIFICATION_NEEDED',
                            case_name: lookupKey,
                            message: `Found ${realCases.length} cases matching "${lookupKey}": ${realCases.map(c => c.case_number).join(', ')}. Please specify case number.`,
                            matches: realCases
                        };
                    }
                } else {
                    throw error;
                }
            }
            
            // Step 2: Add hearing record to the case's hearing history table
            let hearingResult = null;
            if (caseData.outcome) {
                hearingResult = await this.notion.addHearing(existingCase.id, {
                    date: new Date().toISOString().split('T')[0],
                    description: caseData.raw_notes || caseData.outcome,
                    outcome: caseData.outcome,
                    next_steps: caseData.next_hearing_date ? `Next hearing: ${caseData.next_hearing_date}` : '',
                    documents: caseData.documents_needed?.join(', ') || '',
                    court: '',
                    next_hearing_date: caseData.next_hearing_date
                }, this.user);
                
                this.log('HEARING_ADDED', `Added hearing ${hearingResult.hearing_number} to case`);
            }
            
            // Build comprehensive update object with ALL extracted fields
            const updates = {};
            
            // Core fields
            if (caseData.status) updates.status = this.mapStatus(caseData.status);
            if (caseData.next_hearing_date) updates.next_hearing_date = caseData.next_hearing_date;
            if (caseData.documents_needed?.length > 0) updates.documents_needed = caseData.documents_needed;
            
            // Client information
            if (caseData.client_email) updates.client_email = caseData.client_email;
            if (caseData.client_name) updates.client_name = caseData.client_name;
            if (caseData.client_phone) updates.client_phone = caseData.client_phone;
            
            // Case details
            if (caseData.case_summary) updates.case_summary = caseData.case_summary;
            if (caseData.outcome) updates.latest_outcome = caseData.outcome;
            if (caseData.case_number && !existingCase.case_number) updates.case_number = caseData.case_number;
            
            // Junior assignment
            if (caseData.assign_to_junior) {
                // Always prefer extracted junior_name/email, fallback to user context if missing
                updates.junior_name = caseData.junior_name || this.user.junior_name || null;
                updates.junior_email = caseData.junior_email || this.user.junior_email || null;
                // Always send assignment email to junior with all details
                await this.email.sendJuniorAssignmentEmail({
                    ...existingCase,
                    ...caseData,
                    junior_name: updates.junior_name,
                    junior_email: updates.junior_email
                }, this.user);
                this.log('JUNIOR_EMAIL', 'Sent assignment email to junior');
            }
            
            // Apply updates if any fields were extracted
            if (Object.keys(updates).length > 0) {
                await this.notion.updateCase(existingCase.id, updates, this.user);
                this.log('NOTION_UPDATE', `Updated case: ${existingCase.case_name} (fields: ${Object.keys(updates).join(', ')})`);
            } else {
                this.log('NOTION_UPDATE', `Updated case: ${existingCase.case_name}`);
            }
            
            // Step 3: Handle case status
            const result = {
                status: 'UPDATED',
                case_id: existingCase.id,
                notion_page_id: existingCase.id, // For Notion URL
                case_name: existingCase.case_name,
                case_number: existingCase.case_number,
                outcome: caseData.outcome,
                hearing_number: hearingResult?.hearing_number,
                next_date: caseData.next_hearing_date,
                actions: []
            };
            
            // Step 4: Status-specific actions
            if (caseData.status === 'FINALIZED') {
                // Close the case
                await this.notion.closeCase(existingCase.id, this.user);
                this.log('CASE_CLOSED', `Case finalized: ${existingCase.case_name}`);
                result.actions.push('Case closed/archived');
                
                // Send final update to client
                if (existingCase.client_email) {
                    await this.email.sendClientUpdateEmail({
                        ...existingCase,
                        outcome: caseData.outcome,
                        status: 'Finalized'
                    }, this.user);
                    result.actions.push('Client notified of case conclusion');
                }
            } else if (caseData.status === 'CONTINUING') {
                // Status is continuing, will set calendar below
            }
            
            // ALWAYS set calendar reminder when there's a next hearing date
            if (caseData.next_hearing_date) {
                const calendarEvent = await this.calendar.createHearingEvent({
                    case_name: existingCase.case_name,
                    case_number: existingCase.case_number,
                    date: caseData.next_hearing_date,
                    time: caseData.next_hearing_time, // Pass extracted time (or null for default 9 AM)
                    client_name: existingCase.client_name,
                    documents_needed: caseData.documents_needed,
                    include_junior: caseData.assign_to_junior
                }, this.user);
                
                if (calendarEvent && !calendarEvent.skipped) {
                    this.log('CALENDAR_EVENT', `Created hearing reminder`);
                    result.actions.push('Calendar reminder set');
                    result.calendar_event = calendarEvent;
                }
            }
            
            // Step 5: Handle document requests
            if (caseData.documents_needed?.length > 0) {
                await this.handleDocumentRequest(existingCase, caseData);
                result.actions.push('Document request processed');
            }
            
            // Step 6: Client communication - Send hearing report after EVERY hearing
            const newHearingCount = (existingCase.hearing_count || 0) + 1;
            
            // Resolve client email: Use case email if valid, otherwise fallback to default
            const caseEmail = existingCase.client_email || caseData.client_email;
            const resolvedEmail = this.resolveClientEmail(caseEmail, 'hearing update');
            
            if (caseData.outcome && resolvedEmail) {
                // Send detailed hearing report to client after EVERY hearing
                const emailResult = await this.email.sendClientHearingReport({
                    ...existingCase,
                    client_email: resolvedEmail, // Use resolved email
                    outcome: caseData.outcome,
                    next_hearing_date: caseData.next_hearing_date,
                    documents_needed: caseData.documents_needed,
                    status: caseData.status === 'FINALIZED' ? 'Finalized' : 'Continuing'
                }, this.user, newHearingCount);
                
                if (emailResult && !emailResult.skipped) {
                    this.log('CLIENT_EMAIL', `Sent hearing #${newHearingCount} report to client (${resolvedEmail})`);
                    result.actions.push(`Hearing #${newHearingCount} report sent to client`);
                    result.email_sent = true;
                    result.email_to = resolvedEmail;
                }
                
                // Mark welcome sent after first hearing
                if (newHearingCount === 1 && !existingCase.client_welcome_sent) {
                    await this.notion.updateCase(existingCase.id, {
                        client_welcome_sent: true
                    }, this.user);
                }
            }
            
            return result;
            
        } catch (error) {
            logger.error('Orchestrator: Failed to update case', { error: error.message });
            this.log('ERROR', `Failed to update case: ${error.message}`);
            
            return {
                status: 'ERROR',
                case_name: lookupKey,
                error: error.message
            };
        }
    }
    
    /**
     * Handle new case creation (Branch B)
     * @param {Object} caseData - New case data
     */
    async handleNewCase(caseData) {
        try {
            // Step 1: Validate required fields
            const missingFields = [];
            if (!caseData.case_name) missingFields.push('case_name');
            if (!caseData.client_name) missingFields.push('client_name');
            if (!caseData.client_email) missingFields.push('client_email');
            
            // Senior-specific validation
            if (this.user.role === 'SENIOR' && caseData.assign_to_junior) {
                if (!caseData.junior_email && !this.user.junior_email) {
                    missingFields.push('junior_email');
                }
            }
            
            // Merge AI-detected missing fields
            const allMissingFields = [...new Set([
                ...missingFields,
                ...(caseData.missing_fields || [])
            ])];
            
            caseData.missing_fields = allMissingFields;
            
            // Step 2: Generate summary if not provided
            if (!caseData.case_summary && caseData.raw_notes) {
                caseData.case_summary = await generateCaseSummary(caseData);
            }
            
            // Step 3: Create case in Notion
            const createdCase = await this.notion.createCase(caseData, this.user);
            this.log('NOTION_CREATE', `Created case: ${caseData.case_name} (${createdCase.is_draft ? 'Draft' : 'Active'})`);
            
            const result = {
                status: createdCase.is_draft ? 'CREATED_AS_DRAFT' : 'CREATED',
                case_id: createdCase.id,
                notion_page_id: createdCase.id, // For Notion URL
                case_name: caseData.case_name,
                case_number: createdCase.case_number,
                is_draft: createdCase.is_draft,
                missing_fields: allMissingFields,
                actions: []
            };
            
            // Step 4: Handle draft cases
            if (createdCase.is_draft) {
                // Notify user about missing information
                result.message = `Case created as draft. Missing: ${allMissingFields.join(', ')}. Please provide these details.`;
                result.actions.push('Created as draft - awaiting complete information');
                
                // Don't send emails for drafts
                return result;
            }
            
            // Step 5: Senior assigns to junior
            if (this.user.role === 'SENIOR' && caseData.assign_to_junior) {
                await this.email.sendJuniorAssignmentEmail(caseData, this.user);
                this.log('JUNIOR_EMAIL', 'Sent assignment email to junior');
                result.actions.push('Junior notified of assignment');
            } else if (this.user.role === 'SENIOR' && this.user.preferences?.auto_assign_to_junior) {
                // Auto-assign based on preferences
                await this.email.sendJuniorAssignmentEmail(caseData, this.user);
                this.log('JUNIOR_EMAIL', 'Auto-assigned to junior');
                result.actions.push('Auto-assigned to junior');
            }
            
            // Step 6: Handle document requirements
            if (caseData.documents_needed?.length > 0) {
                await this.handleDocumentRequest(caseData, caseData);
                result.actions.push('Document collection requested');
            }
            
            // Step 7: Set calendar for first hearing if date provided
            if (caseData.next_hearing_date) {
                const calendarEvent = await this.calendar.createHearingEvent({
                    case_name: caseData.case_name,
                    case_number: createdCase.case_number,
                    date: caseData.next_hearing_date,
                    time: caseData.next_hearing_time, // Pass extracted time (or null for default 9 AM)
                    client_name: caseData.client_name,
                    include_junior: caseData.assign_to_junior
                }, this.user);
                
                if (calendarEvent) {
                    result.actions.push('First hearing calendar event created');
                    result.calendar_event = calendarEvent;
                }
            }
            
            // Note: Don't email client for new cases - wait until first hearing
            result.actions.push('Client email held until first hearing');
            
            return result;
            
        } catch (error) {
            // Handle CaseAlreadyExistsError - inform user about duplicate
            if (error instanceof CaseAlreadyExistsError) {
                logger.warn('Orchestrator: Duplicate case detected', { 
                    newCase: caseData.case_name,
                    existingCase: error.existingCase?.case_name,
                    existingCaseNumber: error.existingCase?.case_number
                });
                this.log('DUPLICATE_CASE', `Case already exists: ${error.existingCase?.case_name}`);
                
                return {
                    status: 'DUPLICATE_CASE',
                    case_name: caseData.case_name,
                    existing_case: {
                        id: error.existingCase?.id,
                        case_name: error.existingCase?.case_name,
                        case_number: error.existingCase?.case_number,
                        notion_url: error.existingCase?.id ? 
                            `https://notion.so/${error.existingCase.id.replace(/-/g, '')}` : null
                    },
                    message: error.message,
                    suggestion: 'Please update the existing case instead of creating a new one.'
                };
            }
            
            logger.error('Orchestrator: Failed to create case', { error: error.message });
            this.log('ERROR', `Failed to create case: ${error.message}`);
            
            return {
                status: 'ERROR',
                case_name: caseData.case_name,
                error: error.message
            };
        }
    }
    
    /**
     * Create draft from unknown case reference
     * @param {Object} caseData - Case data
     * @param {string} lookupKey - Original lookup key
     */
    async createDraftFromUnknown(caseData, lookupKey) {
        const draftData = {
            case_name: `Unknown Case: ${lookupKey}`,
            case_summary: caseData.outcome || caseData.raw_notes,
            missing_fields: ['case_verification', 'client_name', 'client_email'],
            assign_to_junior: false
        };
        
        const createdCase = await this.notion.createCase(draftData, this.user);
        
        // Add note about the original reference
        await this.notion.addHistoryEntry(
            createdCase.id,
            `⚠️ This case was auto-created because "${lookupKey}" was not found. Please verify and update case details.`,
            this.user
        );
        
        return {
            status: 'CREATED_AS_DRAFT',
            case_id: createdCase.id,
            notion_page_id: createdCase.id, // For Notion URL
            case_name: draftData.case_name,
            case_number: createdCase.case_number,
            is_draft: true,
            message: `Case "${lookupKey}" not found. Created draft for review.`,
            actions: ['Created draft case for unknown reference']
        };
    }
    
    /**
     * Handle document request logic
     * Sends email to both junior (to collect) and client (to submit)
     * @param {Object} existingCase - Existing case data
     * @param {Object} updateData - Update data with document needs
     */
    async handleDocumentRequest(existingCase, updateData) {
        const documents = updateData.documents_needed || [];
        if (documents.length === 0) return;
        
        const caseData = {
            case_name: existingCase.case_name || updateData.case_name,
            case_number: existingCase.case_number || updateData.case_number,
            documents_needed: documents,
            client_name: existingCase.client_name || updateData.client_name,
            client_email: existingCase.client_email || updateData.client_email
        };
        
        // Create document reminder in calendar
        await this.calendar.createDocumentReminder(caseData, this.user);
        this.log('CALENDAR_EVENT', 'Created document collection reminder');
        
        // Send email to client to submit documents
        if (caseData.client_email) {
            await this.email.sendDocumentRequestToClient(caseData, this.user);
            this.log('CLIENT_EMAIL', 'Sent document request to client');
        }
        
        // If senior, also email junior to follow up
        if (this.user.role === 'SENIOR' && this.user.junior_email) {
            await this.email.sendDocumentRequestToJunior(caseData, this.user);
            this.log('JUNIOR_EMAIL', 'Sent document collection request to junior');
        }
    }
    
    /**
     * Map AI status to Notion status
     * @param {string} status - AI extracted status
     * @returns {string} Notion status
     */
    mapStatus(status) {
        const statusMap = {
            'CONTINUING': config.caseStatuses.CONTINUING,
            'FINALIZED': config.caseStatuses.FINALIZED,
            'DRAFT': config.caseStatuses.DRAFT,
            'ACTIVE': config.caseStatuses.ACTIVE
        };
        return statusMap[status] || config.caseStatuses.ACTIVE;
    }
    
    /**
     * Resolve client email - use case email if valid, else fallback to default
     * @param {string} email - Email from case/extracted data
     * @param {string} context - Context for logging (e.g., 'hearing update', 'welcome email')
     * @returns {string|null} Resolved email or null
     */
    resolveClientEmail(email, context = 'email') {
        const defaultEmail = this.user.email || process.env.DEMO_USER_EMAIL;
        
        if (!email) {
            if (defaultEmail) {
                logger.info(`Email: No client email, using default for ${context}`, { 
                    defaultEmail: defaultEmail.substring(0, 5) + '...' 
                });
                return defaultEmail;
            }
            logger.warn(`Email: No client email and no default configured for ${context}`);
            return null;
        }
        
        // Check if email is real (not dummy/test)
        if (isRealEmail(email)) {
            logger.info(`Email: Using client email for ${context}`, { 
                email: email.substring(0, 5) + '...' 
            });
            return email;
        }
        
        // Email exists but is fake/dummy - use default
        if (defaultEmail) {
            logger.info(`Email: Client email is dummy/test, using default for ${context}`, { 
                originalEmail: email.substring(0, 5) + '...',
                defaultEmail: defaultEmail.substring(0, 5) + '...'
            });
            return defaultEmail;
        }
        
        logger.warn(`Email: Client email is dummy and no default for ${context}`, { 
            email: email.substring(0, 5) + '...' 
        });
        return null;
    }
    
    /**
     * Log an operation
     * @param {string} type - Operation type
     * @param {string} message - Operation message
     */
    log(type, message) {
        const entry = {
            timestamp: new Date().toISOString(),
            type,
            message,
            user: this.user.name
        };
        
        this.operationLog.push(entry);
        logger.info(`Orchestrator [${type}]: ${message}`);
    }
    
    /**
     * Resolve client email - uses case email if valid, otherwise falls back to default
     * This ensures emails always go somewhere useful (real client or demo email for testing)
     * @param {string} caseEmail - Email from case data
     * @param {string} context - Context for logging (e.g., 'hearing update', 'document request')
     * @returns {string|null} Resolved email address
     */
    resolveClientEmail(caseEmail, context = 'email') {
        const defaultEmail = this.user.email || process.env.DEMO_USER_EMAIL;
        
        // Case 1: No email at all
        if (!caseEmail) {
            if (defaultEmail) {
                logger.info(`Email: No client email, using default for ${context}`, { 
                    defaultEmail 
                });
                return defaultEmail;
            }
            logger.warn(`Email: No client email and no default configured for ${context}`);
            return null;
        }
        
        // Case 2: Check if email is real (not dummy/fake domain)
        if (isRealEmail(caseEmail)) {
            logger.info(`Email: Using client email for ${context}`, { 
                clientEmail: caseEmail 
            });
            return caseEmail;
        }
        
        // Case 3: Email is dummy/fake - fall back to default
        if (defaultEmail) {
            logger.info(`Email: Client email is dummy, using default for ${context}`, { 
                dummyEmail: caseEmail,
                defaultEmail 
            });
            return defaultEmail;
        }
        
        logger.warn(`Email: Client email is dummy and no default configured for ${context}`, { 
            dummyEmail: caseEmail 
        });
        return null;
    }
}

module.exports = { WorkflowOrchestrator };
