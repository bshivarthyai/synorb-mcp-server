Synorb MCP Server
MCP server for streaming stories from Synorb Content APIs.

Features
5 Tools Available:
test_connection - Verify API credentials
get_meta - Get all streams and metadata
get_entity_types - Get entity types for a stream
get_entity_values - Get entity values for a specific entity type
fetch_stories - Fetch stories with filters, pagination, and format options
Project Structure
synorb-mcp-server/
├── src/
│   └── index.ts        # Main server file
├── package.json        # Dependencies and scripts
├── tsconfig.json       # TypeScript configuration
├── .env.example        # Environment variables template
└── README.md          # This file
Setup Instructions
1. Create Project Directory
bash
mkdir synorb-mcp-server
cd synorb-mcp-server
2. Create the Files
Create the following structure:

Create src/ directory
Copy index.ts into src/index.ts
Copy package.json to root
Copy tsconfig.json to root
Copy .env.example to .env and update credentials if needed
3. Install Dependencies
bash
npm install
4. Build the Project
bash
npm run build
Deployment to Render
Step 1: Push to GitHub
Create a new repository on GitHub
Initialize git and push:
bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
Step 2: Deploy on Render
Go to Render Dashboard
Click "New +" → "Web Service"
Connect your GitHub repository
Configure the service:
Name: synorb-mcp-server
Environment: Node
Build Command: npm install && npm run build
Start Command: npm run start:http
Instance Type: Select your preferred tier
Step 3: Set Environment Variables
In Render dashboard, add these environment variables:

SYNORB_API_KEY = fd5a4a33-ce19-424e-bcde-4a2435cf25bc
SYNORB_API_SECRET = U&GRWCT@nts&TMNumRGb
HTTP_MODE = true
PORT = 10000 (Render usually sets this automatically)
Step 4: Deploy
Click "Create Web Service" and wait for deployment to complete.

API Endpoints (HTTP Mode)
When deployed on Render, the server exposes these HTTP endpoints:

Health Check
GET /health
Test Connection
POST /test_connection
Body: {
  "apiKey": "your-api-key",    // Optional if env vars are set
  "secret": "your-secret"       // Optional if env vars are set
}
Get Meta
POST /get_meta
Body: {
  "apiKey": "your-api-key",    // Optional
  "secret": "your-secret"       // Optional
}
Get Entity Types
POST /get_entity_types
Body: {
  "streamId": "stream-id",
  "apiKey": "your-api-key",    // Optional
  "secret": "your-secret"       // Optional
}
Get Entity Values
POST /get_entity_values
Body: {
  "streamId": "stream-id",
  "entityType": "type-name",    // Optional
  "apiKey": "your-api-key",    // Optional
  "secret": "your-secret"       // Optional
}
Fetch Stories
POST /fetch_stories
Body: {
  "streamId": "stream-id",
  "format": "json" | "markdown",
  "bodySections": ["section1", "section2"],  // For markdown only
  "entityFilters": [
    {
      "entityType": "type",
      "entityValue": "value"
    }
  ],
  "dateFrom": "YYYY-MM-DD",
  "dateTo": "YYYY-MM-DD",
  "pageNumber": 0,
  "pageSize": 10,
  "apiKey": "your-api-key",    // Optional
  "secret": "your-secret"       // Optional
}
Connecting Your Client
Once deployed on Render, your service URL will be:

https://synorb-mcp-server-XXXX.onrender.com
Your client can connect to this URL through your Render relay. The client should:

Send API key and secret for authentication
Call the endpoints as needed
Handle pagination on the client side for the recall filter
Local Development
For local testing without HTTP mode:

bash
npm run dev
For local testing with HTTP mode:

bash
npm run dev:http
Notes
The server supports both stdio mode (for standard MCP) and HTTP mode (for Render deployment)
Credentials can be passed per-request or set as environment variables
The fetch_stories endpoint supports both JSON and Markdown formats
Markdown format allows fetching specific sections using body_sections parameter
Client-side recall filter controls max stories to stream
