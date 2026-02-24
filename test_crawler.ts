import { crawlDomain } from './src/crawler';

async function main() {
    console.log('Testing crawler...');
    try {
        const data = await crawlDomain('https://merchants.glopal.com/en-us/home', 2);
        console.log(`Results: ${data.length} items`);
        if (data.length > 0) {
            console.log('First item title:', data[0].title);
            console.log('First item url:', data[0].url);
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

main();
