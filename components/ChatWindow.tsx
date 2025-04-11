"use client";
import { type Message } from "ai";
import { useChat } from "ai/react";
import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { toast } from "sonner";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { ChatMessageBubble } from "@/components/ChatMessageBubble";
import { IntermediateStep } from "./IntermediateStep";
import { Button } from "./ui/button";
import { ArrowDown, LoaderCircle, Paperclip, LogIn, FileSpreadsheet } from "lucide-react";
import { Checkbox } from "./ui/checkbox";
import { UploadDocumentsForm } from "./UploadDocumentsForm";
import { UploadCSVForm } from "./UploadCSVForm";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "./ui/dialog";

import { Slider } from "./ui/slider";
import { cn } from "@/utils/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Download } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { ChatMessage } from "@/components/ChatMessage";

function ChatMessages(props: {
  messages: Message[];
  isLoading: boolean;
  reload?: () => void;
}) {
  if (!props.messages.length) {
    return null;
  }

  return (
    <div className="relative mx-auto max-w-2xl px-4">
      {props.messages.map((message, i) => {
        // Check if this is a system message with intermediate steps
        if (message.role === "system") {
          try {
            // Try to parse the content as JSON to check if it's an intermediate step
            const parsedContent = JSON.parse(message.content);
            if (parsedContent.action && parsedContent.observation) {
              return <IntermediateStep key={message.id} message={message} />;
            }
          } catch (e) {
            // If parsing fails, it's not an intermediate step message
          }
        }
        
        // For all other messages, use the standard ChatMessage component
        return <ChatMessage key={message.id} message={message} />;
      })}
    </div>
  );
}

