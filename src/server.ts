import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { google } from 'googleapis';
import { crawlDomain } from './crawler';
import { generateLlmsTxt, improveExistingLlmsTxt } from './llm';

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../client/dist')));

async function checkExistingLlmsTxt(startUrl: string): Promise<string | null> {
    try {
        const parsed = new URL(startUrl);
        const llmsUrl = `${parsed.protocol}//${parsed.host}/llms.txt`;
        console.log(`Checking if ${llmsUrl} exists...`);
        const response = await fetch(llmsUrl);
        if (response.ok) {
            console.log(`Found existing llms.txt at ${llmsUrl}`);
            const text = await response.text();
            return text;
        }
    } catch (e) {
        // Ignore fetch errors (e.g. network issues)
    }
    return null;
}

const SPREADSHEET_ID = '1TTGtV81nwQ1L5sr6CoyaM2x-qSFf9WH5WnhdehgxAAs';

async function initializeSheetHeaders() {
    try {
        const auth = new google.auth.GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const client = await auth.getClient();
        const sheets = google.sheets({ version: 'v4', auth: client as any });

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Sheet1!A1:E1',
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: 'Sheet1!A1:E1',
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: [
                        ['Date', 'URL', 'Status', 'Synthesized Data', 'LLMs.txt Data']
                    ]
                }
            });
            console.log('Successfully initialized Google Sheets headers');
        } else {
            console.log('Google Sheets headers already exist');
        }
    } catch (error) {
        console.error('Failed to initialize Google Sheets headers:', error);
    }
}

// duplicate removed

async function appendRowToSheet(targetUrl: string, status: string, synthesizedData: string, llmsText: string) {
    try {
        const auth = new google.auth.GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const client = await auth.getClient();
        const sheets = google.sheets({ version: 'v4', auth: client as any });

        const dateStr = new Date().toISOString();

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Sheet1!A:E',
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [
                    [dateStr, targetUrl, status, synthesizedData, llmsText]
                ]
            }
        });
        console.log(`Successfully appended row for ${targetUrl} to Google Sheets`);
    } catch (error) {
        console.error('Failed to append row to Google Sheets:', error);
    }
}

app.post('/api/analyze', async (req: Request, res: Response) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        console.log(`Received API request to analyze: ${url}`);

        // 1. Check for existing llms.txt
        const existingContent = await checkExistingLlmsTxt(url);

        let content = '';
        let filename = 'llms.txt';
        let existingLlmsTxtDetected = false;
        let synthesizedDataString = 'N/A - Improved Existing File';

        if (existingContent) {
            console.log('Existing llms.txt found. Improving it...');
            existingLlmsTxtDetected = true;
            const result = await improveExistingLlmsTxt(existingContent, url);
            content = result.content;
            filename = result.filename;
        } else {
            // 2. Crawl Domain
            console.log('Starting crawler...');
            const extractedData = await crawlDomain(url, 100);
            synthesizedDataString = JSON.stringify(extractedData);

            // 3. Synthesize using LLM
            if (extractedData.length === 0) {
                return res.status(400).json({ error: 'Did not find any pages on that domain to crawl.' });
            }
            console.log(`Crawler finished. Submitting ${extractedData.length} pages to Gemini.`);
            const result = await generateLlmsTxt(extractedData, url);
            content = result.content;
            filename = result.filename;
        }

        // Fire-and-forget logging to Google Sheets
        const status = existingLlmsTxtDetected ? 'Improved Existing' : 'Newly Generated';
        appendRowToSheet(url, status, synthesizedDataString, content).catch(console.error);

        res.json({
            success: true,
            filename,
            content,
            existingLlmsTxtDetected
        });
    } catch (error: any) {
        console.error('Error during analysis API call:', error);
        res.status(500).json({ error: error.message || 'An internal error occurred' });
    }
});

// Catch-all route to serve the React frontend for non-API requests
app.use((req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
    console.log(`Express server running on http://localhost:${PORT}`);
    await initializeSheetHeaders();
});
