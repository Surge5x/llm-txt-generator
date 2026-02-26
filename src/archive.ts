import archiver from 'archiver';
import * as fs from 'fs';
import * as path from 'path';
import { MarkdownPage } from './llm';

export async function createMarkdownArchive(
    pages: MarkdownPage[],
    llmsTxt: string,
    llmsFullTxt: string,
    companyName: string
): Promise<string> {
    return new Promise((resolve, reject) => {
        const outputDir = path.join(__dirname, '../output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const archiveName = `${companyName}_agent_bundle.zip`;
        const outputPath = path.join(outputDir, archiveName);

        const output = fs.createWriteStream(outputPath);
        const archive = archiver('zip', {
            zlib: { level: 9 } // Sets the compression level.
        });

        output.on('close', () => {
            console.log(`Archive created successfully: ${archive.pointer()} total bytes`);
            resolve(archiveName);
        });

        archive.on('error', (err) => {
            console.error('Error creating archive:', err);
            reject(err);
        });

        archive.pipe(output);

        // Add llms.txt at the root
        archive.append(llmsTxt, { name: 'llms.txt' });

        // Add llms-full.txt at the root
        archive.append(llmsFullTxt, { name: `${companyName}_llms-full.txt` });

        // Add all individual pages inside a 'pages' directory
        pages.forEach(page => {
            archive.append(page.content, { name: `pages/${page.filename}` });
        });

        archive.finalize();
    });
}
