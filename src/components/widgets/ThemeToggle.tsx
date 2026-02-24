import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<string>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // 获取保存的主题
    let savedTheme: string | null = null;
    try {
      savedTheme = localStorage.getItem("theme");
    } catch (e) {
      console.warn("localStorage not available:", e);
    }
    
    const initialTheme = savedTheme || "light";
    setTheme(initialTheme);
    applyTheme(initialTheme);
  }, []);

  const applyTheme = (newTheme: string) => {
    try {
      const html = document.documentElement;
      
      // 移除所有主题相关的属性和类
      html.removeAttribute("data-theme");
      document.documentElement.classList.remove("dark");
      
      // 应用新主题
      if (newTheme === "dark") {
        html.setAttribute("data-theme", "dark");
        document.documentElement.classList.add("dark");
      }
      
      // 保存到 localStorage
      try {
        localStorage.setItem("theme", newTheme);
      } catch (e) {
        console.warn("Failed to save theme to localStorage:", e);
      }
    } catch (e) {
      console.error("Error applying theme:", e);
    }
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
