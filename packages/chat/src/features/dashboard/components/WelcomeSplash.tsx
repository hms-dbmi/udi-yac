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
      <img src={mascotSrc} alt="YAC mascot" className="udi:w-60 udi:h-60 udi:object-contain" />
    ) : (
      mascot // null \u2192 renders nothing; otherwise render the consumer's node
    );

  return (
    <div className="udi:flex udi:items-center udi:justify-center udi:h-full udi:p-6">
      {/* Arrow pointing left toward chat */}
      <svg
        className="udi:w-[40%] udi:max-w-[300px] udi:min-w-[100px] udi:opacity-70 udi:self-start udi:mt-4"
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
      <div className="udi:flex udi:flex-col udi:items-center udi:gap-1 udi:mt-12">
        {message !== null && (
          <div className="udi:relative udi:bg-[#e8f4fc] udi:border-[1.5px] udi:border-[#57b4e9] udi:rounded-2xl udi:px-5 udi:py-3">
            <span className="udi:text-sm udi:text-foreground">{message}</span>
            <div className="udi:absolute udi:-bottom-[10px] udi:left-1/2 udi:-translate-x-1/2 udi:w-0 udi:h-0 udi:border-l-[10px] udi:border-r-[10px] udi:border-t-[10px] udi:border-l-transparent udi:border-r-transparent udi:border-t-[#57b4e9]" />
            <div className="udi:absolute udi:-bottom-[8px] udi:left-1/2 udi:-translate-x-1/2 udi:w-0 udi:h-0 udi:border-l-[8px] udi:border-r-[8px] udi:border-t-[8px] udi:border-l-transparent udi:border-r-transparent udi:border-t-[#e8f4fc]" />
          </div>
        )}
        {mascotContent}
      </div>
    </div>
  );
}
