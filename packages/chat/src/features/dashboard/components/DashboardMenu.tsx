import type { ReactNode } from 'react';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { GridSettingsPanel } from './GridSettingsButton';
import { useSessionActions } from '../hooks/useSessionActions';
import { useDownloadItems } from '../hooks/useDownloadItems';
import type { MenuAction } from '../types';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="udi:flex udi:flex-col udi:gap-1">
      <p className="udi:text-xs udi:font-medium udi:uppercase udi:tracking-wide udi:text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

function ActionRow({ label, Icon, disabled, onSelect }: MenuAction) {
  return (
    <PopoverClose
      render={
        <Button
          variant="ghost"
          size="sm"
          className="udi:-mx-1 udi:h-8 udi:justify-start udi:px-2 udi:text-xs"
        />
      }
      disabled={disabled}
      onClick={onSelect}
    >
      {Icon && <Icon className="udi:mr-2 udi:h-3.5 udi:w-3.5" />}
      {label}
    </PopoverClose>
  );
}

/**
 * Display settings, Session and Download folded into one popover, for when the
 * entity counts need the header's width. A popover rather than a menu: a menu
 * takes the arrow keys from the sliders, and Tab closes it before reaching them.
 */
export function DashboardMenu() {
  const session = useSessionActions();
  const downloads = useDownloadItems();
  const row = (action: MenuAction, i: number) => (
    <ActionRow key={`${action.label}-${i}`} {...action} />
  );

  return (
    <>
      {session.dialogs}
      <Popover>
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="udi:h-7 udi:w-7 udi:p-0"
                    aria-label="Dashboard options"
                  />
                }
              >
                <Settings className="udi:h-3.5 udi:w-3.5" />
              </PopoverTrigger>
            }
          />
          <TooltipContent>Dashboard options</TooltipContent>
        </Tooltip>
        <PopoverContent className="udi:flex udi:w-64 udi:max-h-(--available-height) udi:flex-col udi:gap-3 udi:overflow-y-auto">
          <Section title="Layout">
            <GridSettingsPanel />
          </Section>
          <Separator />
          <Section title="Session">{session.items.map(row)}</Section>
          <Separator />
          <Section title="Download">{[...downloads.items, ...downloads.custom].map(row)}</Section>
          {session.reportIssue && (
            <>
              <Separator />
              <ActionRow {...session.reportIssue} />
            </>
          )}
        </PopoverContent>
      </Popover>
    </>
  );
}
