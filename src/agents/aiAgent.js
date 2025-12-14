/**
 * ============================================
 * AI AGENT - THE BRAIN (FREE VERSION)
 * AUTO-FALLBACK between multiple FREE AI providers
 * ============================================
 * 
 * SUPPORTED FREE PROVIDERS (auto-fallback):
 * 1. Groq (Llama 3.3 70B) - 14,400 req/day FREE
 * 2. Google Gemini - 1,500 req/day FREE  
 * 3. Hugging Face - Unlimited FREE (slower)
 * 4. Together AI - 60 req/min FREE
 * 
 * If one provider hits rate limit, automatically tries next!
 * 
 * Get FREE API keys from:
 * - Groq: https://console.groq.com/keys
 * - Gemini: https://aistudio.google.com/app/apikey
 * - Together: https://api.together.xyz/settings/api-keys
 * ============================================
 */

const { config } = require('../config');
const { logger } = require('../utils/logger');
const { AIProcessingError } = require('../utils/errors');

/**
 * Provider priority order - will try each in sequence
 * Configured providers are tried first, then fallbacks
 */
const PROVIDER_ORDER = ['groq', 'gemini', 'together', 'huggingface'];

/**
 * Check if error is a rate limit error
 */
function isRateLimitError(error) {
    const msg = error.message?.toLowerCase() || '';
    return msg.includes('rate') || 
           msg.includes('quota') || 
           msg.includes('limit') || 
           msg.includes('429') ||
           msg.includes('exceeded') ||
           msg.includes('too many');
}

/**
 * Call Groq API (FREE - Llama 3.3 70B) - RECOMMENDED
 * 14,400 requests/day FREE, 30 requests/min
 */
async function callGroqAPI(prompt, systemPrompt) {
    const apiKey = config.groq?.apiKey || process.env.GROQ_API_KEY;
    
    if (!apiKey) {
        throw new AIProcessingError('NO_API_KEY: Groq');
    }
    
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
            ],
            temperature: 0,
            max_tokens: 4096,
            response_format: { type: 'json_object' }
        })
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new AIProcessingError(`Groq API error: ${error}`);
    }
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content;
}

/**
 * Call Google Gemini API (FREE - backup)
 */
async function callGeminiAPI(prompt, systemPrompt) {
    const apiKey = config.gemini?.apiKey || process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
        throw new AIProcessingError('GEMINI_API_KEY not configured. Get free key from https://aistudio.google.com/app/apikey');
    }
    
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: `${systemPrompt}\n\n${prompt}` }]
                }],
                generationConfig: {
                    temperature: 0,
                    topK: 1,
                    topP: 1,
                    maxOutputTokens: 4096
                }
            })
        }
    );
    
    if (!response.ok) {
        const error = await response.text();
        throw new AIProcessingError(`Gemini API error: ${error}`);
    }
    
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
        throw new AIProcessingError('No response from Gemini API');
    }
    
    return text;
}

/**
 * Call Hugging Face Inference API (FREE - Unlimited but slower)
 */
async function callHuggingFaceAPI(prompt, systemPrompt) {
    const apiKey = process.env.HUGGINGFACE_API_KEY;
    
    if (!apiKey) {
        throw new AIProcessingError('NO_API_KEY: HuggingFace');
    }
    
    const response = await fetch(
        'https://api-inference.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                inputs: `<s>[INST] ${systemPrompt}\n\n${prompt} [/INST]`,
                parameters: {
                    max_new_tokens: 4096,
                    temperature: 0.1,
                    return_full_text: false
                }
            })
        }
    );
    
    if (!response.ok) {
        const error = await response.text();
        throw new AIProcessingError(`HuggingFace API error: ${error}`);
    }
    
    const data = await response.json();
    return data[0]?.generated_text || '';
}

/**
 * Call Together AI API (FREE - 60 req/min)
 * Get key from: https://api.together.xyz/settings/api-keys
 */
async function callTogetherAPI(prompt, systemPrompt) {
    const apiKey = process.env.TOGETHER_API_KEY;
    
    if (!apiKey) {
        throw new AIProcessingError('NO_API_KEY: Together');
    }
    
    const response = await fetch('https://api.together.xyz/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
            ],
            temperature: 0,
            max_tokens: 4096
        })
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new AIProcessingError(`Together API error: ${error}`);
    }
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
}

/**
 * Call a specific provider
 */
