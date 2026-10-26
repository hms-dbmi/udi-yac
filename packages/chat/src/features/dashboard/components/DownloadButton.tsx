import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDownloadButtonLabel } from '@/app/UDIChatContext';
import { useDownloadItems } from '../hooks/useDownloadItems';
import type { MenuAction } from '../types';

export function DownloadButton() {
  const { items, custom } = useDownloadItems();
  const buttonLabel = useDownloadButtonLabel();
  const menuItem = ({ label, Icon, disabled, onSelect }: MenuAction, i: number) => (
    <DropdownMenuItem key={`${label}-${i}`} onClick={onSelect} disabled={disabled}>
      {Icon && <Icon className="udi:h-3.5 udi:w-3.5 udi:mr-2" />}
      {label}
    </DropdownMenuItem>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" className="udi:h-7 udi:text-xs udi:gap-1.5" />}
      >
        <Download className="udi:h-3.5 udi:w-3.5" />
        {buttonLabel}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map(menuItem)}
        {custom.length > 0 && <DropdownMenuSeparator />}
        {custom.map(menuItem)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
