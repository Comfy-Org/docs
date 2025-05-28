#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

async function fetchRatesWithPagination(apiKey, rateCardId, outputFile = 'rates.json') {
  const baseUrl = 'https://api.metronome.com/v1/contract-pricing/rate-cards/getRates';
  const today = new Date().toISOString();
  
  let allRates = [];
  let nextPage = null;
  let pageCount = 0;
  let consecutiveSamePageCount = 0;
  let lastNextPage = null;
  const MAX_PAGES = 10000; // Safety limit

  do {
    try {
      pageCount++;
      console.log(`Fetching page ${pageCount}...`);
      
      const requestBody = {
        at: today,
        rate_card_id: rateCardId
      };
      
      if (nextPage) {
        requestBody.next_page = nextPage;
      }

      console.log(`Calling URL: ${baseUrl}`);
      
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.data && Array.isArray(data.data)) {
        allRates.push(...data.data);
        console.log(`Added ${data.data.length} rates from page ${pageCount}. Total: ${allRates.length}`);
      }
      
      nextPage = data.next_page || null;
      
      // Check for infinite loop (same next_page token multiple times in a row)
      if (nextPage === lastNextPage) {
        consecutiveSamePageCount++;
        if (consecutiveSamePageCount >= 10) {
          console.log(`Detected same next_page token ${consecutiveSamePageCount} times in a row, assuming end of data`);
          break;
        }
      } else {
        consecutiveSamePageCount = 0;
      }
      lastNextPage = nextPage;
      
      // Safety check for maximum pages
      if (pageCount >= MAX_PAGES) {
        console.log(`Reached maximum page limit of ${MAX_PAGES}, stopping`);
        break;
      }
      
      if (nextPage) {
        await new Promise(resolve => setTimeout(resolve, 50)); // Reduced delay
      }
      
    } catch (error) {
      console.error(`Error fetching page ${pageCount}:`, error.message);
      throw error;
    }
  } while (nextPage);

  const result = {
    fetched_at: new Date().toISOString(),
    rate_card_id: rateCardId,
    at_date: today,
    total_rates: allRates.length,
    pages_fetched: pageCount,
    rates: allRates
  };

  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
  console.log(`\nCompleted! Fetched ${allRates.length} rates across ${pageCount} pages.`);
  console.log(`Results saved to: ${path.resolve(outputFile)}`);
  
  return result;
}

async function main() {
  const apiKey = process.env.METRONOME_API_KEY;
  const rateCardId = process.env.RATE_CARD_ID || process.argv[2];
  const outputFile = process.argv[3] || 'rates.json';

  if (!apiKey) {
    console.error('Error: METRONOME_API_KEY environment variable is required');
    process.exit(1);
  }

  if (!rateCardId) {
    console.error('Error: Rate card ID is required. Provide it as RATE_CARD_ID env var or first argument');
    console.error('Usage: node update-pricing.js <rate_card_id> [output_file]');
    console.error('   or: RATE_CARD_ID=<id> node update-pricing.js [output_file]');
    process.exit(1);
  }

  try {
    await fetchRatesWithPagination(apiKey, rateCardId, outputFile);
  } catch (error) {
    console.error('Failed to fetch rates:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { fetchRatesWithPagination };