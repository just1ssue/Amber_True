import { useState } from "react";
import { HashRouter, Route, Routes, useMatch } from "react-router-dom";
import { Home } from "./pages/Home";
import { Room } from "./pages/Room";

function AppFrame() {
  const roomMatch = useMatch("/room/:roomId");
  const [shareNotice, setShareNotice] = useState("");

  async function shareRoomUrl() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setShareNotice("URLをコピーしました。");
    } catch {
      setShareNotice("コピーに失敗しました。");
    }
  }

  return (
    <div className="app-shell">
      <header className="title-frame">
        <div className="title-frame__inner">
          <img
            className="title-image"
            src={`${import.meta.env.BASE_URL}assets/title/title.png`}
            alt="Amber_True title"
          />
          {roomMatch && (
            <div className="title-share">
              <button className="btn btn--ghost" onClick={shareRoomUrl}>
                ShareURL
              </button>
              {shareNotice && <span className="muted title-share__notice">{shareNotice}</span>}
            </div>
          )}
        </div>
      </header>
      <div className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/room/:roomId" element={<Room />} />
        </Routes>
      </div>
    </div>
  );
}

export function App() {
  return (
    <HashRouter>
      <AppFrame />
    </HashRouter>
  );
}
