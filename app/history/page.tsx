"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Trash, MessageSquare, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

type ChatHistory = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: { content: string }[];
};

export default function HistoryPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [chatHistories, setChatHistories] = useState<ChatHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Redirect if not authenticated
    if (status === 'unauthenticated') {
      router.push('/login');
    }

    // Fetch chat histories if authenticated
    if (status === 'authenticated') {
      fetchChatHistories();
    }
  }, [status, router]);

  const fetchChatHistories = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/chat/history');
      if (!response.ok) {
        throw new Error('Failed to fetch chat histories');
      }
      const data = await response.json();
      setChatHistories(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteHistory = async (id: string) => {
    if (confirm('Are you sure you want to delete this chat?')) {
      try {
        const response = await fetch(`/api/chat/history/${id}`, {
          method: 'DELETE',
        });
        
        if (!response.ok) {
          throw new Error('Failed to delete chat history');
        }
        
        // Remove the deleted history from state
        setChatHistories(chatHistories.filter(history => history.id !== id));
      } catch (err: any) {
        setError(err.message);
      }
    }
  };

  // Loading state
  if (status === 'loading' || (status === 'authenticated' && isLoading)) {
    return (
      <div className="flex min-h-screen flex-col p-8">
        <h1 className="text-3xl font-bold mb-8">Chat History</h1>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (status === 'unauthenticated') {
    return null; // Will redirect in the useEffect
  }

  return (
    <div className="flex min-h-screen flex-col p-4 md:p-8">
      <h1 className="text-2xl md:text-3xl font-bold mb-4 md:mb-8">Your Chat History</h1>
      
      {error && (
        <div className="p-4 mb-6 rounded-md bg-destructive/10 text-destructive">
          {error}
        </div>
      )}

      {chatHistories.length === 0 && !isLoading ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <MessageSquare className="h-12 w-12 mb-4 text-muted-foreground" />
          <h3 className="text-xl font-semibold">No chat history yet</h3>
          <p className="text-muted-foreground mt-2 mb-4">Start a new conversation to see it here.</p>
          <Button asChild>
            <Link href="/">Start New Chat</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {chatHistories.map((history) => (
            <div 
              key={history.id}
              className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold truncate flex-1">{history.title}</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteHistory(history.id)}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 -mr-2 -mt-2"
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
              
              <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                {history.messages[0]?.content || "No messages"}
              </p>
              
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span>{format(new Date(history.updatedAt), 'MMM d, yyyy')}</span>
                <Button asChild variant="ghost" size="sm" className="gap-1">
                  <Link href={`/chat/${history.id}`}>
                    View <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}