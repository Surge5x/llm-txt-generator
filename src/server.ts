import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { google } from 'googleapis';
import { crawlDomain } from './crawler';
import { generateLlmsTxt, improveExistingLlmsTxt, generateLlmsFullTxt } from './llm';
import { createMarkdownArchive } from './archive';
import * as fs from 'fs';

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../client/dist')));

// Serve the output directory for ZIP downloads
app.use('/download', express.static(path.join(__dirname, '../output')));


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

        // Truncate strings to prevent hitting Google Sheets 50,000 character limit per cell
        const MAX_CELL_LENGTH = 49000;
        const truncatedSynthesizedData = synthesizedData.length > MAX_CELL_LENGTH
            ? synthesizedData.substring(0, MAX_CELL_LENGTH) + '...\n\n[TRUNCATED DUE TO GOOGLE SHEETS SIZE LIMIT]'
            : synthesizedData;

        const truncatedLlmsText = llmsText.length > MAX_CELL_LENGTH
            ? llmsText.substring(0, MAX_CELL_LENGTH) + '...\n\n[TRUNCATED DUE TO GOOGLE SHEETS SIZE LIMIT]'
            : llmsText;

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Sheet1!A:E',
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [
                    [dateStr, targetUrl, status, truncatedSynthesizedData, truncatedLlmsText]
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

        // Start streaming the response to prevent proxy/browser timeouts
        res.setHeader('Content-Type', 'application/json');
        res.write('{\n');

        // Send a whitespace character every 10 seconds to keep connection alive
        const keepAliveInterval = setInterval(() => {
            res.write(' ');
        }, 10000);

        // 1. Check for existing llms.txt
        const existingContent = await checkExistingLlmsTxt(url);

        let content = '';
        let filename = 'llms.txt';
        let llmsFullContent = '';
        let llmsFullFilename = '';
        let zipFilename = '';
        let existingLlmsTxtDetected = false;
        let synthesizedDataString = 'N/A - Improved Existing File';

        if (existingContent) {
            console.log('Existing llms.txt found. Improving it...');
            existingLlmsTxtDetected = true;
            const result = await improveExistingLlmsTxt(existingContent, url);
            content = result.content;
            filename = result.filename;

            // We can't generate the full bundle easily without crawling, 
            // but for UX consistency, we could fallback. For now, we skip full bundle if we just improved existing.
        } else {
            // 2. Crawl Domain
            console.log('Starting crawler...');
            // Reduced to 45 to prevent browser timeout on large sites
            const extractedData = await crawlDomain(url, 45);
            synthesizedDataString = JSON.stringify(extractedData);

            // 3. Synthesize using LLM and generate markdown files
            if (extractedData.length === 0) {
                clearInterval(keepAliveInterval);
                res.write(`"error": "Did not find any pages on that domain to crawl."\n}`);
                return res.end();
            }
            console.log(`Crawler finished. Submitting ${extractedData.length} pages to Gemini and formatting markdown.`);

            const [llmsResult, fullResult] = await Promise.all([
                generateLlmsTxt(extractedData, url),
                generateLlmsFullTxt(extractedData, url)
            ]);

            content = llmsResult.content;
            filename = llmsResult.filename;
            llmsFullContent = fullResult.content;
            llmsFullFilename = fullResult.filename;

            // Extract company name for archive
            let companyName = 'website';
            try {
                const parsedUrl = new URL(url);
                companyName = parsedUrl.host.replace(/^www\./, '').split('.')[0];
            } catch (e) { }

            // Generate ZIP Archive
            console.log('Generating ZIP archive...');
            zipFilename = await createMarkdownArchive(fullResult.pages, content, llmsFullContent, companyName);
        }

        // Fire-and-forget logging to Google Sheets
        const status = existingLlmsTxtDetected ? 'Improved Existing' : 'Newly Generated';
        appendRowToSheet(url, status, synthesizedDataString, content).catch(console.error);

        clearInterval(keepAliveInterval);

        // Complete the JSON object
        const zipUrlString = zipFilename ? `/download/${zipFilename}` : null;
        res.write(`"success": true, "filename": ${JSON.stringify(filename)}, "content": ${JSON.stringify(content)}, "existingLlmsTxtDetected": ${existingLlmsTxtDetected}, "llmsFullContent": ${JSON.stringify(llmsFullContent)}, "llmsFullFilename": ${JSON.stringify(llmsFullFilename)}, "zipDownloadUrl": ${JSON.stringify(zipUrlString)}\n}`);
        res.end();
    } catch (error: any) {
        console.error('Error during analysis API call:', error);

        // We already sent the opening `{`, so we append the error and close it
        res.write(`"error": ${JSON.stringify(error.message || 'An internal error occurred')}\n}`);
        res.end();
    }
});

// Catch-all route to serve the React frontend for non-API requests
app.use((req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, async () => {
    console.log(`Express server running on http://localhost:${PORT}`);
    await initializeSheetHeaders();
});

// Increase Node.js timeouts to prevent dropping long-running crawler connections
server.setTimeout(600000); // 10 minutes
server.keepAliveTimeout = 600000;
server.headersTimeout = 600000;
