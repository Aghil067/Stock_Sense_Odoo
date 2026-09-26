import { z } from 'zod';
import { env } from '../../config/env.js';
import { ApiError } from '../../lib/api-error.js';

const responseSchema = z.object({ status: z.string(), output: z.array(z.object({
  type: z.string(), call_id: z.string().optional(), name: z.string().optional(), arguments: z.string().optional(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()).optional(),
}).passthrough()) }).passthrough();

// Provider boundary: inventory tools know nothing about API credentials or model APIs.
export interface InventoryAiProvider {
  respond(input: { instructions: string; messages: unknown[]; tools: unknown[]; choice: 'required' | 'auto' | 'none'; signal: AbortSignal }): Promise<z.infer<typeof responseSchema>>;
}
export const aiProvider: InventoryAiProvider = {
  async respond({ instructions, messages, tools, choice, signal }) {
    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', signal,
        headers: { Authorization: `Bearer ${env.AI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: env.AI_MODEL, instructions, input: messages, tools, store: false,
          max_output_tokens: 1800, parallel_tool_calls: false, tool_choice: choice }),
      });
    } catch { throw new ApiError(503, 'AI_UNAVAILABLE', 'The AI provider is unreachable or timed out. Please retry. No inventory was changed.'); }
    if (!response.ok) throw new ApiError(503, 'AI_PROVIDER_ERROR', response.status === 429 ? 'AI usage limit reached. Please try later.' : 'The AI provider could not complete this request. Check the backend model/key configuration.');
    let result: z.infer<typeof responseSchema>;
    try { result = responseSchema.parse(await response.json()); }
    catch { throw new ApiError(502, 'AI_INVALID_RESPONSE', 'The AI provider returned an unreadable response. Please retry.'); }
    if (result.status !== 'completed') throw new ApiError(502, 'AI_INCOMPLETE', 'The AI response was incomplete. Ask a more focused question.');
    return result;
  },
};
