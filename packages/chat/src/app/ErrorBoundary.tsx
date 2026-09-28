import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, Download, RotateCcw } from 'lucide-react';
import { captureCurrentSession } from './snapshotRegistry';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

function saveBlob(content: string, name: string) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function timestampForFilename(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('UDIChat error:', error, errorInfo);
  }

  private getErrorText(): string {
    const { error, errorInfo } = this.state;
    const lines: string[] = [];
    if (error) {
      lines.push(`${error.name}: ${error.message}`);
      if (error.stack) lines.push('', error.stack);
    }
    if (errorInfo?.componentStack) {
      lines.push('', 'Component stack:', errorInfo.componentStack);
    }
    return lines.join('\n');
  }

  private handleCopy = () => {
    void navigator.clipboard.writeText(this.getErrorText());
  };

  private handleReset = () => {
    this.setState({ error: null, errorInfo: null });
  };

  private handleExport = () => {
    const { error, errorInfo } = this.state;
    const session = captureCurrentSession();
    // The exported file is a superset of a regular session export — Import
    // session will accept it (it just ignores the extra `error` block) so
    // the bug report doubles as a reproduction artifact.
    const payload = {
      ...(session ?? { capturedSession: false }),
      error: error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
            componentStack: errorInfo?.componentStack ?? null,
          }
        : null,
    };
    saveBlob(JSON.stringify(payload, null, 2), `udi-error_${timestampForFilename()}.json`);
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="udi:flex udi:flex-col udi:items-center udi:justify-center udi:h-full udi:p-6 udi:gap-4">
        <div className="udi:text-center">
          <h2 className="udi:text-sm udi:font-semibold udi:mb-1">Something went wrong</h2>
          <p className="udi:text-xs udi:text-muted-foreground">{this.state.error.message}</p>
        </div>
        <pre className="udi:w-full udi:max-h-[300px] udi:overflow-auto udi:rounded-md udi:bg-muted udi:p-3 udi:text-xs udi:font-mono udi:whitespace-pre-wrap udi:break-words">
          {this.getErrorText()}
        </pre>
        <div className="udi:flex udi:flex-wrap udi:gap-2 udi:justify-center">
          <Button variant="outline" size="sm" onClick={this.handleCopy}>
            <Copy className="udi:h-3.5 udi:w-3.5 udi:mr-1.5" />
            Copy error
          </Button>
          <Button variant="outline" size="sm" onClick={this.handleExport}>
            <Download className="udi:h-3.5 udi:w-3.5 udi:mr-1.5" />
            Export configuration
          </Button>
          <Button size="sm" onClick={this.handleReset}>
            <RotateCcw className="udi:h-3.5 udi:w-3.5 udi:mr-1.5" />
            Retry
          </Button>
        </div>
      </div>
    );
  }
}
