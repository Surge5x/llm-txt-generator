import { crawlDomain, ExtractedData } from './crawler';
import { generateLlmsTxt } from './llm';
import * as fs from 'fs';
import * as path from 'path';

async function checkExistingLlmsTxt(startUrl: string): Promise<boolean> {
    const parsed = new URL(startUrl);
    const llmsUrl = `${parsed.protocol}//${parsed.host}/llms.txt`;
    console.log(`Checking if ${llmsUrl} exists...`);
    try {
        const response = await fetch(llmsUrl);
        if (response.ok) {
            console.log(`Found existing llms.txt at ${llmsUrl}`);
            return true;
        }
    } catch (e) {
        // Ignore fetch errors (e.g. network issues)
    }
    console.log(`No llms.txt found at ${llmsUrl}`);
    return false;
}

async function main() {
    const targetUrl = process.argv[2];
    if (!targetUrl) {
        console.error('Please provide a URL to analyze.');
        console.error('Usage: npx ts-node src/index.ts <url>');
        process.exit(1);
    }

    try {
        // 1. Check for existing llms.txt
        const hasLlmsTxt = await checkExistingLlmsTxt(targetUrl);
        if (hasLlmsTxt) {
            console.log('An llms.txt already exists for this domain. We will still proceed to generate a new optimized one, or you can abort.');
        }

        // 2. Run the crawler (max 100 pages per requirements)
        console.log(`\n--- Starting Web Crawl for ${targetUrl} ---`);
        const extractedData = await crawlDomain(targetUrl, 100);

        // 3. Save extracted data to storage layer (local JSON for now)
        const outputDir = path.join(__dirname, '../output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const rawOutputFile = path.join(outputDir, 'extracted_data.json');
        fs.writeFileSync(rawOutputFile, JSON.stringify(extractedData, null, 2));
        console.log(`\nSaved extracted data for ${extractedData.length} pages to ${rawOutputFile}`);

        // 4. Generate llms.txt using LLM
        console.log('\n--- LLM Synthesis Step ---');
        console.log('Sending extracted data to Gemini to evaluate and synthesize...');
        const result = await generateLlmsTxt(extractedData, targetUrl);
        console.log('\n--- Final Output Preview ---');
        console.log(result.content.substring(0, 500) + '...\n(See full output in output/' + result.filename + ')');

    } catch (error) {
        console.error('An error occurred during analysis:', error);
        process.exit(1);
    }
}

main();
