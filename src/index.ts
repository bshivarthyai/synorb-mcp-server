import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosInstance } from 'axios';
import { z } from 'zod';

// API Base URL
const API_BASE_URL = 'https://feeds.parsym.com/api/v1';

// Tool schemas
const TestConnectionSchema = z.object({});

const GetMetaSchema = z.object({});

const GetEntityTypesSchema = z.object({
  feedid: z.string().describe('The stream ID to fetch entity types for'),
});

const GetEntityValuesSchema = z.object({
  feedid: z.string().describe('The stream ID'),
  entity_type: z.string().optional().describe('Optional: entity type name'),
});

const GetFeedContentSchema = z.object({
  feed_id: z.number().describe('Stream ID'),
  format: z.enum(['json', 'newsml', 'markdown', 'html']).default('json').describe('Response format'),
  body_sections: z.array(z.string()).optional().describe('Body sections (only for markdown)'),
  entity_details: z.array(z.object({
    entity_type: z.string(),
    entity_value: z.string(),
  })).optional().describe('List of entity filters'),
  published_date_from: z.string().optional().describe('Start date (YYYY-MM-DD)'),
  published_date_to: z.string().optional().describe('End date (YYYY-MM-DD)'),
  created_on_from: z.string().optional().describe('Created on start date (YYYY-MM-DD)'),
  created_on_to: z.string().optional().describe('Created on end date (YYYY-MM-DD)'),
  page_num: z.number().default(0).describe('Page number for pagination'),
  page_size: z.number().default(10).describe('Page size for pagination'),
  is_active: z.boolean().optional().describe('Whether to fetch only active feeds'),
  max_stories: z.number().optional().describe('Maximum number of stories to return'),
});

class SynorbAPIClient {
  private axios: AxiosInstance;

  constructor(apiKey: string, secret: string) {
    this.axios = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'x-api-key': apiKey,
        'x-api-secret': secret,
        'Content-Type': 'application/json',
      },
    });
  }

  async testConnection() {
    try {
      const response = await this.axios.get('/content/meta');
      return { success: true, message: 'Authentication successful', data: response.data };
    } catch (error: any) {
      return { 
        success: false, 
        message: `Authentication failed: ${error.response?.data?.message || error.message}` 
      };
    }
  }

  async getMeta() {
    try {
      const response = await this.axios.get('/content/meta');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || error.message);
    }
  }

  async getEntityTypes(feedid: string) {
    try {
      const response = await this.axios.get(`/content/entity-types/${feedid}`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || error.message);
    }
  }

  async getEntityValues(feedid: string, entityType?: string) {
    try {
      const params: any = {};
      if (entityType) params.entity_type = entityType;
      
      const response = await this.axios.get(`/content/entity-values/${feedid}`, { params });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || error.message);
    }
  }

  async getFeedContent(params: z.infer<typeof GetFeedContentSchema>) {
    try {
      const requestParams: any = {
        feed_id: params.feed_id,
        format: params.format || 'json',
        page_num: params.page_num || 0,
        page_size: params.page_size || 10,
      };

      if (params.published_date_from) requestParams.published_date_from = params.published_date_from;
      if (params.published_date_to) requestParams.published_date_to = params.published_date_to;
      if (params.created_on_from) requestParams.created_on_from = params.created_on_from;
      if (params.created_on_to) requestParams.created_on_to = params.created_on_to;
      if (params.is_active !== undefined) requestParams.is_active = params.is_active;
      
      if (params.body_sections && params.format === 'markdown') {
        requestParams.body_sections = params.body_sections;
      }
      
      if (params.entity_details && params.entity_details.length > 0) {
        requestParams.entity_details = params.entity_details;
      }

      // Handle max_stories limit if provided
      if (params.max_stories) {
        requestParams.page_size = Math.min(params.max_stories, 100); // Cap at 100 per request
      }

      const response = await this.axios.get('/content/feed', { params: requestParams });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || error.message);
    }
  }
}

class SynorbMCPServer {
  private server: Server;
  private apiClient: SynorbAPIClient | null = null;

