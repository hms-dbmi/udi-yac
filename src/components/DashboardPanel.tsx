import { useDashboard, useSelections } from '@/stores/UDIChatContext';
import { DashboardCard } from './DashboardCard';
import { WelcomeSplash } from './WelcomeSplash';
import { ScrollArea } from '@/components/ui/scroll-area';

export function DashboardPanel() {
  const pinnedVisualizations = useDashboard((s) => s.pinnedVisualizations);
  const selections = useSelections((s) => s.selections);

  const entries = Array.from(pinnedVisualizations.entries()).reverse();

  if (entries.length === 0) {
    return <WelcomeSplash />;
  }

  return (
    <ScrollArea className="h-full p-3">
      <div className="flex flex-col gap-3">
        {entries.map(([key, viz]) => (
          <DashboardCard key={key} vizKey={key} viz={viz} selections={selections} />
        ))}
      </div>
    </ScrollArea>
  );
}
