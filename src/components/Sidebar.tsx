import type { View } from "../types";

interface SidebarProps {
  activeView: View;
  onNavigate: (view: View) => void;
  conversations: { id: string; title: string }[];
  activeConversationId?: string;
  onSelectConversation: (id: string) => void;
}

export default function Sidebar({
  activeView,
  onNavigate,
  conversations,
  activeConversationId,
  onSelectConversation,
}: SidebarProps) {
  const navItems: { view: View; label: string; icon: React.ReactNode }[] = [
    {
      view: "dashboard",
      label: "Dashboard",
      icon: <DashboardIcon />,
    },
    {
      view: "research",
      label: "Research",
      icon: <ResearchIcon />,
    },
    {
      view: "documents",
      label: "Documents",
      icon: <FolderIcon />,
    },
    {
      view: "chat",
      label: "Chat",
      icon: <MessageIcon />,
    },
    {
      view: "leaderboard",
      label: "Leaderboard",
      icon: <TrophyIcon />,
    },
  ];

  return (
    <aside className="w-64 h-screen bg-surface border-r border-border flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-border">
        <h1 className="font-heading text-xl font-semibold text-foreground tracking-tight">
          Atlas
        </h1>
        <p className="text-xs text-muted mt-0.5">AI Investment Research</p>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <button
            key={item.view}
            onClick={() => onNavigate(item.view)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer
              ${
                activeView === item.view
                  ? "bg-primary/15 text-primary"
                  : "text-muted hover:text-foreground hover:bg-elevated"
              }`}
          >
            <span className="w-5 h-5 shrink-0">{item.icon}</span>
            {item.label}
          </button>
        ))}

        {/* Conversations list (only shown when Chat is active) */}
        {activeView === "chat" && conversations.length > 0 && (
          <div className="pt-4 mt-4 border-t border-border">
            <p className="px-3 text-xs font-medium text-muted uppercase tracking-wider mb-2">
              Conversations
            </p>
            <div className="space-y-0.5">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => onSelectConversation(conv.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate transition-all duration-150 cursor-pointer
                    ${
                      activeConversationId === conv.id
                        ? "bg-primary/10 text-primary"
                        : "text-muted hover:text-foreground hover:bg-elevated"
                    }`}
                >
                  {conv.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-border">
        <p className="text-xs text-muted">
          Virtual portfolio — not financial advice
        </p>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG Icons
// ---------------------------------------------------------------------------

function DashboardIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function ResearchIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}