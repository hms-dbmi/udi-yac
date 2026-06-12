import { useCallback } from 'react';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDashboard, useDashboardStore } from '@/app/UDIChatContext';
import {
  MAX_GRID_COLS,
  MAX_GRID_ROW_HEIGHT_PX,
  MIN_GRID_COLS,
  MIN_GRID_ROW_HEIGHT_PX,
} from '../utils/gridDefaults';

export function GridSettingsButton() {
  const gridCols = useDashboard((s) => s.gridCols);
  const gridRowHeight = useDashboard((s) => s.gridRowHeight);
  const store = useDashboardStore();

  const handleColsChange = useCallback(
    (next: number | readonly number[]) => {
      const n = Array.isArray(next) ? next[0] : (next as number);
      store.getState().setGridCols(n);
    },
    [store],
  );

  const handleRowHeightChange = useCallback(
    (next: number | readonly number[]) => {
      const n = Array.isArray(next) ? next[0] : (next as number);
      store.getState().setGridRowHeight(n);
    },
    [store],
  );

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  aria-label="Grid settings"
                />
              }
            >
              <Settings className="h-3.5 w-3.5" />
            </PopoverTrigger>
          }
        />
        <TooltipContent>Grid settings</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-64">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="grid-cols" className="text-xs">
                Columns
              </Label>
              <span className="text-xs tabular-nums text-muted-foreground">{gridCols}</span>
            </div>
            <Slider
              id="grid-cols"
              min={MIN_GRID_COLS}
              max={MAX_GRID_COLS}
              step={1}
              value={[gridCols]}
              onValueChange={handleColsChange}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="grid-row-height" className="text-xs">
                Row height
              </Label>
              <span className="text-xs tabular-nums text-muted-foreground">{gridRowHeight} px</span>
            </div>
            <Slider
              id="grid-row-height"
              min={MIN_GRID_ROW_HEIGHT_PX}
              max={MAX_GRID_ROW_HEIGHT_PX}
              step={10}
              value={[gridRowHeight]}
              onValueChange={handleRowHeightChange}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
