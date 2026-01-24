"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

// ============================================================================
// Types
// ============================================================================

export interface ChatMessage {
  id: string;
  eventId: string;
  sender: {
    id: string;
    name: string;
    avatar?: string;
  };
  content: string;
  contentType: "text" | "image" | "file" | "video" | "audio";
  replyTo?: {
    id: string;
    senderName: string;
    content: string;
  };
  reactions: Record<string, string[]>;
  timestamp: Date;
  isEdited: boolean;
  isDeleted: boolean;
  isPending?: boolean;
  error?: string;
}

export interface ChatMember {
  id: string;
  name: string;
  avatar?: string;
  role: "owner" | "admin" | "moderator" | "member";
  isOnline: boolean;
  lastSeen?: Date;
}

export interface RoomSettings {
  name: string;
  topic?: string;
  avatar?: string;
  isEncrypted: boolean;
  historyVisibility: "shared" | "invited" | "joined";
  allowGuests: boolean;
}

export interface ChatRoomProps {
  roomId: string;
  roomName: string;
  roomTopic?: string;
  roomAvatar?: string;
  isEncrypted?: boolean;
  messages: ChatMessage[];
  members: ChatMember[];
  currentUserId: string;
  typingUsers?: string[];
  hasMoreMessages?: boolean;
  isLoadingMessages?: boolean;
  onSendMessage: (content: string, replyToId?: string) => Promise<void>;
  onSendReaction: (messageId: string, emoji: string) => Promise<void>;
  onEditMessage?: (messageId: string, content: string) => Promise<void>;
  onDeleteMessage?: (messageId: string) => Promise<void>;
  onLoadMoreMessages?: () => Promise<void>;
  onStartTyping?: () => void;
  onStopTyping?: () => void;
  onOpenSettings?: () => void;
  onInviteMember?: () => void;
  onLeaveRoom?: () => void;
  className?: string;
}

// ============================================================================
// Helper Components
// ============================================================================

