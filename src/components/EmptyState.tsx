import { Sparkles } from "lucide-react";

type EmptyStateProps = {
  title: string;
  body: string;
};

export function EmptyState({ title, body }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <Sparkles size={22} />
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}
