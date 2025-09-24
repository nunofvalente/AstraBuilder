"use client";

import { useEffect } from "react";

type LangAttributeProps = {
  locale: string;
};

export function LangAttribute({ locale }: LangAttributeProps) {
  useEffect(() => {
    document.documentElement.lang = locale;
    document.body.dataset.locale = locale;
  }, [locale]);

  return null;
}