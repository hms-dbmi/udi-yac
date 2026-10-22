import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSessionActions } from '../hooks/useSessionActions';
import type { MenuAction } from '../types';

export function SessionImportExportButton() {
  const { items, reportIssue, dialogs } = useSessionActions();
  const menuItem = ({ label, Icon, onSelect }: MenuAction) => (
    <DropdownMenuItem key={label} onClick={onSelect}>
      {Icon && <Icon className="udi:h-3.5 udi:w-3.5 udi:mr-2" />}
      {label}
    </DropdownMenuItem>
  );

  return (
    <>
      {dialogs}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm" className="udi:h-7 udi:text-xs udi:gap-1.5" />
          }
        >
          <Save className="udi:h-3.5 udi:w-3.5" />
          Session
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {items.map(menuItem)}
          {reportIssue && (
            <>
              <DropdownMenuSeparator />
              {menuItem(reportIssue)}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
