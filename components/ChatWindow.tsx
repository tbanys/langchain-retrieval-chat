"use client";

import { type Message } from "ai";
import { useChat } from "ai/react";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { toast } from "sonner";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";

import { ChatMessageBubble } from "@/components/ChatMessageBubble";
import { IntermediateStep } from "./IntermediateStep";
import { Button } from "./ui/button";
import { ArrowDown, LoaderCircle, Paperclip } from "lucide-react";
import { Checkbox } from "./ui/checkbox";
import { UploadDocumentsForm } from "./UploadDocumentsForm";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Slider } from "./ui/slider";
import { cn } from "@/utils/cn";

function ChatMessages(props: {
  messages: Message[];
  emptyStateComponent: ReactNode;
  sourcesForMessages: Record<string, any>;
  aiEmoji?: string;
  className?: string;
}) {
  return (
    <div className="flex flex-col max-w-[768px] mx-auto pb-12 w-full">
      {props.messages.map((m, i) => {
        if (m.role === "system") {
          return <IntermediateStep key={m.id} message={m} />;
        }

        const sourceKey = (props.messages.length - 1 - i).toString();
        return (
          <ChatMessageBubble
            key={m.id}
            message={m}
            aiEmoji={props.aiEmoji}
            sources={props.sourcesForMessages[sourceKey]}
          />
        );
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
        className="absolute inset-0"
        contentClassName="py-8 px-2"
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
}) {
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

  const chat = useChat({
    api: props.endpoint,
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
    body: {
      temperature: temperature,
      systemPrompt: systemPrompt,
      model: model,
      frequencyPenalty: frequencyPenalty,
      presencePenalty: presencePenalty,
      maxTokens: maxTokens
    },
  });

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
      body: JSON.stringify({
        messages: messagesWithUserReply,
        show_intermediate_steps: true,
        temperature: temperature,
        systemPrompt: systemPrompt,
        model: model,
        frequencyPenalty: frequencyPenalty,
        presencePenalty: presencePenalty,
        maxTokens: maxTokens
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
    // TODO: Add proper support for tool messages
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
      intermediateStepMessages.push({
        id: (messagesWithUserReply.length + i / 2).toString(),
        role: "system" as const,
        content: JSON.stringify({
          action: aiMessage.tool_calls?.[0],
          observation: toolMessage.content,
        }),
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

    chat.setMessages([
      ...newMessages,
      {
        id: newMessages.length.toString(),
        content: responseMessages[responseMessages.length - 1].content,
        role: "assistant",
      },
    ]);
  }

  // Temperature slider component with popover
  // This component has been moved into the OpenAISettingsDialog
  
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
    
    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="ghost" className="pl-2 pr-3">
            <span>AI Settings</span>
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>OpenAI Settings</DialogTitle>
            <DialogDescription>
              Configure the AI model parameters to customize its behavior.
            </DialogDescription>
          </DialogHeader>
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
              <label className="text-sm font-medium">Temperature</label>
                <Slider
                  value={[localTemperature]}
                  min={0}
                  max={1}
                  step={0.1}
                  onValueChange={(value) => setLocalTemperature(value[0])}
                  className="col-span-1"
                />
            </div>
            
            <div className="grid gap-2">
              <label className="text-sm font-medium">Frequency Penalty</label>
              <Slider
                value={[localFrequencyPenalty]}
                min={0}
                max={2}
                step={0.1}
                onValueChange={(value) => setLocalFrequencyPenalty(value[0])}
              />
            </div>
            
            <div className="grid gap-2">
              <label className="text-sm font-medium">Presence Penalty</label>
              <Slider
                value={[localPresencePenalty]}
                min={0}
                max={2}
                step={0.1}
                onValueChange={(value) => setLocalPresencePenalty(value[0])}
              />
            </div>
            
            <div className="grid gap-2">
              <label className="text-sm font-medium">Max Tokens</label>
              <Slider
                value={[localMaxTokens]}
                min={1}
                max={4096}
                step={1}
                onValueChange={(value) => setLocalMaxTokens(value[0])}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" onClick={() => {
              setModel(localModel);
              setFrequencyPenalty(localFrequencyPenalty);
              setPresencePenalty(localPresencePenalty);
              setMaxTokens(localMaxTokens);
              setTemperature(localTemperature);
              // No need to manually close the dialog as the DialogClose button will handle this
            }}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <ChatLayout
      content={
        chat.messages.length === 0 ? (
          <div>{props.emptyStateComponent}</div>
        ) : (
          <ChatMessages
            aiEmoji={props.emoji}
            messages={chat.messages}
            emptyStateComponent={props.emptyStateComponent}
            sourcesForMessages={sourcesForMessages}
          />
        )
      }
      footer={
        <ChatInput
          value={chat.input}
          onChange={chat.handleInputChange}
          onSubmit={sendMessage}
          loading={chat.isLoading || intermediateStepsLoading}
          placeholder={props.placeholder ?? "What's it like to be a pirate?"}
          actions={
            <div className="flex items-center gap-2">
              <OpenAISettingsDialog />
              <SystemPromptDialog />
            </div>
          }
        >
          {props.showIngestForm && (
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  className="pl-2 pr-3 -ml-2"
                  disabled={chat.messages.length !== 0}
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
          {props.showIntermediateStepsToggle && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="show_intermediate_steps"
                name="show_intermediate_steps"
                checked={showIntermediateSteps}
                disabled={chat.isLoading || intermediateStepsLoading}
                onCheckedChange={(e) => setShowIntermediateSteps(!!e)}
              />
              <label htmlFor="show_intermediate_steps" className="text-sm">
                Show intermediate steps
              </label>
            </div>
          )}
        </ChatInput>
      }
    />
  );
}