import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
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

app.post('/api/analyze', async (req: Request, res: Response) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        console.log(`Received API request to analyze: ${url}`);

        // 1. Check for existing llms.txt
        const existingContent = await checkExistingLlmsTxt(url);

        let content, filename;
        let existingLlmsTxtDetected = false;

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

            // 3. Synthesize using LLM
            if (extractedData.length === 0) {
                return res.status(400).json({ error: 'Did not find any pages on that domain to crawl.' });
            }
            console.log(`Crawler finished. Submitting ${extractedData.length} pages to Gemini.`);
            const result = await generateLlmsTxt(extractedData, url);
            content = result.content;
            filename = result.filename;
        }

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
app.listen(PORT, () => {
    console.log(`Express server running on http://localhost:${PORT}`);
});
