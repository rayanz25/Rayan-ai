import React, { useState, useEffect } from 'react';
import { getAccessToken, googleSignIn } from '../firebase';
import { Mail, RefreshCw, Loader2, AlertCircle, Inbox, Send, LogOut } from 'lucide-react';

interface EmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  subject?: string;
  from?: string;
  date?: string;
}

export function GmailInbox({ onSignOut }: { onSignOut: () => void }) {
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEmails = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('No access token available');

      // Fetch list of messages
      const listRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&labelIds=INBOX', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!listRes.ok) {
        if(listRes.status === 401 || listRes.status === 403) {
          throw new Error('Unauthorized or permission denied. Please sign in again.');
        }
        throw new Error('Failed to fetch messages list');
      }
      
      const listData = await listRes.json();
      const messages = listData.messages || [];

      // Fetch details for each message
      const emailDetails = await Promise.all(
        messages.map(async (msg: any) => {
          const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const detailData = await detailRes.json();
          
          const headers = detailData.payload?.headers || [];
          const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || 'No Subject';
          const from = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || 'Unknown Sender';
          const date = headers.find((h: any) => h.name.toLowerCase() === 'date')?.value || '';

          return {
            id: detailData.id,
            threadId: detailData.threadId,
            snippet: detailData.snippet,
            subject,
            from,
            date
          };
        })
      );

      setEmails(emailDetails);
    } catch (err: any) {
      setError(err.message || 'Failed to load emails');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmails();
  }, []);

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50">
        <h3 className="font-medium text-gray-900 flex items-center gap-2">
          <Inbox className="w-5 h-5 text-indigo-600" />
          Recent Emails
        </h3>
        <div className="flex items-center gap-2">
          <button 
            onClick={fetchEmails} 
            disabled={loading}
            title="Refresh emails"
            className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button 
            onClick={onSignOut} 
            title="Sign Out"
            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-0">
        {loading && emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            <p className="text-sm">Loading inbox...</p>
          </div>
        ) : error ? (
          <div className="p-4 m-4 bg-red-50 text-red-700 rounded-lg flex items-start gap-3 border border-red-100">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm">Could not load emails</p>
              <p className="text-sm mt-1 opacity-90">{error}</p>
              {error.includes('Unauthorized') && (
                <button
                  onClick={async () => {
                    await googleSignIn();
                    fetchEmails();
                  }}
                  className="mt-3 text-sm bg-white text-red-700 border border-red-200 px-3 py-1.5 rounded-md hover:bg-red-50"
                >
                  Sign in again
                </button>
              )}
            </div>
          </div>
        ) : emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <Mail className="w-10 h-10 mb-3 opacity-20" />
            <p className="text-sm">Inbox is empty</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {emails.map((email) => (
              <li key={email.id} className="p-4 hover:bg-gray-50 transition-colors group cursor-pointer">
                <div className="flex justify-between items-start gap-4 mb-1">
                  <h4 className="font-medium text-gray-900 truncate flex-1 group-hover:text-indigo-600 transition-colors">
                    {email.subject}
                  </h4>
                  <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">
                    {email.date ? new Date(email.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}
                  </span>
                </div>
                <div className="text-xs text-gray-600 truncate mb-1.5">
                  <span className="font-medium text-gray-700">From:</span> {email.from}
                </div>
                <p className="text-sm text-gray-500 line-clamp-2 leading-relaxed">
                  {email.snippet.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
