import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<string>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // 获取保存的主题
    const savedTheme = localStorage.getItem("theme");
    const initialTheme = savedTheme || "light";
    
    setTheme(initialTheme);
    applyTheme(initialTheme);
  }, []);

  const applyTheme = (newTheme: string) => {
    const html = document.documentElement;
    if (newTheme === "dark") {
      html.setAttribute("data-theme", "dark");
      document.documentElement.classList.add("dark");
    } else {
      html.removeAttribute("data-theme");
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("theme", newTheme);
  };

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  if (!mounted) return null;

  return (
    <button
      onClick={toggleTheme}
      className="btn btn-ghost btn-circle"
      title={theme === "light" ? "切换到夜间模式" : "切换到日间模式"}
      aria-label="切换主题"
    >
      {theme === "light" ? (
        <i className="ri-moon-line text-lg"></i>
      ) : (
        <i className="ri-sun-line text-lg"></i>
      )}
    </button>
  );
}
