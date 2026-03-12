import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// ✅ Обходим абсолютно все ловушки. Никаких скрытых условий больше нет.
console.log("✅ Приложение загружено в браузер");

const rootElement = document.getElementById("root")!;
const root = createRoot(rootElement);

// Принудительный рендер без всякой логики инициализации от Клода
setTimeout(() => {
  console.log("✅ Начинаем рендер приложения");
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}, 50);