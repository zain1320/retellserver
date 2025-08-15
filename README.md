# Clover-Retell Integration Service

A comprehensive backend service that bridges Retell AI voice agents with Clover merchant systems, enabling seamless order processing through conversational AI. This service handles secure OAuth authentication with Clover merchants and processes voice-driven orders from Retell AI agents.

## Overview

This integration service solves a critical gap in restaurant automation by connecting advanced voice AI capabilities with established point-of-sale systems. Restaurant owners can now accept orders through natural voice conversations while maintaining their existing Clover workflow and inventory management.

The system operates as a secure middleware that authenticates merchants through Clover's OAuth flow, captures order data from Retell AI voice interactions, and pushes completed orders directly into the merchant's Clover system.

## Architecture

The service consists of two main integration points:

**Clover Integration**: Handles merchant authentication and order submission to Clover POS systems through their REST API. Merchants authenticate once through OAuth 2.0, and the service maintains secure token management with automatic refresh capabilities.

**Retell AI Integration**: Processes voice call data from Retell AI agents, extracting structured order information from natural language conversations. The service can pull call transcripts, extract specific variables, and process order details in real-time.

## Key Features

**Secure OAuth Authentication**: Full OAuth 2.0 implementation for Clover merchant authentication with state verification and token refresh management.

**Voice Order Processing**: Extract structured order data from Retell AI voice conversations, including customer details, menu items, quantities, and payment preferences.

**Real-time Webhooks**: Handle live call events from Retell AI as they happen, enabling immediate order processing and customer service responses.

**Merchant Portal**: Web-based portal for merchants to manage their Clover connections, view integration status, and test API functionality.

**Flexible Deployment**: Optimized for cloud deployment with environment-based configuration and production-ready security middleware.

**Error Handling**: Comprehensive error management with detailed logging and graceful failure recovery for both Clover and Retell API interactions.

## Getting Started

### Prerequisites

You'll need the following to run this service:

- Node.js 18 or higher
- A Clover developer account with app credentials
- Retell AI API access and agent configuration
- Cloud hosting platform account (Render, Heroku, etc.)

### Environment Configuration

Create a `.env` file with your service credentials:

```
BASE_URL=https://your-service-domain.com
CLOVER_ENV=sandbox
CLOVER_APP_ID=your_clover_app_id
CLOVER_APP_SECRET=your_clover_app_secret
RETELL_API_KEY=your_retell_api_key
STATE_SECRET=your_random_state_secret
PORT=3000
```

### Local Development

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Test your setup by visiting the health endpoint:
```bash
curl http://localhost:3000/health
```

Access the merchant portal at `http://localhost:3000/portal` to begin merchant onboarding.

## OAuth Flow Implementation

The service implements a complete OAuth 2.0 flow for Clover merchant authentication:

1. **Merchant Registration**: Restaurant owners create an account through the web portal
2. **OAuth Initiation**: Service redirects merchants to Clover's authorization server
3. **Authorization**: Merchants grant permissions for order management and inventory access
4. **Token Exchange**: Service exchanges authorization code for access and refresh tokens
5. **Token Management**: Automatic token refresh ensures persistent API access

The OAuth implementation includes state parameter verification to prevent CSRF attacks and supports both sandbox and production Clover environments.

## Retell Integration

### Call Data Processing

The service connects to Retell AI through their REST API to process voice call data:

```javascript
// Extract order details from a completed call
const response = await fetch('/api/calls/call_abc123/extract-variables', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    variableNames: ['customer_name', 'phone_number', 'order_items', 'total_amount', 'payment_method']
  })
});
```

### Webhook Processing

Real-time webhook integration allows immediate processing of call events:

- Call completion triggers order extraction
- Failed calls generate customer service alerts
- Transcript updates enable real-time order modifications

## API Endpoints

### Merchant Management

**Portal Access**: `GET /portal` - Web interface for merchant onboarding and management

**OAuth Callback**: `GET /oauth/callback` - Handles Clover OAuth authorization responses

**Connection Management**: `POST /portal/connect/:tenantId` - Initiates OAuth flow for new merchants

