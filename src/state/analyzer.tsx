import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { analyzeUrl, type AnalyzeResult } from "../lib/api";
import { normalizeUrl } from "../lib/clipboard";
import { shortErrorMessage } from "../lib/errors";

interface AnalyzerContextValue {
  url: string;
  setUrl: (url: string) => void;
  result: AnalyzeResult | null;
  /** The URL the current result was produced from. */
  analyzedUrl: string | null;
  analyzing: boolean;
  error: string | null;
  analyze: (url?: string) => Promise<AnalyzeResult | null>;
  reset: () => void;
}

const AnalyzerContext = createContext<AnalyzerContextValue | null>(null);

export function AnalyzerProvider({ children }: { children: ReactNode }) {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [analyzedUrl, setAnalyzedUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Guards against an older analyze call overwriting a newer one. */
  const requestId = useRef(0);

  const analyze = useCallback(
    async (candidate?: string) => {
      const target = normalizeUrl(candidate ?? url);
      if (!target) return null;
      const current = ++requestId.current;

      setUrl(target);
      setAnalyzing(true);
      setError(null);
      try {
        const analyzed = await analyzeUrl(target);
        if (requestId.current !== current) return null;
        setResult(analyzed);
        setAnalyzedUrl(target);
        return analyzed;
      } catch (caught) {
        if (requestId.current === current) {
          setError(shortErrorMessage(caught));
          setResult(null);
          setAnalyzedUrl(null);
        }
        return null;
      } finally {
        if (requestId.current === current) setAnalyzing(false);
      }
    },
    [url],
  );

  const reset = useCallback(() => {
    requestId.current += 1;
    setUrl("");
    setResult(null);
    setAnalyzedUrl(null);
    setError(null);
    setAnalyzing(false);
  }, []);

  const value = useMemo(
    () => ({
      url,
      setUrl,
      result,
      analyzedUrl,
      analyzing,
      error,
      analyze,
      reset,
    }),
    [url, result, analyzedUrl, analyzing, error, analyze, reset],
  );

  return (
    <AnalyzerContext.Provider value={value}>{children}</AnalyzerContext.Provider>
  );
}

export function useAnalyzer(): AnalyzerContextValue {
  const context = useContext(AnalyzerContext);
  if (!context)
    throw new Error("useAnalyzer must be used inside an AnalyzerProvider");
  return context;
}