async function callProvider(provider, prompt, systemPrompt) {
    switch (provider) {
        case 'groq':
            return await callGroqAPI(prompt, systemPrompt);
        case 'gemini':
            return await callGeminiAPI(prompt, systemPrompt);
        case 'together':
            return await callTogetherAPI(prompt, systemPrompt);
        case 'huggingface':
        case 'hf':
            return await callHuggingFaceAPI(prompt, systemPrompt);
        default:
            throw new AIProcessingError(`Unknown provider: ${provider}`);
    }
}

/**
 * Universal AI call function with AUTO-FALLBACK
 * Tries each provider in order until one succeeds
 */
async function callAI(prompt, systemPrompt) {
    const errors = [];
    
    // Build provider order: configured provider first, then others
    const primaryProvider = (process.env.AI_PROVIDER || 'groq').toLowerCase();
    const providerOrder = [primaryProvider, ...PROVIDER_ORDER.filter(p => p !== primaryProvider)];
    
    for (const provider of providerOrder) {
        try {
            logger.info(`AI Agent: Trying provider: ${provider}`);
            const result = await callProvider(provider, prompt, systemPrompt);
            logger.info(`AI Agent: Success with provider: ${provider}`);
            return result;
        } catch (error) {
            const errorMsg = error.message || String(error);
            
            // Skip if no API key configured
            if (errorMsg.includes('NO_API_KEY')) {
                logger.debug(`AI Agent: ${provider} - no API key, skipping`);
                continue;
            }
            
            // Log the error
            logger.warn(`AI Agent: ${provider} failed: ${errorMsg}`);
            errors.push({ provider, error: errorMsg });
            
            // If rate limited, try next provider
            if (isRateLimitError(error)) {
                logger.info(`AI Agent: ${provider} rate limited, trying next provider...`);
                continue;
            }
            
            // For other errors, also try next provider
            continue;
        }
    }
    
    // All providers failed
    const errorSummary = errors.map(e => `${e.provider}: ${e.error}`).join('; ');
    throw new AIProcessingError(
        `All AI providers failed. Please add at least one API key to .env:\n` +
        `- GROQ_API_KEY from https://console.groq.com/keys\n` +
        `- GEMINI_API_KEY from https://aistudio.google.com/app/apikey\n` +
        `- TOGETHER_API_KEY from https://api.together.xyz/settings/api-keys\n\n` +
        `Errors: ${errorSummary}`
    );
}

/**
 * System prompt for the AI Agent
 */
