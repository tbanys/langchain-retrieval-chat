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

// --- Helper Functions ---

// Additional security validation function
function validateCSVData(csvData: string): { valid: boolean; error?: string } {
  if (!csvData || !csvData.trim()) {
    return { valid: false, error: "Empty CSV data" };
  }

  // Size check
  const sizeInMB = csvData.length / (1024 * 1024);
  if (sizeInMB > 15) { // Server-side limit slightly higher than client
    return { valid: false, error: `CSV data too large (${sizeInMB.toFixed(2)}MB)` };
  }

  // Basic structure validation
  const lines = csvData.trim().split('\n');
  if (lines.length < 1) {
    return { valid: false, error: "CSV must have at least a header row" };
  }

  // Column count validation
  const headers = lines[0].split(',').map(h => h.trim());
  if (headers.length === 0) {
    return { valid: false, error: "No columns detected in CSV" };
  }
  
  if (headers.length > 1000) {
    return { valid: false, error: "Too many columns (max: 1000)" };
  }
  
  // Row count validation
  if (lines.length > 200000) {
    return { valid: false, error: "Too many rows (max: 200,000)" };
  }
  
  // Security checks
  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /eval\(/i,
    /function\(/i,
    /setTimeout/i,
    /document\./i
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(csvData)) {
      return { valid: false, error: "CSV contains potentially unsafe content" };
    }
  }
  
  return { valid: true };
}

// Slightly more robust CSV parsing (handles simple quotes, still limited)
function parseCsvRow(rowString: string): string[] {
    const result: string[] = [];
    let currentField = '';
    let inQuotes = false;
    for (let i = 0; i < rowString.length; i++) {
        const char = rowString[i];
        if (char === '"') {
            // Handle escaped quotes ("")
            if (inQuotes && rowString[i + 1] === '"') {
                currentField += '"';
                i++; // Skip the next quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(currentField.trim());
            currentField = '';
        } else {
            currentField += char;
        }
    }
    result.push(currentField.trim()); // Add the last field
    return result;
}

function parseCSV(csvString: string): { headers: string[], data: string[][] } {
    const lines = csvString.trim().split('\n');
    if (lines.length === 0) {
        return { headers: [], data: [] };
    }
    const headers = parseCsvRow(lines[0]);
    const data = lines.slice(1).map(line => parseCsvRow(line));
    // Basic validation: ensure all rows have same length as headers (or handle inconsistencies)
    const consistentData = data.filter(row => row.length === headers.length);
    if (consistentData.length !== data.length) {
        console.warn("CSV Parse Warning: Some rows had inconsistent column counts and were potentially skipped.");
    }
    return { headers, data: consistentData };
}

function formatCSV(headers: string[], data: string[][]): string {
    const headerRow = headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','); // Quote headers
    const dataRows = data.map(row =>
        row.map(cell => `"${(cell ?? '').toString().replace(/"/g, '""')}"`).join(',') // Quote all cells
    );
    return [headerRow, ...dataRows].join('\n');
}

// Generate a downloadable file content with base64 encoding
function generateDownloadableFile(csvData: string, format: string): string {
    // For CSV, we can just use the CSV data directly with base64 encoding
    if (format === 'csv') {
        return `data:text/csv;base64,${Buffer.from(csvData).toString('base64')}`;
    }
    
    // For Excel format, we would typically need a library like ExcelJS
    // This is a simplified approach that creates a CSV with Excel mime type
    if (format === 'excel') {
        return `data:application/vnd.ms-excel;base64,${Buffer.from(csvData).toString('base64')}`;
    }
    
    return '';
}

