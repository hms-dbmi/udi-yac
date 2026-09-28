import { MarkdownText } from '@/components/MarkdownText';

interface RebuffNoticeProps {
  message: string;
}

export function RebuffNotice({ message }: RebuffNoticeProps) {
  return (
    <div className="udi:px-2 udi:pb-2">
      <MarkdownText>{message}</MarkdownText>
    </div>
  );
}
