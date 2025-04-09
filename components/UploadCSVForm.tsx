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
  const { toast } = useToast();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === "text/csv") {
      setFile(selectedFile);
    } else {
      toast({
        title: "Invalid file type",
        description: "Please upload a CSV file",
        variant: "destructive",
      });
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

    try {
      // Read the file content
      const reader = new FileReader();
      
      reader.onload = (event) => {
        if (event.target?.result) {
          const csvContent = event.target.result as string;
          
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
      </div>
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