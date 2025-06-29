const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const Retell = require('retell-sdk').default;
const retellClient = new Retell({
  apiKey: process.env.RETELL_API_KEY,
});

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Get call details by call ID
app.get('/api/calls/:callId', async (req, res) => {
  try {
    const { callId } = req.params;
    
    const callDetails = await retellClient.call.getCall(callId);
    
    res.json({
      success: true,
      data: callDetails
    });
  } catch (error) {
    console.error('Error fetching call details:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get call transcript and extract variables
app.get('/api/calls/:callId/transcript', async (req, res) => {
  try {
    const { callId } = req.params;
    
    const callDetails = await retellClient.call.getCall(callId);
    
    // Extract transcript and variables
    const transcript = callDetails.transcript || [];
    const variables = callDetails.variables || {};
    
    res.json({
      success: true,
      data: {
        callId,
        transcript,
        variables,
        metadata: {
          duration: callDetails.duration,
          status: callDetails.status,
          startTime: callDetails.start_time,
          endTime: callDetails.end_time
        }
      }
    });
  } catch (error) {
    console.error('Error fetching call transcript:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Extract specific variables from a call
app.post('/api/calls/:callId/extract-variables', async (req, res) => {
  try {
    const { callId } = req.params;
    // Accept variables directly from the request body
    const { name, ordered_items, phone_number } = req.body;

    // You can add more fields as needed
    res.json({
      success: true,
      data: {
        callId,
        name,
        ordered_items,
        phone_number
      }
    });
  } catch (error) {
    console.error('Error extracting variables:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get all calls for an agent
app.get('/api/agents/:agentId/calls', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { limit = 10, offset = 0 } = req.query;
    
    const calls = await retellClient.call.listCalls({
      agentId,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    res.json({
      success: true,
      data: calls
    });
  } catch (error) {
    console.error('Error fetching agent calls:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Webhook endpoint for real-time call events (optional)
app.post('/webhook/call-events', (req, res) => {
  try {
    const event = req.body;
    console.log('Received call event:', event);
    
    // Handle different event types
    switch (event.event_type) {
      case 'call_started':
        console.log('Call started:', event.call_id);
        break;
      case 'call_ended':
        console.log('Call ended:', event.call_id);
        // You can trigger variable extraction here
        break;
      case 'transcript_updated':
        console.log('Transcript updated for call:', event.call_id);
        break;
      default:
        console.log('Unknown event type:', event.event_type);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: 'Something went wrong!'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
}); 