  constructor() {
    this.server = new Server(
      {
        name: 'synorb-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        {
          name: 'Synorb Streams:test-connection',
          description: 'Test if the API credentials are valid',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'Synorb Streams:get-synorb-stream-meta',
          description: 'Discover all streams and metadata available',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'Synorb Streams:get-synorb-stream-entity-types',
          description: 'Retrieve entity types available within a specific stream',
          inputSchema: {
            type: 'object',
            properties: {
              feedid: {
                type: 'string',
                description: 'The stream ID to fetch entity types for',
              },
            },
            required: ['feedid'],
          },
        },
        {
          name: 'Synorb Streams:get-synorb-stream-entity-values',
          description: 'Retrieve entity values for a given entity type in a stream',
          inputSchema: {
            type: 'object',
            properties: {
              feedid: {
                type: 'string',
                description: 'The stream ID',
              },
              entity_type: {
                type: 'string',
                description: 'Optional: entity type name',
              },
            },
            required: ['feedid'],
          },
        },
        {
          name: 'Synorb Streams:get-synorb-stream-feed-content',
          description: 'Fetch stories from a stream with optional filters',
          inputSchema: {
            type: 'object',
            properties: {
              feed_id: {
                type: 'number',
                description: 'Stream ID',
              },
              format: {
                type: 'string',
                enum: ['json', 'newsml', 'markdown', 'html'],
                default: 'json',
                description: 'Response format',
              },
              body_sections: {
                type: 'array',
                items: { type: 'string' },
                description: 'Body sections to include (only for markdown format)',
              },
              entity_details: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    entity_type: { type: 'string' },
                    entity_value: { type: 'string' },
                  },
                  required: ['entity_type', 'entity_value'],
                },
                description: 'List of entity filters',
              },
              published_date_from: {
                type: 'string',
                description: 'Start date (YYYY-MM-DD)',
              },
              published_date_to: {
                type: 'string',
                description: 'End date (YYYY-MM-DD)',
              },
              created_on_from: {
                type: 'string',
                description: 'Created on start date (YYYY-MM-DD)',
              },
              created_on_to: {
                type: 'string',
                description: 'Created on end date (YYYY-MM-DD)',
              },
              page_num: {
                type: 'number',
                default: 0,
                description: 'Page number for pagination',
              },
              page_size: {
                type: 'number',
                default: 10,
                description: 'Page size for pagination',
              },
              is_active: {
                type: 'boolean',
                description: 'Whether to fetch only active feeds',
              },
              max_stories: {
                type: 'number',
                description: 'Maximum number of stories to return',
              },
            },
            required: ['feed_id'],
          },
        },
      ];

      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (!this.apiClient) {
        // Initialize with credentials from environment or connection params
        const apiKey = process.env.SYNORB_API_KEY || '';
        const secret = process.env.SYNORB_API_SECRET || '';
        
        if (!apiKey || !secret) {
          throw new Error('API credentials not configured');
        }
        
        this.apiClient = new SynorbAPIClient(apiKey, secret);
      }

      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'Synorb Streams:test-connection': {
            const result = await this.apiClient.testConnection();
            return {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
          }

          case 'Synorb Streams:get-synorb-stream-meta': {
            const result = await this.apiClient.getMeta();
            return {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
          }

          case 'Synorb Streams:get-synorb-stream-entity-types': {
            const validated = GetEntityTypesSchema.parse(args);
            const result = await this.apiClient.getEntityTypes(validated.feedid);
            return {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
          }

          case 'Synorb Streams:get-synorb-stream-entity-values': {
            const validated = GetEntityValuesSchema.parse(args);
            const result = await this.apiClient.getEntityValues(
              validated.feedid,
              validated.entity_type
            );
            return {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
          }

          case 'Synorb Streams:get-synorb-stream-feed-content': {
            const validated = GetFeedContentSchema.parse(args);
            const result = await this.apiClient.getFeedContent(validated);
            return {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error: any) {
        return {
          content: [
            { 
              type: 'text', 
              text: `Error: ${error.message}` 
            }
          ],
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Synorb MCP server running...');
  }
}

// For HTTP mode (Render deployment)
async function startHttpServer() {
  // FIX: Use dynamic import for ES modules
  const { default: express } = await import('express');
  const app = express();
  app.use(express.json());

  const apiKey = process.env.SYNORB_API_KEY || '';
  const secret = process.env.SYNORB_API_SECRET || '';
  
  if (!apiKey || !secret) {
    console.error('Warning: SYNORB_API_KEY and SYNORB_API_SECRET not set');
  }

  const apiClient = new SynorbAPIClient(apiKey, secret);

  // Health check
  app.get('/health', (req: any, res: any) => {
    res.json({ status: 'ok', service: 'synorb-mcp-server' });
  });

  // MCP endpoint to handle all tool calls from the relay
  app.post('/mcp-call', async (req: any, res: any) => {
    try {
      const { name, arguments: args } = req.body;
      
      // Debug logging
      console.log('=== MCP-CALL DEBUG ===');
      console.log('Headers:', JSON.stringify(req.headers));
      console.log('Query params:', JSON.stringify(req.query));
      console.log('Body:', JSON.stringify(req.body));
      console.log('URL:', req.url);
      
      // Get credentials from headers OR query parameters
      let apiKey = req.headers['x-synorb-key'] || req.query.api_key || process.env.SYNORB_API_KEY;
      let secret = req.headers['x-synorb-secret'] || req.query.secret || process.env.SYNORB_API_SECRET;
      
      console.log('Before decode - apiKey:', apiKey);
      console.log('Before decode - secret:', secret);
      
      // Decode URL-encoded secret if it comes from query parameters
      if (req.query.secret) {
        secret = decodeURIComponent(secret);
        console.log('After decode - secret:', secret);
      }
      
      if (!apiKey || !secret) {
        console.error('No credentials! apiKey:', apiKey, 'secret:', secret);
        return res.status(401).json({ error: 'API credentials not provided' });
      }

      console.log('Creating client with credentials...');
      const client = new SynorbAPIClient(apiKey, secret);
      let result;

      // Handle both formats: with and without "Synorb Streams:" prefix
      switch (name) {
        case 'Synorb Streams:test-connection':
        case 'test-connection':
          console.log('Calling test-connection...');
          result = await client.testConnection();
          break;

        case 'Synorb Streams:get-synorb-stream-meta':
        case 'get-synorb-stream-meta':
          console.log('Calling get-synorb-stream-meta...');
          result = await client.getMeta();
          break;

        case 'Synorb Streams:get-synorb-stream-entity-types':
        case 'get-synorb-stream-entity-types':
          console.log('Calling get-synorb-stream-entity-types...');
          result = await client.getEntityTypes(args.feedid);
          break;

        case 'Synorb Streams:get-synorb-stream-entity-values':
        case 'get-synorb-stream-entity-values':
          console.log('Calling get-synorb-stream-entity-values...');
          result = await client.getEntityValues(args.feedid, args.entity_type);
          break;

        case 'Synorb Streams:get-synorb-stream-feed-content':
        case 'get-synorb-stream-feed-content':
          console.log('Calling get-synorb-stream-feed-content...');
          result = await client.getFeedContent(args);
          break;

        default:
          console.log('Unknown tool name:', name);
          return res.status(400).json({ error: `Unknown tool: ${name}` });
      }

      console.log('Result success:', result.success || !!result);
      
      // Return in MCP format
      res.json({
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      });
    } catch (error: any) {
      console.error('MCP call error:', error.message);
      res.status(500).json({ 
        error: error.message,
        content: [{ type: 'text', text: `Error: ${error.message}` }]
      });
    }
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Synorb MCP HTTP server running on port ${PORT}`);
  });
}

// Main entry point
if (process.env.HTTP_MODE === 'true') {
  startHttpServer();
} else {
  const server = new SynorbMCPServer();
  server.run().catch(console.error);
}