const getSystemPrompt = (userContext) => `
You are an Intelligent Legal Case Manager AI. Analyze voice notes from lawyers and extract structured case information.

## USER CONTEXT
- Name: ${userContext.name}
- Role: ${userContext.role}
- Has Junior Assigned: ${userContext.junior_email ? 'Yes (' + userContext.junior_name + ')' : 'No'}

## EXTRACTION RULES

### Case Name Generation:
- ALWAYS generate a case_name from the context
- Format: "[Client Name] [Case Type]" (e.g., "Vikram Malhotra Employment Dispute")
- If client name is unknown: "[Description] Case" (e.g., "Property Dispute Case")
- NEVER return null for case_name - always infer something meaningful

### Intent Classification (use semantic understanding):

**UPDATE_EXISTING** - Use when:
- User mentions an existing case by name/number (e.g., "Meera Reddy case", "property dispute case", "CASE-2025-XXX")
- Words like: update, outcome, hearing, judge said, adjourned, bail, verdict, postponed, ruling
- Updates about ongoing matters
- IMPORTANT: For lookup_key, use ONLY the client name (e.g., "Arun Mehta") OR case number (e.g., "CTR-2025-001") - NOT the full case name
- PRIORITY: If case number is mentioned, use case number. Otherwise use client name only.

**CREATE_NEW** - Use when:
- User mentions onboarding a NEW client (words like "new client", "new case", "signed retainer")
- Words like: new case, hired, signed, retainer, new client, new matter
- Introduction of new client relationship

**CLARIFICATION_NEEDED** - Use when:
- Intent is ambiguous
- Cannot determine if new or existing

### Field Extraction:
1. **lookup_key**: CRITICAL - For UPDATE_EXISTING, use ONLY:
   - Case number if mentioned (e.g., "CTR-2025-001", "PROP-2025-002")
   - OR Client name only (e.g., "Arun Mehta", "Priya Sharma")
   - DO NOT include case type/description in lookup_key (wrong: "Arun Mehta Contract Breach", correct: "Arun Mehta")
2. **case_number**: Extract if explicitly mentioned (e.g., CTR-2025-001, EMP-2025-003)
3. **client_name**: Extract the client's name (e.g., "Arun Mehta", "Priya Sharma")
4. **Case Name**: Full case name for display (e.g., "Arun Mehta Contract Breach")
5. **Case Summary**: Write a brief description of what the case is about
6. **Client Email**: Only extract if explicitly mentioned. NEVER guess.
7. **Documents Needed**: Extract if court requested documents
8. **Next Hearing Date**: Parse dates like "next Tuesday", "January 15th", "12/12/2025"
9. **Next Hearing Time**: Extract time if mentioned (e.g., "10:30 AM", "2 PM", "14:00"). Use 24-hour format like "10:30" or "14:00". If no time mentioned, leave null.
10. **Status**: FINALIZED, CONTINUING, DRAFT, ACTIVE

### Missing Fields:
For NEW cases, required fields are: case_name, client_name, client_email
If missing, add to missing_fields array.

### Junior Assignment:
${userContext.role === 'SENIOR' ? 
'- You may assign cases to juniors if user mentions delegating' :
'- You are JUNIOR - always set assign_to_junior=false'}

## RESPONSE FORMAT (STRICT JSON)
You MUST respond with ONLY this JSON structure:
{
    "cases": [
        {
            "action_type": "UPDATE_EXISTING" | "CREATE_NEW" | "CLARIFICATION_NEEDED",
            "confidence": "HIGH" | "MEDIUM" | "LOW",
            "lookup_key": "string or null",
            "case_name": "string or null",
            "case_number": "string or null",
            "case_summary": "string or null",
            "client_name": "string or null",
            "client_email": "string or null",
            "junior_name": "string or null",
            "junior_email": "string or null",
            "outcome": "string or null",
            "status": "CONTINUING" | "FINALIZED" | "DRAFT" | "ACTIVE" | null,
            "next_hearing_date": "ISO date string or null",
            "next_hearing_time": "24-hour time string like 09:00, 14:30, or null if not mentioned",
            "documents_needed": ["array of strings"],
            "assign_to_junior": false,
            "send_client_email": false,
            "missing_fields": ["array of strings"],
            "raw_notes": "string or null"
        }
    ],
    "overall_summary": "Brief summary of all actions",
    "requires_clarification": false,
    "clarification_message": "string or null"
}

## IMPORTANT RULES
1. NEVER hallucinate information not in the input
2. Set confidence to LOW if uncertain
3. Extract multiple cases separately
4. Return ONLY valid JSON, no other text
`;

/**
 * Extract case information from voice note text
 * @param {string} transcription - Voice note transcription
 * @param {Object} userContext - User context from auth
 * @returns {Object} Extracted case information
 */
const extractCaseInformation = async (transcription, userContext) => {
    logger.info('AI Agent: Starting case extraction', {
        userId: userContext.id,
        transcriptionLength: transcription.length,
        provider: process.env.AI_PROVIDER || 'auto-fallback'
    });
    
    try {
        const systemPrompt = getSystemPrompt(userContext);
        const userPrompt = `Analyze this voice note and extract all case information:\n\n"${transcription}"`;
        
        const responseText = await callAI(userPrompt, systemPrompt);
        
        // Clean response - remove markdown code blocks if present
        let cleanedResponse = responseText.trim();
        if (cleanedResponse.startsWith('```json')) {
            cleanedResponse = cleanedResponse.slice(7);
        }
        if (cleanedResponse.startsWith('```')) {
            cleanedResponse = cleanedResponse.slice(3);
        }
        if (cleanedResponse.endsWith('```')) {
            cleanedResponse = cleanedResponse.slice(0, -3);
        }
        
        const result = JSON.parse(cleanedResponse);
        
        logger.info('AI Agent: Extraction complete', {
            casesFound: result.cases?.length || 0,
            requiresClarification: result.requires_clarification
        });
        
        // Post-process: Apply role constraints
        if (result.cases) {
            result.cases = result.cases.map(caseData => {
                if (userContext.role === 'JUNIOR') {
                    caseData.assign_to_junior = false;
                    caseData.junior_name = null;
                    caseData.junior_email = null;
                } else {
                    // For SENIOR: If junior_email is present, set assign_to_junior true
                    if (caseData.junior_email && caseData.junior_email.trim() !== '') {
                        caseData.assign_to_junior = true;
                    }
                }
                // Ensure arrays exist
                caseData.documents_needed = caseData.documents_needed || [];
                caseData.missing_fields = caseData.missing_fields || [];
                return caseData;
            });
        }
        
        return result;
        
    } catch (error) {
        logger.error('AI Agent: Extraction failed', { error: error.message });
        throw new AIProcessingError(`Failed to extract case information: ${error.message}`);
    }
};