export function ChatInput(props: {
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onStop?: () => void;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  loading?: boolean;
  placeholder?: string;
  children?: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  const disabled = props.loading && props.onStop == null;
  return (
    <form
      onSubmit={(e) => {
        e.stopPropagation();
        e.preventDefault();
        if (props.loading) {
          props.onStop?.();
        } else {
          props.onSubmit(e);
        }
      }}
      className={cn("flex w-full flex-col", props.className)}
    >
      <div className="border border-input bg-secondary rounded-lg flex flex-col gap-2 max-w-[768px] w-full mx-auto">
        <input
          value={props.value}
          placeholder={props.placeholder}
          onChange={props.onChange}
          className="border-none outline-none bg-transparent p-4"
        />
        <div className="flex justify-between ml-4 mr-2 mb-2">
          <div className="flex gap-3">{props.children}</div>
          <div className="flex gap-2 self-end">
            {props.actions}
            <Button type="submit" className="self-end" disabled={disabled}>
              {props.loading ? (
                <span role="status" className="flex justify-center">
                  <LoaderCircle className="animate-spin" />
                  <span className="sr-only">Loading...</span>
                </span>
              ) : (
                <span>Send</span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

function ScrollToBottom(props: { className?: string }) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  if (isAtBottom) return null;
  return (
    <Button
      variant="outline"
      className={props.className}
      onClick={() => scrollToBottom()}
    >
      <ArrowDown className="w-4 h-4" />
      <span>Scroll to bottom</span>
    </Button>
  );
}

function StickyToBottomContent(props: {
  content: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const context = useStickToBottomContext();
  // scrollRef will also switch between overflow: unset to overflow: auto
  return (
    <div
      ref={context.scrollRef}
      style={{ width: "100%", height: "100%" }}
      className={cn("grid grid-rows-[1fr,auto]", props.className)}
    >
      <div ref={context.contentRef} className={props.contentClassName}>
        {props.content}
      </div>
      {props.footer}
    </div>
  );
}

export function ChatLayout(props: { content: ReactNode; footer: ReactNode }) {
  return (
    <StickToBottom>
      <StickyToBottomContent
        className="absolute inset-0 pt-24"
        contentClassName="px-2 pb-8"
        content={props.content}
        footer={
          <div className="sticky bottom-8 px-2">
            <ScrollToBottom className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4" />
            {props.footer}
          </div>
        }
      />
    </StickToBottom>
  );
}

export function ChatWindow(props: {
  endpoint: string;
  emptyStateComponent: ReactNode;
  placeholder?: string;
  emoji?: string;
  showIngestForm?: boolean;
  showIntermediateStepsToggle?: boolean;
  chatId?: string;
  uploadType?: "document" | "csv";
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [showIntermediateSteps, setShowIntermediateSteps] = useState(
    !!props.showIntermediateStepsToggle,
  );
  const [intermediateStepsLoading, setIntermediateStepsLoading] =
    useState(false);
  const [temperature, setTemperature] = useState(0.8); // Default temperature value
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful AI assistant."); // Default system prompt
  const [sourcesForMessages, setSourcesForMessages] = useState<
    Record<string, any>
  >({});
  const [model, setModel] = useState("gpt-4");
  const [frequencyPenalty, setFrequencyPenalty] = useState(0);
  const [presencePenalty, setPresencePenalty] = useState(0);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [userApiKey, setUserApiKey] = useState("");
  const [chatTitle, setChatTitle] = useState("New Chat");
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string | undefined>(props.chatId);
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [csvData, setCsvData] = useState<string | null>(null);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);

  // Fetch user's API key if logged in
  useEffect(() => {
    if (session?.user?.id) {
      fetchUserApiKey();
    }

    const loadHistory = false;
    // If a chatId is provided, load that chat
    if (props.chatId && loadHistory) {
      loadChatHistory(props.chatId);
    }
  }, [session, props.chatId]);

  const fetchUserApiKey = async () => {
    try {
      const response = await fetch('/api/user/profile');
      if (response.ok) {
        const data = await response.json();
        if (data.apiKey) {
          setUserApiKey(data.apiKey);
        }
      }
    } catch (error) {
      console.error('Error fetching user API key:', error);
    }
  };

  const loadChatHistory = async (chatId: string) => {
    setIsLoadingChat(true);
    try {
      const response = await fetch(`/api/chat/history/${chatId}`);
      if (response.ok) {
        const chatData = await response.json();
        setChatTitle(chatData.title);

        // Convert messages from the database format to the format expected by useChat
        const formattedMessages = chatData.messages.map((msg: any) => ({
          id: msg.id,
          content: msg.content,
          role: msg.role,
        }));

        // Set the messages in the chat
        chat.setMessages(formattedMessages);
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
      toast.error('Failed to load chat history');
    } finally {
      setIsLoadingChat(false);
    }
  };

  const saveChatToDatabase = async (messages: Message[]) => {
    // Skip saving chat history for now
    return;
  };

  // Handle CSV upload
  const handleCSVUploaded = (csvContent: string, fileName: string) => {
    // File type validation
    const allowedExtensions = ['.csv', '.txt'];
    const fileExtension = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
    if (!allowedExtensions.includes(fileExtension)) {
      toast.error("Invalid file type. Only CSV files are allowed");
      return;
    }
    
    // Size validation - rough estimate based on string length
    const fileSizeInMB = csvContent.length / (1024 * 1024);
    const maxSizeInMB = 10; // 10MB limit
    if (fileSizeInMB > maxSizeInMB) {
      toast.error(`File too large (${fileSizeInMB.toFixed(2)}MB). Maximum size is ${maxSizeInMB}MB`);
      return;
    }

    // Basic content validation
    if (!csvContent.trim()) {
      toast.error("The CSV file appears to be empty");
      return;
    }

    // CSV structure validation
    const lines = csvContent.trim().split('\n');
    if (lines.length < 1) {
      toast.error("The CSV file must contain at least a header row");
      return;
    }

    const headers = lines[0].split(',').map(h => h.trim());
    if (headers.length === 0) {
      toast.error("No columns found in the CSV file");
      return;
    }
    
    // Check for reasonable number of columns (to prevent DOS)
    if (headers.length > 500) {
      toast.error("Too many columns in the CSV file (max: 500)");
      return;
    }
    
    // Check for reasonable number of rows (to prevent DOS)
    if (lines.length > 100000) {
      toast.error("Too many rows in the CSV file (max: 100,000)");
      return;
    }
    
    // Validate data consistency
    const columnCount = headers.length;
    let malformedRows = 0;
    
    // Check a sample of rows for consistent column counts
    const sampleSize = Math.min(100, lines.length - 1);
    for (let i = 1; i <= sampleSize; i++) {
      const row = lines[i].split(',');
      if (row.length !== columnCount) {
        malformedRows++;
      }
    }
    
    if (malformedRows > sampleSize * 0.1) { // If more than 10% of sample rows are malformed
      toast.error("CSV file has inconsistent column counts across rows");
      return;
    }
    
    // Content safety check (basic)
    const sensitivePatterns = [
      /<script/i,
      /javascript:/i,
      /eval\(/i,
      /onerror=/i,
      /<%.*%>/i, // Template injection patterns
      /\$/i // SQL injection basic check
    ];
    
    let containsSuspiciousContent = false;
    for (const pattern of sensitivePatterns) {
      if (pattern.test(csvContent)) {
        containsSuspiciousContent = true;
        break;
      }
    }
    
    if (containsSuspiciousContent) {
      toast.error("The file contains potentially unsafe content");
      return;
    }

    setCsvData(csvContent.trim());
    setCsvFileName(fileName);
    
    // Update system prompt to include CSV context
    setSystemPrompt(`You are a helpful AI assistant with access to CSV data analysis capabilities. The CSV file "${fileName}" has been loaded.

To analyze the data, use the csv_processor tool with the following parameters:
- csv_data: Use the provided CSV data from the request
- operation: Choose from "analyze", "filter", "summarize", "clean_missing", "detect_outliers", "remove_duplicates", or "generate_report"
- column: (Optional) Specify a column name when needed
- condition: (Optional) For filtering operations
- method: (Optional) For cleaning operations (e.g., 'mean', 'median', 'mode', 'drop')
- threshold: (Optional) For outlier detection

Available columns: ${headers.join(', ')}

When using the csv_processor tool, always include the CSV data in the csv_data parameter.`);

    // Calculate some basic stats
    const totalRows = lines.length - 1; // Excluding header
    const totalColumns = headers.length;
    const data = lines.slice(1).map(row => row.split(',').map(cell => cell.trim()));
    
    // Add a message to inform the user that the CSV has been loaded
    const csvLoadedMessage: Message = {
      id: Date.now().toString(),
      role: "assistant",
      content: `CSV file "${fileName}" has been loaded successfully! 📊

**Dataset Overview:**
- Total Rows: ${totalRows}
- Total Columns: ${totalColumns}
- Column Names: ${headers.join(', ')}

**Preview of your data:**
<DataTable headers={${JSON.stringify(headers)}} rows={${JSON.stringify(data)}} />

You can now ask me questions about your data! Here are some examples of what you can ask:
- "Analyze this dataset"
- "Show me a summary of the ${headers[0]} column"
- "Find any missing values"
- "Check for outliers in numeric columns"
- "Remove duplicate rows"
- "Generate a data quality report"
- "Calculate statistics for ${headers[headers.length - 1]}"

What would you like to know about your data?`,
    };

    // Clear any existing messages and set the new CSV message
    chat.setMessages([csvLoadedMessage]);

    // Log CSV data for debugging
    console.log('CSV Data loaded:', {
      fileName,
      headers,
      rowCount: totalRows,
      sampleRow: lines.length > 1 ? lines[1] : 'No data rows'
    });
  };

  const chat = useChat({
    api: props.endpoint, // Use the endpoint provided by the parent component
    onResponse(response) {
      const sourcesHeader = response.headers.get("x-sources");
      const sources = sourcesHeader
        ? JSON.parse(Buffer.from(sourcesHeader, "base64").toString("utf8"))
        : [];
      const messageIndexHeader = response.headers.get("x-message-index");
      if (sources.length && messageIndexHeader !== null) {
        setSourcesForMessages({
          ...sourcesForMessages,
          [messageIndexHeader]: sources,
        });
      }
    },
    streamMode: "text",
    onError: (e) =>
      toast.error(`Error while processing your request`, {
        description: e.message,
      }),
    onFinish: (message) => {
      // Save the updated chat to the database
      saveChatToDatabase([...chat.messages]);
    },
    body: {
      temperature: temperature,
      systemPrompt: systemPrompt,
      model: model,
      frequencyPenalty: frequencyPenalty,
      presencePenalty: presencePenalty,
      maxTokens: maxTokens,
      apiKey: userApiKey, // Use the user's API key from their profile
      csvData: csvData, // Include the CSV data in the request
      csvFileName: csvFileName, // Include the CSV file name in the request
      showIntermediateSteps: showIntermediateSteps,
    },
  });

  // Add a greeting message when chat is initialized
  useEffect(() => {
    if (chat.messages.length === 0 && !isLoadingChat) {
      chat.setMessages([
        {
          id: "greeting",
          content: "Hello! I'm your AI assistant. How can I help you today?",
          role: "assistant",
        },
      ]);
    }
  }, [isLoadingChat]);

  async function sendMessage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (chat.isLoading || intermediateStepsLoading) return;
    if (!showIntermediateSteps) {
      chat.handleSubmit(e);
      return;
    }
    // Some extra work to show intermediate steps properly
    setIntermediateStepsLoading(true);
    chat.setInput("");
    const messagesWithUserReply = chat.messages.concat({
      id: chat.messages.length.toString(),
      content: chat.input,
      role: "user",
    });
    chat.setMessages(messagesWithUserReply);
    const response = await fetch(props.endpoint, {
      method: "POST",
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: messagesWithUserReply,
        show_intermediate_steps: true,
        temperature: temperature,
        systemPrompt: systemPrompt,
        model: model,
        frequencyPenalty: frequencyPenalty,
        presencePenalty: presencePenalty,
        maxTokens: maxTokens,
        apiKey: userApiKey,
        csvData: csvData, // Include CSV data
        csvFileName: csvFileName, // Include CSV filename
      }),
    });
    const json = await response.json();
    setIntermediateStepsLoading(false);
    if (!response.ok) {
      toast.error(`Error while processing your request`, {
        description: json.error,
      });
      return;
    }
    const responseMessages: Message[] = json.messages;
    // Represent intermediate steps as system messages for display purposes
    const toolCallMessages = responseMessages.filter(
      (responseMessage: Message) => {
        return (
          (responseMessage.role === "assistant" &&
            !!responseMessage.tool_calls?.length) ||
          responseMessage.role === "tool"
        );
      },
    );
    const intermediateStepMessages = [];
    for (let i = 0; i < toolCallMessages.length; i += 2) {
      const aiMessage = toolCallMessages[i];
      const toolMessage = toolCallMessages[i + 1];
      
      const toolCall = aiMessage.tool_calls?.[0];
      const toolName = typeof toolCall === 'object' && toolCall !== null && 'name' in toolCall 
        ? toolCall.name === "csv_processor" ? "CSV Processor" : toolCall.name
        : "Unknown Tool";
      const toolArgs = typeof toolCall === 'object' && toolCall !== null && 'args' in toolCall
        ? toolCall.args
        : {};
      
      intermediateStepMessages.push({
        id: (messagesWithUserReply.length + i / 2).toString(),
        role: "system" as const,
        content: JSON.stringify({
          action: {
            name: toolName,
            args: toolArgs
          },
          observation: toolMessage.content
        })
      });
    }
    const newMessages = messagesWithUserReply;
    for (const message of intermediateStepMessages) {
      newMessages.push(message);
      chat.setMessages([...newMessages]);
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 + Math.random() * 1000),
      );
    }
    const finalMessages: Message[] = [
      ...newMessages,
      {
        id: newMessages.length.toString(),
        content: responseMessages[responseMessages.length - 1].content,
        role: "assistant" as const,
      }
    ];
    chat.setMessages(finalMessages);

    // Save chat to database after completing with intermediate steps
    saveChatToDatabase(finalMessages);
  }

  // System prompt dialog component
  const SystemPromptDialog = () => {
    const [localSystemPrompt, setLocalSystemPrompt] = useState(systemPrompt);

    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="ghost" className="pl-2 pr-3">
            <span>System Prompt</span>
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit System Prompt</DialogTitle>
            <DialogDescription>
              Customize the AI assistant behavior by editing the system instructions.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <textarea
              className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Enter system instructions here..."
              value={localSystemPrompt}
              onChange={(e) => setLocalSystemPrompt(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" onClick={() => {
              setSystemPrompt(localSystemPrompt);
              // No need to manually close the dialog as the DialogClose button will handle this
            }}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  // OpenAI Settings dialog component
  const OpenAISettingsDialog = () => {
    const [localModel, setLocalModel] = useState(model);
    const [localFrequencyPenalty, setLocalFrequencyPenalty] = useState(frequencyPenalty);
    const [localPresencePenalty, setLocalPresencePenalty] = useState(presencePenalty);
    const [localMaxTokens, setLocalMaxTokens] = useState(maxTokens);
    const [localTemperature, setLocalTemperature] = useState(temperature);
    const [showFullDescription, setShowFullDescription] = useState(false);
    const [localShowIntermediateSteps, setLocalShowIntermediateSteps] = useState(showIntermediateSteps);

    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="ghost" className="pl-2 pr-3">
            <span>AI Settings</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-none">
            <DialogTitle>OpenAI Settings</DialogTitle>
            <DialogDescription>
              Configure the AI model parameters to customize its behavior.
            </DialogDescription>
            <div className="flex justify-start">
              {!showFullDescription ? (
                <Button
                  variant="link"
                  className="p-0 h-auto text-xs"
                  onClick={() => setShowFullDescription(true)}
                >
                  Show usage tips
                </Button>
              ) : (
                <div>
                  <Button
                    variant="link"
                    className="p-0 h-auto text-xs"
                    onClick={() => setShowFullDescription(false)}
                  >
                    Hide usage tips
                  </Button>
                  <ul className="mt-2 text-sm text-muted-foreground">
                    <li>For creative writing: Use higher temperature (0.7-1.0), moderate frequency penalty (0.5-1.5), and low presence penalty</li>
                    <li>For factual responses: Use lower temperature (0.1-0.4), low frequency penalty, and low presence penalty</li>
                    <li>For diverse responses: Increase presence penalty to encourage exploration of different topics</li>
                    <li>For focused responses: Use negative presence penalty to stay on topic</li>
                    <li>For concise answers: Limit max tokens (e.g., 100-300)</li>
                    <li>For detailed explanations: Allow more tokens (1000+)</li>
                  </ul>
                </div>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Model</label>
                <select
                  value={localModel}
                  onChange={(e) => setLocalModel(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="gpt-4">GPT-4</option>
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                </select>
              </div>

              <div className="grid gap-2">
                <div className="flex justify-between">
                  <label className="text-sm font-medium">Temperature</label>
                  <span className="text-sm font-medium">{localTemperature.toFixed(1)}</span>
                </div>
                <Slider
                  value={[localTemperature]}
                  min={0}
                  max={1}
                  step={0.1}
                  onValueChange={(value) => setLocalTemperature(value[0])}
                  className="col-span-1"
                />
                <p className="text-xs text-muted-foreground">Controls randomness: Lower values are more deterministic, higher values are more creative.</p>
              </div>

              <div className="grid gap-2">
                <div className="flex justify-between">
                  <label className="text-sm font-medium">Frequency Penalty</label>
                  <span className="text-sm font-medium">{localFrequencyPenalty.toFixed(1)}</span>
                </div>
                <Slider
                  value={[localFrequencyPenalty]}
                  min={-2.0}
                  max={2.0}
                  step={0.1}
                  onValueChange={(value) => setLocalFrequencyPenalty(value[0])}
                />
                <p className="text-xs text-muted-foreground">Reduces repetition of specific phrases.</p>
              </div>

              <div className="grid gap-2">
                <div className="flex justify-between">
                  <label className="text-sm font-medium">Presence Penalty</label>
                  <span className="text-sm font-medium">{localPresencePenalty.toFixed(1)}</span>
                </div>
                <Slider
                  value={[localPresencePenalty]}
                  min={-2.0}
                  max={2.0}
                  step={0.1}
                  onValueChange={(value) => setLocalPresencePenalty(value[0])}
                />
                <p className="text-xs text-muted-foreground">Encourages discussing new topics.</p>
              </div>

              <div className="grid gap-2">
                <div className="flex justify-between">
                  <label className="text-sm font-medium">Max Tokens</label>
                  <span className="text-sm font-medium">{localMaxTokens}</span>
                </div>
                <Slider
                  value={[localMaxTokens]}
                  min={1}
                  max={4096}
                  step={1}
                  onValueChange={(value) => setLocalMaxTokens(value[0])}
                />
                <p className="text-xs text-muted-foreground">Maximum length of the response (roughly 3/4 words per token).</p>
              </div>

              {props.showIntermediateStepsToggle && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="show_intermediate_steps"
                    name="show_intermediate_steps"
                    checked={localShowIntermediateSteps}
                    disabled={chat.isLoading || intermediateStepsLoading}
                    onCheckedChange={(e) => setLocalShowIntermediateSteps(!!e)}
                  />
                  <label htmlFor="show_intermediate_steps" className="text-sm">
                    Show intermediate steps
                  </label>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="flex-none">
            <Button type="submit" onClick={() => {
              setModel(localModel);
              setFrequencyPenalty(localFrequencyPenalty);
              setPresencePenalty(localPresencePenalty);
              setMaxTokens(localMaxTokens);
              setTemperature(localTemperature);
              setShowIntermediateSteps(localShowIntermediateSteps);
              // No need to manually close the dialog as the DialogClose button will handle this
            }}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  const downloadChat = (messages: Message[], format: string) => {
    const timestamp = new Date().toISOString().split('T')[0];
    let content = '';
    let filename = `chat-export-${timestamp}`;

    switch (format) {
      case 'json':
        content = JSON.stringify(messages, null, 2);
        filename += '.json';
        break;
      case 'txt':
        content = messages
          .map(m => `${m.role}: ${m.content}`)
          .join('\n\n');
        filename += '.txt';
        break;
      case 'csv':
        content = 'Role,Content\n' + messages
          .map(m => `"${m.role}","${m.content.replace(/"/g, '""')}"`)
          .join('\n');
        filename += '.csv';
        break;
    }
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    setShowDownloadDialog(false);
  };

  // Show login prompt for unauthenticated users
  if (status === 'unauthenticated') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Sign in to use AI Chat</h2>
          <p className="text-muted-foreground">
            Create an account to save your chat history and personalize your experience.
          </p>
        </div>
        <div className="flex space-x-4">
          <Button asChild>
            <Link href="/register">
              Create Account
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/login">
              <LogIn className="mr-2 h-4 w-4" />
              Sign In
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // Loading state while checking authentication
  if (status === 'loading' || isLoadingChat) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Check if user has set API key
  const hasApiKey = !!userApiKey;

  return (
    <ChatLayout
      content={
        !hasApiKey ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="mb-4 text-center">
              <h2 className="text-2xl font-bold">Welcome to the AI Chat</h2>
              <p className="text-muted-foreground">Please set your OpenAI API key in your profile</p>
            </div>
            <Button asChild>
              <Link href="/profile">Go to Profile Settings</Link>
            </Button>
          </div>
        ) : chat.messages.length === 0 ? (
          <div>{props.emptyStateComponent}</div>
        ) : (
          <ChatMessages
            isLoading={chat.isLoading || intermediateStepsLoading}
            messages={chat.messages}
          />
        )
      }
      footer={
        hasApiKey ? (
          <ChatInput
            value={chat.input}
            onChange={chat.handleInputChange}
            onSubmit={sendMessage}
            loading={chat.isLoading || intermediateStepsLoading}
            placeholder={props.placeholder ?? "Ask me anything about your data..."}
            actions={
              <div className="flex items-center gap-2">
                {chat.messages.length > 0 && (
                  <Dialog open={showDownloadDialog} onOpenChange={setShowDownloadDialog}>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <Download className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Download Chat</DialogTitle>
                        <DialogDescription>
                          Choose a format to download your chat history
                        </DialogDescription>
                      </DialogHeader>
                      <div className="flex flex-col gap-2 py-4">
                        <Button
                          variant="outline"
                          onClick={() => downloadChat(chat.messages, 'txt')}
                          className="w-full justify-start"
                        >
                          Download as TXT
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => downloadChat(chat.messages, 'json')}
                          className="w-full justify-start"
                        >
                          Download as JSON
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => downloadChat(chat.messages, 'csv')}
                          className="w-full justify-start"
                        >
                          Download as CSV
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
                <OpenAISettingsDialog />
                <SystemPromptDialog />
              </div>
            }
          >
            {props.showIngestForm && !csvData && (
              <>
                {props.uploadType === "document" && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        className="pl-2 pr-3 -ml-2"
                        disabled={chat.messages.length > 1}
                      >
                        <Paperclip className="size-4" />
                        <span>Upload document</span>
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Upload document</DialogTitle>
                        <DialogDescription>
                          Upload a document to use for the chat.
                        </DialogDescription>
                      </DialogHeader>
                      <UploadDocumentsForm />
                    </DialogContent>
                  </Dialog>
                )}
                {props.uploadType === "csv" && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        className="pl-2 pr-3 -ml-2"
                        disabled={chat.messages.length > 1}
                      >
                        <FileSpreadsheet className="size-4" />
                        <span>Upload CSV</span>
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Upload CSV</DialogTitle>
                        <DialogDescription>
                          Upload a CSV file to use for the chat.
                        </DialogDescription>
                      </DialogHeader>
                      <UploadCSVForm onCSVUploaded={handleCSVUploaded} />
                    </DialogContent>
                  </Dialog>
                )}
              </>
            )}
          </ChatInput>
        ) : (
          <div className="flex justify-center pb-4">
            <Button asChild>
              <Link href="/profile">Set API Key</Link>
            </Button>
          </div>
        )
      }
    />
  );
}