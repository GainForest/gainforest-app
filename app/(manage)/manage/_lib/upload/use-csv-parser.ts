"use client";

import { useState, useCallback } from "react";
import Papa from "papaparse";

type CsvParserState = {
  parsedData: Record<string, string>[];
  headers: string[];
  rowCount: number;
  error: string | null;
  isParsing: boolean;
};

const INITIAL_STATE: CsvParserState = {
  parsedData: [],
  headers: [],
  rowCount: 0,
  error: null,
  isParsing: false,
};

export function useCsvParser() {
  const [state, setState] = useState<CsvParserState>(INITIAL_STATE);

  const parseFile = useCallback((file: File) => {
    setState((prev) => ({ ...prev, isParsing: true, error: null }));

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const headers = result.meta.fields ?? [];
        setState({
          parsedData: result.data,
          headers,
          rowCount: result.data.length,
          error: result.errors.length > 0 ? result.errors[0]?.message ?? "Parse error" : null,
          isParsing: false,
        });
      },
      error: (error) => {
        setState((prev) => ({
          ...prev,
          isParsing: false,
          error: error.message,
        }));
      },
    });
  }, []);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return { ...state, parseFile, reset };
}
