import { MarkdownText } from '@/components/MarkdownText';

interface RebuffNoticeProps {
  message: string;
}

export function RebuffNotice({ message }: RebuffNoticeProps) {
  return (
    <div className="px-2 pb-2">
      <MarkdownText>{message}</MarkdownText>
    </div>
  );
}
