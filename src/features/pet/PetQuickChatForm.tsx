import type { FormEvent } from "react";

type PetQuickChatFormProps = {
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function PetQuickChatForm({ value, busy, onChange, onSubmit }: PetQuickChatFormProps) {
  return (
    <form className="pet-quick-form" onSubmit={onSubmit}>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="来聊聊天吧～"
        maxLength={120}
        disabled={busy}
      />
    </form>
  );
}
