import { HashRouter, Route, Routes } from "react-router-dom";
import { Home } from "./pages/Home";
import { Room } from "./pages/Room";

export function App() {
  return (
    <HashRouter>
      <div className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/room/:roomId" element={<Room />} />
        </Routes>
      </div>
    </HashRouter>
  );
}
