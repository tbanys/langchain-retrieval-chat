import { NextRequest, NextResponse } from "next/server";
import { Message as VercelChatMessage, StreamingTextResponse } from "ai";

import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { SerpAPI } from "@langchain/community/tools/serpapi";
import { Calculator } from "@langchain/community/tools/calculator";
import {
  AIMessage,
  BaseMessage,
  ChatMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const runtime = "edge";

// CSV Data Processing Tool
class CSVDataProcessor extends StructuredTool {
  name = "csv_processor";
  description = "Process and analyze CSV data. Input should be a CSV string or a URL to a CSV file.";
  schema = z.object({
    csv_data: z.string().describe("The CSV data as a string or URL to a CSV file"),
    operation: z.enum(["analyze", "filter", "summarize", "visualize"]).describe("The operation to perform on the CSV data"),
    column: z.string().optional().describe("The column to operate on (for filter, summarize operations)"),
    condition: z.string().optional().describe("The condition to filter by (for filter operation)"),
  });

  async _call(input: z.infer<typeof this.schema>) {
    try {
      const { csv_data, operation, column, condition } = input;
      
      // For demonstration purposes, we'll just return a mock response
      // In a real implementation, you would parse the CSV and perform the requested operation
      
      if (operation === "analyze") {
        return `Analysis of CSV data: The data appears to contain ${csv_data.split('\n').length} rows. 
                Columns detected: ${csv_data.split('\n')[0].split(',').join(', ')}.`;
      } else if (operation === "filter" && column && condition) {
        return `Filtered CSV data for column "${column}" with condition "${condition}". 
                This would return rows where ${column} ${condition}.`;
      } else if (operation === "summarize" && column) {
        return `Summary of column "${column}": This would calculate statistics like mean, median, mode for the specified column.`;
      } else if (operation === "visualize") {
        return `Visualization of CSV data: This would generate a chart or graph based on the data.`;
      } else {
        return "Invalid operation or missing parameters. Please specify a valid operation and required parameters.";
      }
    } catch (error) {
      return `Error processing CSV data: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

const convertVercelMessageToLangChainMessage = (message: VercelChatMessage) => {
  if (message.role === "user") {
    return new HumanMessage(message.content);
  } else if (message.role === "assistant") {
    return new AIMessage(message.content);
  } else {
    return new ChatMessage(message.content, message.role);
  }
};

const convertLangChainMessageToVercelMessage = (message: BaseMessage) => {
  if (message._getType() === "human") {
    return { content: message.content, role: "user" };
  } else if (message._getType() === "ai") {
    return {
      content: message.content,
      role: "assistant",
      tool_calls: (message as AIMessage).tool_calls,
    };
  } else {
    return { content: message.content, role: message._getType() };
  }
};

const AGENT_SYSTEM_TEMPLATE = `You are a talking parrot named Polly. All final responses must be how a talking parrot would respond. Squawk often!`;

/**
 * This handler initializes and calls an tool caling ReAct agent.
 * See the docs for more information:
 *
 * https://langchain-ai.github.io/langgraphjs/tutorials/quickstart/
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const returnIntermediateSteps = body.show_intermediate_steps;
    // Controls randomness: 0 = deterministic responses, 1 = maximum randomness
    const temperature = body.temperature ?? 0.2;
    // Defines the AI's personality and behavior guidelines
    const systemPrompt = body.systemPrompt ?? AGENT_SYSTEM_TEMPLATE;
    // The GPT model to use (e.g., gpt-3.5-turbo, gpt-4)
    const modelName = body.model ?? "gpt-4o-mini";
    // Reduces repetition of the same phrases (-2.0 to 2.0, higher = stronger penalty)
    const frequencyPenalty = body.frequencyPenalty ?? 0;
    // Reduces repetition of overall topics (-2.0 to 2.0, higher = stronger penalty)
    const presencePenalty = body.presencePenalty ?? 0;
    // Maximum number of tokens (words/characters) in the response
    const maxTokens = body.maxTokens ?? 2048;
    // User's OpenAI API key for authentication
    const apiKey = body.apiKey; // Get API key from request body

    // Check if API key is provided
    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI API key is required" }, { status: 400 });
    }

    /**
     * We represent intermediate steps as system messages for display purposes,
     * but don't want them in the chat history.
     */
    const messages = (body.messages ?? [])
      .filter(
        (message: VercelChatMessage) =>
          message.role === "user" || message.role === "assistant",
      )
      .map(convertVercelMessageToLangChainMessage);

    // Requires process.env.SERPAPI_API_KEY to be set: https://serpapi.com/
    // You can remove this or use a different tool instead.
    const tools = [new Calculator(), new SerpAPI(), new CSVDataProcessor()];
    const chat = new ChatOpenAI({
      model: modelName,
      temperature: temperature,
      frequencyPenalty: frequencyPenalty,
      presencePenalty: presencePenalty,
      maxTokens: maxTokens,
      openAIApiKey: apiKey, // Use the provided API key
    });

    /**
     * Use a prebuilt LangGraph agent.
     */
    const agent = createReactAgent({
      llm: chat,
      tools,
      /**
       * Modify the stock prompt in the prebuilt agent. See docs
       * for how to customize your agent:
       *
       * https://langchain-ai.github.io/langgraphjs/tutorials/quickstart/
       */
      messageModifier: new SystemMessage(systemPrompt),
    });

    if (!returnIntermediateSteps) {
      /**
       * Stream back all generated tokens and steps from their runs.
       *
       * We do some filtering of the generated events and only stream back
       * the final response as a string.
       *
       * For this specific type of tool calling ReAct agents with OpenAI, we can tell when
       * the agent is ready to stream back final output when it no longer calls
       * a tool and instead streams back content.
       *
       * See: https://langchain-ai.github.io/langgraphjs/how-tos/stream-tokens/
       */
      const eventStream = await agent.streamEvents(
        { messages },
        { version: "v2" },
      );

      const textEncoder = new TextEncoder();
      const transformStream = new ReadableStream({
        async start(controller) {
          for await (const { event, data } of eventStream) {
            if (event === "on_chat_model_stream") {
              // Intermediate chat model generations will contain tool calls and no content
              if (!!data.chunk.content) {
                controller.enqueue(textEncoder.encode(data.chunk.content));
              }
            }
          }
          controller.close();
        },
      });

      return new StreamingTextResponse(transformStream);
    } else {
      /**
       * We could also pick intermediate steps out from `streamEvents` chunks, but
       * they are generated as JSON objects, so streaming and displaying them with
       * the AI SDK is more complicated.
       */
      const result = await agent.invoke({ messages });

      return NextResponse.json(
        {
          messages: result.messages.map(convertLangChainMessageToVercelMessage),
        },
        { status: 200 },
      );
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status ?? 500 });
  }
}