const formatTime = (date: Date) => {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

const formatDate = (date: Date) => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return "Today";
  } else if (days === 1) {
    return "Yesterday";
  } else if (days < 7) {
    return date.toLocaleDateString([], { weekday: "long" });
  } else {
    return date.toLocaleDateString([], {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
};

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  showSender: boolean;
  onReply: () => void;
  onReact: (emoji: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

function MessageBubble({
  message,
  isOwn,
  showSender,
  onReply,
  onReact,
  onEdit,
  onDelete,
}: MessageBubbleProps) {
  const [showActions, setShowActions] = React.useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = React.useState(false);

  const quickEmojis = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

  if (message.isDeleted) {
    return (
      <div
        className={cn(
          "flex items-center space-x-2 py-1 px-3",
          isOwn ? "flex-row-reverse space-x-reverse" : ""
        )}
      >
        <div className="px-4 py-2 rounded-2xl bg-muted text-muted-foreground text-sm italic">
          This message was deleted
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group flex items-start space-x-2 py-1 px-3",
        isOwn ? "flex-row-reverse space-x-reverse" : ""
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => {
        setShowActions(false);
        setShowEmojiPicker(false);
      }}
    >
      {/* Avatar */}
      {!isOwn && showSender && (
        <div className="w-8 h-8 rounded-full bg-primary/10 flex-shrink-0 flex items-center justify-center">
          {message.sender.avatar ? (
            <img
              src={message.sender.avatar}
              alt={message.sender.name}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            <span className="text-xs font-medium">
              {message.sender.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
      )}
      {!isOwn && !showSender && <div className="w-8 flex-shrink-0" />}

      {/* Message content */}
      <div className={cn("flex flex-col max-w-[70%]", isOwn ? "items-end" : "items-start")}>
        {/* Sender name */}
        {!isOwn && showSender && (
          <span className="text-xs text-muted-foreground mb-1">{message.sender.name}</span>
        )}

        {/* Reply preview */}
        {message.replyTo && (
          <div
            className={cn(
              "text-xs px-3 py-1 rounded-t-lg border-l-2 border-primary/50 bg-muted/50 mb-1",
              isOwn ? "text-right" : "text-left"
            )}
          >
            <span className="font-medium">{message.replyTo.senderName}</span>
            <p className="text-muted-foreground truncate">{message.replyTo.content}</p>
          </div>
        )}

        {/* Message bubble */}
        <div
          className={cn(
            "px-4 py-2 rounded-2xl relative",
            isOwn
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : "bg-muted rounded-bl-sm",
            message.isPending && "opacity-60",
            message.error && "border-2 border-destructive"
          )}
        >
          {message.contentType === "text" && (
            <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
          )}

          {message.contentType === "image" && (
            <img
              src={message.content}
              alt="Shared image"
              className="max-w-full rounded-lg"
            />
          )}

          {message.contentType === "file" && (
            <a
              href={message.content}
              className="flex items-center space-x-2 text-sm underline"
              target="_blank"
              rel="noopener noreferrer"
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
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                />
              </svg>
              <span>Attachment</span>
            </a>
          )}

          {/* Edited indicator */}
          {message.isEdited && (
            <span className="text-xs opacity-60 ml-1">(edited)</span>
          )}

          {/* Error indicator */}
          {message.error && (
            <div className="text-xs text-destructive mt-1">{message.error}</div>
          )}
        </div>

        {/* Reactions */}
        {Object.keys(message.reactions).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {Object.entries(message.reactions).map(([emoji, users]) => (
              <button
                key={emoji}
                onClick={() => onReact(emoji)}
                className={cn(
                  "px-2 py-0.5 rounded-full text-xs border flex items-center space-x-1",
                  users.includes(message.sender.id)
                    ? "bg-primary/10 border-primary/30"
                    : "bg-muted border-transparent hover:border-muted-foreground/30"
                )}
              >
                <span>{emoji}</span>
                <span>{users.length}</span>
              </button>
            ))}
          </div>
        )}

        {/* Timestamp */}
        <span className="text-xs text-muted-foreground mt-1">{formatTime(message.timestamp)}</span>
      </div>

      {/* Message actions */}
      {showActions && !message.isPending && (
        <div
          className={cn(
            "flex items-center space-x-1 bg-background border rounded-full px-1 py-0.5 shadow-sm",
            isOwn ? "order-first mr-2" : "ml-2"
          )}
        >
          <button
            onClick={onReply}
            className="p-1 hover:bg-muted rounded-full"
            title="Reply"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
              />
            </svg>
          </button>

          <div className="relative">
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="p-1 hover:bg-muted rounded-full"
              title="React"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </button>

            {showEmojiPicker && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-background border rounded-lg shadow-lg p-2 flex space-x-1 z-10">
                {quickEmojis.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      onReact(emoji);
                      setShowEmojiPicker(false);
                    }}
                    className="p-1 hover:bg-muted rounded text-lg"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {isOwn && onEdit && (
            <button
              onClick={onEdit}
              className="p-1 hover:bg-muted rounded-full"
              title="Edit"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </button>
          )}

          {isOwn && onDelete && (
            <button
              onClick={onDelete}
              className="p-1 hover:bg-muted rounded-full text-destructive"
              title="Delete"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ChatRoom({
  roomId,
  roomName,
  roomTopic,
  roomAvatar,
  isEncrypted = false,
  messages,
  members,
  currentUserId,
  typingUsers = [],
  hasMoreMessages = false,
  isLoadingMessages = false,
  onSendMessage,
  onSendReaction,
  onEditMessage,
  onDeleteMessage,
  onLoadMoreMessages,
  onStartTyping,
  onStopTyping,
  onOpenSettings,
  onInviteMember,
  onLeaveRoom,
  className,
}: ChatRoomProps) {
  const [inputValue, setInputValue] = React.useState("");
  const [replyTo, setReplyTo] = React.useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = React.useState<ChatMessage | null>(null);
  const [showMemberList, setShowMemberList] = React.useState(true);
  const [isSending, setIsSending] = React.useState(false);

  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const messagesContainerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Scroll to bottom on new messages
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Handle typing indicator
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);

    // Start typing
    onStartTyping?.();

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Stop typing after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      onStopTyping?.();
    }, 2000);
  };

  // Handle send message
  const handleSend = async () => {
    const content = inputValue.trim();
    if (!content || isSending) return;

    setIsSending(true);
    onStopTyping?.();

    try {
      if (editingMessage) {
        await onEditMessage?.(editingMessage.id, content);
        setEditingMessage(null);
      } else {
        await onSendMessage(content, replyTo?.id);
        setReplyTo(null);
      }
      setInputValue("");
    } finally {
      setIsSending(false);
    }

    inputRef.current?.focus();
  };

  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }

    if (e.key === "Escape") {
      setReplyTo(null);
      setEditingMessage(null);
    }
  };

  // Handle infinite scroll
  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container || isLoadingMessages || !hasMoreMessages) return;

    if (container.scrollTop === 0) {
      void onLoadMoreMessages?.();
    }
  };

  // Group messages by date
  const groupedMessages = React.useMemo(() => {
    const groups: { date: string; messages: ChatMessage[] }[] = [];
    let currentDate = "";

    for (const message of messages) {
      const messageDate = formatDate(message.timestamp);
      if (messageDate !== currentDate) {
        currentDate = messageDate;
        groups.push({ date: messageDate, messages: [] });
      }
      groups[groups.length - 1].messages.push(message);
    }

    return groups;
  }, [messages]);

  // Online members count
  const onlineCount = members.filter((m) => m.isOnline).length;

  return (
    <div className={cn("flex h-full bg-background", className)}>
      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="h-16 border-b flex items-center justify-between px-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              {roomAvatar ? (
                <img
                  src={roomAvatar}
                  alt={roomName}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span className="font-medium">{roomName.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="font-semibold">{roomName}</h2>
                {isEncrypted && (
                  <svg
                    className="h-4 w-4 text-green-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    title="Encrypted"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {members.length} members, {onlineCount} online
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowMemberList(!showMemberList)}
              className={cn(
                "p-2 rounded-lg",
                showMemberList ? "bg-primary/10 text-primary" : "hover:bg-muted"
              )}
              title="Toggle member list"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            </button>

            <button
              onClick={onOpenSettings}
              className="p-2 hover:bg-muted rounded-lg"
              title="Room settings"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto"
          onScroll={handleScroll}
        >
          {/* Load more indicator */}
          {hasMoreMessages && (
            <div className="flex justify-center py-4">
              {isLoadingMessages ? (
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              ) : (
                <button
                  onClick={() => void onLoadMoreMessages?.()}
                  className="text-sm text-primary hover:underline"
                >
                  Load older messages
                </button>
              )}
            </div>
          )}

          {/* Messages */}
          {groupedMessages.map((group) => (
            <div key={group.date}>
              {/* Date separator */}
              <div className="flex items-center justify-center my-4">
                <div className="px-3 py-1 rounded-full bg-muted text-xs text-muted-foreground">
                  {group.date}
                </div>
              </div>

              {/* Messages for this date */}
              {group.messages.map((message, index) => {
                const prevMessage = group.messages[index - 1];
                const showSender =
                  !prevMessage ||
                  prevMessage.sender.id !== message.sender.id ||
                  message.timestamp.getTime() - prevMessage.timestamp.getTime() > 60000;

                return (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    isOwn={message.sender.id === currentUserId}
                    showSender={showSender}
                    onReply={() => setReplyTo(message)}
                    onReact={(emoji) => void onSendReaction(message.id, emoji)}
                    onEdit={
                      message.sender.id === currentUserId && onEditMessage
                        ? () => {
                            setEditingMessage(message);
                            setInputValue(message.content);
                          }
                        : undefined
                    }
                    onDelete={
                      message.sender.id === currentUserId && onDeleteMessage
                        ? () => void onDeleteMessage(message.id)
                        : undefined
                    }
                  />
                );
              })}
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="px-4 py-2 text-sm text-muted-foreground">
            {typingUsers.length === 1
              ? `${typingUsers[0]} is typing...`
              : typingUsers.length === 2
                ? `${typingUsers[0]} and ${typingUsers[1]} are typing...`
                : `${typingUsers.length} people are typing...`}
          </div>
        )}

        {/* Reply/Edit preview */}
        {(replyTo || editingMessage) && (
          <div className="px-4 py-2 border-t bg-muted/50 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-1 h-8 bg-primary rounded-full" />
              <div>
                <span className="text-xs text-primary font-medium">
                  {editingMessage ? "Editing message" : `Replying to ${replyTo?.sender.name}`}
                </span>
                <p className="text-sm text-muted-foreground truncate max-w-md">
                  {editingMessage?.content ?? replyTo?.content}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setReplyTo(null);
                setEditingMessage(null);
                setInputValue("");
              }}
              className="p-1 hover:bg-muted rounded"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}

        {/* Input area */}
        <div className="p-4 border-t">
          <div className="flex items-end space-x-2">
            <button className="p-2 hover:bg-muted rounded-lg flex-shrink-0" title="Attach file">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                />
              </svg>
            </button>

            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                rows={1}
                className="w-full px-4 py-2 rounded-2xl border bg-muted resize-none text-sm focus:outline-none focus:ring-2 focus:ring-primary max-h-32"
                style={{
                  minHeight: "40px",
                  height: "auto",
                }}
              />
            </div>

            <button
              onClick={() => void handleSend()}
              disabled={!inputValue.trim() || isSending}
              className={cn(
                "p-2 rounded-full flex-shrink-0 transition-colors",
                inputValue.trim()
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {isSending ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current" />
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Member list sidebar */}
      {showMemberList && (
        <div className="w-64 border-l flex flex-col">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-semibold">Members</h3>
            <button
              onClick={onInviteMember}
              className="p-1 hover:bg-muted rounded"
              title="Invite member"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Online members */}
            {members.filter((m) => m.isOnline).length > 0 && (
              <div className="p-2">
                <p className="text-xs text-muted-foreground font-medium px-2 py-1">
                  Online - {members.filter((m) => m.isOnline).length}
                </p>
                {members
                  .filter((m) => m.isOnline)
                  .map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center space-x-2 px-2 py-1.5 rounded-lg hover:bg-muted cursor-pointer"
                    >
                      <div className="relative">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          {member.avatar ? (
                            <img
                              src={member.avatar}
                              alt={member.name}
                              className="w-full h-full rounded-full object-cover"
                            />
                          ) : (
                            <span className="text-xs font-medium">
                              {member.name.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 border-2 border-background" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{member.name}</p>
                        {member.role !== "member" && (
                          <span className="text-xs text-muted-foreground capitalize">
                            {member.role}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* Offline members */}
            {members.filter((m) => !m.isOnline).length > 0 && (
              <div className="p-2">
                <p className="text-xs text-muted-foreground font-medium px-2 py-1">
                  Offline - {members.filter((m) => !m.isOnline).length}
                </p>
                {members
                  .filter((m) => !m.isOnline)
                  .map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center space-x-2 px-2 py-1.5 rounded-lg hover:bg-muted cursor-pointer opacity-60"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        {member.avatar ? (
                          <img
                            src={member.avatar}
                            alt={member.name}
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          <span className="text-xs font-medium">
                            {member.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{member.name}</p>
                        {member.role !== "member" && (
                          <span className="text-xs text-muted-foreground capitalize">
                            {member.role}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Leave room button */}
          <div className="p-4 border-t">
            <button
              onClick={onLeaveRoom}
              className="w-full px-4 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
            >
              Leave Room
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