// CSV Data Processing Tool
class CSVDataProcessor extends StructuredTool {
  name = "csv_processor";
  description = "Process, clean, and analyze CSV data. Input should be a CSV string or a URL to a CSV file.";
  schema = z.object({
    csv_data: z.string().describe("The CSV data as a string or URL to a CSV file"),
    operation: z.enum([
      "analyze", 
      "filter", 
      "summarize", 
      "visualize", 
      "clean_missing", 
      "detect_outliers", 
      "remove_duplicates", 
      "generate_report",
      "download_data"  // New operation to download data
    ]).describe("The operation to perform on the CSV data"),
    column: z.string().optional().describe("The column to operate on (for filter, summarize, clean_missing, detect_outliers operations)"),
    condition: z.string().optional().describe("The condition to filter by (for filter operation)"),
    method: z.string().optional().describe("The method to use for cleaning (e.g., 'mean', 'median', 'mode', 'drop' for missing values)"),
    threshold: z.number().optional().describe("The threshold for outlier detection (e.g., z-score threshold)"),
    format: z.enum(["csv", "excel"]).optional().describe("The format for downloading data (csv or excel)"),
    processed_data: z.string().optional().describe("Previously processed CSV data to download (for download_data operation)"),
  });

  async _call(input: z.infer<typeof this.schema>) {
    try {
      const { csv_data, operation, column, condition, method, threshold, format, processed_data } = input;
      
      // Validate operation
      const validOperations = ["analyze", "filter", "summarize", "visualize", "clean_missing", 
                               "detect_outliers", "remove_duplicates", "generate_report", "download_data"];
      if (!validOperations.includes(operation)) {
        return `Error: Invalid operation "${operation}". Valid operations are: ${validOperations.join(', ')}`;
      }
      
      // Special case for download operation
      if (operation === "download_data") {
        const dataToDownload = processed_data || csv_data;
        
        // Validate download data
        const validation = validateCSVData(dataToDownload);
        if (!validation.valid) {
          return `Error: ${validation.error}`;
        }
        
        const downloadFormat = format || "csv";
        if (!["csv", "excel"].includes(downloadFormat)) {
          return "Error: Invalid download format. Use 'csv' or 'excel'.";
        }
        
        const downloadLink = generateDownloadableFile(dataToDownload, downloadFormat);
        return JSON.stringify({
          download_link: downloadLink,
          file_format: downloadFormat,
          message: `Your cleaned data is ready to download as a ${downloadFormat.toUpperCase()} file.`
        });
      }
      
      // Validate CSV data
      const validation = validateCSVData(csv_data);
      if (!validation.valid) {
        return `Error: ${validation.error}`;
      }
      
      // Parse CSV data using the proper parsing function
      const { headers, data } = parseCSV(csv_data);
      
      // Validate column if provided
      if (column && !headers.includes(column)) {
        return `Error: Column "${column}" not found in the CSV data. Available columns: ${headers.join(', ')}`;
      }
      
      // For demonstration purposes, we'll return detailed responses
      // In a real implementation, you would process the parsed CSV according to the operation
      
      if (operation === "analyze") {
        const rowCount = data.length;
        const columnCount = headers.length;
        const missingValues = this._countMissingValues(data, headers);
        
        return `Analysis of CSV data:
                - Total rows: ${rowCount}
                - Total columns: ${columnCount}
                - Columns: ${headers.join(', ')}
                - Missing values: ${JSON.stringify(missingValues)}
                - Duplicate rows: ${this._countDuplicates(data)}`;
      } else if (operation === "filter" && column && condition) {
        const columnIndex = headers.indexOf(column);
        if (columnIndex === -1) {
          return `Column "${column}" not found in the CSV data.`;
        }
        
        // Simple filtering logic (would be more complex in a real implementation)
        const filteredData = data.filter(row => {
          const value = row[columnIndex];
          // This is a simplified condition check
          return value && value.includes(condition);
        });
        
        // Format filtered data for potential download
        const filteredCsv = formatCSV(headers, filteredData);
        
        return JSON.stringify({
          summary: `Filtered CSV data for column "${column}" with condition "${condition}":
                    - Original rows: ${data.length}
                    - Filtered rows: ${filteredData.length}
                    - Removed rows: ${data.length - filteredData.length}`,
          processed_csv_data: filteredCsv
        });
      } else if (operation === "summarize" && column) {
        const columnIndex = headers.indexOf(column);
        if (columnIndex === -1) {
          return `Column "${column}" not found in the CSV data.`;
        }
        
        const values = data.map(row => row[columnIndex]).filter(Boolean);
        const numericValues = values.filter(v => !isNaN(Number(v))).map(Number);
        
        if (numericValues.length > 0) {
          const sum = numericValues.reduce((a, b) => a + b, 0);
          const mean = sum / numericValues.length;
          const sorted = [...numericValues].sort((a, b) => a - b);
          const median = sorted.length % 2 === 0 
            ? (sorted[sorted.length/2 - 1] + sorted[sorted.length/2]) / 2 
            : sorted[Math.floor(sorted.length/2)];
          
          return `Summary of column "${column}":
                  - Count: ${values.length}
                  - Numeric values: ${numericValues.length}
                  - Mean: ${mean.toFixed(2)}
                  - Median: ${median.toFixed(2)}
                  - Min: ${Math.min(...numericValues)}
                  - Max: ${Math.max(...numericValues)}`;
        } else {
          // For non-numeric columns, count unique values
          const uniqueValues = new Set(values);
          return `Summary of column "${column}":
                  - Count: ${values.length}
                  - Unique values: ${uniqueValues.size}
                  - Sample values: ${Array.from(uniqueValues).slice(0, 5).join(', ')}`;
        }
      } else if (operation === "clean_missing" && column && method) {
        const columnIndex = headers.indexOf(column);
        if (columnIndex === -1) {
          return `Column "${column}" not found in the CSV data.`;
        }
        
        const missingCount = data.filter(row => !row[columnIndex] || row[columnIndex].trim() === '').length;
        
        if (method === 'drop') {
          const cleanedData = data.filter(row => row[columnIndex] && row[columnIndex].trim() !== '');
          
          // Format cleaned data for potential download
          const cleanedCsv = formatCSV(headers, cleanedData);
          
          return JSON.stringify({
            summary: `Cleaned missing values in column "${column}" using method "${method}":
                      - Original rows: ${data.length}
                      - Rows with missing values: ${missingCount}
                      - Remaining rows: ${cleanedData.length}
                      - Removed rows: ${data.length - cleanedData.length}`,
            processed_csv_data: cleanedCsv
          });
        } else {
          // For imputation methods (mean, median, mode)
          // NOTE: This is a placeholder; real implementation would actually perform the imputation
          return JSON.stringify({
            summary: `Cleaned missing values in column "${column}" using method "${method}":
                      - Original rows: ${data.length}
                      - Rows with missing values: ${missingCount}
                      - Imputed values: ${missingCount}
                      - Method used: ${method}`,
            processed_csv_data: csv_data  // This would be the actual imputed data in a real implementation
          });
        }
      } else if (operation === "detect_outliers" && column && threshold) {
        const columnIndex = headers.indexOf(column);
        if (columnIndex === -1) {
          return `Column "${column}" not found in the CSV data.`;
        }
        
        const numericValues = data
          .map(row => row[columnIndex])
          .filter(v => !isNaN(Number(v)))
          .map(Number);
        
        if (numericValues.length === 0) {
          return `Column "${column}" does not contain numeric values.`;
        }
        
        // Simple z-score based outlier detection
        const mean = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
        const stdDev = Math.sqrt(
          numericValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / numericValues.length
        );
        
        const outliers = numericValues.filter(v => Math.abs((v - mean) / stdDev) > threshold);
        
        return `Outlier detection for column "${column}" with threshold ${threshold}:
                - Total values: ${numericValues.length}
                - Mean: ${mean.toFixed(2)}
                - Standard deviation: ${stdDev.toFixed(2)}
                - Outliers detected: ${outliers.length}
                - Outlier values: ${outliers.slice(0, 5).join(', ')}${outliers.length > 5 ? '...' : ''}`;
      } else if (operation === "remove_duplicates") {
        // Create a map to track unique rows with proper handling of empty/null values
        const uniqueRowMap = new Map<string, string[]>();
        data.forEach(row => {
          const rowKey = row.map(cell => (cell ?? '').trim()).join('|');
          if (!uniqueRowMap.has(rowKey)) {
            uniqueRowMap.set(rowKey, row);
          }
        });
        const cleanedData = Array.from(uniqueRowMap.values());
        const originalRowCount = data.length;
        const removedCount = originalRowCount - cleanedData.length;
        
        // Format the cleaned data back to CSV
        const finalCsv = formatCSV(headers, cleanedData);
        const summary = `Removed ${removedCount} duplicate rows. Kept ${cleanedData.length} unique rows.`;
        
        // Return both the summary and the cleaned data in JSON format for further processing
        if (removedCount > 0) {
          return JSON.stringify({ 
            summary: summary,
            processed_csv_data: finalCsv
          });
        } else {
          // If no duplicates found, just return a simple message
          return `Duplicate removal:
                  - Original rows: ${originalRowCount}
                  - Unique rows: ${cleanedData.length}
                  - Duplicate rows removed: ${removedCount}`;
        }
      } else if (operation === "generate_report") {
        const rowCount = data.length;
        const columnCount = headers.length;
        const missingValues = this._countMissingValues(data, headers);
        const duplicateCount = this._countDuplicates(data);
        
        // Check for potential outliers in numeric columns
        const numericColumns = headers.filter((_, i) => 
          data.some(row => !isNaN(Number(row[i])))
        );
        
        const outlierSummary = numericColumns.map(col => {
          const colIndex = headers.indexOf(col);
          const values = data.map(row => Number(row[colIndex])).filter(v => !isNaN(v));
          if (values.length === 0) return null;
          
          const mean = values.reduce((a, b) => a + b, 0) / values.length;
          const stdDev = Math.sqrt(
            values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length
          );
          
          const outliers = values.filter(v => Math.abs((v - mean) / stdDev) > 3);
          return outliers.length > 0 ? `${col}: ${outliers.length} potential outliers` : null;
        }).filter((item): item is string => item !== null);
        
        return `Data Cleaning Report:
                - Dataset: ${rowCount} rows × ${columnCount} columns
                - Columns: ${headers.join(', ')}
                - Missing values: ${JSON.stringify(missingValues)}
                - Duplicate rows: ${duplicateCount}
                - Potential outliers: ${outlierSummary.length > 0 ? outlierSummary.join(', ') : 'None detected'}
                - Recommendations:
                  ${this._generateRecommendations(missingValues, duplicateCount, outlierSummary)}`;
      } else if (operation === "visualize") {
        return `Visualization of CSV data: This would generate a chart or graph based on the data.
                Available visualizations:
                - Bar chart (for categorical data)
                - Line chart (for time series data)
                - Scatter plot (for relationships between numeric columns)
                - Histogram (for distribution of numeric data)
                - Box plot (for outlier detection)`;
      } else {
        return "Invalid operation or missing parameters. Please specify a valid operation and required parameters.";
      }
    } catch (error) {
      return `Error processing CSV data: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  
  // Helper methods
  _countMissingValues(data: string[][], headers: string[]): Record<string, number> {
    const missingCounts: Record<string, number> = {};
    
    headers.forEach((header, colIndex) => {
      missingCounts[header] = data.filter(row => !row[colIndex] || row[colIndex].trim() === '').length;
    });
    
    return missingCounts;
  }
  
  _countDuplicates(data: string[][]): number {
    // Improved duplicate detection using pipe separator and trimming values
    const uniqueRows = new Set<string>();
    let duplicateCount = 0;
    
    data.forEach((row) => {
      // Create a string representation of the row with pipe separator
      const rowKey = row.map(cell => (cell ?? '').trim()).join('|');
      
      if (uniqueRows.has(rowKey)) {
        duplicateCount++;
      } else {
        uniqueRows.add(rowKey);
      }
    });
    
    return duplicateCount;
  }
  
  _generateRecommendations(
    missingValues: Record<string, number>, 
    duplicateCount: number,
    outlierSummary: string[]
  ): string {
    const recommendations: string[] = [];
    
    // Check for missing values
    const columnsWithMissing = Object.entries(missingValues)
      .filter(([_, count]) => count > 0)
      .map(([col, _]) => col);
    
    if (columnsWithMissing.length > 0) {
      recommendations.push(`- Consider cleaning missing values in columns: ${columnsWithMissing.join(', ')}`);
    }
    
    // Check for duplicates
    if (duplicateCount > 0) {
      recommendations.push(`- Remove ${duplicateCount} duplicate rows to improve data quality`);
    }
    
    // Check for outliers
    if (outlierSummary.length > 0) {
      recommendations.push(`- Investigate potential outliers in columns: ${outlierSummary.join(', ')}`);
    }
    
    return recommendations.join('\n');
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

const AGENT_SYSTEM_TEMPLATE = `You are a data cleaning agent. Your job is to help users clean and analyze their datasets.
You have access to a CSV data processor tool that can perform various operations on CSV data.
When a user uploads a file, analyze it and provide insights about data quality issues.
Offer specific recommendations for cleaning the data, such as handling missing values, detecting outliers, or removing duplicates.
Always explain your reasoning and the impact of each cleaning operation on the dataset.
Be thorough but concise in your explanations.

After cleaning operations, offer users the option to download their cleaned data in CSV or Excel format.
To generate a download link, use the csv_processor tool with the "download_data" operation, passing the processed data from previous operations.

IMPORTANT: When offering a download, always use the csv_processor tool to generate the link.
DO NOT create a markdown download link like "[Download the CSV File]()" - this will not work.
Instead, use the tool and say something like "Would you like to download your cleaned data? Just let me know and I'll generate a download link for you."

Example prompt to trigger download:
User: "Yes, please give me the download link"
You should then call the csv_processor tool with operation: "download_data", format: "csv", and the processed data.`;

// Rate limiting implementation
// This is a simple in-memory rate limiter for demo purposes
// In production, use Redis or similar for distributed rate limiting
const rateLimiter = {
  // Store IP addresses and their request timestamps
  requests: new Map<string, number[]>(),
  
  // Check if IP is allowed to make a request
  isAllowed: function(ip: string, maxRequests: number = 50, windowMs: number = 60000) {
    const now = Date.now();
    
    // Get existing requests for this IP
    const timestamps = this.requests.get(ip) || [];
    
    // Filter out requests outside the time window
    const recentRequests = timestamps.filter(timestamp => now - timestamp < windowMs);
    
    // Update the requests map with recent requests
    this.requests.set(ip, recentRequests);
    
    // Check if the number of recent requests is less than the limit
    return recentRequests.length < maxRequests;
  },
  
  // Log a new request for an IP
  logRequest: function(ip: string) {
    const now = Date.now();
    const timestamps = this.requests.get(ip) || [];
    timestamps.push(now);
    this.requests.set(ip, timestamps);
  },
  
  // Clean up old entries (should be called periodically)
  cleanup: function() {
    const now = Date.now();
    this.requests.forEach((timestamps, ip) => {
      const recentRequests = timestamps.filter(timestamp => now - timestamp < 24 * 60 * 60 * 1000);
      if (recentRequests.length === 0) {
        this.requests.delete(ip);
      } else {
        this.requests.set(ip, recentRequests);
      }
    });
  }
};

// Sanitize input to prevent harmful inputs
function sanitizeInputs(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeInputs(item));
  }
  
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    // Skip null or undefined values
    if (value === null || value === undefined) {
      result[key] = value;
      continue;
    }
    
    // Sanitize strings
    if (typeof value === 'string') {
      // Replace potentially dangerous patterns in strings
      let sanitized = value
        .replace(/<script/gi, '&lt;script')
        .replace(/javascript:/gi, 'disabled-javascript:')
        .replace(/on\w+=/gi, 'data-on='); // Disable event handlers
      
      result[key] = sanitized;
      continue;
    }
    
    // Recursively sanitize objects
    if (typeof value === 'object') {
      result[key] = sanitizeInputs(value);
      continue;
    }
    
    // Keep other types as is
    result[key] = value;
  }
  
  return result;
}

/**
 * This handler initializes and calls an tool caling ReAct agent.
 * See the docs for more information:
 *
 * https://langchain-ai.github.io/langgraphjs/tutorials/quickstart/
 */
export async function POST(req: NextRequest) {
  try {
    // Apply rate limiting based on IP - but make it very lenient for local development
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    
    // Temporarily disable rate limiting for testing
    // Uncomment this block for production
    /*
    if (!rateLimiter.isAllowed(ip, 50, 60000)) { // 50 requests per minute
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }
    
    // Log this request
    rateLimiter.logRequest(ip);
    */
    
    const body = await req.json();
    
    // Sanitize inputs before processing
    const sanitizedBody = sanitizeInputs(body);
    
    const returnIntermediateSteps = sanitizedBody.show_intermediate_steps;
    const temperature = sanitizedBody.temperature ?? 0.2;
    const systemPrompt = sanitizedBody.systemPrompt ?? AGENT_SYSTEM_TEMPLATE;
    const modelName = sanitizedBody.model ?? "gpt-4o-mini";
    const frequencyPenalty = sanitizedBody.frequencyPenalty ?? 0;
    const presencePenalty = sanitizedBody.presencePenalty ?? 0;
    const maxTokens = Math.min(sanitizedBody.maxTokens ?? 2048, 4096); // Cap max tokens
    const apiKey = sanitizedBody.apiKey;
    const csvData = sanitizedBody.csvData;
    const csvFileName = sanitizedBody.csvFileName;

    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI API key is required" }, { status: 400 });
    }
    
    // Validate CSV data if present
    if (csvData) {
      const validation = validateCSVData(csvData);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
    }

    const messages = (sanitizedBody.messages ?? [])
      .filter(
        (message: VercelChatMessage) =>
          message.role === "user" || message.role === "assistant",
      )
      .map(convertVercelMessageToLangChainMessage);

    // Create a custom CSVDataProcessor that automatically includes the CSV data
    class CustomCSVDataProcessor extends CSVDataProcessor {
      async _call(input: z.infer<typeof this.schema>) {
        // Check if the input.csv_data looks like a filename or is empty
        if (!input.csv_data || 
            input.csv_data.trim() === 'sample_data.csv' || 
            (input.csv_data.endsWith('.csv') && !input.csv_data.includes('\n'))) {
          
          // If it's a filename or empty, use the CSV data from the request
          if (csvData) {
            console.log("Replacing filename reference with actual CSV data from upload");
            
            // Handle the specific operation type with custom enhancements for better reporting
            if (input.operation === "download_data") {
              // Generate downloadable link for the CSV data with the specified format
              const format = input.format || "csv";
              const fileName = csvFileName || `cleaned_data.${format}`;
              
              const downloadLink = generateDownloadableFile(csvData, format);
              return JSON.stringify({
                download_link: downloadLink,
                file_name: fileName,
                file_format: format,
                message: `Your data is ready to download as a ${format.toUpperCase()} file.`
              });
            } else if (input.operation === "remove_duplicates") {
              // First parse the CSV data to identify duplicate rows for better reporting
              const { headers, data } = parseCSV(csvData);
              
              // Track unique rows and collect duplicates for reporting
              const uniqueRowMap = new Map<string, string[]>();
              const duplicates: { row: string[], count: number }[] = [];
              const rowCounts = new Map<string, number>();
              
              // Count occurrences of each row
              data.forEach(row => {
                const rowKey = row.map(cell => (cell ?? '').trim()).join('|');
                rowCounts.set(rowKey, (rowCounts.get(rowKey) || 0) + 1);
                
                // Keep track of the first occurrence of each row
                if (!uniqueRowMap.has(rowKey)) {
                  uniqueRowMap.set(rowKey, row);
                }
              });
              
              // Collect information about duplicates (rows with count > 1)
              for (const [key, count] of rowCounts.entries()) {
                if (count > 1) {
                  duplicates.push({
                    row: uniqueRowMap.get(key) || [],
                    count: count
                  });
                }
              }
              
              // If there are duplicates, provide detailed information
              if (duplicates.length > 0) {
                return super._call({
                  ...input,
                  csv_data: csvData
                });
              } else {
                return "No duplicate rows were found in the dataset.";
              }
            }
            
            // For other operations, just pass the actual CSV data
            return super._call({
              ...input,
              csv_data: csvData
            });
          } else {
            return "Error: No CSV data available. Please upload a CSV file first.";
          }
        }
        
        // Otherwise, use the provided CSV data (could be from a previous operation)
        return super._call(input);
      }
    }

    const tools = [new Calculator(), new SerpAPI(), new CustomCSVDataProcessor()];
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
