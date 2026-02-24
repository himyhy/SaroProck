import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const getPreferredTheme = (): Theme => {
  try {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      return savedTheme;
    }
  } catch (e) {
    console.warn("localStorage not available:", e);
  }

  if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }

  return "light";
};

const getAppliedTheme = (): Theme => {
  const html = document.documentElement;
  if (
    html.getAttribute("data-theme") === "dark" ||
    html.classList.contains("dark")
  ) {
    return "dark";
  }
  return "light";
};

const applyTheme = (newTheme: Theme) => {
  const html = document.documentElement;

  if (newTheme === "dark") {
    html.setAttribute("data-theme", "dark");
    html.classList.add("dark");
  } else {
    html.setAttribute("data-theme", "light");
    html.classList.remove("dark");
  }

  try {
    localStorage.setItem("theme", newTheme);
  } catch (e) {
    console.warn("Failed to save theme to localStorage:", e);
  }
};

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof document !== "undefined") {
      return getAppliedTheme();
    }
    return "light";
  });

  useEffect(() => {
    const preferredTheme = getPreferredTheme();
    applyTheme(preferredTheme);
    setTheme(preferredTheme);
  }, []);

  const toggleTheme = () => {
    const currentTheme = getAppliedTheme();
    const newTheme: Theme = currentTheme === "light" ? "dark" : "light";
    applyTheme(newTheme);
    setTheme(newTheme);
  };

  return (
    <button
      onClick={toggleTheme}
      className="btn btn-ghost btn-circle"
      title={theme === "light" ? "切换到夜间模式" : "切换到日间模式"}
      aria-label="切换主题"
      type="button"
    >
      {theme === "light" ? (
        <i className="ri-moon-line text-lg"></i>
      ) : (
        <i className="ri-sun-line text-lg"></i>
      )}
    </button>
  );
}
