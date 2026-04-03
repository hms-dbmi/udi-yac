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
    <div className="border-t p-3">
      <div className="flex items-center gap-2 mb-2 text-muted-foreground">
        <KeyRound className="h-4 w-4" />
        <span className="text-xs">Enter your OpenAI API key to start chatting</span>
      </div>
      <div className="flex gap-2">
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="sk-..."
          className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <Button onClick={handleSubmit} disabled={!key.trim()} size="sm">
          Set key
        </Button>
      </div>
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      <p className="text-xs text-muted-foreground mt-1.5">
        Your key is sent to the backend via the X-OpenAI-Key header and is not stored.
      </p>
    </div>
  );
}
