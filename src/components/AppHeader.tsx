import type { ReactNode } from "react";

type AppHeaderProps = {
  title: string;
  description?: string;
  children?: ReactNode;
};

export function AppHeader({ title, description, children }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="header-actions">{children}</div>
    </header>
  );
}
