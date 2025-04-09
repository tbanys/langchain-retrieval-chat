import { Message } from "ai";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { DataTable } from "@/components/ui/DataTable";

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  // Function to render custom components from markdown
  const renderMessage = (content: string) => {
    // Check if the content contains a DataTable component
    if (content.includes('<DataTable')) {
      const parts = content.split(/<DataTable|\/>/);
      return parts.map((part, index) => {
        if (index % 2 === 0) {
          // Regular markdown content
          return <ReactMarkdown key={index}>{part}</ReactMarkdown>;
        } else {
          // DataTable component
          try {
            // Extract props using a more robust regex pattern
            const headersMatch = part.match(/headers=\{(.*?)\}/s);
            const rowsMatch = part.match(/rows=\{(.*?)\}/s);

            if (headersMatch && rowsMatch) {
              // Clean up the extracted strings and parse them
              const headersStr = headersMatch[1].replace(/\\"/g, '"');
              const rowsStr = rowsMatch[1].replace(/\\"/g, '"');

              // Parse the cleaned strings
              const headers = JSON.parse(headersStr);
              const rows = JSON.parse(rowsStr);

              return <DataTable key={index} headers={headers} rows={rows} />;
            }
          } catch (error) {
            console.error('Error parsing DataTable props:', error);
            // Return a fallback UI for parsing errors
            return (
              <div key={index} className="text-red-500 p-2 border border-red-300 rounded">
                Error: Could not parse table data. Please check the format.
              </div>
            );
          }
          return null;
        }
      });
    }

    // Regular markdown content
    return <ReactMarkdown>{content}</ReactMarkdown>;
  };

  return (
    <div
      className={cn(
        "group relative mb-4 flex items-start md:mb-6",
        message.role === "user" ? "flex-row-reverse" : "flex-row"
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-md border shadow",
          message.role === "user"
            ? "bg-background"
            : "bg-primary text-primary-foreground"
        )}
      >
        {message.role === "user" ? "U" : "A"}
      </div>

      <div
        className={cn(
          "ml-4 flex-1 space-y-2 overflow-hidden px-1",
          message.role === "user" && "mr-4 ml-0"
        )}
      >
        <div className="prose break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0">
          {renderMessage(message.content)}
        </div>
      </div>
    </div>
  );
} 