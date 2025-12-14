/**
 * ============================================
 * GOOGLE CALENDAR SERVICE - THE SCHEDULER
 * Court date and reminder management
 * OPTIONAL: Works without configuration
 * ============================================
 */

const { google } = require('googleapis');
const { config } = require('../config');
const { logger } = require('../utils/logger');
const { ExternalServiceError } = require('../utils/errors');
const { parseDate } = require('../utils/helpers');

/**
 * Google Calendar Service Class
 * Handles calendar events and reminders
 * If not configured, gracefully skips calendar operations
 */
class CalendarService {
    constructor(refreshToken = null) {
        // Check if Google Calendar is configured
        this.isConfigured = !!(
            config.google.clientId && 
            config.google.clientSecret && 
            (refreshToken || config.google.refreshToken)
        );
        
        if (!this.isConfigured) {
            logger.info('Calendar: Not configured - calendar features disabled');
            this.calendar = null;
            return;
        }
        
        this.oauth2Client = new google.auth.OAuth2(
            config.google.clientId,
            config.google.clientSecret,
            config.google.redirectUri
        );
        
        // Set credentials
        this.oauth2Client.setCredentials({
            refresh_token: refreshToken || config.google.refreshToken
        });
        
        // Initialize calendar API
        this.calendar = google.calendar({
            version: 'v3',
            auth: this.oauth2Client
        });
    }
    
