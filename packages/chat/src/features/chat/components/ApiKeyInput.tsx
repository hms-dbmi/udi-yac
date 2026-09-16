import { useState, useCallback, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { KeyRound } from 'lucide-react';

interface ApiKeyInputProps {
  onSubmit: (key: string) => void;
}

export function ApiKeyInput({ onSubmit }: ApiKeyInputProps) {
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = key.trim();
    if (!trimmed) return;
    if (!trimmed.startsWith('sk-')) {
      setError('Key should start with sk-');
      return;
    }
    setError(null);
    onSubmit(trimmed);
  }, [key, onSubmit]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <div className="udi:border-t udi:p-3">
      <div className="udi:flex udi:items-center udi:gap-2 udi:mb-2 udi:text-muted-foreground">
        <KeyRound className="udi:h-4 udi:w-4" />
        <span className="udi:text-xs">Enter your OpenAI API key to start chatting</span>
      </div>
      <div className="udi:flex udi:gap-2">
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="sk-..."
          className="udi:flex-1 udi:rounded-md udi:border udi:border-input udi:bg-background udi:px-3 udi:py-1.5 udi:text-sm udi:shadow-xs udi:placeholder:text-muted-foreground udi:focus-visible:outline-none udi:focus-visible:ring-1 udi:focus-visible:ring-ring"
        />
        <Button onClick={handleSubmit} disabled={!key.trim()} size="sm">
          Set key
        </Button>
      </div>
      {error && <p className="udi:text-xs udi:text-destructive udi:mt-1">{error}</p>}
      <p className="udi:text-xs udi:text-muted-foreground udi:mt-1.5">
        Your key is sent to the backend via the X-OpenAI-Key header and is not stored.
      </p>
    </div>
  );
}
