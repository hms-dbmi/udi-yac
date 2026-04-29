import { useState } from 'react';
import mascotSrc from '@/assets/yac-mascot.svg';
import { useMascot, useSplashMessages } from '@/app/UDIChatContext';

const DEFAULT_SPLASH_MESSAGES = [
  'Ask me for a visualization!',
  'Tell me what you\u2019d like to see!',
  'What data would you like to explore?',
  'Try asking for a chart!',
  'I\u2019m ready to visualize your data!',
  'Curious about your data? Just ask!',
];

export function WelcomeSplash() {
  // An explicit empty array from the consumer means "hide the bubble"; leave
  // `null` as the sentinel so the render branch below is a simple truthy check.
  const consumerMessages = useSplashMessages();
  const effectiveMessages = consumerMessages ?? DEFAULT_SPLASH_MESSAGES;
  const [message] = useState(() =>
    effectiveMessages.length > 0
      ? effectiveMessages[Math.floor(Math.random() * effectiveMessages.length)]
      : null,
  );
  const mascot = useMascot();
  const mascotContent =
    mascot === undefined ? (
      <img src={mascotSrc} alt="YAC mascot" className="w-60 h-60 object-contain" />
    ) : (
      mascot // null \u2192 renders nothing; otherwise render the consumer's node
    );

  return (
    <div className="flex items-center justify-center h-full p-6">
      {/* Arrow pointing left toward chat */}
      <svg
        className="w-[40%] max-w-[300px] min-w-[100px] opacity-70 self-start mt-4"
        viewBox="0 0 200 60"
        fill="none"
        preserveAspectRatio="xMinYMid meet"
      >
        <path
          d="M190 32 C150 28, 80 25, 40 30 C25 32, 15 35, 8 38"
          stroke="#57B4E9"
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M14 26 L6 38 L16 46"
          stroke="#57B4E9"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>

      {/* Mascot + speech bubble */}
      <div className="flex flex-col items-center gap-1 mt-12">
        {message !== null && (
          <div className="relative bg-[#e8f4fc] border-[1.5px] border-[#57b4e9] rounded-2xl px-5 py-3">
            <span className="text-sm text-foreground">{message}</span>
            <div className="absolute -bottom-[10px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[10px] border-r-[10px] border-t-[10px] border-l-transparent border-r-transparent border-t-[#57b4e9]" />
            <div className="absolute -bottom-[8px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-r-[8px] border-t-[8px] border-l-transparent border-r-transparent border-t-[#e8f4fc]" />
          </div>
        )}
        {mascotContent}
      </div>
    </div>
  );
}
