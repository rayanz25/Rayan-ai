/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, User, Bot, Loader2, Mail } from 'lucide-react';
import { cn } from './utils';
import { initAuth, googleSignIn, logout, getAccessToken, saveMessageToFirestore, loadMessagesFromFirestore } from './firebase';
import { GmailInbox } from './components/GmailInbox';
import type { User as FirebaseUser } from 'firebase/auth';

type Message = {
  role: 'user' | 'model';
  content: string;
};

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const unsubscribe = initAuth(
      (user) => {
        setAuthUser(user);
        setAuthInitialized(true);
      },
      () => {
        setAuthUser(null);
        setAuthInitialized(true);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (authUser) {
      loadMessagesFromFirestore(authUser.uid).then(msgs => {
        setMessages(msgs);
      });
    } else {
      setMessages([]);
    }
  }, [authUser]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    if (authUser) {
      saveMessageToFirestore(authUser.uid, userMessage).catch(console.error);
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch response');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder('utf-8');

      if (!reader) throw new Error('No reader available');

      setMessages([...newMessages, { role: 'model', content: '' }]);

      let assistantMessage = '';
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        
        // Keep the last part in buffer if it doesn't end with \n\n
        buffer = parts.pop() || '';

        for (const part of parts) {
          const lines = part.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.substring(6).trim();
              if (data === '[DONE]') break;
              
              try {
                const parsed = JSON.parse(data);
                if (parsed.text) {
                  assistantMessage += parsed.text;
                  setMessages((prev) => {
                    const updated = [...prev];
                    updated[updated.length - 1].content = assistantMessage;
                    return updated;
                  });
                }
              } catch (err) {
                console.error('Error parsing stream data', err, data);
              }
            }
          }
        }
      }
      
      if (authUser && assistantMessage) {
        saveMessageToFirestore(authUser.uid, { role: 'model', content: assistantMessage }).catch(console.error);
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) => [
        ...prev,
        { role: 'model', content: `*Error: ${error instanceof Error ? error.message : 'Could not reach the assistant.'}*` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900 font-sans overflow-hidden">
      <header className="flex-shrink-0 bg-white border-b border-gray-200 py-4 px-6 sticky top-0 z-10 shadow-sm flex items-center justify-between">
        <h1 className="text-xl font-medium tracking-tight flex items-center gap-2">
          <Bot className="w-6 h-6 text-indigo-600" />
          AI Studio Assistant
        </h1>
        <div>
          {authInitialized ? (
            authUser ? (
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700 hidden sm:inline-block">{authUser.email}</span>
              </div>
            ) : (
              <button
                onClick={googleSignIn}
                className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors gap-2"
              >
                <Mail className="w-4 h-4" />
                Connect Gmail
              </button>
            )
          ) : (
            <div className="w-24 h-8 bg-gray-100 animate-pulse rounded-lg"></div>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Chat Interface */}
        <div className={cn("flex flex-col h-full transition-all duration-300", authUser ? "w-full lg:w-1/2 lg:border-r border-gray-200" : "w-full max-w-4xl mx-auto")}>
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 w-full space-y-6">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in duration-700">
                <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center shadow-inner">
                  <Bot className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold tracking-tight text-gray-800">How can I help you today?</h2>
                  <p className="text-gray-500 max-w-sm">
                    I can answer questions, write code, and help you build applications from scratch.
                  </p>
                </div>
              </div>
            ) : (
              messages.map((message, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "flex gap-4 p-4 rounded-2xl animate-in slide-in-from-bottom-2 fade-in duration-300",
                    message.role === 'user' 
                      ? "bg-indigo-50 border border-indigo-100 ml-auto max-w-[85%]" 
                      : "bg-white border border-gray-100 shadow-sm mr-auto max-w-[95%]"
                  )}
                >
                  <div className="flex-shrink-0 mt-1">
                    {message.role === 'user' ? (
                      <div className="w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center">
                        <User className="w-5 h-5" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 bg-gray-800 text-white rounded-full flex items-center justify-center">
                        <Bot className="w-5 h-5" />
                      </div>
                    )}
                  </div>
                  <div className={cn(
                    "prose prose-sm sm:prose-base max-w-none w-full",
                    message.role === 'user' ? "prose-indigo text-indigo-950" : "prose-gray text-gray-800"
                  )}>
                    {message.role === 'user' ? (
                      <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
                    ) : (
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </main>

          <div className="flex-shrink-0 bg-white border-t border-gray-200 p-4 sm:p-6 w-full">
            <div className="w-full">
              <form 
                onSubmit={handleSubmit}
                className="relative flex items-end overflow-hidden rounded-2xl border border-gray-300 bg-white shadow-sm focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent transition-all"
              >
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }}
                  placeholder="Ask me anything or let's build something..."
                  className="w-full max-h-48 min-h-[56px] resize-none border-0 bg-transparent py-4 pl-4 pr-14 text-gray-900 placeholder:text-gray-400 focus:ring-0 sm:text-base leading-relaxed"
                  rows={1}
                />
                <div className="absolute right-2 bottom-2">
                  <button
                    type="submit"
                    disabled={!input.trim() || isLoading}
                    className="inline-flex items-center justify-center rounded-xl bg-indigo-600 p-2 text-white shadow-sm hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:bg-gray-300 disabled:text-gray-500 disabled:shadow-none transition-colors"
                  >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  </button>
                </div>
              </form>
              <div className="text-center mt-3">
                <p className="text-xs text-gray-400">AI can make mistakes. Consider verifying important information.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Gmail Panel */}
        {authUser && (
          <div className="hidden lg:block w-1/2 p-6 bg-gray-50 h-full overflow-hidden">
            <GmailInbox onSignOut={logout} />
          </div>
        )}
      </div>
    </div>
  );
}
