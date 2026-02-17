import { useState } from "react";
import Sidebar from "./components/Sidebar";
import TitleBar from "./components/TitleBar";
import ScanCleanPage from "./components/ScanCleanPage";
import ConversationsPage from "./components/ConversationsPage";
import UninstallPage from "./components/UninstallPage";
import SettingsPage from "./components/SettingsPage";
import type { Page } from "./types";

function App() {
  const [currentPage, setCurrentPage] = useState<Page>("scan");

  const renderPage = () => {
    switch (currentPage) {
      case "scan":
        return <ScanCleanPage />;
      case "conversations":
        return <ConversationsPage />;
      case "uninstall":
        return <UninstallPage />;
      case "settings":
        return <SettingsPage />;
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-transparent">
      <TitleBar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
        <main className="app-shell-main relative flex-1 min-w-0 overflow-hidden bg-background/70">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}

export default App;
