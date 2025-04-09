"use client";

import { ChatWindow } from "@/components/ChatWindow";
import { GuideInfoBox } from "@/components/guide/GuideInfoBox";
import { InfoIcon, UploadIcon, FileIcon, CheckCircleIcon } from "lucide-react";

export default function HomePage() {
  const InfoCard = (
    <GuideInfoBox>
      <ul>
        <li className="text-l">
          <InfoIcon className="inline-block mr-2 h-5 w-5" />
          <span className="ml-2">
            This agent has memory and access to a search engine, a calculator, and a CSV data processor.
          </span>
        </li>
        <li>
          <UploadIcon className="inline-block mr-2 h-5 w-5" />
          <span className="ml-2">
            Upload your CSV or Excel file and the agent will help you clean and analyze your data.
          </span>
        </li>
        <li>
          <FileIcon className="inline-block mr-2 h-5 w-5" />
          <span className="ml-2">
            The agent can detect missing values, outliers, and duplicate rows.
          </span>
        </li>
        <li>
          <CheckCircleIcon className="inline-block mr-2 h-5 w-5" />
          <span className="ml-2">
            After cleaning, you can download the processed dataset.
          </span>
        </li>
      </ul>
    </GuideInfoBox>
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <ChatWindow
        endpoint="/api/chat/agents"
        emptyStateComponent={InfoCard}
        placeholder="Ask me anything about your data..."
        emoji="🤖"
        showIngestForm={true}
        showIntermediateStepsToggle={true}
        uploadType="csv"
      />
    </div>
  );
}
