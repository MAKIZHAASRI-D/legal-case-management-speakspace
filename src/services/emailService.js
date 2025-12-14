/**
 * ============================================
 * EMAIL SERVICE - THE COURIER
 * Client and Junior communication via email
 * OPTIONAL: Works without configuration
 * ============================================
 */

const nodemailer = require('nodemailer');
const { config } = require('../config');
const { logger } = require('../utils/logger');
const { ExternalServiceError } = require('../utils/errors');
const { formatDate } = require('../utils/helpers');

/**
 * Email Service Class
 * Handles all email communications
 * If not configured, gracefully skips email operations
 */
class EmailService {
    constructor() {
        // Check if email is configured
        this.isConfigured = !!(
            config.email.auth?.user && 
            config.email.auth?.pass
        );
        
        if (!this.isConfigured) {
            logger.info('Email: Not configured - email features disabled');
            this.transporter = null;
            return;
        }
        
        this.transporter = nodemailer.createTransport({
            host: config.email.host,
            port: config.email.port,
            secure: config.email.secure,
            auth: config.email.auth
        });
        
        this.fromAddress = config.email.from;
    }
    
    /**
     * Verify email configuration
     */
    async verify() {
        if (!this.isConfigured) {
            logger.info('Email: Skipping verification (not configured)');
            return false;
        }
        
        try {
            await this.transporter.verify();
            logger.info('Email: SMTP connection verified');
            return true;
        } catch (error) {
            logger.error('Email: SMTP verification failed', { error: error.message });
            return false;
        }
    }
    
    /**
     * Send email to junior about new case assignment
     * @param {Object} caseData - Case details
     * @param {Object} userContext - User context (senior)
     */
    async sendJuniorAssignmentEmail(caseData, userContext) {
        if (!this.isConfigured) {
            logger.info('Email: Skipping junior assignment email (not configured)');
            return { skipped: true, reason: 'Email not configured' };
        }
        
        if (!userContext.junior_email) {
            logger.warn('Email: No junior email configured');
            return null;
        }
        
        logger.info('Email: Sending junior assignment email', {
            to: userContext.junior_email,
            caseName: caseData.case_name
        });
        
        const subject = `📋 New Case Assignment: ${caseData.case_name}`;
        
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">
                    New Case Assigned to You
                </h2>
                
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="color: #2c3e50; margin-top: 0;">Case Details</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: #666;"><strong>Case Name:</strong></td>
                            <td style="padding: 8px 0;">${caseData.case_name}</td>
                        </tr>
                        ${caseData.case_number ? `
                        <tr>
                            <td style="padding: 8px 0; color: #666;"><strong>Case Number:</strong></td>
                            <td style="padding: 8px 0;">${caseData.case_number}</td>
                        </tr>
                        ` : ''}
                        ${caseData.client_name ? `
                        <tr>
                            <td style="padding: 8px 0; color: #666;"><strong>Client:</strong></td>
                            <td style="padding: 8px 0;">${caseData.client_name}</td>
                        </tr>
                        ` : ''}
                        ${caseData.client_email ? `
                        <tr>
                            <td style="padding: 8px 0; color: #666;"><strong>Client Email:</strong></td>
                            <td style="padding: 8px 0;">${caseData.client_email}</td>
                        </tr>
                        ` : ''}
                    </table>
                </div>
                
                ${caseData.case_summary ? `
                <div style="background: #fff; padding: 15px; border-left: 4px solid #3498db; margin: 20px 0;">
                    <h4 style="margin-top: 0; color: #2c3e50;">Case Summary</h4>
                    <p style="color: #555; line-height: 1.6;">${caseData.case_summary}</p>
                </div>
                ` : ''}
                
                ${caseData.documents_needed?.length > 0 ? `
                <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <h4 style="margin-top: 0; color: #856404;">📄 Documents Required</h4>
                    <ul style="margin: 0; padding-left: 20px;">
                        ${caseData.documents_needed.map(doc => `<li style="color: #856404; padding: 4px 0;">${doc}</li>`).join('')}
                    </ul>
                    <p style="font-size: 12px; color: #856404; margin-bottom: 0; margin-top: 10px;">
                        Please collect these documents from the client at the earliest.
                    </p>
                </div>
                ` : ''}
                
                ${caseData.next_hearing_date ? `
                <div style="background: #d4edda; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <h4 style="margin-top: 0; color: #155724;">📅 Next Hearing</h4>
                    <p style="color: #155724; margin: 0;">${formatDate(caseData.next_hearing_date)}</p>
                </div>
                ` : ''}
                
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                    <p style="color: #666; font-size: 12px; margin: 0;">
                        Assigned by: <strong>${userContext.name}</strong><br>
                        Date: ${new Date().toLocaleDateString('en-IN')}
                    </p>
                </div>
            </div>
        `;
        
        return this.sendEmail({
            to: userContext.junior_email,
            subject,
            html
        });
    }
    
    /**
     * Send document request email to junior
     * @param {Object} caseData - Case details
     * @param {Object} userContext - User context
     */
    async sendDocumentRequestToJunior(caseData, userContext) {
        if (!this.isConfigured) {
            logger.info('Email: Skipping document request email (not configured)');
            return { skipped: true, reason: 'Email not configured' };
        }
        
        if (!userContext.junior_email) {
            logger.warn('Email: No junior email for document request');
            return null;
        }
        
        logger.info('Email: Sending document request to junior', {
            to: userContext.junior_email,
            documents: caseData.documents_needed
        });
        
        const subject = `🔴 URGENT: Document Collection Required - ${caseData.case_name}`;
        
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #dc3545; color: white; padding: 15px; border-radius: 8px 8px 0 0;">
                    <h2 style="margin: 0;">⚠️ Urgent Document Request</h2>
                </div>
                
                <div style="background: #f8f9fa; padding: 20px; border: 1px solid #ddd; border-top: none;">
                    <p style="color: #333; font-size: 16px;">
                        The court has requested the following documents for case <strong>${caseData.case_name}</strong>.
                        Please collect these from the client immediately.
                    </p>
                    
                    <div style="background: #fff; padding: 20px; border-radius: 8px; margin: 15px 0;">
                        <h3 style="color: #dc3545; margin-top: 0;">Documents Required:</h3>
                        <ul style="margin: 0; padding-left: 20px;">
                            ${(caseData.documents_needed || []).map(doc => `
                                <li style="padding: 8px 0; border-bottom: 1px solid #eee;">${doc}</li>
                            `).join('')}
                        </ul>
                    </div>
                    
                    <div style="background: #e9ecef; padding: 15px; border-radius: 8px;">
                        <h4 style="margin-top: 0; color: #495057;">Client Information</h4>
                        <p style="margin: 5px 0;"><strong>Name:</strong> ${caseData.client_name || 'N/A'}</p>
                        <p style="margin: 5px 0;"><strong>Email:</strong> ${caseData.client_email || 'N/A'}</p>
                    </div>
                    
                    <p style="color: #666; font-size: 12px; margin-top: 20px;">
                        Requested by: ${userContext.name}<br>
                        Date: ${new Date().toLocaleDateString('en-IN')}
                    </p>
                </div>
            </div>
        `;
        
        return this.sendEmail({
            to: userContext.junior_email,
            subject,
            html
        });
    }
    
