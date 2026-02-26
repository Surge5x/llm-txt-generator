import { GoogleGenAI } from '@google/genai';
import { ExtractedData } from './crawler';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

export interface MarkdownPage {
    url: string;
    filename: string;
    content: string;
}

export function formatPageToMarkdown(pageData: ExtractedData): MarkdownPage {
    // Basic sanitization to create a safe filename
    let filename = pageData.url
        .replace(/^https?:\/\//, '') // Remove protocol
        .replace(/[^a-zA-Z0-9.\-_]/g, '_') // Replace invalid chars with underscore
        .replace(/_+/g, '_'); // Replace multiple underscores with a single one

    if (filename.length > 200) {
        filename = filename.substring(0, 200); // Truncate if too long to avoid OS limits
    }

    // Ensure it has a .md extension
    if (!filename.endsWith('.md')) {
        filename += '.md';
    }

    let rawMarkdown = `# ${pageData.title || pageData.url}\n\n`;
    rawMarkdown += `**Source URL:** [${pageData.url}](${pageData.url})\n\n`;

    if (pageData.metaDescription) {
        rawMarkdown += `> ${pageData.metaDescription}\n\n`;
    }

    if (pageData.h1 && pageData.h1.length > 0) {
        rawMarkdown += `## Main Headings\n`;
        pageData.h1.forEach(h => {
            rawMarkdown += `- ${h}\n`;
        });
        rawMarkdown += '\n';
    }

    if (pageData.h2 && pageData.h2.length > 0) {
        rawMarkdown += `## Sub Topics\n`;
        pageData.h2.forEach(h => {
            rawMarkdown += `- ${h}\n`;
        });
        rawMarkdown += '\n';
    }

    rawMarkdown += `## Content\n\n`;

    // Attempt some highly basic visual formatting for the extracted text (as the crawler currently just does space separated text). 
    // This isn't perfect, but without hitting an LLM per page (which is slow/expensive), we do basic block separation.
    // E.g., splitting by common punctuation combinations or ensuring sentences aren't one massive block.
    // For a more robust production version, Turndown.js run inside the crawler page context is best.
    const blocks = pageData.bodyText.split(/\.([A-Z])/).reduce<{ sentences: string[], currentBlock: string }>((acc, val, i, arr) => {
        if (i % 2 === 0 && i !== arr.length - 1) {
            acc.currentBlock += val + '.';
        } else if (i % 2 !== 0) {
            acc.currentBlock += val;
            // Arbitrary block length split
            if (acc.currentBlock.length > 300) {
                acc.sentences.push(acc.currentBlock.trim());
                acc.currentBlock = '';
            }
        } else {
            acc.currentBlock += val;
            if (acc.currentBlock.trim() !== '') {
                acc.sentences.push(acc.currentBlock.trim());
            }
        }
        return acc;
    }, { sentences: [], currentBlock: '' });

    if (blocks.sentences.length > 0) {
        rawMarkdown += blocks.sentences.join('\n\n');
    } else {
        rawMarkdown += pageData.bodyText;
    }

    return {
        url: pageData.url,
        filename,
        content: rawMarkdown.trim()
    };
}

export async function generateLlmsFullTxt(extractedData: ExtractedData[], websiteUrl: string): Promise<{ content: string, filename: string, pages: MarkdownPage[] }> {
    console.log(`Formatting ${extractedData.length} pages into markdown for llms-full.txt...`);

    const pages = extractedData.map(page => formatPageToMarkdown(page));

    // Construct the massive llms-full.txt
    let fullText = `# Full Documentation & Content for ${websiteUrl}\n\n`;
    fullText += `> This file contains the concatenated markdown representation of all key pages from the site.\n\n`;
    fullText += `---\n\n`;

    pages.forEach(page => {
        fullText += page.content;
        fullText += `\n\n---\n\n`;
    });

    let filename = 'llms-full.txt';
    try {
        const parsed = new URL(websiteUrl);
        const host = parsed.host.replace(/^www\./, '');
        const companyName = host.split('.')[0];
        if (companyName) {
            filename = `${companyName}_llms-full.txt`;
        }
    } catch (e) {
        // fallback
    }

    // Save final output for testing/debugging
    const outputDir = path.join(__dirname, '../output');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    const outputFile = path.join(outputDir, filename);
    fs.writeFileSync(outputFile, fullText.trim());
    console.log(`Successfully generated ${filename}`);

    return { content: fullText.trim(), filename, pages };
}

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

