import { GoogleGenAI } from '@google/genai';
import { ExtractedData } from './crawler';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

export async function generateLlmsTxt(extractedData: ExtractedData[], websiteUrl: string): Promise<{ content: string, filename: string }> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is missing in the environment or .env file.");
    }

    const ai = new GoogleGenAI({ apiKey });

    // Prepare the data payload (we strip out massive bodies if we are hitting token limits, but 1-2M is fine)
    const dataString = JSON.stringify(extractedData, null, 2);

    const prompt = `
You are an expert technical writer and AI optimization specialist.
Your task is to take the following raw scraped data from the website ${websiteUrl} and synthesize an \`llms.txt\` file.

CRITICAL RULES FOR llms.txt:
1. Start with a single H1 Title (#) which is the name of the website or project.
2. Immediately follow with a Blockquote Summary (>) of 1-2 sentences stating factually what the business does.
3. Use H2 Categories (##) to organize links logically (e.g. ## Products, ## Documentation, ## Company).
4. Use Annotated Links (standard bullet point followed by link, colon, and factual description):
   - [Page Name](https://full.url): Description.
5. Provide a ## Optional section for secondary content (e.g., Blog or non-core feature pages).
6. ZERO MARKETING FLUFF: Strip out buzzwords, sales copy, and abstract claims. Be direct and factual.
7. CURATION OVER QUANTITY: Do not list all provided links. Curate the most valuable, evergreen content (Core products, APIs, Docs, Pricing, About). Keep the output small (under 10KB).

RAW SCRAPED DATA:
${dataString}

OUTPUT EXPECTATION:
Output only the raw markdown content for the \`llms.txt\` file and nothing else (no conversational filler, no markdown codeblocks wrapping the entire output, just the raw text starting with #).
`;

    console.log('Calling out to Gemini to synthesize llms.txt...');
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });

    let text = response.text || '';

    // Sometimes the model outputs a markdown codeblock despite being told not to
    if (text.startsWith('\`\`\`markdown')) {
        text = text.replace(/^\`\`\`markdown\n/i, '').replace(/\n\`\`\`$/, '');
    } else if (text.startsWith('\`\`\`')) {
        text = text.replace(/^\`\`\`\n/i, '').replace(/\n\`\`\`$/, '');
    }

    let filename = 'llms.txt';
    const h1Match = text.match(/^#\s+(.+)$/m);
    if (h1Match && h1Match[1]) {
        // Sanitize the filename
        const companyName = h1Match[1].replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');
        filename = `${companyName}_llms.txt`;
    }

    // Save final output
    const outputDir = path.join(__dirname, '../output');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    const outputFile = path.join(outputDir, filename);
    fs.writeFileSync(outputFile, text.trim());
    console.log(`Successfully generated ${filename} at ${outputFile}`);

    return { content: text.trim(), filename };
}

export async function improveExistingLlmsTxt(existingContent: string, websiteUrl: string): Promise<{ content: string, filename: string }> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is missing in the environment or .env file.");
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
You are an expert technical writer and AI optimization specialist.
Your task is to take the following existing \`llms.txt\` file from the website ${websiteUrl} and improve its formatting and content to strictly adhere to our optimal \`llms.txt\` standards.

CRITICAL RULES FOR llms.txt:
1. Start with a single H1 Title (#) which is the name of the website or project.
2. Immediately follow with a Blockquote Summary (>) of 1-2 sentences stating factually what the business does.
3. Use H2 Categories (##) to organize links logically (e.g. ## Products, ## Documentation, ## Company).
4. Use Annotated Links (standard bullet point followed by link, colon, and factual description):
   - [Page Name](https://full.url): Description.
5. Provide a ## Optional section for secondary content (e.g., Blog or non-core feature pages).
6. ZERO MARKETING FLUFF: Strip out buzzwords, sales copy, and abstract claims. Be direct and factual.
7. CURATION OVER QUANTITY: Ensure the links are highly valuable. Keep the output small (under 10KB).

EXISTING llms.txt CONTENT:
${existingContent}

OUTPUT EXPECTATION:
Output only the raw markdown content for the improved \`llms.txt\` file and nothing else (no conversational filler, no markdown codeblocks wrapping the entire output, just the raw text starting with #).
`;

    console.log('Calling out to Gemini to improve existing llms.txt...');
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });

    let text = response.text || '';

    // Sometimes the model outputs a markdown codeblock despite being told not to
    if (text.startsWith('\`\`\`markdown')) {
        text = text.replace(/^\`\`\`markdown\n/i, '').replace(/\n\`\`\`$/, '');
    } else if (text.startsWith('\`\`\`')) {
        text = text.replace(/^\`\`\`\n/i, '').replace(/\n\`\`\`$/, '');
    }

    let filename = 'llms.txt';
    const h1Match = text.match(/^#\s+(.+)$/m);
    if (h1Match && h1Match[1]) {
        // Sanitize the filename
        const companyName = h1Match[1].replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');
        filename = `${companyName}_llms.txt`;
    }

    return { content: text.trim(), filename };
}

