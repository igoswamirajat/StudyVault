import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleGoHome = () => {
    window.location.assign("/library");
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
          <AlertTriangle className="size-12 text-destructive" />
          <div>
            <h2 className="text-xl font-semibold">
              {this.props.fallbackTitle ?? "Something crashed"}
            </h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              {this.state.error?.message ?? "An unexpected error occurred."}
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={this.handleReset}>
              Try again
            </Button>
            <Button onClick={this.handleGoHome}>Go to Library</Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
