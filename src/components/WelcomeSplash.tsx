import { useState } from 'react';

const SPLASH_MESSAGES = [
  'Ask me for a visualization!',
  'Tell me what you\u2019d like to see!',
  'What data would you like to explore?',
  'Try asking for a chart!',
  'I\u2019m ready to visualize your data!',
  'Curious about your data? Just ask!',
];

export function WelcomeSplash() {
  const [message] = useState(
    () => SPLASH_MESSAGES[Math.floor(Math.random() * SPLASH_MESSAGES.length)],
  );

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <svg
        className="w-[60%] max-w-[300px] mb-4 opacity-70"
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
      <div className="relative bg-[#e8f4fc] border border-[#57b4e9] rounded-2xl px-5 py-3 mb-2">
        <span className="text-sm text-foreground">{message}</span>
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-r-[8px] border-t-[8px] border-l-transparent border-r-transparent border-t-[#57b4e9]" />
      </div>
    </div>
  );
}
