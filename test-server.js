const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';

async function testEndpoints() {
  console.log('🧪 Testing Retell Server Endpoints...\n');

  try {
    // Test health endpoint
    console.log('1. Testing health endpoint...');
    const healthResponse = await fetch(`${BASE_URL}/health`);
    const healthData = await healthResponse.json();
    console.log('✅ Health check:', healthData);
    console.log('');

    // Test with a sample call ID (you'll need to replace this with a real call ID)
    const sampleCallId = 'call_123'; // Replace with actual call ID from your Retell agent
    
    console.log('2. Testing call details endpoint...');
    try {
      const callResponse = await fetch(`${BASE_URL}/api/calls/${sampleCallId}`);
      const callData = await callResponse.json();
      console.log('✅ Call details:', callData);
    } catch (error) {
      console.log('⚠️  Call details test failed (expected if no real call ID):', error.message);
    }
    console.log('');

    // Test variable extraction endpoint
    console.log('3. Testing variable extraction endpoint...');
    try {
      const extractResponse = await fetch(`${BASE_URL}/api/calls/${sampleCallId}/extract-variables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variableNames: ['customer_name', 'order_total', 'payment_method']
        })
      });
      const extractData = await extractResponse.json();
      console.log('✅ Variable extraction:', extractData);
    } catch (error) {
      console.log('⚠️  Variable extraction test failed (expected if no real call ID):', error.message);
    }
    console.log('');

    console.log('🎉 Server is running and endpoints are accessible!');
    console.log('\n📝 Next steps:');
    console.log('1. Set your RETELL_API_KEY in the .env file');
    console.log('2. Replace the sample call ID with a real call ID from your Retell agent');
    console.log('3. Test with actual call data');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n💡 Make sure the server is running with: npm run dev');
  }
}

// Run tests
testEndpoints(); 