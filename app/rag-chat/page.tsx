"use client";

import { ChatWindow } from "@/components/ChatWindow";
import { GuideInfoBox } from "@/components/guide/GuideInfoBox";
import { InfoIcon, BookOpen, MessagesSquare } from "lucide-react";

export default function RagChatPage() {
  const InfoCard = (
    <GuideInfoBox>
      <ul>
        <li className="text-l">
          <InfoIcon className="inline-block mr-2 h-5 w-5" />
          <span className="ml-2">
            This is a RAG (Retrieval Augmented Generation) chatbot that can answer questions about your documents.
          </span>
        </li>
        <li>
          <BookOpen className="inline-block mr-2 h-5 w-5" />
          <span className="ml-2">
            Upload your documents and the chatbot will use them as context to answer your questions.
          </span>
        </li>
        <li>
          <MessagesSquare className="inline-block mr-2 h-5 w-5" />
          <span className="ml-2">
            The chatbot will provide relevant quotes and citations from your documents.
          </span>
        </li>
      </ul>
    </GuideInfoBox>
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <ChatWindow
        endpoint="/api/chat/retrieval"
        emptyStateComponent={InfoCard}
        placeholder="Ask questions about your documents..."
        emoji="📚"
        showIngestForm={true}
        showIntermediateStepsToggle={false}
        uploadType="document"
      />
    </div>
  );
} 