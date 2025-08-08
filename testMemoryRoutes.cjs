const axios = require('axios');

async function testSearch(keyword) {
  try {
    const response = await axios.post('http://localhost:5000/api/memory/search', {
      keyword
    });

    console.log(`✅ Search for "${keyword}" returned:`, response.data.results);
  } catch (error) {
    console.error('❌ Error testing search route:', error.message);
  }
}

testSearch('genealogy');  // You can change this to test other keywords
