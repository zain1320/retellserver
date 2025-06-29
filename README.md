# Retell Server Backend

A Node.js server backend for integrating with Retell AI voice agents and extracting call data and variables.

## Features

- 🔗 **Retell AI Integration**: Connect to your Retell voice agents
- 📊 **Call Data Extraction**: Pull transcripts, variables, and metadata from calls
- 🎯 **Variable Extraction**: Extract specific variables from call data
- 🔄 **Real-time Webhooks**: Handle call events in real-time
- 🚀 **Render Ready**: Optimized for deployment on Render platform
- 🛡️ **Security**: Built-in security middleware and error handling

## Quick Start

### Prerequisites

- Node.js 18+ 
- Retell API key
- Render account (for deployment)

### Local Development

1. **Clone and install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp env.example .env
   # Edit .env with your Retell API key
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Test the health endpoint:**
   ```bash
   curl http://localhost:3000/health
   ```

## API Endpoints

### Health Check
```
GET /health
```
Returns server status and timestamp.

### Get Call Details
```
GET /api/calls/:callId
```
Retrieve complete call information including transcript and variables.

**Response:**
```json
{
  "success": true,
  "data": {
    "call_id": "call_123",
    "transcript": [...],
    "variables": {
      "customer_name": "John Doe",
      "order_total": "150.00",
      "payment_method": "credit_card"
    },
    "duration": 180,
    "status": "completed"
  }
}
```

### Get Call Transcript
```
GET /api/calls/:callId/transcript
```
Extract transcript and variables with metadata.

### Extract Specific Variables
```
POST /api/calls/:callId/extract-variables
Content-Type: application/json

{
  "variableNames": ["customer_name", "order_total", "payment_method"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "callId": "call_123",
    "extractedVariables": {
      "customer_name": "John Doe",
      "order_total": "150.00",
      "payment_method": "credit_card"
    },
    "allAvailableVariables": ["customer_name", "order_total", "payment_method", "delivery_address"]
  }
}
```

### Get Agent Calls
```
GET /api/agents/:agentId/calls?limit=10&offset=0
```
List all calls for a specific agent with pagination.

### Webhook Endpoint
```
POST /webhook/call-events
```
Handle real-time call events from Retell.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `RETELL_API_KEY` | Your Retell API key | Yes |
| `PORT` | Server port (default: 3000) | No |
| `NODE_ENV` | Environment (production/development) | No |
| `WEBHOOK_SECRET` | Secret for webhook verification | No |

## Deployment on Render

### 1. Connect Your Repository

1. Push your code to GitHub/GitLab
2. Connect your repository to Render
3. Create a new Web Service

### 2. Configure the Service

- **Name**: `retell-server` (or your preferred name)
- **Environment**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Plan**: Choose your preferred plan

### 3. Set Environment Variables

In Render dashboard, add these environment variables:
- `RETELL_API_KEY`: Your Retell API key
- `NODE_ENV`: `production`

### 4. Deploy

Click "Create Web Service" and Render will automatically deploy your application.

## Usage Examples

### Extract Order Information

```javascript
// Extract order details from a call
const response = await fetch('/api/calls/call_123/extract-variables', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    variableNames: ['customer_name', 'order_items', 'total_amount', 'delivery_address']
  })
});

const data = await response.json();
console.log('Extracted variables:', data.data.extractedVariables);
```

### Get Call Transcript

```javascript
// Get full transcript and variables
const response = await fetch('/api/calls/call_123/transcript');
const data = await response.json();

console.log('Transcript:', data.data.transcript);
console.log('Variables:', data.data.variables);
console.log('Call duration:', data.data.metadata.duration);
```

## Webhook Integration

To receive real-time call events, configure your Retell webhook URL to point to:
```
https://your-render-app.onrender.com/webhook/call-events
```

The webhook will receive events for:
- `call_started`: When a call begins
- `call_ended`: When a call ends
- `transcript_updated`: When transcript is updated

## Error Handling

The API returns consistent error responses:

```json
{
  "success": false,
  "error": "Error message description"
}
```

Common HTTP status codes:
- `200`: Success
- `400`: Bad request (missing parameters)
- `404`: Call not found
- `500`: Server error

## Security Features

- **Helmet**: Security headers
- **CORS**: Cross-origin resource sharing
- **Input validation**: Request parameter validation
- **Error handling**: Comprehensive error management
- **Logging**: Request logging with Morgan

## Next Steps

Once you have the basic setup working, you can:

1. **Integrate with Clover POS**: Add endpoints to push extracted data to Clover's API
2. **Add authentication**: Implement API key or JWT authentication
3. **Database integration**: Store call data in a database for analytics
4. **Real-time notifications**: Send notifications when calls complete
5. **Analytics dashboard**: Build a dashboard to view call statistics

## Support

For issues related to:
- **Retell API**: Check [Retell Documentation](https://docs.retellai.com/)
- **Render Deployment**: Check [Render Documentation](https://render.com/docs)
- **This Server**: Open an issue in this repository 