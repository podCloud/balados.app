import { Component, type ErrorInfo, type ReactNode } from "react";
import i18n from "../../services/i18n";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex flex-col items-center justify-center p-6 bg-gray-50">
          <div className="text-center max-w-sm">
            <div className="text-6xl mb-4" role="img" aria-label={i18n.t("error.title")}>
              😵
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">{i18n.t("error.title")}</h1>
            <p className="text-gray-600 mb-6">{i18n.t("error.description")}</p>
            <button
              type="button"
              onClick={this.handleReload}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors"
            >
              {i18n.t("error.reload")}
            </button>
            {this.state.error && (
              <details className="mt-6 text-left">
                <summary className="text-sm text-gray-500 cursor-pointer">
                  {i18n.t("error.details")}
                </summary>
                <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-40">
                  {this.state.error.message}
                  {"\n"}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
