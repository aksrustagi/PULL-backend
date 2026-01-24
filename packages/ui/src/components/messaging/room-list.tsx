"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

// ============================================================================
// Types
// ============================================================================

export interface Room {
  id: string;
  matrixRoomId: string;
  name: string;
  topic?: string;
  avatar?: string;
  type: "dm" | "group" | "channel";
  isEncrypted: boolean;
  unreadCount: number;
  highlightCount: number;
  lastMessage?: {
    content: string;
    senderName: string;
    timestamp: Date;
  };
  memberCount: number;
  isPinned: boolean;
  isMuted: boolean;
  isArchived: boolean;
}

export interface RoomListProps {
  rooms: Room[];
  selectedRoomId?: string;
  onSelectRoom: (room: Room) => void;
  onCreateRoom?: () => void;
  onCreateDm?: () => void;
  onArchiveRoom?: (roomId: string) => void;
  onMuteRoom?: (roomId: string) => void;
  onPinRoom?: (roomId: string) => void;
  onLeaveRoom?: (roomId: string) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  isLoading?: boolean;
  showArchived?: boolean;
  onToggleArchived?: () => void;
  className?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

const formatTimestamp = (date: Date) => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor(diff / (1000 * 60));

  if (minutes < 1) {
    return "now";
  } else if (minutes < 60) {
    return `${minutes}m`;
  } else if (hours < 24) {
    return `${hours}h`;
  } else if (days === 1) {
    return "yesterday";
  } else if (days < 7) {
    return date.toLocaleDateString([], { weekday: "short" });
  } else {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
};

const truncateContent = (content: string, maxLength = 50) => {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength) + "...";
};

// ============================================================================
// Room Item Component
// ============================================================================

interface RoomItemProps {
  room: Room;
  isSelected: boolean;
  onClick: () => void;
  onArchive?: () => void;
  onMute?: () => void;
  onPin?: () => void;
  onLeave?: () => void;
}

