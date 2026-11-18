import { useEffect, useState } from "react";
import { pb, me } from "./pb.js";
import Auth from "./screens/Auth.jsx";
import Home from "./screens/Home.jsx";
import Library from "./screens/Library.jsx";
import Scanner from "./screens/Scanner.jsx";
import DeckEditor from "./screens/DeckEditor.jsx";
import Table from "./screens/Table.jsx";

function readJoinParam() {
  const p = new URLSearchParams(window.location.search);
  const c = (p.get("join") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  return c.length === 6 ? c : "";
}

function readGameParam() {
  const g = new URLSearchParams(window.location.search).get("game") || "";
  return /^[a-z0-9]{15}$/.test(g) ? g : "";
}

export default function App() {
  const [user, setUser] = useState(me());
  const [screen, setScreen] = useState(() => (readGameParam() ? { name: "table", gameId: readGameParam() } : { name: "home" }));
  const [pendingJoin, setPendingJoin] = useState(readJoinParam());

  useEffect(() => pb.authStore.onChange(() => setUser(me())), []);

  useEffect(() => {
    if (pb.authStore.isValid) pb.collection("users").authRefresh().catch(() => pb.authStore.clear());
  }, []);

  const go = (name, params = {}) => {
    setScreen({ name, ...params });
    // La partie en cours reste dans l'URL : un rechargement ramène à la table
    const url = name === "table" ? `${window.location.pathname}?game=${params.gameId}` : window.location.pathname;
    if (name === "table" || !pendingJoin) window.history.replaceState(null, "", url);
    window.scrollTo(0, 0);
  };

  if (!user) return <Auth />;

  switch (screen.name) {
    case "library":
      return <Library go={go} />;
    case "scan":
      return <Scanner go={go} />;
    case "deck":
      return <DeckEditor go={go} deckId={screen.deckId} />;
    case "table":
      return <Table go={go} gameId={screen.gameId} />;
    default:
      return (
        <Home
          go={go}
          pendingJoin={pendingJoin}
          clearJoin={() => {
            setPendingJoin("");
            window.history.replaceState(null, "", window.location.pathname);
          }}
        />
      );
  }
}
