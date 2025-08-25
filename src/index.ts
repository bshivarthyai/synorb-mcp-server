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
  streamId: z.string().describe('The stream ID to fetch entity types for'),
});

const GetEntityValuesSchema = z.object({
  streamId: z.string().describe('The stream ID'),
  entityType: z.string().optional().describe('Optional: entity type name'),
});

const FetchStoriesSchema = z.object({
  streamId: z.string().describe('Stream ID'),
  format: z.enum(['json', 'markdown']).default('json').describe('Output format'),
  bodySections: z.array(z.string()).optional().describe('Body sections (only for markdown)'),
  entityFilters: z.array(z.object({
    entityType: z.string(),
    entityValue: z.string(),
  })).optional().describe('Entity filters'),
  dateFrom: z.string().optional().describe('Start date (YYYY-MM-DD)'),
  dateTo: z.string().optional().describe('End date (YYYY-MM-DD)'),
  pageNumber: z.number().default(0).describe('Page number for pagination'),
  pageSize: z.number().default(10).describe('Page size for pagination'),
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
      return { success: true, data: response.data };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.response?.data?.message || error.message 
      };
    }
  }

  async getEntityTypes(streamId: string) {
    try {
      const response = await this.axios.get(`/content/entity-types/${streamId}`);
      return { success: true, data: response.data };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.response?.data?.message || error.message 
      };
    }
  }

  async getEntityValues(streamId: string, entityType?: string) {
    try {
      const params: any = {};
      if (entityType) params.entity_type = entityType;
      
      const response = await this.axios.get(`/content/entity-values/${streamId}`, { params });
      return { success: true, data: response.data };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.response?.data?.message || error.message 
      };
    }
  }

  async fetchStories(params: z.infer<typeof FetchStoriesSchema>) {
    try {
      const requestParams: any = {
        feed_id: params.streamId,
        format: params.format,
        page_num: params.pageNumber,
        page_size: params.pageSize,
      };

      if (params.dateFrom) requestParams.published_date_from = params.dateFrom;
      if (params.dateTo) requestParams.published_date_to = params.dateTo;
      
      if (params.bodySections && params.format === 'markdown') {
        requestParams.body_sections = params.bodySections;
      }
      
      if (params.entityFilters && params.entityFilters.length > 0) {
        requestParams.entity_details = params.entityFilters.map(filter => ({
          entity_type: filter.entityType,
          entity_value: filter.entityValue,
        }));
      }

      const response = await this.axios.get('/content/feed', { params: requestParams });
      return { success: true, data: response.data };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.response?.data?.message || error.message 
      };
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
          name: 'test_connection',
          description: 'Test if the API credentials are valid',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'get_meta',
          description: 'Get all streams and metadata',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'get_entity_types',
          description: 'Get entity types available within a specific stream',
          inputSchema: {
            type: 'object',
            properties: {
              streamId: {
                type: 'string',
                description: 'The stream ID to fetch entity types for',
              },
            },
            required: ['streamId'],
          },
        },
        {
          name: 'get_entity_values',
          description: 'Get entity values for a given entity type in a stream',
          inputSchema: {
            type: 'object',
            properties: {
              streamId: {
                type: 'string',
                description: 'The stream ID',
              },
              entityType: {
                type: 'string',
                description: 'Optional: entity type name',
              },
            },
            required: ['streamId'],
          },
        },
        {
          name: 'fetch_stories',
          description: 'Fetch stories from a stream with optional filters',
          inputSchema: {
            type: 'object',
            properties: {
              streamId: {
                type: 'string',
                description: 'Stream ID',
              },
              format: {
                type: 'string',
                enum: ['json', 'markdown'],
                default: 'json',
                description: 'Output format',
              },
              bodySections: {
                type: 'array',
                items: { type: 'string' },
                description: 'Body sections to include (only for markdown format)',
              },
              entityFilters: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    entityType: { type: 'string' },
                    entityValue: { type: 'string' },
                  },
                  required: ['entityType', 'entityValue'],
                },
                description: 'List of entity filters',
              },
              dateFrom: {
                type: 'string',
                description: 'Start date (YYYY-MM-DD)',
              },
              dateTo: {
                type: 'string',
                description: 'End date (YYYY-MM-DD)',
              },
              pageNumber: {
                type: 'number',
                default: 0,
                description: 'Page number for pagination',
              },
              pageSize: {
                type: 'number',
                default: 10,
                description: 'Page size for pagination',
              },
            },
            required: ['streamId'],
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
          case 'test_connection': {
            const result = await this.apiClient.testConnection();
            return {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
          }

          case 'get_meta': {
            const result = await this.apiClient.getMeta();
            return {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
          }

          case 'get_entity_types': {
            const validated = GetEntityTypesSchema.parse(args);
            const result = await this.apiClient.getEntityTypes(validated.streamId);
            return {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
          }

          case 'get_entity_values': {
            const validated = GetEntityValuesSchema.parse(args);
            const result = await this.apiClient.getEntityValues(
              validated.streamId,
              validated.entityType
            );
            return {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
          }

          case 'fetch_stories': {
            const validated = FetchStoriesSchema.parse(args);
            const result = await this.apiClient.fetchStories(validated);
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

  // Test connection endpoint
  app.post('/test_connection', async (req: any, res: any) => {
    try {
      const { apiKey: clientKey, secret: clientSecret } = req.body;
      const client = new SynorbAPIClient(clientKey || apiKey, clientSecret || secret);
      const result = await client.testConnection();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Meta endpoint
  app.post('/get_meta', async (req: any, res: any) => {
    try {
      const { apiKey: clientKey, secret: clientSecret } = req.body;
      const client = new SynorbAPIClient(clientKey || apiKey, clientSecret || secret);
      const result = await client.getMeta();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Entity types endpoint
  app.post('/get_entity_types', async (req: any, res: any) => {
    try {
      const { streamId, apiKey: clientKey, secret: clientSecret } = req.body;
      const client = new SynorbAPIClient(clientKey || apiKey, clientSecret || secret);
      const result = await client.getEntityTypes(streamId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Entity values endpoint
  app.post('/get_entity_values', async (req: any, res: any) => {
    try {
      const { streamId, entityType, apiKey: clientKey, secret: clientSecret } = req.body;
      const client = new SynorbAPIClient(clientKey || apiKey, clientSecret || secret);
      const result = await client.getEntityValues(streamId, entityType);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Fetch stories endpoint
  app.post('/fetch_stories', async (req: any, res: any) => {
    try {
      const { apiKey: clientKey, secret: clientSecret, ...params } = req.body;
      const client = new SynorbAPIClient(clientKey || apiKey, clientSecret || secret);
      const result = await client.fetchStories(params);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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