function RoomItem({
  room,
  isSelected,
  onClick,
  onArchive,
  onMute,
  onPin,
  onLeave,
}: RoomItemProps) {
  const [showContextMenu, setShowContextMenu] = React.useState(false);
  const [contextMenuPosition, setContextMenuPosition] = React.useState({ x: 0, y: 0 });

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  // Close context menu on click outside
  React.useEffect(() => {
    const handleClickOutside = () => setShowContextMenu(false);
    if (showContextMenu) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [showContextMenu]);

  return (
    <>
      <div
        onClick={onClick}
        onContextMenu={handleContextMenu}
        className={cn(
          "flex items-center space-x-3 px-3 py-2 cursor-pointer rounded-lg transition-colors",
          isSelected
            ? "bg-primary/10 text-primary"
            : "hover:bg-muted",
          room.isMuted && "opacity-60"
        )}
      >
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <div
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center",
              room.type === "channel" ? "bg-primary/10" : "bg-muted"
            )}
          >
            {room.avatar ? (
              <img
                src={room.avatar}
                alt={room.name}
                className="w-full h-full rounded-full object-cover"
              />
            ) : room.type === "channel" ? (
              <svg className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
                />
              </svg>
            ) : room.type === "dm" ? (
              <span className="text-lg font-medium">{room.name.charAt(0).toUpperCase()}</span>
            ) : (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            )}
          </div>

          {/* Encryption indicator */}
          {room.isEncrypted && (
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-green-500 border-2 border-background flex items-center justify-center">
              <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <div className="flex items-center space-x-1.5 min-w-0">
              {room.isPinned && (
                <svg
                  className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z" />
                </svg>
              )}
              <span
                className={cn(
                  "text-sm truncate",
                  room.unreadCount > 0 && "font-semibold"
                )}
              >
                {room.name}
              </span>
              {room.isMuted && (
                <svg
                  className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                  />
                </svg>
              )}
            </div>
            {room.lastMessage && (
              <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                {formatTimestamp(room.lastMessage.timestamp)}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground truncate">
              {room.lastMessage ? (
                <>
                  <span className="font-medium">{room.lastMessage.senderName}: </span>
                  {truncateContent(room.lastMessage.content)}
                </>
              ) : (
                <span className="italic">No messages yet</span>
              )}
            </p>

            {/* Badges */}
            <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
              {room.highlightCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-xs font-medium bg-destructive text-destructive-foreground min-w-[20px] text-center">
                  {room.highlightCount > 99 ? "99+" : room.highlightCount}
                </span>
              )}
              {room.unreadCount > 0 && room.highlightCount === 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-xs font-medium bg-primary text-primary-foreground min-w-[20px] text-center">
                  {room.unreadCount > 99 ? "99+" : room.unreadCount}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Context menu */}
      {showContextMenu && (
        <div
          className="fixed bg-background border rounded-lg shadow-lg py-1 z-50 min-w-[150px]"
          style={{ left: contextMenuPosition.x, top: contextMenuPosition.y }}
        >
          {onPin && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPin();
                setShowContextMenu(false);
              }}
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted flex items-center space-x-2"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                />
              </svg>
              <span>{room.isPinned ? "Unpin" : "Pin"}</span>
            </button>
          )}
          {onMute && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMute();
                setShowContextMenu(false);
              }}
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted flex items-center space-x-2"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d={
                    room.isMuted
                      ? "M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                      : "M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                  }
                />
              </svg>
              <span>{room.isMuted ? "Unmute" : "Mute"}</span>
            </button>
          )}
          {onArchive && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onArchive();
                setShowContextMenu(false);
              }}
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted flex items-center space-x-2"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                />
              </svg>
              <span>{room.isArchived ? "Unarchive" : "Archive"}</span>
            </button>
          )}
          <div className="border-t my-1" />
          {onLeave && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onLeave();
                setShowContextMenu(false);
              }}
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted flex items-center space-x-2 text-destructive"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              <span>Leave Room</span>
            </button>
          )}
        </div>
      )}
    </>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function RoomList({
  rooms,
  selectedRoomId,
  onSelectRoom,
  onCreateRoom,
  onCreateDm,
  onArchiveRoom,
  onMuteRoom,
  onPinRoom,
  onLeaveRoom,
  searchQuery = "",
  onSearchChange,
  isLoading = false,
  showArchived = false,
  onToggleArchived,
  className,
}: RoomListProps) {
  const [showCreateMenu, setShowCreateMenu] = React.useState(false);

  // Filter and sort rooms
  const filteredRooms = React.useMemo(() => {
    let filtered = rooms;

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (room) =>
          room.name.toLowerCase().includes(query) ||
          room.topic?.toLowerCase().includes(query)
      );
    }

    // Filter by archived status
    filtered = filtered.filter((room) => room.isArchived === showArchived);

    // Sort: pinned first, then by last message timestamp
    return filtered.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;

      const aTime = a.lastMessage?.timestamp.getTime() ?? 0;
      const bTime = b.lastMessage?.timestamp.getTime() ?? 0;
      return bTime - aTime;
    });
  }, [rooms, searchQuery, showArchived]);

  // Group rooms by type
  const groupedRooms = React.useMemo(() => {
    const dms = filteredRooms.filter((r) => r.type === "dm");
    const groups = filteredRooms.filter((r) => r.type === "group");
    const channels = filteredRooms.filter((r) => r.type === "channel");
    return { dms, groups, channels };
  }, [filteredRooms]);

  // Calculate unread totals
  const totalUnread = rooms.reduce((sum, r) => sum + r.unreadCount, 0);
  const totalHighlights = rooms.reduce((sum, r) => sum + r.highlightCount, 0);

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <h2 className="text-lg font-semibold">Messages</h2>
            {totalUnread > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary text-primary-foreground">
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            )}
          </div>

          {/* Create button */}
          <div className="relative">
            <button
              onClick={() => setShowCreateMenu(!showCreateMenu)}
              className="p-2 hover:bg-muted rounded-lg"
              title="Create room"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </button>

            {showCreateMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowCreateMenu(false)}
                />
                <div className="absolute right-0 top-full mt-1 bg-background border rounded-lg shadow-lg py-1 z-50 min-w-[180px]">
                  {onCreateDm && (
                    <button
                      onClick={() => {
                        onCreateDm();
                        setShowCreateMenu(false);
                      }}
                      className="w-full px-3 py-2 text-sm text-left hover:bg-muted flex items-center space-x-2"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                      <span>New Direct Message</span>
                    </button>
                  )}
                  {onCreateRoom && (
                    <button
                      onClick={() => {
                        onCreateRoom();
                        setShowCreateMenu(false);
                      }}
                      className="w-full px-3 py-2 text-sm text-left hover:bg-muted flex items-center space-x-2"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                        />
                      </svg>
                      <span>New Group</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border bg-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        <button
          onClick={() => onToggleArchived?.()}
          className={cn(
            "flex-1 px-4 py-2 text-sm font-medium transition-colors",
            !showArchived
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Inbox
        </button>
        <button
          onClick={() => onToggleArchived?.()}
          className={cn(
            "flex-1 px-4 py-2 text-sm font-medium transition-colors",
            showArchived
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Archived
        </button>
      </div>

      {/* Room list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : filteredRooms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <svg
              className="h-12 w-12 text-muted-foreground mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            {searchQuery ? (
              <>
                <p className="text-muted-foreground mb-2">No conversations found</p>
                <p className="text-sm text-muted-foreground">
                  Try a different search term
                </p>
              </>
            ) : showArchived ? (
              <p className="text-muted-foreground">No archived conversations</p>
            ) : (
              <>
                <p className="text-muted-foreground mb-2">No conversations yet</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Start a conversation with someone
                </p>
                {onCreateDm && (
                  <button
                    onClick={onCreateDm}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
                  >
                    Start a Chat
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="py-2">
            {/* Direct Messages */}
            {groupedRooms.dms.length > 0 && (
              <div className="mb-2">
                <p className="px-4 py-1 text-xs font-medium text-muted-foreground uppercase">
                  Direct Messages
                </p>
                {groupedRooms.dms.map((room) => (
                  <RoomItem
                    key={room.id}
                    room={room}
                    isSelected={room.id === selectedRoomId}
                    onClick={() => onSelectRoom(room)}
                    onArchive={onArchiveRoom ? () => onArchiveRoom(room.id) : undefined}
                    onMute={onMuteRoom ? () => onMuteRoom(room.id) : undefined}
                    onPin={onPinRoom ? () => onPinRoom(room.id) : undefined}
                    onLeave={onLeaveRoom ? () => onLeaveRoom(room.id) : undefined}
                  />
                ))}
              </div>
            )}

            {/* Groups */}
            {groupedRooms.groups.length > 0 && (
              <div className="mb-2">
                <p className="px-4 py-1 text-xs font-medium text-muted-foreground uppercase">
                  Groups
                </p>
                {groupedRooms.groups.map((room) => (
                  <RoomItem
                    key={room.id}
                    room={room}
                    isSelected={room.id === selectedRoomId}
                    onClick={() => onSelectRoom(room)}
                    onArchive={onArchiveRoom ? () => onArchiveRoom(room.id) : undefined}
                    onMute={onMuteRoom ? () => onMuteRoom(room.id) : undefined}
                    onPin={onPinRoom ? () => onPinRoom(room.id) : undefined}
                    onLeave={onLeaveRoom ? () => onLeaveRoom(room.id) : undefined}
                  />
                ))}
              </div>
            )}

            {/* Channels */}
            {groupedRooms.channels.length > 0 && (
              <div className="mb-2">
                <p className="px-4 py-1 text-xs font-medium text-muted-foreground uppercase">
                  Channels
                </p>
                {groupedRooms.channels.map((room) => (
                  <RoomItem
                    key={room.id}
                    room={room}
                    isSelected={room.id === selectedRoomId}
                    onClick={() => onSelectRoom(room)}
                    onArchive={onArchiveRoom ? () => onArchiveRoom(room.id) : undefined}
                    onMute={onMuteRoom ? () => onMuteRoom(room.id) : undefined}
                    onPin={onPinRoom ? () => onPinRoom(room.id) : undefined}
                    onLeave={onLeaveRoom ? () => onLeaveRoom(room.id) : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="p-3 border-t bg-muted/50 text-center">
        <p className="text-xs text-muted-foreground">
          {rooms.filter((r) => !r.isArchived).length} conversations
          {totalUnread > 0 && ` · ${totalUnread} unread`}
          {totalHighlights > 0 && ` · ${totalHighlights} mentions`}
        </p>
      </div>
    </div>
  );
}