    /**
     * Create a court hearing event
     * @param {Object} eventData - Event details
     * @param {Object} userContext - User context
     * @returns {Object} Created event or null if not configured
     */
    async createHearingEvent(eventData, userContext) {
        // Skip if not configured
        if (!this.isConfigured) {
            logger.info('Calendar: Skipping event creation (not configured)', {
                caseName: eventData.case_name,
                date: eventData.date
            });
            return { skipped: true, reason: 'Calendar not configured' };
        }
        
        logger.info('Calendar: Creating hearing event', {
            caseName: eventData.case_name,
            date: eventData.date
        });
        
        try {
            const eventDate = parseDate(eventData.date);
            if (!eventDate) {
                logger.warn('Calendar: Could not parse date', { date: eventData.date });
                return null;
            }
            
            // Use extracted time if available, otherwise default to 9:00 AM
            let startHour = 9;
            let startMinute = 0;
            
            if (eventData.time) {
                // Parse time string like "14:30", "09:00", "2:30 PM"
                const timeStr = eventData.time.toString().trim();
                const time24Match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
                const time12Match = timeStr.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
                
                if (time24Match) {
                    startHour = parseInt(time24Match[1], 10);
                    startMinute = parseInt(time24Match[2], 10);
                } else if (time12Match) {
                    startHour = parseInt(time12Match[1], 10);
                    startMinute = time12Match[2] ? parseInt(time12Match[2], 10) : 0;
                    const isPM = time12Match[3].toUpperCase() === 'PM';
                    if (isPM && startHour !== 12) startHour += 12;
                    if (!isPM && startHour === 12) startHour = 0;
                }
                
                logger.info('Calendar: Using extracted time', { time: eventData.time, hour: startHour, minute: startMinute });
            } else {
                logger.info('Calendar: No time specified, using default 9:00 AM');
            }
            
            eventDate.setHours(startHour, startMinute, 0, 0);
            
            const endDate = new Date(eventDate);
            endDate.setHours(startHour + 2, startMinute, 0, 0); // 2 hour duration
            
            const reminderHours = userContext.preferences?.reminder_hours_before || 24;
            
            const event = {
                summary: `[Court] ${eventData.case_name} Hearing`,
                description: this.buildEventDescription(eventData, userContext),
                start: {
                    dateTime: eventDate.toISOString(),
                    timeZone: 'Asia/Kolkata'
                },
                end: {
                    dateTime: endDate.toISOString(),
                    timeZone: 'Asia/Kolkata'
                },
                location: eventData.court_location || 'Court',
                attendees: this.buildAttendeesList(eventData, userContext),
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'email', minutes: reminderHours * 60 },
                        { method: 'popup', minutes: 60 }, // 1 hour before
                        { method: 'popup', minutes: 15 }  // 15 minutes before
                    ]
                },
                colorId: '11' // Red for court dates
            };
            
            const response = await this.calendar.events.insert({
                calendarId: userContext.google_calendar_id || 'primary',
                resource: event,
                sendUpdates: 'all' // Send notifications to attendees
            });
            
            logger.info('Calendar: Event created', {
                eventId: response.data.id,
                htmlLink: response.data.htmlLink
            });
            
            return {
                event_id: response.data.id,
                html_link: response.data.htmlLink,
                summary: response.data.summary,
                start: response.data.start.dateTime
            };
            
        } catch (error) {
            logger.error('Calendar: Failed to create event', { error: error.message });
            
            // Don't fail the whole operation for calendar errors
            if (error.code === 401) {
                throw new ExternalServiceError('Google Calendar', 'Authentication failed. Please re-authorize.');
            }
            
            return null;
        }
    }
    
    /**
     * Create a document submission reminder
     * @param {Object} reminderData - Reminder details
     * @param {Object} userContext - User context
     * @returns {Object} Created reminder
     */
    async createDocumentReminder(reminderData, userContext) {
        logger.info('Calendar: Creating document reminder', {
            caseName: reminderData.case_name,
            documents: reminderData.documents
        });
        
        try {
            // Set reminder for 3 days from now if no specific date
            const reminderDate = reminderData.due_date 
                ? parseDate(reminderData.due_date)
                : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
            
            reminderDate.setHours(9, 0, 0, 0);
            
            const endDate = new Date(reminderDate);
            endDate.setHours(9, 30, 0, 0);
            
            const event = {
                summary: `📄 [Documents] ${reminderData.case_name}`,
                description: this.buildDocumentReminderDescription(reminderData, userContext),
                start: {
                    dateTime: reminderDate.toISOString(),
                    timeZone: 'Asia/Kolkata'
                },
                end: {
                    dateTime: endDate.toISOString(),
                    timeZone: 'Asia/Kolkata'
                },
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'email', minutes: 24 * 60 }, // 1 day before
                        { method: 'popup', minutes: 60 }
                    ]
                },
                colorId: '5' // Yellow for reminders
            };
            
            const response = await this.calendar.events.insert({
                calendarId: userContext.google_calendar_id || 'primary',
                resource: event
            });
            
            logger.info('Calendar: Document reminder created', {
                eventId: response.data.id
            });
            
            return {
                event_id: response.data.id,
                html_link: response.data.htmlLink,
                summary: response.data.summary
            };
            
        } catch (error) {
            logger.error('Calendar: Failed to create reminder', { error: error.message });
            return null;
        }
    }
    
    /**
     * Build event description
     */
    buildEventDescription(eventData, userContext) {
        let description = `📋 Case Hearing Details\n\n`;
        description += `Case: ${eventData.case_name}\n`;
        
        if (eventData.case_number) {
            description += `Case Number: ${eventData.case_number}\n`;
        }
        
        if (eventData.client_name) {
            description += `Client: ${eventData.client_name}\n`;
        }
        
        description += `\nCreated by: ${userContext.name}\n`;
        
        if (eventData.notes) {
            description += `\nNotes:\n${eventData.notes}`;
        }
        
        if (eventData.documents_needed?.length > 0) {
            description += `\n\n📄 Documents to Carry:\n`;
            eventData.documents_needed.forEach(doc => {
                description += `• ${doc}\n`;
            });
        }
        
        return description;
    }
    
    /**
     * Build document reminder description
     */
    buildDocumentReminderDescription(reminderData, userContext) {
        let description = `📄 Document Collection Reminder\n\n`;
        description += `Case: ${reminderData.case_name}\n\n`;
        description += `Documents Required:\n`;
        
        (reminderData.documents || []).forEach(doc => {
            description += `• ${doc}\n`;
        });
        
        if (reminderData.client_name) {
            description += `\nClient: ${reminderData.client_name}`;
        }
        
        if (reminderData.client_email) {
            description += `\nClient Email: ${reminderData.client_email}`;
        }
        
        description += `\n\nCreated by: ${userContext.name}`;
        
        return description;
    }
    
    /**
     * Build attendees list
     */
    buildAttendeesList(eventData, userContext) {
        const attendees = [
            { email: userContext.email }
        ];
        
        // Add junior if senior is assigning
        if (userContext.junior_email && eventData.include_junior) {
            attendees.push({ email: userContext.junior_email });
        }
        
        return attendees;
    }
    
    /**
     * Delete a calendar event
     * @param {string} eventId - Event ID to delete
     * @param {Object} userContext - User context
     */
    async deleteEvent(eventId, userContext) {
        try {
            await this.calendar.events.delete({
                calendarId: userContext.google_calendar_id || 'primary',
                eventId: eventId
            });
            
            logger.info('Calendar: Event deleted', { eventId });
            return true;
            
        } catch (error) {
            logger.error('Calendar: Failed to delete event', { error: error.message });
            return false;
        }
    }
    
    /**
     * Get upcoming events
     * @param {Object} userContext - User context
     * @param {number} maxResults - Maximum events to return
     * @returns {Array} Upcoming events
     */
    async getUpcomingEvents(userContext, maxResults = 10) {
        try {
            const response = await this.calendar.events.list({
                calendarId: userContext.google_calendar_id || 'primary',
                timeMin: new Date().toISOString(),
                maxResults: maxResults,
                singleEvents: true,
                orderBy: 'startTime',
                q: '[Court]' // Only court events
            });
            
            return response.data.items.map(event => ({
                id: event.id,
                summary: event.summary,
                start: event.start.dateTime || event.start.date,
                html_link: event.htmlLink
            }));
            
        } catch (error) {
            logger.error('Calendar: Failed to get events', { error: error.message });
            return [];
        }
    }
    
    /**
     * Generate OAuth URL for authorization
     * @returns {string} Authorization URL
     */
    getAuthUrl() {
        const scopes = [
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/calendar.events'
        ];
        
        return this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            prompt: 'consent'
        });
    }
    
    /**
     * Exchange authorization code for tokens
     * @param {string} code - Authorization code
     * @returns {Object} Tokens
     */
    async getTokensFromCode(code) {
        const { tokens } = await this.oauth2Client.getToken(code);
        this.oauth2Client.setCredentials(tokens);
        return tokens;
    }
}

module.exports = { CalendarService };
