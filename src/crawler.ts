import { PlaywrightCrawler, log, RequestQueue } from 'crawlee';

export interface ExtractedData {
    url: string;
    title: string;
    metaDescription: string;
    h1: string[];
    h2: string[];
    bodyText: string;
}

export async function crawlDomain(startUrl: string, maxPages: number = 100): Promise<ExtractedData[]> {
    const extractedData: ExtractedData[] = [];

    // Ensure the URL is valid
    let parsedUrl: URL;
    try {
        parsedUrl = new URL(startUrl);
    } catch (e) {
        throw new Error(`Invalid URL provided: ${startUrl}`);
    }

    // Create a unique, isolated request queue for this specific crawl.
    // This prevents Crawlee from skipping URLs it has seen in past API requests.
    const queueName = `queue-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const requestQueue = await RequestQueue.open(queueName);

    const crawler = new PlaywrightCrawler({
        requestQueue,
        maxRequestsPerCrawl: maxPages,
        // Headless is default. Playwright will load the page and run JS.
        async requestHandler({ page, request, enqueueLinks }) {
            log.info(`Processing ${request.url}...`);

            // Wait for the DOM to be fully loaded (useful for SPAs)
            await page.waitForLoadState('domcontentloaded');

            const title = await page.title();

            // Extract meta description
            const metaDescription = await page.$eval('meta[name="description"]', (el) => el.getAttribute('content') || '').catch(() => '');

            // Extract H1 and H2
            const h1 = await page.$$eval('h1', (elements) => elements.map(el => el.textContent?.trim() || ''));
            const h2 = await page.$$eval('h2', (elements) => elements.map(el => el.textContent?.trim() || ''));

            // Extract body text while stripping out noisy tags
            const bodyTextRaw = await page.evaluate(() => {
                const clone = document.body.cloneNode(true) as HTMLElement;
                const noisySelectors = ['script', 'style', 'noscript', 'nav', 'footer', 'header', 'svg'];
                noisySelectors.forEach(selector => {
                    const elements = clone.querySelectorAll(selector);
                    elements.forEach(el => el.remove());
                });
                return clone.textContent?.replace(/\s+/g, ' ').trim() || '';
            });

            // Truncate body text to save tokens
            let bodyText = bodyTextRaw;
            if (bodyText.length > 2500) {
                bodyText = bodyText.substring(0, 2500) + '...';
            }

            extractedData.push({
                url: request.url,
                title,
                metaDescription,
                h1,
                h2,
                bodyText
            });

            // Enqueue links from the same domain
            await enqueueLinks({
                strategy: 'same-domain',
            });
        },
        failedRequestHandler({ request }) {
            log.error(`Request ${request.url} failed too many times.`);
        },
    });

    log.info(`Starting crawl of ${startUrl}`);
    await crawler.run([startUrl]);
    log.info(`Crawl finished. Scraped ${extractedData.length} pages.`);

    // Drop the queue to free up disk space and avoid cluttering the storage directory
    await requestQueue.drop();

    return extractedData;
}