    /**
     * Send document request email to client
     * @param {Object} caseData - Case details with documents_needed
     * @param {Object} userContext - User context
     */
    async sendDocumentRequestToClient(caseData, userContext) {
        if (!this.isConfigured) {
            logger.info('Email: Skipping client document request (not configured)');
            return { skipped: true, reason: 'Email not configured' };
        }
        
        if (!caseData.client_email) {
            logger.warn('Email: No client email for document request');
            return null;
        }
        
        logger.info('Email: Sending document request to client', {
            to: caseData.client_email,
            documents: caseData.documents_needed
        });
        
        const subject = `📄 Documents Required - ${caseData.case_name}`;
        
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #f39c12, #e74c3c); color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h1 style="margin: 0;">📄 Documents Required</h1>
                    <p style="margin: 10px 0 0; opacity: 0.9;">Action Required From You</p>
                </div>
                
                <div style="background: #f8f9fa; padding: 25px; border: 1px solid #ddd; border-top: none;">
                    <p style="color: #333; font-size: 16px;">
                        Dear <strong>${caseData.client_name}</strong>,
                    </p>
                    
                    <p style="color: #555; line-height: 1.6;">
                        The court has requested certain documents for your case <strong>${caseData.case_name}</strong>.
                        Please provide these documents at your earliest convenience to avoid any delays in proceedings.
                    </p>
                    
                    <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f39c12;">
                        <h3 style="margin-top: 0; color: #856404;">📋 Required Documents:</h3>
                        <ul style="margin: 0; padding-left: 20px;">
                            ${(caseData.documents_needed || []).map(doc => `
                                <li style="color: #856404; padding: 8px 0; border-bottom: 1px solid #ffe69c;">${doc}</li>
                            `).join('')}
                        </ul>
                    </div>
                    
                    <div style="background: #d4edda; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <h4 style="margin-top: 0; color: #155724;">How to Submit:</h4>
                        <p style="color: #155724; margin: 0;">
                            You can reply to this email with the documents attached, or bring them to our office.
                        </p>
                    </div>
                    
                    <p style="color: #666; font-size: 12px; margin-top: 25px; border-top: 1px solid #ddd; padding-top: 15px;">
                        If you have any questions, please contact us.<br>
                        <strong>${userContext.name}</strong><br>
                        ${new Date().toLocaleDateString('en-IN')}
                    </p>
                </div>
            </div>
        `;
        
        return this.sendEmail({
            to: caseData.client_email,
            subject,
            html
        });
    }
    
    /**
     * Send welcome email to client (after first hearing)
     * @param {Object} caseData - Case details
     * @param {Object} userContext - User context
     */
    async sendClientWelcomeEmail(caseData, userContext) {
        if (!this.isConfigured) {
            logger.info('Email: Skipping client welcome email (not configured)');
            return { skipped: true, reason: 'Email not configured' };
        }
        
        if (!caseData.client_email) {
            logger.warn('Email: No client email for welcome message');
            return null;
        }
        
        logger.info('Email: Sending client welcome email', {
            to: caseData.client_email,
            caseName: caseData.case_name
        });
        
        const subject = `Welcome - Your Case ${caseData.case_name} Update`;
        
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #2c3e50; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h1 style="margin: 0;">⚖️ Legal Update</h1>
                </div>
                
                <div style="background: #f8f9fa; padding: 30px; border: 1px solid #ddd; border-top: none;">
                    <p style="color: #333; font-size: 16px;">
                        Dear <strong>${caseData.client_name}</strong>,
                    </p>
                    
                    <p style="color: #555; line-height: 1.8;">
                        We are pleased to inform you that the first hearing for your case 
                        <strong>${caseData.case_name}</strong> has been completed.
                    </p>
                    
                    ${caseData.outcome ? `
                    <div style="background: #d4edda; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <h4 style="margin-top: 0; color: #155724;">Hearing Update</h4>
                        <p style="color: #155724; margin: 0;">${caseData.outcome}</p>
                    </div>
                    ` : ''}
                    
                    ${caseData.next_hearing_date ? `
                    <div style="background: #fff; padding: 15px; border: 2px solid #3498db; border-radius: 8px; margin: 20px 0;">
                        <h4 style="margin-top: 0; color: #2c3e50;">📅 Next Hearing Date</h4>
                        <p style="color: #3498db; font-size: 18px; font-weight: bold; margin: 0;">
                            ${formatDate(caseData.next_hearing_date)}
                        </p>
                    </div>
                    ` : ''}
                    
                    <p style="color: #555; line-height: 1.8;">
                        We will keep you updated on the progress of your case. 
                        If you have any questions, please feel free to reach out.
                    </p>
                    
                    <p style="color: #333; margin-top: 30px;">
                        Best regards,<br>
                        <strong>${userContext.name}</strong><br>
                        <span style="color: #666;">Legal Counsel</span>
                    </p>
                </div>
                
                <div style="background: #2c3e50; color: #95a5a6; padding: 15px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px;">
                    This is an automated message from the Legal Case Management System.
                </div>
            </div>
        `;
        
        return this.sendEmail({
            to: caseData.client_email,
            subject,
            html
        });
    }
    
