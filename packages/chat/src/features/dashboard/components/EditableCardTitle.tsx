import { useCallback, useMemo, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDashboardStore, useTracker } from '@/app/UDIChatContext';
import { cn } from '@/lib/utils';
import type { ActiveVisualization } from '../stores/dashboardStore';
import { vizTitleProvenance } from '../utils/vizTitle';
import { useVizTitleLabels } from '../hooks/useVizTitleLabels';

interface EditableCardTitleProps {
  vizKey: string;
  viz: ActiveVisualization;
  /** Notified when the inline editor opens or closes, so the card can hide the
   *  rest of its header chrome and give the field the whole row. */
  onEditingChange?: (editing: boolean) => void;
}

const MAX_TITLE_LENGTH = 120;

/**
 * The card header's title: a text-styled button that swaps to an input on
 * click. Enter and blur commit, Escape cancels, and an empty value clears the
 * rename so the derived / original title takes over again (see
 * `utils/vizTitle.ts` for the resolution order). The keyboard path is mirrored
 * by explicit accept / cancel buttons inside the field, so the affordance does
 * not depend on knowing that Enter and Escape do anything.
 *
 * A button rather than a click-handling span so the affordance is reachable by
 * keyboard without hand-rolling roles. Dragging is unaffected: react-grid-layout
 * is scoped to the grip's DRAG_HANDLE_CLASS, not the whole header.
 */
export function EditableCardTitle({ vizKey, viz, onEditingChange }: EditableCardTitleProps) {
  const dashboardStore = useDashboardStore();
  const trackEvent = useTracker();

  const labels = useVizTitleLabels();
  const { display, original, isRenamed } = useMemo(
    () => vizTitleProvenance(viz, labels),
    [viz, labels],
  );

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  // Mirrors `editing` for the handlers: Escape unmounts the input, and a blur
  // arriving afterwards must not re-commit the abandoned draft.
  const editingRef = useRef(false);
  // What the field held when editing began. Committing an unchanged value would
  // otherwise pin the current text as a rename — freezing auto-updates just
  // because the user clicked the title and clicked away.
  const initialRef = useRef('');
  // The field + its accept/cancel buttons. Focus moving *within* this box is
  // not "leaving the field", so a blur onto our own buttons must not commit.
  const boxRef = useRef<HTMLDivElement>(null);

  const startEditing = useCallback(() => {
    initialRef.current = display;
    setDraft(display);
    editingRef.current = true;
    setEditing(true);
    onEditingChange?.(true);
  }, [display, onEditingChange]);

  const stopEditing = useCallback(
    (commit: boolean) => {
      if (!editingRef.current) return;
      editingRef.current = false;
      setEditing(false);
      onEditingChange?.(false);
      if (!commit) return;
      const next = draft.trim();
      if (next === initialRef.current.trim()) return;
      dashboardStore.getState().setVisualizationTitle(vizKey, next);
      trackEvent('visualization_renamed', { cleared: next.length === 0, source: 'card' });
    },
    [draft, dashboardStore, vizKey, trackEvent, onEditingChange],
  );

  const focusOnMount = useCallback((el: HTMLInputElement | null) => {
    el?.focus();
    el?.select();
  }, []);

  if (editing) {
    return (
      <div
        ref={boxRef}
        // The border lives on the wrapper rather than the input so the two
        // buttons read as part of one text box. `h-6` matches the resting row
        // height (set by the grip button) so entering edit mode cannot grow the
        // header, and focus is shown with a border colour rather than a ring —
        // a ring paints outside the box and would spill past the card edge.
        className={cn(
          'flex h-6 flex-1 items-center gap-0.5 min-w-0 rounded-md border border-input pr-0.5',
          'bg-transparent transition-colors focus-within:border-ring dark:bg-input/30',
        )}
      >
        <input
          ref={focusOnMount}
          value={draft}
          aria-label="Visualization title"
          placeholder="Clear to reset"
          maxLength={MAX_TITLE_LENGTH}
          // An input's default `size` of 20 characters is a real intrinsic
          // width, which the card header's grid track sizes itself against.
          // `size={1}` keeps the field purely flex-sized.
          size={1}
          className="h-5 min-w-0 flex-1 bg-transparent px-1.5 text-xs outline-none placeholder:text-muted-foreground"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => {
            // Clicking or tabbing onto accept/cancel keeps the session open —
            // those buttons decide the outcome themselves.
            if (boxRef.current?.contains(e.relatedTarget)) return;
            stopEditing(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              stopEditing(true);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              stopEditing(false);
            }
          }}
        />
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-5"
          title="Save title (Enter)"
          aria-label="Save title"
          // Keep focus in the input on mouse-down so the click never fires a
          // blur-commit ahead of this button's own handler.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => stopEditing(true)}
        >
          <Check className="h-3 w-3 text-green-600" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-5"
          title="Cancel (Esc)"
          aria-label="Cancel rename"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => stopEditing(false)}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  // Newline-separated so the native tooltip keeps the provenance readable:
  // what is shown, what the agent originally called it, and the prompt behind it.
  const tooltip = [
    display,
    original && original !== display ? `Originally: "${original}"` : null,
    viz.userPrompt ? `Prompt: ${viz.userPrompt}` : null,
    'Click to rename',
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <button
      type="button"
      title={tooltip}
      aria-label={`Rename visualization: ${display}`}
      onClick={startEditing}
      className={cn(
        'text-xs font-medium truncate flex-1 min-w-0 text-left cursor-text rounded px-1 py-0.5',
        'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        // A renamed card reads as the user's own label; italics mark that the
        // text no longer comes from the assistant.
        isRenamed && 'italic',
      )}
    >
      {display}
    </button>
  );
}
