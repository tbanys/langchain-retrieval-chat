import { Message } from "ai";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { DataTable } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  // Process content to check for download links in JSON
  const processContent = (content: string) => {
    // First check for typical markdown download link pattern
    const downloadLinkRegex = /\[Download (?:the )?(CSV|Excel)(?: File)?\]\(([^)]*)\)/i;
    if (downloadLinkRegex.test(content)) {
      // Replace the markdown download links with actual buttons
      return (
        <ReactMarkdown
          components={{
            a: ({ node, ...props }) => {
              const text = String(props.children).toLowerCase();
              if (text.includes('download') && text.includes('csv') || text.includes('excel')) {
                return (
                  <Button 
                    onClick={(e) => {
                      e.preventDefault();
                      handleManualDownload(message.content);
                    }}
                    className="flex items-center"
                    disabled={isDownloading}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {isDownloading ? "Downloading..." : props.children}
                  </Button>
                );
              }
              return <a {...props} />;
            }
          }}
        >
          {content}
        </ReactMarkdown>
      );
    }

    // Function to handle manual download from text content
    const handleManualDownload = (content: string) => {
      setIsDownloading(true);
      try {
        // Create a simple CSV with the content
        const blob = new Blob([content], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = "cleaned_data.csv";
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        
        // Clean up
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          setIsDownloading(false);
          toast.success("File downloaded successfully");
        }, 100);
      } catch (error) {
        console.error("Download error:", error);
        setIsDownloading(false);
        toast.error("Failed to download file. Please try again.");
      }
    };

    try {
      // Try to parse the content as JSON to check if it contains a download link
      const json = JSON.parse(content);
      if (json.download_link && (json.file_format || json.file_name)) {
        // This is a download response
        const fileName = json.file_name || `cleaned_data.${json.file_format || 'csv'}`;
        
        // Function to handle download properly
        const handleDownload = (e: React.MouseEvent) => {
          e.preventDefault(); // Prevent default button behavior
          e.stopPropagation(); // Stop event propagation
          
          setIsDownloading(true);
          
          try {
            // Get the data URL
            const dataUrl = json.download_link;
            
            // Extract base64 data - remove the data:text/csv;base64, part
            const base64Data = dataUrl.split(',')[1];
            if (!base64Data) {
              throw new Error("Invalid data URL format");
            }
            
            // Decode base64 to binary
            const binaryData = atob(base64Data);
            
            // Convert binary to Uint8Array
            const bytes = new Uint8Array(binaryData.length);
            for (let i = 0; i < binaryData.length; i++) {
              bytes[i] = binaryData.charCodeAt(i);
            }
            
            // Create a blob from the bytes
            const blob = new Blob(
              [bytes], 
              { type: json.file_format === 'excel' ? 'application/vnd.ms-excel' : 'text/csv' }
            );
            
            // Create a URL for the blob
            const url = URL.createObjectURL(blob);
            
            // Create a download link and click it
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            
            // Clean up
            setTimeout(() => {
              document.body.removeChild(link);
              URL.revokeObjectURL(url);
              setIsDownloading(false);
              toast.success(`File "${fileName}" downloaded successfully`);
            }, 100);
          } catch (error) {
            console.error("Download error:", error);
            setIsDownloading(false);
            toast.error("Failed to download file. Please try again.");
          }
        };
        
        return (
          <div className="p-4 border rounded-md bg-gray-50 dark:bg-gray-800">
            <p className="mb-4">{json.message || "Your data is ready to download"}</p>
            <Button 
              onClick={handleDownload}
              className="flex items-center"
              disabled={isDownloading}
            >
              <Download className="mr-2 h-4 w-4" />
              {isDownloading ? "Downloading..." : `Download ${json.file_format ? json.file_format.toUpperCase() : 'CSV'}`}
            </Button>
          </div>
        );
      }
    } catch (e) {
      // Not JSON or doesn't contain download link, continue with regular rendering
    }
    
    // Function to render custom components from markdown
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

    // Regular markdown content with enhanced link rendering
    return (
      <ReactMarkdown
        components={{
          a: ({ node, ...props }) => {
            const text = String(props.children).toLowerCase();
            if (text.includes('download') && (text.includes('csv') || text.includes('excel'))) {
              return (
                <Button 
                  onClick={(e) => {
                    e.preventDefault();
                    handleManualDownload(content);
                  }}
                  className="flex items-center"
                  disabled={isDownloading}
                >
                  <Download className="mr-2 h-4 w-4" />
                  {isDownloading ? "Downloading..." : props.children}
                </Button>
              );
            }
            return <a {...props} />;
          }
        }}
      >
        {content}
      </ReactMarkdown>
    );
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
          {processContent(message.content)}
        </div>
      </div>
    </div>
  );
} 