/**
 * Transcribe audio using free speech-to-text
 * For hackathon: SpeakSpace already sends transcribed text
 * This is a fallback using AssemblyAI free tier
 */
const transcribeAudio = async (audioFilePath) => {
    logger.info('AI Agent: Audio transcription requested', { audioFilePath });
    
    // Option 1: Use AssemblyAI free tier (5 hours/month free)
    const assemblyKey = process.env.ASSEMBLYAI_API_KEY;
    
    if (assemblyKey) {
        try {
            const fs = require('fs');
            const audioData = fs.readFileSync(audioFilePath);
            
            // Upload file
            const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
                method: 'POST',
                headers: { 'Authorization': assemblyKey },
                body: audioData
            });
            const { upload_url } = await uploadResponse.json();
            
            // Request transcription
            const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
                method: 'POST',
                headers: {
                    'Authorization': assemblyKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ audio_url: upload_url })
            });
            const { id } = await transcriptResponse.json();
            
            // Poll for result
            let result;
            while (true) {
                const pollResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
                    headers: { 'Authorization': assemblyKey }
                });
                result = await pollResponse.json();
                
                if (result.status === 'completed') {
                    return result.text;
                } else if (result.status === 'error') {
                    throw new Error(result.error);
                }
                
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            logger.error('AI Agent: AssemblyAI transcription failed', { error: error.message });
        }
    }
    
    // Fallback: Return placeholder (SpeakSpace sends text anyway)
    logger.warn('AI Agent: No audio transcription service configured. SpeakSpace should send text directly.');
    throw new AIProcessingError(
        'Audio transcription requires ASSEMBLYAI_API_KEY (free tier: 5 hours/month). ' +
        'For hackathon, SpeakSpace sends transcribed text, so this is not needed.'
    );
};

/**
 * Generate a case summary from details
 */
const generateCaseSummary = async (caseData) => {
    try {
        const prompt = `Generate a brief, professional legal case summary (2-3 sentences) for:
Case Name: ${caseData.case_name}
Client: ${caseData.client_name}
Details: ${caseData.raw_notes || 'No additional details'}

Return ONLY the summary text, no JSON.`;
        
        const systemPrompt = 'You are a legal assistant. Generate concise, professional case summaries.';
        
        const summary = await callAI(prompt, systemPrompt);
        return summary.trim();
        
    } catch (error) {
        logger.error('AI Agent: Summary generation failed', { error: error.message });
        return caseData.case_summary || 'Case summary pending.';
    }
};

/**
 * Validate extracted data for completeness
 */
const validateExtractedData = (caseData) => {
    const issues = [];
    
    if (caseData.action_type === 'CREATE_NEW') {
        if (!caseData.case_name) issues.push('Case name is required');
        if (!caseData.client_name) issues.push('Client name is required');
        if (!caseData.client_email) issues.push('Client email is required');
    }
    
    if (caseData.action_type === 'UPDATE_EXISTING') {
        // Allow lookup by case name OR case number OR lookup_key
        if (!caseData.lookup_key && !caseData.case_name && !caseData.case_number) {
            issues.push('Case identifier is required for updates (case name, number, or lookup key)');
        }
        // If no lookup_key but has case_name, use case_name as lookup_key
        if (!caseData.lookup_key && caseData.case_name) {
            caseData.lookup_key = caseData.case_name;
        }
    }
    
    if (caseData.client_email && !isValidEmail(caseData.client_email)) {
        issues.push('Invalid client email format');
    }
    
    return {
        isValid: issues.length === 0,
        issues: issues
    };
};

const isValidEmail = (email) => /^[\w.-]+@[\w.-]+\.\w+$/i.test(email);

module.exports = {
    extractCaseInformation,
    transcribeAudio,
    generateCaseSummary,
    validateExtractedData
};
