"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

/**
 * Dark / light mode switch for the top utility bar.
 * Both icons are server-rendered and the active one is picked by CSS
 * (`.dark` class on <html>), so there is no hydration flash. The
 * aria-label is intentionally static: `resolvedTheme` is undefined on
 * the server and would cause a hydration attribute mismatch.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === "light" ? "dark" : "light")}
      aria-label="Toggle dark or light mode"
      title="Toggle dark / light mode"
      className={
        className ??
        "flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-cyber-border bg-cyber-surface text-mid transition-colors hover:border-cyber-teal/60 hover:text-cyber-teal"
      }
    >
      <Moon className="hidden h-4 w-4 dark:block" aria-hidden="true" />
      <Sun className="block h-4 w-4 dark:hidden" aria-hidden="true" />
    </button>
  );
}
