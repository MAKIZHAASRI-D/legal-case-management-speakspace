/**
 * ============================================
 * OAUTH SERVICE - Multi-User Authorization
 * Handles OAuth for Notion, Google, and Email
 * Each user connects their OWN accounts
 * ============================================
 */

const { google } = require('googleapis');
const { logger } = require('../utils/logger');
const { config } = require('../config');

/**
 * User Tokens Storage
 * In production, store this in a database (MongoDB, PostgreSQL, etc.)
 * For hackathon, we'll use in-memory + file storage
 */
const userTokensStore = new Map();

/**
 * OAuth Service Class
 * Manages per-user OAuth tokens for all services
 */
class OAuthService {
    
    /**
     * Get Google OAuth2 Client for authorization flow
     */
    static getGoogleAuthClient() {
        return new google.auth.OAuth2(
            config.google.clientId,
            config.google.clientSecret,
            config.google.redirectUri
        );
    }
    
    /**
     * Generate Google OAuth URL for a user to connect their account
     * @param {string} userId - The user's ID
     * @returns {string} - Authorization URL
     */
    static getGoogleAuthUrl(userId) {
        const oauth2Client = this.getGoogleAuthClient();
        
        const scopes = [
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/calendar.events',
            'https://www.googleapis.com/auth/gmail.send'  // For sending emails via Gmail
        ];
        
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            state: userId,  // Pass userId to identify user after callback
            prompt: 'consent'  // Force consent to get refresh token
        });
        
        return authUrl;
    }
    
    /**
     * Exchange authorization code for tokens (Google)
     * @param {string} code - Authorization code from Google
     * @param {string} userId - User ID
     */
    static async handleGoogleCallback(code, userId) {
        const oauth2Client = this.getGoogleAuthClient();
        
        try {
            const { tokens } = await oauth2Client.getToken(code);
            
            // Store tokens for this user
            await this.saveUserGoogleTokens(userId, tokens);
            
            logger.info('OAuth: Google tokens saved for user', { userId });
            
            return {
                success: true,
                message: 'Google account connected successfully'
            };
        } catch (error) {
            logger.error('OAuth: Failed to exchange Google code', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Get Notion OAuth URL for a user
     * @param {string} userId - The user's ID
     */
    static getNotionAuthUrl(userId) {
        const clientId = config.notion.oauthClientId;
        const redirectUri = encodeURIComponent(config.notion.oauthRedirectUri || `${config.baseUrl}/api/oauth/notion/callback`);
        
        // Notion OAuth URL
        const authUrl = `https://api.notion.com/v1/oauth/authorize?client_id=${clientId}&response_type=code&owner=user&redirect_uri=${redirectUri}&state=${userId}`;
        
        return authUrl;
    }
    
    /**
     * Exchange Notion authorization code for access token
     * @param {string} code - Authorization code from Notion
     * @param {string} userId - User ID
     */
    static async handleNotionCallback(code, userId) {
        const clientId = config.notion.oauthClientId;
        const clientSecret = config.notion.oauthClientSecret;
        const redirectUri = config.notion.oauthRedirectUri;
        
        try {
            const response = await fetch('https://api.notion.com/v1/oauth/token', {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: redirectUri
                })
            });
            
            const data = await response.json();
            
            if (data.access_token) {
                await this.saveUserNotionTokens(userId, {
                    accessToken: data.access_token,
                    workspaceId: data.workspace_id,
                    workspaceName: data.workspace_name,
                    botId: data.bot_id
                });
                
                logger.info('OAuth: Notion tokens saved for user', { 
                    userId, 
                    workspaceName: data.workspace_name 
                });
                
                return {
                    success: true,
                    message: `Connected to Notion workspace: ${data.workspace_name}`
                };
            } else {
                throw new Error(data.error || 'Failed to get Notion access token');
            }
        } catch (error) {
            logger.error('OAuth: Failed to exchange Notion code', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Save Google tokens for a user
     */
    static async saveUserGoogleTokens(userId, tokens) {
        let userTokens = userTokensStore.get(userId) || {};
        userTokens.google = {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiryDate: tokens.expiry_date,
            tokenType: tokens.token_type
        };
        userTokensStore.set(userId, userTokens);
        
        // In production, save to database
        await this.persistTokens(userId, userTokens);
    }
    
    /**
     * Save Notion tokens for a user
     */
    static async saveUserNotionTokens(userId, tokens) {
        let userTokens = userTokensStore.get(userId) || {};
        userTokens.notion = tokens;
        userTokensStore.set(userId, userTokens);
        
        await this.persistTokens(userId, userTokens);
    }
    
    /**
     * Save email configuration for a user
     */
    static async saveUserEmailConfig(userId, emailConfig) {
        let userTokens = userTokensStore.get(userId) || {};
        userTokens.email = emailConfig;
        userTokensStore.set(userId, userTokens);
        
        await this.persistTokens(userId, userTokens);
    }
    
    /**
     * Get user's Google OAuth client with their tokens
     */
    static async getUserGoogleClient(userId) {
        const userTokens = await this.getUserTokens(userId);
        
        if (!userTokens?.google) {
            return null;
        }
        
        const oauth2Client = this.getGoogleAuthClient();
        oauth2Client.setCredentials({
            access_token: userTokens.google.accessToken,
            refresh_token: userTokens.google.refreshToken,
            expiry_date: userTokens.google.expiryDate
        });
        
        // Handle token refresh
        oauth2Client.on('tokens', async (tokens) => {
            if (tokens.refresh_token) {
                userTokens.google.refreshToken = tokens.refresh_token;
            }
            userTokens.google.accessToken = tokens.access_token;
            userTokens.google.expiryDate = tokens.expiry_date;
            await this.saveUserGoogleTokens(userId, userTokens.google);
        });
        
        return oauth2Client;
    }
    
    /**
     * Get user's Notion client
     */
    static async getUserNotionClient(userId) {
        const { Client } = require('@notionhq/client');
        const userTokens = await this.getUserTokens(userId);
        
        if (!userTokens?.notion?.accessToken) {
            return null;
        }
        
        return new Client({
            auth: userTokens.notion.accessToken
        });
    }
    
    /**
     * Get user's email transporter (using Gmail API or SMTP)
     */
    static async getUserEmailTransporter(userId) {
        const nodemailer = require('nodemailer');
        const userTokens = await this.getUserTokens(userId);
        
        // Option 1: Use Gmail API with OAuth (recommended)
        if (userTokens?.google?.accessToken) {
            const oauth2Client = await this.getUserGoogleClient(userId);
            
            return nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    type: 'OAuth2',
                    user: userTokens.email?.address || userTokens.google?.email,
                    clientId: config.google.clientId,
                    clientSecret: config.google.clientSecret,
                    refreshToken: userTokens.google.refreshToken,
                    accessToken: userTokens.google.accessToken
                }
            });
        }
        
        // Option 2: Use custom SMTP settings
        if (userTokens?.email?.smtp) {
            return nodemailer.createTransport({
                host: userTokens.email.smtp.host,
                port: userTokens.email.smtp.port,
                secure: userTokens.email.smtp.secure,
                auth: {
                    user: userTokens.email.smtp.user,
                    pass: userTokens.email.smtp.pass
                }
            });
        }
        
        return null;
    }
    
    /**
     * Get all tokens for a user
     */
    static async getUserTokens(userId) {
        // Check in-memory cache first
        if (userTokensStore.has(userId)) {
            return userTokensStore.get(userId);
        }
        
        // Load from persistent storage
        return await this.loadTokens(userId);
    }
    
    /**
     * Check what services a user has connected
     */
    static async getUserConnectedServices(userId) {
        const tokens = await this.getUserTokens(userId);
        
        return {
            notion: !!tokens?.notion?.accessToken,
            google: !!tokens?.google?.refreshToken,
            email: !!tokens?.email || !!tokens?.google?.refreshToken,
            notionWorkspace: tokens?.notion?.workspaceName || null
        };
    }
    
    /**
     * Persist tokens to storage (file/database)
     * In production, use a proper database
     */
    static async persistTokens(userId, tokens) {
        const fs = require('fs').promises;
        const path = require('path');
        
        const tokensDir = path.join(__dirname, '../../data/tokens');
        const tokenFile = path.join(tokensDir, `${userId}.json`);
        
        try {
            await fs.mkdir(tokensDir, { recursive: true });
            await fs.writeFile(tokenFile, JSON.stringify(tokens, null, 2));
        } catch (error) {
            logger.error('OAuth: Failed to persist tokens', { userId, error: error.message });
        }
    }
    
    /**
     * Load tokens from storage
     */
    static async loadTokens(userId) {
        const fs = require('fs').promises;
        const path = require('path');
        
        const tokenFile = path.join(__dirname, '../../data/tokens', `${userId}.json`);
        
        try {
            const data = await fs.readFile(tokenFile, 'utf8');
            const tokens = JSON.parse(data);
            userTokensStore.set(userId, tokens);
            return tokens;
        } catch (error) {
            return null;
        }
    }
    
    /**
     * Disconnect a service for a user
     */
    static async disconnectService(userId, service) {
        const tokens = await this.getUserTokens(userId) || {};
        delete tokens[service];
        userTokensStore.set(userId, tokens);
        await this.persistTokens(userId, tokens);
        
        return { success: true, message: `${service} disconnected` };
    }
}

module.exports = { OAuthService };
