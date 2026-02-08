import { HashRouter, Route, Routes } from "react-router-dom";
import { Home } from "./pages/Home";
import { Room } from "./pages/Room";

export function App() {
  return (
    <HashRouter>
      <div className="app-shell">
        <header className="title-frame">
          <img
            className="title-image"
            src={`${import.meta.env.BASE_URL}assets/title/title.png`}
            alt="Amber_True title"
          />
        </header>
        <div className="container">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/room/:roomId" element={<Room />} />
          </Routes>
        </div>
      </div>
    </HashRouter>
  );
}
