import { useState } from "react";
import type { View } from "./types";
import Sidebar from "./components/Sidebar";
import DashboardPage from "./pages/Dashboard";
import ResearchPage from "./pages/Research";
import DocumentsPage from "./pages/Documents";
import ChatPage from "./pages/Chat";
import LeaderboardPage from "./pages/Leaderboard";

// ---------------------------------------------------------------------------
// Mock conversations for the sidebar (Chat view)
// ---------------------------------------------------------------------------

const MOCK_CONVERSATIONS = [
  { id: "1", title: "AAPL Q4 earnings analysis" },
  { id: "2", title: "EV market trends 2025" },
  { id: "3", title: "Interest rate impact on tech" },
];

// ---------------------------------------------------------------------------

export default function App() {
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [activeConversationId, setActiveConversationId] = useState<
    string | undefined
  >();

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar
        activeView={activeView}
        onNavigate={(view) => {
          setActiveView(view);
          if (view !== "chat") setActiveConversationId(undefined);
        }}
        conversations={MOCK_CONVERSATIONS}
        activeConversationId={activeConversationId}
        onSelectConversation={setActiveConversationId}
      />

      <main className="flex-1 flex flex-col min-w-0">
        {activeView === "dashboard" && <DashboardPage />}
        {activeView === "research" && <ResearchPage />}
        {activeView === "documents" && <DocumentsPage />}
        {activeView === "chat" && <ChatPage />}
        {activeView === "leaderboard" && <LeaderboardPage />}
      </main>
    </div>
  );
}