    /**
     * Send case update email to client
     * @param {Object} caseData - Case details
     * @param {Object} userContext - User context
     */
    async sendClientUpdateEmail(caseData, userContext) {
        if (!this.isConfigured) {
            logger.info('Email: Skipping client update email (not configured)');
            return { skipped: true, reason: 'Email not configured' };
        }
        
        if (!caseData.client_email) {
            logger.warn('Email: No client email for update');
            return null;
        }
        
        logger.info('Email: Sending client update email', {
            to: caseData.client_email,
            caseName: caseData.case_name
        });
        
        const subject = `Case Update: ${caseData.case_name}`;
        
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #3498db; color: white; padding: 15px; border-radius: 8px 8px 0 0;">
                    <h2 style="margin: 0;">📋 Case Update</h2>
                </div>
                
                <div style="background: #f8f9fa; padding: 25px; border: 1px solid #ddd; border-top: none;">
                    <p style="color: #333;">Dear <strong>${caseData.client_name}</strong>,</p>
                    
                    <p style="color: #555;">
                        Here is the latest update on your case <strong>${caseData.case_name}</strong>:
                    </p>
                    
                    <div style="background: #fff; padding: 20px; border-left: 4px solid #3498db; margin: 20px 0;">
                        <p style="color: #333; margin: 0;">${caseData.outcome}</p>
                    </div>
                    
                    ${caseData.next_hearing_date ? `
                    <p style="color: #555;">
                        <strong>Next Hearing:</strong> ${formatDate(caseData.next_hearing_date)}
                    </p>
                    ` : ''}
                    
                    ${caseData.status === 'Finalized' ? `
                    <div style="background: #d4edda; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p style="color: #155724; margin: 0;">
                            ✅ This case has been concluded. Thank you for trusting us.
                        </p>
                    </div>
                    ` : ''}
                    
                    <p style="color: #666; font-size: 12px; margin-top: 30px;">
                        From: ${userContext.name}
                    </p>
                </div>
            </div>
        `;
        
        return this.sendEmail({
            to: caseData.client_email,
            subject,
            html
        });
    }
    
    /**
     * Send hearing report to client after EVERY hearing
     * This is a detailed court report sent after each hearing
     * @param {Object} caseData - Case details with hearing outcome
     * @param {Object} userContext - User context
     * @param {number} hearingNumber - Which hearing number this is
     */
    async sendClientHearingReport(caseData, userContext, hearingNumber) {
        if (!this.isConfigured) {
            logger.info('Email: Skipping client hearing report (not configured)');
            return { skipped: true, reason: 'Email not configured' };
        }
        
        if (!caseData.client_email) {
            logger.warn('Email: No client email for hearing report');
            return null;
        }
        
        logger.info('Email: Sending client hearing report', {
            to: caseData.client_email,
            caseName: caseData.case_name,
            hearingNumber: hearingNumber
        });
        
        const subject = `📋 Hearing #${hearingNumber} Report - ${caseData.case_name}`;
        const hearingDate = new Date().toLocaleDateString('en-IN', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #2c3e50, #3498db); color: white; padding: 25px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h1 style="margin: 0;">⚖️ Court Hearing Report</h1>
                    <p style="margin: 10px 0 0; opacity: 0.9;">Hearing #${hearingNumber}</p>
                </div>
                
                <div style="background: #f8f9fa; padding: 30px; border: 1px solid #ddd; border-top: none;">
                    <p style="color: #333; font-size: 16px;">
                        Dear <strong>${caseData.client_name}</strong>,
                    </p>
                    
                    <p style="color: #555; line-height: 1.8;">
                        We are writing to provide you with a detailed report of today's court hearing 
                        for your case <strong>${caseData.case_name}</strong>${caseData.case_number ? ` (Case No: ${caseData.case_number})` : ''}.
                    </p>
                    
                    <div style="background: #fff; padding: 20px; border-radius: 8px; margin: 25px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 10px 0; color: #666; width: 40%;"><strong>Hearing Date:</strong></td>
                                <td style="padding: 10px 0; color: #333;">${hearingDate}</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px 0; color: #666;"><strong>Hearing Number:</strong></td>
                                <td style="padding: 10px 0; color: #333;">#${hearingNumber}</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px 0; color: #666;"><strong>Case Status:</strong></td>
                                <td style="padding: 10px 0; color: #333;">
                                    <span style="background: ${caseData.status === 'Finalized' ? '#28a745' : '#17a2b8'}; color: white; padding: 4px 12px; border-radius: 12px; font-size: 14px;">
                                        ${caseData.status || 'Continuing'}
                                    </span>
                                </td>
                            </tr>
                        </table>
                    </div>
                    
                    <div style="background: #e8f4fd; padding: 20px; border-left: 4px solid #3498db; margin: 25px 0;">
                        <h3 style="margin-top: 0; color: #2c3e50;">📝 What Happened in Court Today</h3>
                        <p style="color: #333; line-height: 1.8; margin-bottom: 0;">${caseData.outcome || 'The hearing was conducted. Details will be shared in the next update.'}</p>
                    </div>
                    
                    ${caseData.next_hearing_date ? `
                    <div style="background: #d4edda; padding: 20px; border-radius: 8px; margin: 25px 0;">
                        <h3 style="margin-top: 0; color: #155724;">📅 Next Hearing Date</h3>
                        <p style="color: #155724; font-size: 20px; font-weight: bold; margin: 0;">
                            ${formatDate(caseData.next_hearing_date)}
                        </p>
                        <p style="color: #155724; font-size: 14px; margin: 10px 0 0;">
                            Please mark this date in your calendar. We will send you a reminder before the hearing.
                        </p>
                    </div>
                    ` : ''}
                    
                    ${caseData.documents_needed?.length > 0 ? `
                    <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 25px 0; border: 1px solid #ffc107;">
                        <h3 style="margin-top: 0; color: #856404;">📄 Documents Required From You</h3>
                        <p style="color: #856404; margin-bottom: 10px;">The court has requested the following documents. Please provide them as soon as possible:</p>
                        <ul style="margin: 0; padding-left: 20px;">
                            ${caseData.documents_needed.map(doc => `<li style="color: #856404; padding: 5px 0;">${doc}</li>`).join('')}
                        </ul>
                    </div>
                    ` : ''}
                    
                    ${caseData.status === 'Finalized' ? `
                    <div style="background: #d4edda; padding: 20px; border-radius: 8px; margin: 25px 0; text-align: center;">
                        <h3 style="color: #155724; margin-top: 0;">🎉 Case Concluded</h3>
                        <p style="color: #155724; margin: 0;">
                            Your case has been successfully concluded. Thank you for trusting us with your legal matters.
                        </p>
                    </div>
                    ` : ''}
                    
                    <div style="background: #f0f0f0; padding: 15px; border-radius: 8px; margin-top: 30px;">
                        <p style="color: #555; margin: 0; font-size: 14px;">
                            <strong>Need to contact us?</strong><br>
                            If you have any questions about this hearing or your case, please reply to this email 
                            or contact our office directly.
                        </p>
                    </div>
                    
                    <p style="color: #333; margin-top: 30px;">
                        Warm regards,<br>
                        <strong>${userContext.name}</strong><br>
                        <span style="color: #666;">Legal Counsel</span>
                    </p>
                </div>
                
                <div style="background: #2c3e50; color: #95a5a6; padding: 15px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px;">
                    <p style="margin: 0;">This is an automated hearing report from the Legal Case Management System.</p>
                    <p style="margin: 5px 0 0;">Report generated on ${new Date().toLocaleString('en-IN')}</p>
                </div>
            </div>
        `;
        
        return this.sendEmail({
            to: caseData.client_email,
            subject,
            html
        });
    }
    
    /**
     * Send email about missing case information
     * @param {Object} caseData - Case details
     * @param {Object} userContext - User context
     */
    async sendMissingInfoReminder(caseData, userContext) {
        const subject = `Action Required: Complete Case Information - ${caseData.case_name}`;
        
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #ffc107; color: #000; padding: 15px; border-radius: 8px 8px 0 0;">
                    <h2 style="margin: 0;">⚠️ Case Information Incomplete</h2>
                </div>
                
                <div style="background: #f8f9fa; padding: 25px; border: 1px solid #ddd; border-top: none;">
                    <p style="color: #333;">
                        The case <strong>${caseData.case_name}</strong> has been created as a draft 
                        because the following information is missing:
                    </p>
                    
                    <ul style="background: #fff; padding: 20px 40px; border-radius: 8px;">
                        ${(caseData.missing_fields || []).map(field => `
                            <li style="color: #dc3545; padding: 5px 0;">${field}</li>
                        `).join('')}
                    </ul>
                    
                    <p style="color: #555;">
                        Please provide these details by sending another voice note or updating 
                        the case directly in Notion.
                    </p>
                </div>
            </div>
        `;
        
        return this.sendEmail({
            to: userContext.email,
            subject,
            html
        });
    }
    
    /**
     * Core email sending function
     * @param {Object} options - Email options
     */
    async sendEmail(options) {
        if (!this.isConfigured) {
            logger.info('Email: Skipping email (not configured)', { to: options.to });
            return { skipped: true, reason: 'Email not configured' };
        }
        
        try {
            const mailOptions = {
                from: this.fromAddress,
                to: options.to,
                subject: options.subject,
                html: options.html,
                text: options.text
            };
            
            const result = await this.transporter.sendMail(mailOptions);
            
            logger.info('Email: Sent successfully', {
                to: options.to,
                messageId: result.messageId
            });
            
            return {
                success: true,
                messageId: result.messageId,
                to: options.to
            };
            
        } catch (error) {
            logger.error('Email: Failed to send', {
                to: options.to,
                error: error.message
            });
            
            // Don't throw - email is non-critical
            return {
                success: false,
                error: error.message,
                to: options.to
            };
        }
    }
}

module.exports = { EmailService };
