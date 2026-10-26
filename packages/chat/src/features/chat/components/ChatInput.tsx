import { useState, useCallback, type KeyboardEvent } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Send } from 'lucide-react';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled, placeholder }: ChatInputProps) {
  const [text, setText] = useState('');

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  }, [text, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="udi:flex udi:gap-2 udi:p-3 udi:border-t">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? 'Ask a question...'}
        className="udi:min-h-[40px] udi:max-h-[120px] udi:resize-none"
        rows={1}
      />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              onClick={handleSend}
              disabled={disabled || !text.trim()}
              size="icon"
              className="udi:shrink-0 udi:self-end"
            />
          }
        >
          <Send className="udi:h-4 udi:w-4" />
        </TooltipTrigger>
        <TooltipContent>Send message</TooltipContent>
      </Tooltip>
    </div>
  );
}