### Retell Integration

**Call Details**: `GET /api/calls/:callId` - Retrieve complete call information including transcript and extracted variables

**Variable Extraction**: `POST /api/calls/:callId/extract-variables` - Extract specific order variables from call data

**Agent Calls**: `GET /api/agents/:agentId/calls` - List all calls for a specific Retell agent

**Webhook Handler**: `POST /webhook/call-events` - Process real-time call events from Retell

### Clover API Access

**Merchant Info**: `GET /portal/api/me/:tenantId` - Fetch authenticated merchant details

**Inventory Items**: `GET /portal/api/items/:tenantId` - Retrieve merchant's menu items and inventory

## Order Processing Workflow

1. **Customer Interaction**: Customer calls restaurant and interacts with Retell AI voice agent
2. **Order Capture**: Voice agent captures order details through natural conversation
3. **Data Extraction**: Service extracts structured order data from call transcript
4. **Order Validation**: System validates menu items against Clover inventory
5. **Order Submission**: Completed order is pushed to merchant's Clover POS system
6. **Confirmation**: Customer receives order confirmation and estimated timing

## Security Considerations

The service implements multiple security layers:

**Token Security**: OAuth tokens are stored securely with automatic refresh and expiration handling

**State Verification**: CSRF protection through signed state parameters in OAuth flow

**Input Validation**: All API inputs are validated and sanitized before processing

**HTTPS Enforcement**: Production deployment requires HTTPS for all communications

**Error Sanitization**: Error responses are sanitized to prevent information leakage

## Deployment

### Cloud Platform Setup

The service is optimized for modern cloud platforms:

1. **Repository Connection**: Connect your Git repository to your hosting platform
2. **Environment Variables**: Configure all required environment variables in the platform dashboard
3. **Build Configuration**: Use `npm install` for build and `npm start` for production
4. **Domain Setup**: Configure custom domain and SSL certificates

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `BASE_URL` | Your public service URL | Yes |
| `CLOVER_ENV` | Clover environment (sandbox/prod) | Yes |
| `CLOVER_APP_ID` | Clover application ID | Yes |
| `CLOVER_APP_SECRET` | Clover application secret | Yes |
| `RETELL_API_KEY` | Retell AI API key | Yes |
| `STATE_SECRET` | Random secret for OAuth state signing | Yes |
| `PORT` | Server port (default: 3000) | No |

### Production Considerations

- Enable HTTPS for all communications
- Configure proper logging and monitoring
- Set up database persistence for production workloads
- Implement rate limiting for API endpoints
- Configure proper CORS policies for your domain

## Error Handling

The service provides comprehensive error handling:

**API Errors**: Structured error responses with appropriate HTTP status codes

**OAuth Failures**: Graceful handling of authorization failures with user-friendly messages

**Token Refresh**: Automatic token refresh with fallback error handling

**Webhook Validation**: Verification of webhook signatures and payload integrity

## Monitoring and Logging

Built-in logging captures:

- OAuth flow completions and failures
- API request patterns and response times
- Error conditions and system health metrics
- Webhook delivery status and processing times

## Future Enhancements

The service architecture supports several planned enhancements:

- **Database Integration**: Persistent storage for order history and analytics
- **Multi-tenant Support**: Enhanced support for restaurant chains and franchises  
- **Advanced Analytics**: Order pattern analysis and business intelligence features
- **Mobile App Integration**: Direct integration with restaurant mobile applications
- **Payment Processing**: Extended payment method support and processing capabilities

## Support and Documentation

For technical support and detailed API documentation:

- **Clover Developer Resources**: [Clover REST API Documentation](https://docs.clover.com/docs)
- **Retell AI Documentation**: [Retell AI API Reference](https://docs.retellai.com/)
- **OAuth 2.0 Specification**: [RFC 6749](https://tools.ietf.org/html/rfc6749)

This service enables restaurants to modernize their ordering systems while maintaining their existing operational workflows, creating a seamless bridge between cutting-edge voice AI and established POS infrastructure. 