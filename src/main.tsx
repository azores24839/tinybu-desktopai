import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import NotchApp from "./NotchApp";
import PetApp from "./PetApp";
import ScreenshotOverlay from "./ScreenshotOverlay";
import "./styles.css";

const params = new URLSearchParams(window.location.search);
const view = params.get("view");
const Root = view === "pet" ? PetApp : view === "notch" ? NotchApp : view === "screenshot" ? ScreenshotOverlay : App;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
