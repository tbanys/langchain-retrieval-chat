import { useState, useRef } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { LoaderCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { DialogClose } from "@/components/ui/dialog";

interface UploadCSVFormProps {
  onCSVUploaded?: (csvContent: string, fileName: string) => void;
}

export function UploadCSVForm({ onCSVUploaded }: UploadCSVFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const MAX_FILE_SIZE_MB = 10;
  
  const validateFile = (file: File): { valid: boolean; error?: string } => {
    // Check file type
    const validTypes = ['text/csv', 'application/vnd.ms-excel', 'text/plain'];
    if (!validTypes.includes(file.type)) {
      return { 
        valid: false, 
        error: "Invalid file type. Please upload a CSV file." 
      };
    }
    
    // Check file extension
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension !== 'csv') {
      return { 
        valid: false, 
        error: "File must have a .csv extension." 
      };
    }
    
    // Check file size
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      return { 
        valid: false, 
        error: `File size (${fileSizeMB.toFixed(2)}MB) exceeds maximum allowed size of ${MAX_FILE_SIZE_MB}MB.` 
      };
    }
    
    return { valid: true };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    
    const validation = validateFile(selectedFile);
    if (validation.valid) {
      setFile(selectedFile);
    } else {
      toast({
        title: "Invalid file",
        description: validation.error,
        variant: "destructive",
      });
      // Reset the file input
      e.target.value = '';
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast({
        title: "No file selected",
        description: "Please select a CSV file to upload",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Read the file content
      const reader = new FileReader();
      
      // Track progress
      reader.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(progress);
        }
      };
      
      reader.onload = (event) => {
        if (event.target?.result) {
          const csvContent = event.target.result as string;
          
          // Basic content validation
          if (!csvContent.trim()) {
            toast({
              title: "Error",
              description: "The CSV file appears to be empty",
              variant: "destructive",
            });
            return;
          }
          
          // Basic structure validation
          const lines = csvContent.trim().split('\n');
          if (lines.length < 1) {
            toast({
              title: "Error",
              description: "The CSV file must contain at least a header row",
              variant: "destructive",
            });
            return;
          }
          
          // Check for CSV format
          // This is a simple check - the full validation is in the handler component
          const firstLine = lines[0];
          if (!firstLine.includes(',')) {
            toast({
              title: "Format error",
              description: "The file doesn't appear to be a valid CSV (no commas detected)",
              variant: "destructive",
            });
            return;
          }
          
          // Security check (basic)
          const sensitivePatterns = [
            /<script/i,
            /javascript:/i,
            /eval\(/i
          ];
          
          for (const pattern of sensitivePatterns) {
            if (pattern.test(csvContent)) {
              toast({
                title: "Security error",
                description: "The file contains potentially unsafe content",
                variant: "destructive",
              });
              return;
            }
          }
          
          // Pass the CSV content to the parent component
          if (onCSVUploaded) {
            onCSVUploaded(csvContent, file.name);
          }
          
          toast({
            title: "Success",
            description: "CSV file loaded successfully",
          });
          setFile(null);
          
          // Close the dialog
          closeButtonRef.current?.click();
        }
      };
      
      reader.onerror = () => {
        toast({
          title: "Error",
          description: "Failed to read CSV file. Please try again.",
          variant: "destructive",
        });
      };
      
      // Read the file as text
      reader.readAsText(file);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to process CSV file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="csv-file">CSV File</Label>
        <Input
          id="csv-file"
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          disabled={isUploading}
        />
        <p className="text-xs text-muted-foreground">
          Maximum file size: {MAX_FILE_SIZE_MB}MB. Only CSV files are supported.
        </p>
      </div>
      
      {isUploading && (
        <div className="space-y-2">
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full" 
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
          <p className="text-xs text-center">{uploadProgress}% processed</p>
        </div>
      )}
      
      <div className="flex justify-end gap-2">
        <DialogClose ref={closeButtonRef} className="hidden" />
        <Button
          onClick={handleUpload}
          disabled={!file || isUploading}
          className="w-full"
        >
          {isUploading ? (
            <>
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            "Load CSV"
          )}
        </Button>
      </div>
    </div>
  );
} 