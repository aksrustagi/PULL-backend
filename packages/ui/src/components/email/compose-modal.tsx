"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

export interface Recipient {
  email: string;
  name?: string;
}

export interface DraftAttachment {
  id: string;
  file: File;
  progress?: number;
}

export interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend?: (data: {
    to: Recipient[];
    cc?: Recipient[];
    bcc?: Recipient[];
    subject: string;
    body: string;
    attachments?: File[];
  }) => void;
  onSaveDraft?: () => void;
  initialTo?: Recipient[];
  initialCc?: Recipient[];
  initialSubject?: string;
  initialBody?: string;
  replyTo?: { email: string; name?: string; subject?: string };
  forwardFrom?: { subject: string; body: string };
  suggestedRecipients?: Recipient[];
  className?: string;
}

export function ComposeModal({
  isOpen,
  onClose,
  onSend,
  onSaveDraft,
  initialTo = [],
  initialCc = [],
  initialSubject = "",
  initialBody = "",
  replyTo,
  forwardFrom,
  suggestedRecipients = [],
  className,
}: ComposeModalProps) {
  const [to, setTo] = React.useState<Recipient[]>(initialTo);
  const [cc, setCc] = React.useState<Recipient[]>(initialCc);
  const [bcc, setBcc] = React.useState<Recipient[]>([]);
  const [subject, setSubject] = React.useState(initialSubject);
  const [body, setBody] = React.useState(initialBody);
  const [attachments, setAttachments] = React.useState<DraftAttachment[]>([]);
  const [showCc, setShowCc] = React.useState(initialCc.length > 0);
  const [showBcc, setShowBcc] = React.useState(false);
  const [toInput, setToInput] = React.useState("");
  const [ccInput, setCcInput] = React.useState("");
  const [bccInput, setBccInput] = React.useState("");
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isMinimized, setIsMinimized] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const toInputRef = React.useRef<HTMLInputElement>(null);

  // Handle reply/forward initialization
  React.useEffect(() => {
    if (replyTo) {
      setTo([{ email: replyTo.email, name: replyTo.name }]);
      setSubject(replyTo.subject ? `Re: ${replyTo.subject}` : "");
    }
    if (forwardFrom) {
      setSubject(`Fwd: ${forwardFrom.subject}`);
      setBody(`\n\n---------- Forwarded message ----------\n${forwardFrom.body}`);
    }
  }, [replyTo, forwardFrom]);

  const addRecipient = (
    setter: React.Dispatch<React.SetStateAction<Recipient[]>>,
    inputSetter: React.Dispatch<React.SetStateAction<string>>,
    input: string
  ) => {
    const email = input.trim();
    if (email && email.includes("@")) {
      setter((prev) => [...prev, { email }]);
      inputSetter("");
    }
  };

  const removeRecipient = (
    setter: React.Dispatch<React.SetStateAction<Recipient[]>>,
    email: string
  ) => {
    setter((prev) => prev.filter((r) => r.email !== email));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newAttachments = files.map((file) => ({
      id: Math.random().toString(36).substring(7),
      file,
      progress: 100,
    }));
    setAttachments((prev) => [...prev, ...newAttachments]);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSend = async () => {
    if (to.length === 0 || !subject.trim()) return;

    setIsSubmitting(true);
    try {
      await onSend?.({
        to,
        cc: showCc ? cc : undefined,
        bcc: showBcc ? bcc : undefined,
        subject,
        body,
        attachments: attachments.map((a) => a.file),
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const filteredSuggestions = suggestedRecipients.filter(
    (r) =>
      !to.find((t) => t.email === r.email) &&
      (r.email.toLowerCase().includes(toInput.toLowerCase()) ||
        r.name?.toLowerCase().includes(toInput.toLowerCase()))
  );

  if (!isOpen) return null;

  if (isMinimized) {
    return (
      <div className="fixed bottom-0 right-4 z-50 w-72 rounded-t-lg border bg-card shadow-lg">
        <div
          className="flex items-center justify-between p-3 cursor-pointer"
          onClick={() => setIsMinimized(false)}
        >
          <div className="flex items-center space-x-2 min-w-0">
            <svg
              className="h-4 w-4 text-muted-foreground flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
            <span className="text-sm font-medium truncate">
              {subject || "New Message"}
            </span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-1 hover:bg-muted rounded"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={cn(
          "relative z-10 w-full max-w-2xl rounded-t-lg sm:rounded-lg border bg-card shadow-lg flex flex-col max-h-[90vh]",
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b p-3">
          <h2 className="font-semibold">New Message</h2>
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1 hover:bg-muted rounded"
              title="Minimize"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 12H4"
                />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-muted rounded"
              title="Close"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Recipients */}
        <div className="border-b">
          {/* To */}
          <div className="flex items-center px-3 py-2 border-b">
            <span className="text-sm text-muted-foreground w-12">To</span>
            <div className="flex-1 flex items-center flex-wrap gap-1">
              {to.map((recipient) => (
                <span
                  key={recipient.email}
                  className="inline-flex items-center px-2 py-0.5 rounded bg-primary/10 text-sm"
                >
                  {recipient.name || recipient.email}
                  <button
                    onClick={() => removeRecipient(setTo, recipient.email)}
                    className="ml-1 hover:text-destructive"
                  >
                    <svg
                      className="h-3 w-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </span>
              ))}
              <div className="relative flex-1 min-w-[100px]">
                <input
                  ref={toInputRef}
                  type="email"
                  value={toInput}
                  onChange={(e) => {
                    setToInput(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addRecipient(setTo, setToInput, toInput);
                    }
                  }}
                  onBlur={() => {
                    setTimeout(() => setShowSuggestions(false), 200);
                    if (toInput) addRecipient(setTo, setToInput, toInput);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder={to.length === 0 ? "Recipients" : ""}
                  className="w-full bg-transparent text-sm outline-none"
                />
                {/* Suggestions dropdown */}
                {showSuggestions && filteredSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 mt-1 w-64 rounded-md border bg-popover shadow-lg z-10">
                    {filteredSuggestions.slice(0, 5).map((suggestion) => (
                      <button
                        key={suggestion.email}
                        onClick={() => {
                          setTo((prev) => [...prev, suggestion]);
                          setToInput("");
                          toInputRef.current?.focus();
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-muted text-sm"
                      >
                        <p className="font-medium">{suggestion.name || suggestion.email}</p>
                        {suggestion.name && (
                          <p className="text-xs text-muted-foreground">{suggestion.email}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              {!showCc && (
                <button onClick={() => setShowCc(true)} className="hover:text-foreground">
                  Cc
                </button>
              )}
              {!showBcc && (
                <button onClick={() => setShowBcc(true)} className="hover:text-foreground">
                  Bcc
                </button>
              )}
            </div>
          </div>

          {/* Cc */}
          {showCc && (
            <div className="flex items-center px-3 py-2 border-b">
              <span className="text-sm text-muted-foreground w-12">Cc</span>
              <div className="flex-1 flex items-center flex-wrap gap-1">
                {cc.map((recipient) => (
                  <span
                    key={recipient.email}
                    className="inline-flex items-center px-2 py-0.5 rounded bg-primary/10 text-sm"
                  >
                    {recipient.name || recipient.email}
                    <button
                      onClick={() => removeRecipient(setCc, recipient.email)}
                      className="ml-1 hover:text-destructive"
                    >
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </span>
                ))}
                <input
                  type="email"
                  value={ccInput}
                  onChange={(e) => setCcInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addRecipient(setCc, setCcInput, ccInput);
                    }
                  }}
                  onBlur={() => ccInput && addRecipient(setCc, setCcInput, ccInput)}
                  className="flex-1 min-w-[100px] bg-transparent text-sm outline-none"
                />
              </div>
            </div>
          )}

          {/* Bcc */}
          {showBcc && (
            <div className="flex items-center px-3 py-2 border-b">
              <span className="text-sm text-muted-foreground w-12">Bcc</span>
              <div className="flex-1 flex items-center flex-wrap gap-1">
                {bcc.map((recipient) => (
                  <span
                    key={recipient.email}
                    className="inline-flex items-center px-2 py-0.5 rounded bg-primary/10 text-sm"
                  >
                    {recipient.name || recipient.email}
                    <button
                      onClick={() => removeRecipient(setBcc, recipient.email)}
                      className="ml-1 hover:text-destructive"
                    >
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </span>
                ))}
                <input
                  type="email"
                  value={bccInput}
                  onChange={(e) => setBccInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addRecipient(setBcc, setBccInput, bccInput);
                    }
                  }}
                  onBlur={() => bccInput && addRecipient(setBcc, setBccInput, bccInput)}
                  className="flex-1 min-w-[100px] bg-transparent text-sm outline-none"
                />
              </div>
            </div>
          )}

          {/* Subject */}
          <div className="flex items-center px-3 py-2">
            <span className="text-sm text-muted-foreground w-12">Subject</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message..."
            className="w-full h-full min-h-[200px] bg-transparent text-sm outline-none resize-none"
          />
        </div>

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="border-t p-3">
            <div className="flex flex-wrap gap-2">
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex items-center space-x-2 px-2 py-1 rounded bg-muted text-sm"
                >
                  <svg
                    className="h-4 w-4 text-muted-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                    />
                  </svg>
                  <span className="max-w-[150px] truncate">
                    {attachment.file.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({formatFileSize(attachment.file.size)})
                  </span>
                  <button
                    onClick={() => removeAttachment(attachment.id)}
                    className="hover:text-destructive"
                  >
                    <svg
                      className="h-3 w-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t p-3">
          <div className="flex items-center space-x-2">
            <button
              onClick={handleSend}
              disabled={to.length === 0 || !subject.trim() || isSubmitting}
              className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? "Sending..." : "Send"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 hover:bg-muted rounded-md transition-colors"
              title="Attach files"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                />
              </svg>
            </button>
          </div>
          <div className="flex items-center space-x-2">
            {onSaveDraft && (
              <button
                onClick={onSaveDraft}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Save draft
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-muted rounded-md transition-colors text-destructive"
              title="Discard"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
