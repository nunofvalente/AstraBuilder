import { permanentRedirect } from "next/navigation";

import { DEFAULT_LOCALE } from "@/i18n/config";

export default function IndexPage() {
  permanentRedirect(`/${DEFAULT_LOCALE}`);
}
